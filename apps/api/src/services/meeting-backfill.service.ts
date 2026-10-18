/**
 * Backfill: make the Meetings page agree with the transcripts ADVO already holds.
 *
 * Transcripts live in three places, and only the first one is what the Meetings page
 * reads:
 *   1. meeting.transcript / meeting.summary          (the Meetings page)
 *   2. corpus_source kind='plaud' .body / .summary   (Plaud transcripts in the corpus;
 *      the curated JSON loader and older ingests wrote these without a meeting row,
 *      or without meta.meetingId pointing at one)
 *   3. meeting_recording.transcript                  (Whisper uploads; the job wrote
 *      the text to meeting.summary and left meeting.transcript "(transcript pending)")
 *
 * For every Plaud corpus source this finds its meeting (meta.meetingId, then the Plaud
 * file id, then the share key, then one meeting with the same title on the same Manila
 * day). Found: the source gets meta.meetingId, and the meeting's transcript/summary is
 * filled only when it is empty. Not found: a meeting is created from the source, under
 * the source's project (Inbox when it has none). A source whose meeting was deleted on
 * purpose (meta.meetingId set, row gone) is never resurrected. A meeting whose
 * transcript is still empty takes the Whisper text from its recordings.
 *
 * Idempotent: a second run plans nothing. Nothing that already has text is overwritten.
 * planBackfill is pure (unit-tested); backfillMeetingsFromTranscripts loads and writes.
 */
import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { corpusSource, meeting, meetingRecording } from "../db/schema.js";
import { parseFileId, parseShareKey } from "./plaud.service.js";
import { firstAdminUserId, resolveInboxProjectId } from "./plaud-import.service.js";
import { isPendingTranscript } from "./meeting.service.js";

export { isPendingTranscript };

/** YYYY-MM-DD on the Asia/Manila calendar. */
export function manilaDay(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
}

function titleKey(title: string, day: string | null): string | null {
  const t = title.toLowerCase().replace(/\s+/g, " ").trim();
  return t && day ? `${day}|${t}` : null;
}

