/**
 * The chat widget's state machine — both channels.
 *
 * Updates: a small set of context types drive what an owner's button tap or
 * free-text reply means (§6.3-6.4 of the plan). Ask: one Claude call per
 * owner turn against a read-only snapshot, no transcripts, no tool-use loop.
 *
 * Every state-changing branch writes its own `activity_log` row
 * (`metadata.source: 'chat'`) — these changes never go through the meeting/
 * project HTTP routes, so nothing else writes that row for them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { calendarEvent, chatMessage, client, meeting, project } from "../db/schema.js";
import { logActivity } from "./activity.service.js";
import { ADVO_AI_MODEL } from "../utils/ai-model.js";
import { rankCandidates, routeCandidate } from "./meeting-route.service.js";
import { createSideProjectCopies, postMeetingMatchQuestion, type ClientGuess } from "./plaud-chat.service.js";
import { lookupInboxClientId } from "./plaud-import.service.js";
import { importRecording } from "./plaud-recording.service.js";

export type ChatChannel = "updates" | "ask";
export type ChatOption = { id: string; label: string; style?: "primary" | "default" | "danger" };
/** What a new client/project gets filed against: a meeting already on the site, or a Plaud recording not imported yet. */
export type MeetingTarget = { meetingId: number } | { fileId: string; grant: string };
export type ChatContext =
  | { type: "confident_fyi"; meetingId: number; projectId: number }
  | { type: "meeting_match"; meetingId: number; candidateProjectIds: number[] }
  | { type: "new_project_name"; meetingId: number }
  | { type: "new_project_client"; meetingId: number; projectName: string }
  | { type: "recording_check"; fileId: string; grant: string; title: string; guess: ClientGuess | null }
  | { type: "recording_project"; fileId: string; grant: string }
  | { type: "new_client_company"; target: MeetingTarget; projectName?: string }
  | { type: "new_client_project"; target: MeetingTarget; companyName: string }
  | { type: "ask_followup" }
  | null;

type ChatMessageRow = typeof chatMessage.$inferSelect;
type MeetingRow = typeof meeting.$inferSelect;

// ─── Basic CRUD ───────────────────────────────────────

export async function postBotMessage(input: {
  channel: ChatChannel;
  body: string;
  inputMode?: "none" | "buttons" | "text";
  options?: ChatOption[] | null;
  context?: ChatContext;
}): Promise<ChatMessageRow> {
  const [row] = await db()
    .insert(chatMessage)
    .values({
      channel: input.channel,
      sender: "bot",
      sentByUserId: null,
      body: input.body,
      inputMode: input.inputMode ?? "none",
      options: input.options ?? null,
      context: input.context ?? null,
    })
    .returning();
  return row;
}

export async function listMessages(channel: ChatChannel, afterId?: number | null): Promise<ChatMessageRow[]> {
  const condition =
    afterId != null
      ? and(eq(chatMessage.channel, channel), gt(chatMessage.chatMessageId, afterId))
      : eq(chatMessage.channel, channel);
  return db().select().from(chatMessage).where(condition).orderBy(asc(chatMessage.chatMessageId));
}

async function loadMeeting(meetingId: number): Promise<MeetingRow | null> {
  const [row] = await db().select().from(meeting).where(eq(meeting.meetingId, meetingId)).limit(1);
  return row ?? null;
}

async function loadProjectTitle(projectId: number): Promise<string> {
  const [row] = await db().select({ title: project.title }).from(project).where(eq(project.projectId, projectId)).limit(1);
  return row?.title ?? `Project #${projectId}`;
}

function logChat(action: string, entityType: string, entityId: number | null, userId: number, extra: Record<string, unknown> = {}) {
  return logActivity({ userId, action, entityType, entityId, source: "chat", metadata: extra });
}

/**
 * File the target under a project: move a meeting that is already on the site, or
 * import the Plaud recording into it. Says so in the chat either way.
 */
