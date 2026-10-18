/**
 * The Updates-channel half of the chat widget: what gets said when a Plaud
 * recording turns into a meeting, and the side-project excerpt copies that
 * follow a routed import.
 *
 * Two entry points only ever run once per meeting: `onPlaudMeetingImported`
 * (called once per `created: true` import) and the "primary finalized" retry
 * from chat.service.ts once the owner answers an unsure match. Both funnel
 * into `createSideProjectCopies`, which is itself idempotent per
 * (sideProjectId, primaryMeetingId) pair.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { meeting, project } from "../db/schema.js";
import { logActivity } from "./activity.service.js";
import { ADVO_AI_MODEL } from "../utils/ai-model.js";
import {
  keywordFor,
  rankCandidates,
  routeCandidate,
  type RankedCandidate,
  type RouteResult,
} from "./meeting-route.service.js";
import { postBotMessage } from "./chat.service.js";

/**
 * `routeRecording`'s own doc comment: a strong title hit alone scores 6. This
 * plan reuses that bar to decide whether an auto-linked import gets a soft
 * FYI (still offering Change) versus the ranked-candidates question — not
 * whether it gets linked at all (that floor is `routeRecording`'s own
 * `score >= 2 && isAhead`, already passed by the time `projectId !== null`).
 */
export const AUTO_MATCH_SCORE_THRESHOLD = 6;

/**
 * Any other project whose rank score is at or above `routeRecording`'s own
 * minimum routing floor gets a side-project excerpt copy.
 */
export const SIDE_PROJECT_SCORE_THRESHOLD = 2;

type MeetingRow = typeof meeting.$inferSelect;

/** Short title for a chat message body — the plan's "40 chars" bound. */
function shortTitle(title: string): string {
  return title.length > 40 ? `${title.slice(0, 40)}…` : title;
}

async function projectTitle(projectId: number): Promise<string> {
  const [row] = await db()
    .select({ title: project.title })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);
  return row?.title ?? `Project #${projectId}`;
}

/**
 * The ranked-candidates "which project?" question. Shared by the unsure-match
 * path (§6.3) and the owner's "Change" tap on a confident FYI — one function,
 * two entry points, so the two flows can never drift apart.
 */
export async function postMeetingMatchQuestion(meetingRow: MeetingRow): Promise<RankedCandidate[]> {
  const candidate = await routeCandidate();
  const ranked = rankCandidates({ title: meetingRow.title, summary: meetingRow.summary }, candidate);

  const options = [
    ...ranked.map((r) => ({ id: `project:${r.projectId}`, label: r.title })),
    { id: "new_project", label: "New project" },
    { id: "skip", label: "Don't add" },
  ];

  await postBotMessage({
    channel: "updates",
    body: `New meeting: ${shortTitle(meetingRow.title)}. Which project?`,
    inputMode: "buttons",
    options,
    context: {
      type: "meeting_match",
      meetingId: meetingRow.meetingId,
      candidateProjectIds: ranked.map((r) => r.projectId),
    },
  });

  return ranked;
}

/**
 * One side-project excerpt copy for (sideProjectId, primaryMeeting). Never
 * touches the primary meeting's own transcript/summary. Idempotent: a second
 * call for the same pair is a no-op.
 */
export async function createSideProjectCopy(
  primaryMeeting: MeetingRow,
  sideProjectId: number,
): Promise<void> {
  const [existing] = await db()
    .select({ meetingId: meeting.meetingId })
    .from(meeting)
    .where(and(eq(meeting.parentMeetingId, primaryMeeting.meetingId), eq(meeting.projectId, sideProjectId)))
    .limit(1);
  if (existing) return;

  const [proj] = await db()
    .select({ title: project.title })
    .from(project)
    .where(eq(project.projectId, sideProjectId))
    .limit(1);
  if (!proj) return; // project vanished between ranking and here — nothing to copy into

  const excerpt = await excerptFor(primaryMeeting.transcript, proj.title);

  await db().insert(meeting).values({
    projectId: sideProjectId,
    parentMeetingId: primaryMeeting.meetingId,
    title: primaryMeeting.title,
    recordedAt: primaryMeeting.recordedAt,
    transcript: excerpt.excerpt,
    summary: excerpt.summary,
    createdBy: primaryMeeting.createdBy,
  });
}

/**
 * Every other ranked candidate at/above the side-project threshold gets a
 * copy. `excludeProjectId` is the primary project this meeting already
 * belongs to (never copy a project into itself).
 */