/** The Plaud identities a corpus source carries in its externalId / url. */
export function plaudKeysOf(source: { externalId: string; url: string | null }): {
  fileId: string | null;
  shareKey: string | null;
  sharePrefix: string | null;
} {
  const fromUrl = source.url?.match(/\/file\/([^/?#]+)/)?.[1] ?? null;
  const fileId = parseFileId(source.externalId) ?? (fromUrl ? parseFileId(fromUrl) : null);
  const shareKey =
    (source.url && /\/(s|share|nshare)\//.test(source.url) ? parseShareKey(source.url) : null) ??
    parseShareKey(source.externalId);
  const sharePrefix = shareKey ? shareKey.split("::")[0] : null;
  return { fileId, shareKey, sharePrefix };
}

export type BackfillMeeting = {
  meetingId: number;
  title: string;
  recordedAt: Date;
  transcript: string;
  summary: string | null;
  plaudFileId: string | null;
  plaudShareKey: string | null;
  parentMeetingId: number | null;
};

export type BackfillSource = {
  corpusSourceId: number;
  externalId: string;
  url: string | null;
  title: string;
  occurredAt: Date | null;
  ingestedAt: Date;
  summary: string | null;
  body: string | null;
  projectId: number | null;
  ingestedBy: number | null;
  meta: Record<string, unknown>;
};

export type BackfillRecording = { meetingId: number; transcript: string; createdAt: Date };

export type BackfillPlan = {
  link: Array<{ corpusSourceId: number; meetingId: number }>;
  fill: Array<{ meetingId: number; transcript?: string; summary?: string; from: "corpus" | "recording" }>;
  create: Array<{
    corpusSourceId: number;
    projectId: number | null;
    title: string;
    recordedAt: Date;
    transcript: string;
    summary: string | null;
    plaudFileId: string | null;
    plaudShareKey: string | null;
    createdBy: number | null;
  }>;
  skip: Array<{ corpusSourceId: number; reason: string }>;
};

/** Decide every change without touching the database. */
export function planBackfill(
  meetings: BackfillMeeting[],
  sources: BackfillSource[],
  recordings: BackfillRecording[],
): BackfillPlan {
  const plan: BackfillPlan = { link: [], fill: [], create: [], skip: [] };
  // Side-project excerpt copies (057) share their primary's title; never match them.
  const primary = meetings.filter((m) => m.parentMeetingId == null);
  const byId = new Map(meetings.map((m) => [m.meetingId, m]));
  const byFileId = new Map<string, BackfillMeeting>();
  const bySharePrefix = new Map<string, BackfillMeeting>();
  const byTitleDay = new Map<string, BackfillMeeting[]>();
  for (const m of primary) {
    if (m.plaudFileId) byFileId.set(m.plaudFileId.toLowerCase(), m);
    if (m.plaudShareKey) bySharePrefix.set(m.plaudShareKey.split("::")[0], m);
    const key = titleKey(m.title, manilaDay(m.recordedAt));
    if (key) byTitleDay.set(key, [...(byTitleDay.get(key) ?? []), m]);
  }
  const takenFileId = new Set(byFileId.keys());
  const filled = new Set<number>();
  // Identities of meetings this run will create, so a second source for the same
  // recording (a share-link copy and a file-id copy) does not create a second meeting.
  const planned = new Map<string, number>();

  for (const s of sources) {
    const metaMeetingId = Number(s.meta?.meetingId);
    const hasMetaLink = Number.isInteger(metaMeetingId) && metaMeetingId > 0;
    const keys = plaudKeysOf(s);

    let match: BackfillMeeting | undefined;
    if (hasMetaLink) {
      match = byId.get(metaMeetingId);
      if (!match) {
        plan.skip.push({ corpusSourceId: s.corpusSourceId, reason: `meeting ${metaMeetingId} was deleted` });
        continue;
      }
    }
    match ??= keys.fileId ? byFileId.get(keys.fileId) : undefined;
    match ??= keys.sharePrefix ? bySharePrefix.get(keys.sharePrefix) : undefined;
    if (!match) {
      const key = titleKey(s.title, manilaDay(s.occurredAt));
      const same = key ? byTitleDay.get(key) ?? [] : [];
      if (same.length === 1) match = same[0];
    }

    const body = s.body?.trim() ? s.body : null;
    const summary = s.summary?.trim() ? s.summary : null;

    if (match) {
      if (!hasMetaLink) plan.link.push({ corpusSourceId: s.corpusSourceId, meetingId: match.meetingId });
      if (!filled.has(match.meetingId)) {
        const fill: BackfillPlan["fill"][number] = { meetingId: match.meetingId, from: "corpus" };
        if (body && isPendingTranscript(match.transcript)) fill.transcript = body;
        if (summary && !match.summary?.trim()) fill.summary = summary;
        if (fill.transcript || fill.summary) {
          plan.fill.push(fill);
          filled.add(match.meetingId);
        }
      }
      continue;
    }

    if (!body && !summary) {
      plan.skip.push({ corpusSourceId: s.corpusSourceId, reason: "no transcript or summary" });
      continue;
    }
    const identity = [
      keys.fileId ? `f:${keys.fileId}` : null,
      keys.sharePrefix ? `s:${keys.sharePrefix}` : null,
      titleKey(s.title, manilaDay(s.occurredAt)),
    ].filter((k): k is string => k != null);
    const twin = identity.map((k) => planned.get(k)).find((id) => id != null);
    if (twin != null) {
      plan.skip.push({ corpusSourceId: s.corpusSourceId, reason: `same recording as source ${twin}; links next run` });
      continue;
    }
    for (const k of identity) planned.set(k, s.corpusSourceId);
    const fileId = keys.fileId && !takenFileId.has(keys.fileId) ? keys.fileId : null;
    if (fileId) takenFileId.add(fileId);
    plan.create.push({
      corpusSourceId: s.corpusSourceId,
      projectId: s.projectId,
      title: (s.title || "Meeting").slice(0, 255),
      recordedAt: s.occurredAt ?? s.ingestedAt,
      transcript: body ?? "",
      summary,
      plaudFileId: fileId,
      plaudShareKey: keys.shareKey ? keys.shareKey.slice(0, 500) : null,
      createdBy: s.ingestedBy,
    });
  }

  // Whisper uploads: the recording has text, the meeting still says pending.
  const recordingText = new Map<number, string[]>();
  for (const r of [...recordings].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!r.transcript.trim()) continue;
    recordingText.set(r.meetingId, [...(recordingText.get(r.meetingId) ?? []), r.transcript.trim()]);
  }
  for (const [meetingId, text] of recordingText) {
    const m = byId.get(meetingId);
    if (!m || filled.has(meetingId) || !isPendingTranscript(m.transcript)) continue;
    plan.fill.push({ meetingId, transcript: text.join("\n\n"), from: "recording" });
    filled.add(meetingId);
  }
  return plan;
}

export type BackfillReport = {
  dryRun: boolean;
  corpusSourceCount: number;
  linkedCount: number;
  filledCount: number;
  createdCount: number;
  skippedCount: number;
  createdMeetingId: number[];
  filledMeetingId: number[];
  skipped: BackfillPlan["skip"];
};

/** Load, plan, and (unless dryRun) write. */
export async function backfillMeetingsFromTranscripts(opts: { dryRun?: boolean } = {}): Promise<BackfillReport> {
  const dryRun = opts.dryRun ?? false;
  const d = db();
  const [meetings, sources, recordings] = await Promise.all([
    d
      .select({
        meetingId: meeting.meetingId,
        title: meeting.title,
        recordedAt: meeting.recordedAt,
        transcript: meeting.transcript,
        summary: meeting.summary,
        plaudFileId: meeting.plaudFileId,
        plaudShareKey: meeting.plaudShareKey,
        parentMeetingId: meeting.parentMeetingId,
      })
      .from(meeting),
    d
      .select({
        corpusSourceId: corpusSource.corpusSourceId,
        externalId: corpusSource.externalId,
        url: corpusSource.url,
        title: corpusSource.title,
        occurredAt: corpusSource.occurredAt,
        ingestedAt: corpusSource.ingestedAt,
        summary: corpusSource.summary,
        body: corpusSource.body,
        projectId: corpusSource.projectId,
        ingestedBy: corpusSource.ingestedBy,
        meta: corpusSource.meta,
      })
      .from(corpusSource)
      .where(eq(corpusSource.kind, "plaud"))
      .orderBy(corpusSource.corpusSourceId),
    d
      .select({
        meetingId: meetingRecording.meetingId,
        transcript: meetingRecording.transcript,
        createdAt: meetingRecording.createdAt,
      })
      .from(meetingRecording)
      .where(isNotNull(meetingRecording.transcript)),
  ]);

  const plan = planBackfill(
    meetings,
    sources.map((s) => ({ ...s, meta: (s.meta ?? {}) as Record<string, unknown> })),
    recordings
      .filter((r): r is { meetingId: number; transcript: string; createdAt: Date } => r.meetingId != null && r.transcript != null),
  );

  const createdMeetingId: number[] = [];
  if (!dryRun) {
    const needsInbox = plan.create.some((c) => c.projectId == null);
    const inboxProjectId = needsInbox ? await resolveInboxProjectId(null) : null;
    const fallbackCreator = plan.create.some((c) => c.createdBy == null) ? await firstAdminUserId() : null;

    await d.transaction(async (tx) => {
      const linkMeta = async (corpusSourceId: number, meetingId: number) => {
        await tx
          .update(corpusSource)
          .set({
            meta: sql`${corpusSource.meta} || jsonb_build_object('meetingId', ${meetingId}::int, 'linkedBy', 'meeting-backfill')`,
            updatedAt: new Date(),
          })
          .where(eq(corpusSource.corpusSourceId, corpusSourceId));
      };
      for (const l of plan.link) await linkMeta(l.corpusSourceId, l.meetingId);
      for (const f of plan.fill) {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (f.transcript) set.transcript = f.transcript;
        if (f.summary) set.summary = f.summary;
        await tx.update(meeting).set(set).where(eq(meeting.meetingId, f.meetingId));
      }
      for (const c of plan.create) {
        const [row] = await tx
          .insert(meeting)
          .values({
            projectId: c.projectId ?? inboxProjectId,
            title: c.title,
            recordedAt: c.recordedAt,
            transcript: c.transcript,
            summary: c.summary,
            plaudFileId: c.plaudFileId,
            plaudShareKey: c.plaudShareKey,
            createdBy: c.createdBy ?? fallbackCreator,
          })
          .returning({ meetingId: meeting.meetingId });
        createdMeetingId.push(row.meetingId);
        await linkMeta(c.corpusSourceId, row.meetingId);
      }
    });
  }

  return {
    dryRun,
    corpusSourceCount: sources.length,
    linkedCount: plan.link.length,
    filledCount: plan.fill.length,
    createdCount: plan.create.length,
    skippedCount: plan.skip.length,
    createdMeetingId,
    filledMeetingId: plan.fill.map((f) => f.meetingId),
    skipped: plan.skip,
  };
}