async function assignTarget(target: MeetingTarget, projectId: number, projectName: string, userId: number): Promise<void> {
  if ("meetingId" in target) {
    await db().update(meeting).set({ projectId, updatedAt: new Date() }).where(eq(meeting.meetingId, target.meetingId));
    await postBotMessage({ channel: "updates", body: `Done. Added to ${projectName}.`, inputMode: "none" });
    await logChat("meeting_updated", "meeting", target.meetingId, userId, { projectId });
    return;
  }
  try {
    const result = await importRecording({ ...target, projectId, createdBy: userId });
    await postBotMessage({ channel: "updates", body: `Done. Meeting added to ${projectName}.`, inputMode: "none" });
    if (result.meeting) await logChat("meeting_created", "meeting", result.meeting.meetingId, userId, { projectId, fileId: target.fileId });
  } catch (err) {
    // The poller never re-asks about a file, so the retry has to live here.
    console.error("[chat] Plaud import after the owner's answer failed:", err);
    await postBotMessage({
      channel: "updates",
      body: `${projectName} is saved, but Plaud did not send the meeting.`,
      inputMode: "buttons",
      options: [{ id: `project:${projectId}`, label: "Try again", style: "primary" }],
      context: { type: "recording_project", fileId: target.fileId, grant: target.grant },
    });
  }
}

/** Create the project and attach the target — shared by every "new project" entry point. */
async function createProjectAndAssign(clientId: number, projectName: string, target: MeetingTarget, userId: number): Promise<void> {
  const [newProj] = await db().insert(project).values({ clientId, title: projectName }).returning();
  await logChat("project_created", "project", newProj.projectId, userId, target);
  await assignTarget(target, newProj.projectId, projectName, userId);
}

/** The owner's names for a new client and its project. An existing company with the same name is reused, not duplicated. */
async function createClientProjectAndAssign(companyName: string, projectName: string, target: MeetingTarget, userId: number): Promise<void> {
  const company = companyName.trim().slice(0, 255);
  const title = (projectName.trim() || company).slice(0, 255);
  const [existing] = await db()
    .select({ clientId: client.clientId })
    .from(client)
    .where(sql`lower(${client.companyName}) = lower(${company})`)
    .limit(1);
  let clientId = existing?.clientId;
  if (!clientId) {
    [{ clientId }] = await db().insert(client).values({ companyName: company }).returning({ clientId: client.clientId });
    await logChat("client_created", "client", clientId, userId, target);
  }
  await createProjectAndAssign(clientId, title, target, userId);
}

function askCompanyName(target: MeetingTarget, projectName?: string) {
  return postBotMessage({
    channel: "updates",
    body: "Company name?",
    inputMode: "text",
    context: { type: "new_client_company", target, projectName },
  });
}

/** "Company" alone, or "Company / Project" in one line. */
async function handleCompanyName(context: { target: MeetingTarget; projectName?: string }, body: string, userId: number) {
  const [company, typedProject] = body.split(/\s+\/\s+/, 2);
  const projectName = context.projectName ?? typedProject;
  if (projectName) {
    await createClientProjectAndAssign(company, projectName, context.target, userId);
    return;
  }
  await postBotMessage({
    channel: "updates",
    body: "Project name?",
    inputMode: "text",
    context: { type: "new_client_project", target: context.target, companyName: company.trim() },
  });
}

/** Every real project, for "Existing project" on a recording that is not on the site yet. */
async function postRecordingProjectQuestion(fileId: string, grant: string): Promise<void> {
  const rows = await db()
    .select({ projectId: project.projectId, title: project.title })
    .from(project)
    .where(ne(project.title, "Inbox"))
    .orderBy(asc(project.title));
  await postBotMessage({
    channel: "updates",
    body: "Which project?",
    inputMode: "buttons",
    options: rows.map((r) => ({ id: `project:${r.projectId}`, label: r.title })),
    context: { type: "recording_project", fileId, grant },
  });
}

/** The owner's text reply to the "Name?" prompt. */
async function handleNewProjectName(meetingId: number, projectName: string, userId: number): Promise<void> {
  const rows = await db().select({ clientId: client.clientId, companyName: client.companyName }).from(client);
  // The auto-created "ADVO Inbox" holding client is never a real pick here —
  // matched by the same identification precedence as resolveInboxProjectId
  // (env var / "Inbox" project title / "ADVO Inbox" client name), not just by
  // display text, so a renamed Inbox client still gets excluded correctly.
  const inboxClientId = await lookupInboxClientId();
  const realRows = inboxClientId != null ? rows.filter((r) => r.clientId !== inboxClientId) : rows;
  if (realRows.length === 0) {
    await askCompanyName({ meetingId }, projectName);
    return;
  }
  const options: ChatOption[] = [
    ...realRows.map((r) => ({ id: `client:${r.clientId}`, label: r.companyName })),
    { id: "new_client", label: "New client" },
  ];
  await postBotMessage({
    channel: "updates",
    body: "Which client?",
    inputMode: "buttons",
    options,
    context: { type: "new_project_client", meetingId, projectName },
  });
}

