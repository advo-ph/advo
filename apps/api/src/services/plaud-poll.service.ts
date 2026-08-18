/**
 * RSS-like probe of the Plaud ADVO folder.
 * New recordings (tag ADVO or name contains "advo") import into Inbox
 * without going through praud. Skips file ids already on meeting.
 */
import { inArray, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting } from "../db/schema.js";
import { recordError } from "../utils/error-capture.js";
import { createLogger } from "../utils/logger.js";
import {
  firstAdminUserId,
  importPlaudMeeting,
  resolveInboxProjectId,
} from "./plaud-import.service.js";
import { hasPlaudAuth, isTokenUsable, listAdvoFile, plaudAuthState } from "./plaud.service.js";

const log = createLogger("plaud-poll");

/** A failed tick widens the interval by this factor, capped at MAX_BACKOFF_STEP. */
const BACKOFF_FACTOR = 2;
const MAX_BACKOFF_STEP = 5;

export type PlaudSyncStatus = {
  isEnabled: boolean;
  isRunning: boolean;
  intervalSecond: number;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailure: number;
  isSuppressed: boolean;
  suppressedReason: string | null;
  importedCount: number;
  skippedCount: number;
  seenCount: number;
  importedMeetingId: number[];
};

const status: PlaudSyncStatus = {
  isEnabled: false,
  isRunning: false,
  intervalSecond: 60,
  lastSyncAt: null,
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailure: 0,
  isSuppressed: false,
  suppressedReason: null,
  importedCount: 0,
  skippedCount: 0,
  seenCount: 0,
  importedMeetingId: [],
};

let timer: ReturnType<typeof setTimeout> | null = null;
let isStopped = true;

export function plaudSyncStatus(): PlaudSyncStatus {
  return { ...status, importedMeetingId: [...status.importedMeetingId] };
}

function intervalSecond(): number {
  const raw = Number(process.env.PLAUD_POLL_SECOND ?? "60");
  if (!Number.isFinite(raw) || raw < 0) return 60;
  return Math.floor(raw);
}

/**
 * Bounded backoff. A tick that fails does NOT get retried at the same cadence —
 * a dead token used to mean one doomed outbound connect every 60s forever, and
 * each of those leaked a socket into TIME_WAIT.
 */
function nextDelayMillisecond(): number {
  const base = status.intervalSecond * 1000;
  const step = Math.min(status.consecutiveFailure, MAX_BACKOFF_STEP);
  return base * Math.pow(BACKOFF_FACTOR, step);
}

/**
 * Why this tick must not touch the network. Configured-but-rejected counts:
 * hasPlaudAuth() only proves a token string exists.
 */
function suppressedReason(): string | null {
  if (!hasPlaudAuth()) return "Plaud auth is not configured";
  if (!isTokenUsable()) return plaudAuthState().deadReason ?? "Plaud token is not usable";
  return null;
}

/** Plaud file ids already on a meeting row — the page walk's stop set. */
async function importedFileId(): Promise<Set<string>> {
  const row = await db()
    .select({ plaudFileId: meeting.plaudFileId })
    .from(meeting)
    .where(isNotNull(meeting.plaudFileId));
  const id = new Set<string>();
  for (const r of row) {
    if (r.plaudFileId) id.add(r.plaudFileId);
  }
  return id;
}

