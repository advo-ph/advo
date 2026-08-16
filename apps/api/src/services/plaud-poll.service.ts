/**
 * RSS-like probe of the Plaud ADVO folder.
 * New recordings (tag ADVO or name contains "advo") import into Inbox
 * without going through praud. Skips file ids already on meeting.
 */
import { inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import {
  firstAdminUserId,
  importPlaudMeeting,
  resolveInboxProjectId,
} from "./plaud-import.service.js";
import { hasPlaudAuth, listAdvoFile } from "./plaud.service.js";

const log = createLogger("plaud-poll");

export type PlaudSyncStatus = {
  isEnabled: boolean;
  isRunning: boolean;
  intervalSecond: number;
  lastSyncAt: string | null;
  lastError: string | null;
  importedCount: number;
  skippedCount: number;
  seenCount: number;
};

const status: PlaudSyncStatus = {
  isEnabled: false,
  isRunning: false,
  intervalSecond: 60,
  lastSyncAt: null,
  lastError: null,
  importedCount: 0,
  skippedCount: 0,
  seenCount: 0,
};

let timer: ReturnType<typeof setInterval> | null = null;

export function plaudSyncStatus(): PlaudSyncStatus {
  return { ...status };
}

function intervalSecond(): number {
  const raw = Number(process.env.PLAUD_POLL_SECOND ?? "60");
  if (!Number.isFinite(raw) || raw < 0) return 60;
  return Math.floor(raw);
}

export async function syncPlaudFolder(): Promise<PlaudSyncStatus> {
  if (status.isRunning) return plaudSyncStatus();
  if (!hasPlaudAuth()) {
    status.isEnabled = false;
    status.lastError = "Plaud auth is not configured";
    status.lastSyncAt = new Date().toISOString();
    return plaudSyncStatus();
  }

  status.isRunning = true;
  status.isEnabled = true;
  try {
    const file = await listAdvoFile();
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
    for (const f of fresh) {
      try {
        const result = await importPlaudMeeting({
          projectId,
          fileId: f.fileId,
          createdBy,
        });
        if (result.created) imported += 1;
        else skipped += 1;
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
    status.skippedCount = skipped;
    status.lastError = null;
    status.lastSyncAt = new Date().toISOString();
    if (imported > 0) {
      log.info({ imported, skipped, seen: file.length }, "Plaud ADVO folder sync");
    }
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : "Plaud sync failed";
    status.lastSyncAt = new Date().toISOString();
    log.error({ err }, "Plaud ADVO folder sync failed");
  } finally {
    status.isRunning = false;
  }
  return plaudSyncStatus();
}

export function startPlaudPoll(): void {
  const second = intervalSecond();
  status.intervalSecond = second;
  if (second === 0) {
    status.isEnabled = false;
    log.info("Plaud poll disabled (PLAUD_POLL_SECOND=0)");
    return;
  }
  if (!hasPlaudAuth()) {
    status.isEnabled = false;
    log.info("Plaud poll idle — no PLAUD_TOKEN / auth file");
    return;
  }
  status.isEnabled = true;
  void syncPlaudFolder();
  timer = setInterval(() => {
    void syncPlaudFolder();
  }, second * 1000);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
  log.info({ intervalSecond: second }, "Plaud ADVO folder poll started");
}

export function stopPlaudPoll(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  status.isEnabled = false;
}