/** Attach the meeting to a candidate project the owner picked, and re-run side copies. */
async function assignMeetingToProject(meetingRow: MeetingRow, candidateProjectId: number, userId: number): Promise<void> {
  await db().update(meeting).set({ projectId: candidateProjectId, updatedAt: new Date() }).where(eq(meeting.meetingId, meetingRow.meetingId));
  const title = await loadProjectTitle(candidateProjectId);
  await postBotMessage({ channel: "updates", body: `Added to ${title}.`, inputMode: "none" });

  const candidate = await routeCandidate();
  const ranked = rankCandidates({ title: meetingRow.title, summary: meetingRow.summary }, candidate);
  await createSideProjectCopies(meetingRow, ranked, candidateProjectId);

  await logChat("meeting_updated", "meeting", meetingRow.meetingId, userId, { projectId: candidateProjectId });
}

// ─── Button-tap dispatch ──────────────────────────────

async function dispatchAnswer(row: ChatMessageRow, optionId: string, userId: number): Promise<void> {
  const context = row.context as ChatContext;
  if (!context) return;

  switch (context.type) {
    case "confident_fyi": {
      if (optionId === "change") {
        const meetingRow = await loadMeeting(context.meetingId);
        if (meetingRow) await postMeetingMatchQuestion(meetingRow);
      }
      // "ok" is a no-op — the row is already locked by answerOption.
      return;
    }
    case "meeting_match": {
      if (optionId === "new_project") {
        await postBotMessage({
          channel: "updates",
          body: "Name?",
          inputMode: "text",
          context: { type: "new_project_name", meetingId: context.meetingId },
        });
        return;
      }
      if (optionId === "skip") {
        await db().update(meeting).set({ projectId: null, updatedAt: new Date() }).where(eq(meeting.meetingId, context.meetingId));
        await postBotMessage({ channel: "updates", body: "OK, skipped.", inputMode: "none" });
        await logChat("meeting_updated", "meeting", context.meetingId, userId, { projectId: null });
        return;
      }
      if (optionId.startsWith("project:")) {
        const candidateProjectId = Number(optionId.slice("project:".length));
        const meetingRow = await loadMeeting(context.meetingId);
        if (meetingRow) await assignMeetingToProject(meetingRow, candidateProjectId, userId);
        return;
      }
      return;
    }
    case "new_project_client": {
      if (optionId === "new_client") {
        await askCompanyName({ meetingId: context.meetingId }, context.projectName);
        return;
      }
      if (optionId.startsWith("client:")) {
        const clientId = Number(optionId.slice("client:".length));
        await createProjectAndAssign(clientId, context.projectName, { meetingId: context.meetingId }, userId);
      }
      return;
    }
    case "recording_check": {
      const target = { fileId: context.fileId, grant: context.grant };
      if (optionId === "yes" && context.guess) {
        await createClientProjectAndAssign(context.guess.company, context.guess.project, target, userId);
        return;
      }
      if (optionId === "type") {
        await askCompanyName(target);
        return;
      }
      if (optionId === "existing") {
        await postRecordingProjectQuestion(context.fileId, context.grant);
        return;
      }
      if (optionId === "skip") {
        await postBotMessage({ channel: "updates", body: "OK, not added.", inputMode: "none" });
        await logChat("recording_skipped", "plaud_file", null, userId, { fileId: context.fileId });
      }
      return;
    }
    case "recording_project": {
      if (optionId.startsWith("project:")) {
        const projectId = Number(optionId.slice("project:".length));
        await assignTarget({ fileId: context.fileId, grant: context.grant }, projectId, await loadProjectTitle(projectId), userId);
      }
      return;
    }
    case "ask_followup": {
      const options = (row.options as ChatOption[] | null) ?? [];
      const chosen = options.find((o) => o.id === optionId);
      if (chosen) await sendOwnerText("ask", chosen.label, userId);
      return;
    }
    default:
      return;
  }
}