export async function createSideProjectCopies(
  primaryMeeting: MeetingRow,
  ranked: RankedCandidate[],
  excludeProjectId: number | null,
): Promise<void> {
  for (const candidate of ranked) {
    if (candidate.projectId === excludeProjectId) continue;
    if (candidate.score < SIDE_PROJECT_SCORE_THRESHOLD) continue;
    await createSideProjectCopy(primaryMeeting, candidate.projectId);
  }
}

type ExcerptResult = { excerpt: string; summary: string | null };

const EXCERPT_SYSTEM = `Extract only the parts of this transcript relevant to one project. Return ONLY JSON: {"excerpt": string, "summary": string}. The excerpt must be verbatim passages from the text, not a paraphrase. If nothing is relevant, return the single most related passage.`;

async function excerptWithAI(transcript: string, sideProjectTitle: string): Promise<ExcerptResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: ADVO_AI_MODEL,
      max_tokens: 4000,
      system: `${EXCERPT_SYSTEM}\n\nProject: ${sideProjectTitle}`,
      // Untrusted transcript text is the user turn, never folded into the system prompt.
      messages: [{ role: "user", content: transcript.slice(0, 120_000) }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(raw) as { excerpt?: unknown; summary?: unknown };
    if (typeof parsed.excerpt !== "string" || !parsed.excerpt.trim()) return null;
    return {
      excerpt: parsed.excerpt,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
    };
  } catch (err) {
    console.error("[plaud-chat] AI excerpt failed; falling back to heuristic:", err);
    return null;
  }
}

/** Keep any line matching the project's keywords, plus one neighbor each side. */
function excerptHeuristic(transcript: string, sideProjectTitle: string): ExcerptResult {
  const { strong, weak } = keywordFor(sideProjectTitle, null);
  const keyword = [...strong, ...weak].filter(Boolean);
  const line = transcript.split("\n");
  const keep = new Set<number>();
  for (let i = 0; i < line.length; i++) {
    const lower = line[i].toLowerCase();
    if (keyword.some((k) => k && lower.includes(k.toLowerCase()))) {
      keep.add(i);
      if (i > 0) keep.add(i - 1);
      if (i < line.length - 1) keep.add(i + 1);
    }
  }
  const index = [...keep].sort((a, b) => a - b);
  const excerpt = index.length > 0 ? index.map((i) => line[i]).join("\n") : line.slice(0, 5).join("\n");
  return { excerpt, summary: null };
}

async function excerptFor(transcript: string, sideProjectTitle: string): Promise<ExcerptResult> {
  return (await excerptWithAI(transcript, sideProjectTitle)) ?? excerptHeuristic(transcript, sideProjectTitle);
}

export async function onPlaudMeetingImported(input: {
  meetingRow: MeetingRow;
  route: RouteResult;
  created: boolean;
}): Promise<void> {
  // Duplicate-safety: a row is only "newly created" once. A re-import retry
  // hits the `created: false` branch and never reaches here a second time.
  if (!input.created) return;
  // Defensive, not load-bearing today — the Open-API caller already guarantees
  // isAdvo === true ever reaches importPlaudMeeting. Kept in case a future
  // caller (e.g. the consumer transport) ever routes before importing.
  if (!input.route.isAdvo) return;

  const { meetingRow, route } = input;
  const confident = route.score >= AUTO_MATCH_SCORE_THRESHOLD && route.projectId !== null;

  if (confident && route.projectId !== null) {
    const title = await projectTitle(route.projectId);
    await postBotMessage({
      channel: "updates",
      body: `New meeting added to ${title}.`,
      inputMode: "buttons",
      options: [
        { id: "ok", label: "OK" },
        { id: "change", label: "Change" },
      ],
      context: { type: "confident_fyi", meetingId: meetingRow.meetingId, projectId: route.projectId },
    });

    const candidate = await routeCandidate();
    const ranked = rankCandidates({ title: meetingRow.title, summary: meetingRow.summary }, candidate);
    await createSideProjectCopies(meetingRow, ranked, route.projectId);
  } else {
    await postMeetingMatchQuestion(meetingRow);
  }

  await logActivity({
    userId: null,
    action: "meeting_routed",
    entityType: "meeting",
    entityId: meetingRow.meetingId,
    source: "plaud",
    metadata: { confident, projectId: route.projectId },
  });
}