export async function syncPlaudFolder(): Promise<PlaudSyncStatus> {
  if (status.isRunning) return plaudSyncStatus();

  // Gate BEFORE any outbound request. A suppressed tick costs zero sockets.
  const blocked = suppressedReason();
  if (blocked) {
    status.isEnabled = false;
    status.isSuppressed = true;
    status.suppressedReason = blocked;
    status.lastError = blocked;
    status.lastSyncAt = new Date().toISOString();
    return plaudSyncStatus();
  }

  status.isRunning = true;
  status.isEnabled = true;
  status.isSuppressed = false;
  status.suppressedReason = null;
  try {
    // Feed already-imported ids in so the page walk stops at the first one it
    // recognises instead of pulling the whole account every tick.
    const seenFileId = await importedFileId();
    const file = await listAdvoFile(seenFileId);
    status.seenCount = file.length;

    const fileId = file.map((f) => f.fileId);
    const existing = new Set<string>();
    if (fileId.length > 0) {
      const row = await db()
        .select({ plaudFileId: meeting.plaudFileId })
        .from(meeting)
        .where(inArray(meeting.plaudFileId, fileId));
      for (const r of row) {
        if (r.plaudFileId) existing.add(r.plaudFileId);
      }
    }

    const fresh = file.filter((f) => !existing.has(f.fileId));
    const projectId = await resolveInboxProjectId(null);
    const createdBy = await firstAdminUserId();

    let imported = 0;
    let skipped = existing.size;
    const importedMeetingId: number[] = [];
    for (const f of fresh) {
      try {
        const result = await importPlaudMeeting({
          projectId,
          fileId: f.fileId,
          createdBy,
        });
        if (result.created) {
          imported += 1;
          if (result.meeting?.meetingId) importedMeetingId.push(result.meeting.meetingId);
        } else skipped += 1;
      } catch (err) {
        skipped += 1;
        if (err instanceof HTTPException && (err.status === 422 || err.status === 502)) {
          log.info({ fileId: f.fileId, status: err.status }, "skip Plaud file");
          continue;
        }
        throw err;
      }
    }

    status.importedCount = imported;
    status.importedMeetingId = importedMeetingId;
    status.skippedCount = skipped;
    status.lastError = null;
    status.consecutiveFailure = 0;
    status.lastSyncAt = new Date().toISOString();
    status.lastSuccessAt = status.lastSyncAt;
    if (imported > 0) {
      log.info({ imported, skipped, seen: file.length }, "Plaud ADVO folder sync");
    }
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : "Plaud sync failed";
    status.consecutiveFailure += 1;
    status.lastSyncAt = new Date().toISOString();
    // A token the API has rejected latches the poll off entirely rather than
    // burning one connect per tick forever.
    const dead = suppressedReason();
    if (dead) {
      status.isSuppressed = true;
      status.isEnabled = false;
      status.suppressedReason = dead;
      log.warn({ reason: dead }, "Plaud poll suppressed — token unusable");
    }
    recordError("plaud-poll", err);
    log.error({ err, consecutiveFailure: status.consecutiveFailure }, "Plaud ADVO folder sync failed");
  } finally {
    status.isRunning = false;
  }
  return plaudSyncStatus();
}

/**
 * Self-rescheduling tick rather than a fixed setInterval, so a failing tick can
 * widen its own next delay and a suppressed one can stop the chain outright.
 */
function schedule(delayMillisecond: number): void {
  if (isStopped) return;
  timer = setTimeout(() => {
    void runTick();
  }, delayMillisecond);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
}

async function runTick(): Promise<void> {
  if (isStopped) return;
  await syncPlaudFolder();
  if (status.isSuppressed) {
    log.info({ reason: status.suppressedReason }, "Plaud poll stopped — nothing to poll with");
    return;
  }
  schedule(nextDelayMillisecond());
}

export function startPlaudPoll(): void {
  const second = intervalSecond();
  status.intervalSecond = second;
  if (second === 0) {
    status.isEnabled = false;
    status.isSuppressed = true;
    status.suppressedReason = "PLAUD_POLL_SECOND=0";
    log.info("Plaud poll disabled (PLAUD_POLL_SECOND=0)");
    return;
  }
  const blocked = suppressedReason();
  if (blocked) {
    status.isEnabled = false;
    status.isSuppressed = true;
    status.suppressedReason = blocked;
    log.info({ reason: blocked }, "Plaud poll idle — no usable Plaud token");
    return;
  }
  isStopped = false;
  status.isEnabled = true;
  void runTick();
  log.info({ intervalSecond: second }, "Plaud ADVO folder poll started");
}

export function stopPlaudPoll(): void {
  isStopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  status.isEnabled = false;
}