/** 409 if the row is already answered — enforced here, not just client-side. */
export async function answerOption(messageId: number, optionId: string, userId: number): Promise<ChatMessageRow> {
  const [row] = await db().select().from(chatMessage).where(eq(chatMessage.chatMessageId, messageId)).limit(1);
  if (!row) throw new HTTPException(404, { message: "Message not found" });
  if (row.inputMode !== "buttons") throw new HTTPException(400, { message: "This message has no buttons" });
  if (row.answeredOptionId) throw new HTTPException(409, { message: "Already answered" });

  const options = (row.options as ChatOption[] | null) ?? [];
  if (!options.some((o) => o.id === optionId)) {
    throw new HTTPException(400, { message: "Unknown option" });
  }

  const [updated] = await db()
    .update(chatMessage)
    .set({ answeredOptionId: optionId })
    .where(eq(chatMessage.chatMessageId, messageId))
    .returning();

  await dispatchAnswer(updated, optionId, userId);
  return updated;
}

// ─── Owner free text ──────────────────────────────────

export async function sendOwnerText(channel: ChatChannel, body: string, userId: number): Promise<ChatMessageRow> {
  const [owned] = await db()
    .insert(chatMessage)
    .values({ channel, sender: "owner", sentByUserId: userId, body, inputMode: "none" })
    .returning();

  if (channel === "ask") {
    await runAskTurn(body);
    return owned;
  }

  // Updates channel: the most recent unanswered text-mode bot prompt (if any)
  // is what this free text answers — never a general free-text parser.
  const [pending] = await db()
    .select()
    .from(chatMessage)
    .where(
      and(
        eq(chatMessage.channel, "updates"),
        eq(chatMessage.sender, "bot"),
        eq(chatMessage.inputMode, "text"),
        isNull(chatMessage.answeredOptionId),
      ),
    )
    .orderBy(desc(chatMessage.chatMessageId))
    .limit(1);

  if (pending) {
    await db()
      .update(chatMessage)
      .set({ answeredOptionId: body.slice(0, 50) })
      .where(eq(chatMessage.chatMessageId, pending.chatMessageId));

    const context = pending.context as ChatContext;
    if (context?.type === "new_project_name") {
      await handleNewProjectName(context.meetingId, body, userId);
    } else if (context?.type === "new_client_company") {
      await handleCompanyName(context, body, userId);
    } else if (context?.type === "new_client_project") {
      await createClientProjectAndAssign(context.companyName, body, context.target, userId);
    }
  }
  // No pending prompt: a disconnected note. The owner row above is kept; no
  // further dispatch — this is the server's defined behavior for that case.

  return owned;
}

// ─── Ask channel ──────────────────────────────────────

const ASK_PROJECT_CAP = 50;
const ASK_MEETING_CAP = 30;
const ASK_EVENT_CAP = 20;

export type AskSnapshot = {
  project: { title: string; status: string; clientCompany: string | null }[];
  meeting: { title: string; projectTitle: string | null; recordedAt: string; hasTranscript: boolean }[];
  event: { title: string; startsAt: string; projectTitle: string | null }[];
};

/** Read-only. No transcript text, ever — only a has-transcript boolean. */
export async function buildAskContextSnapshot(): Promise<AskSnapshot> {
  const d = db();

  const projectRow = await d
    .select({ title: project.title, status: project.projectStatus, clientCompany: client.companyName })
    .from(project)
    .leftJoin(client, eq(project.clientId, client.clientId))
    .limit(ASK_PROJECT_CAP);

  const meetingRow = await d
    .select({
      title: meeting.title,
      projectTitle: project.title,
      recordedAt: meeting.recordedAt,
      transcript: meeting.transcript,
    })
    .from(meeting)
    .leftJoin(project, eq(meeting.projectId, project.projectId))
    .orderBy(desc(meeting.recordedAt))
    .limit(ASK_MEETING_CAP);

  const eventRow = await d
    .select({ title: calendarEvent.title, startsAt: calendarEvent.startsAt, projectTitle: project.title })
    .from(calendarEvent)
    .leftJoin(project, eq(calendarEvent.projectId, project.projectId))
    .orderBy(asc(calendarEvent.startsAt))
    .limit(ASK_EVENT_CAP);

  return {
    project: projectRow.map((r) => ({ title: r.title, status: r.status, clientCompany: r.clientCompany ?? null })),
    meeting: meetingRow.map((r) => ({
      title: r.title,
      projectTitle: r.projectTitle ?? null,
      recordedAt: r.recordedAt.toISOString(),
      hasTranscript: Boolean(r.transcript && r.transcript.trim().length > 0),
    })),
    event: eventRow.map((r) => ({ title: r.title, startsAt: r.startsAt.toISOString(), projectTitle: r.projectTitle ?? null })),
  };
}

/** Exposed to the GET route so the widget can show this before the owner even types. */
export function isAskAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Two different honest lines, not one generic one: "no key" is a known,
// permanent-until-configured state; "error" means the key is set but this
// particular call failed (bad/garbled model output, API error, timeout) —
// worth telling the owner to just try again.
const ASK_FALLBACK_NO_KEY = "Ask is off right now. No AI key is configured.";
const ASK_FALLBACK_ERROR = "Ask couldn't answer that one. Try asking again.";

const ASK_SYSTEM = `You answer short questions about ADVO's own projects, meetings and calendar for the agency's owner. Use only common, plain words and short lines. Return ONLY JSON: {"reply": string, "options"?: [{"id": string, "label": string}]}. Do not include any text before or after the JSON object. Base every answer only on the JSON snapshot given as the user turn — never invent a project, meeting or date that is not in it. If the snapshot has no answer, say so plainly in "reply".`;

type AskReply = { reply: string; options?: ChatOption[] };
type AskOutcome = { ok: true; reply: AskReply } | { ok: false; reason: "no_key" | "error" };

/**
 * Pulls the first balanced `{...}` object out of free-form text. Models
 * sometimes wrap JSON in prose ("Sure, here's the answer:\n{...}\nLet me
 * know!") even when told not to — fence-stripping alone doesn't handle that,
 * so this scans for the first `{` and matches braces to find where the
 * object actually ends, instead of assuming the whole trimmed string is JSON.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAskReply(raw: string): AskReply | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const candidates = [cleaned, extractJsonObject(cleaned)].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { reply?: unknown; options?: unknown };
      if (typeof parsed.reply !== "string" || !parsed.reply.trim()) continue;
      const options = Array.isArray(parsed.options)
        ? parsed.options.filter(
            (o): o is ChatOption => typeof o === "object" && o !== null && typeof o.id === "string" && typeof o.label === "string",
          )
        : undefined;
      return { reply: parsed.reply, options };
    } catch {
      // try the next candidate (e.g. the fence-stripped string failed because
      // of leading/trailing prose; the brace-matched extraction may still work)
    }
  }
  return null;
}

// Exported for direct unit testing of the parse/fallback behavior without a
// live DB — buildAskContextSnapshot() is the only DB-touching half of a full
// Ask turn, and this function takes a snapshot as a plain argument instead
// of building its own, so a test can hand it a fixture.
export async function askWithAI(question: string, snapshot: AskSnapshot): Promise<AskOutcome> {
  if (!isAskAvailable()) return { ok: false, reason: "no_key" };
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: ADVO_AI_MODEL,
      max_tokens: 1000,
      system: ASK_SYSTEM,
      // Single call per turn — no tool-use loop. The snapshot + question are
      // both the untrusted/volatile user turn, never folded into the system prompt.
      messages: [{ role: "user", content: JSON.stringify({ snapshot, question }) }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, reason: "error" };
    const reply = parseAskReply(block.text);
    if (!reply) return { ok: false, reason: "error" };
    return { ok: true, reply };
  } catch (err) {
    console.error("[chat] Ask AI call failed; falling back to honest offline message:", err);
    return { ok: false, reason: "error" };
  }
}

async function runAskTurn(question: string): Promise<void> {
  const snapshot = await buildAskContextSnapshot();
  const outcome = await askWithAI(question, snapshot);

  if (!outcome.ok) {
    const body = outcome.reason === "no_key" ? ASK_FALLBACK_NO_KEY : ASK_FALLBACK_ERROR;
    await postBotMessage({ channel: "ask", body, inputMode: "none" });
    return;
  }

  const result = outcome.reply;
  if (result.options && result.options.length > 0) {
    await postBotMessage({
      channel: "ask",
      body: result.reply,
      inputMode: "buttons",
      options: result.options,
      context: { type: "ask_followup" },
    });
    return;
  }

  await postBotMessage({ channel: "ask", body: result.reply, inputMode: "none" });
}
