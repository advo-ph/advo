/**
 * Retention + rollup for analytics_event (migration 046).
 *
 * DEFAULT AS OF THE visitor-analytics PLAN: raw rows are kept FOREVER unless an operator
 * opts in by setting ANALYTICS_RETENTION_DAY to a positive integer, at which point the
 * rollup-verify-then-delete sweep below applies at that many days. This was a deliberate
 * scope change — the admin visitor-stats surface reads geo and page detail straight off
 * the raw table for any date range, so there is no separate aggregate to preserve history
 * once rows start ageing out. See the plan's Risks section for the storage-growth tradeoff
 * this implies on a 20 GB VPS disk.
 *
 * The daily rollup (rollupAnalyticsEvent) is UNCHANGED and keeps running regardless of the
 * above — it is cheap and still what any future long-range chart reads for coarse trends.
 *
 * The order is the entire safety property, for the opt-in deletion path: rollup, verify,
 * then delete. A sweep that deleted before aggregating would silently erase history the
 * moment the rollup threw. If rollupAnalyticsEvent() fails, sweepAnalyticsEvent() does not
 * run and the raw rows simply stay another cycle — the table grows a little, which is
 * recoverable; the history does not disappear, which would not be.
 *
 * activity_log is NOT touched by any of this. It is a 24-row audit trail kept forever.
 */
import { and, count, countDistinct, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { analyticsEvent, analyticsEventRollup } from "../db/schema.js";
import { recordError } from "../utils/error-capture.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("retention");

/**
 * The legacy/example retention window, kept as a named constant so an operator opting
 * into deletion has a documented starting point (ninety days covers a full quarter's
 * session-level debugging — the only thing raw rows are actually needed for). NOT used as
 * an implicit default any more: deletion is disabled unless ANALYTICS_RETENTION_DAY is
 * explicitly set to a positive integer (see retentionDay() below).
 */
export const RETENTION_DAY = 90;

/** A day older than this is already rolled up and past the window — never re-rolled. */
const ROLLUP_LOOKBACK_DAY = 3;

/** One sweep pass per this interval. Hourly would be wasted work on a daily-grain rollup. */
const SWEEP_INTERVAL_HOUR = 24;

/** Never delete more than this in one statement — a 500k-row DELETE locks the table. */
const SWEEP_BATCH_SIZE = 5000;

export type RetentionResult = {
  /** Null when deletion is disabled (the default) -- the rollup still ran regardless. */
  retentionDay: number | null;
  /** True when ANALYTICS_RETENTION_DAY opted into the delete sweep this pass. */
  isRetentionEnabled: boolean;
  rolledDay: string[];
  rollupRowCount: number;
  deletedCount: number;
  isComplete: boolean;
};

/** Returns null when deletion is disabled (the default). A positive env value opts in. */
export function retentionDay(): number | null {
  const raw = process.env.ANALYTICS_RETENTION_DAY;
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** UTC midnight n days back. The rollup grain is a UTC date, matching `period`. */
function dayStart(dayAgo: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dayAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate one UTC day of raw events into analytics_event_rollup.
 *
 * Grouped by (kind, path) — the one breakdown worth keeping forever. Session and visitor
 * identity are deliberately NOT carried across; a permanent per-visitor record is a privacy
 * liability and ageing individual behaviour out is the point of the window.
 *
 * Idempotent: the unique index on (period, kind, path) turns a re-run into an UPDATE, so a
 * crashed sweep can be re-run without doubling any count. Counts are OVERWRITTEN rather
 * than incremented, for the same reason — a partially-written day converges to the truth on
 * the next pass instead of drifting upward.
 *
 * Bucketed on receivedAt, not occurredAt: a client clock can be skewed or forged, and a row
 * must never be able to land in a day the sweep has already passed.
 */
export async function rollupAnalyticsEvent(dayAgo = 1): Promise<number> {
  const from = dayStart(dayAgo);
  const to = dayStart(dayAgo - 1);
  const period = dayKey(from);

  const row = await db()
    .select({
      kind: analyticsEvent.kind,
      path: analyticsEvent.path,
      eventCount: count(),
      sessionCount: countDistinct(analyticsEvent.sessionId),
      visitorCount: countDistinct(analyticsEvent.visitorId),
    })
    .from(analyticsEvent)
    .where(and(gte(analyticsEvent.receivedAt, from), lt(analyticsEvent.receivedAt, to)))
    .groupBy(analyticsEvent.kind, analyticsEvent.path);

  if (row.length === 0) return 0;

  await db()
    .insert(analyticsEventRollup)
    .values(
      row.map((r) => ({
        period,
        kind: r.kind,
        path: r.path,
        eventCount: r.eventCount,
        sessionCount: r.sessionCount,
        visitorCount: r.visitorCount,
      }))
    )
    .onConflictDoUpdate({
      target: [
        analyticsEventRollup.period,
        analyticsEventRollup.kind,
        analyticsEventRollup.path,
      ],
      set: {
        eventCount: sql`excluded.event_count`,
        sessionCount: sql`excluded.session_count`,
        visitorCount: sql`excluded.visitor_count`,
        updatedAt: new Date(),
      },
    });

  return row.length;
}

/**
 * Delete raw rows past the window, in bounded batches.
 *
 * Returns isComplete=false when the batch cap was hit — the caller does NOT loop it to
 * exhaustion inside one tick. A first sweep against a long-unswept table would otherwise
 * hold the table for minutes; the remainder is taken by the next tick instead.
 */
export async function sweepAnalyticsEvent(): Promise<{
  deletedCount: number;
  isComplete: boolean;
  refusedDay: string[];
}> {
  const day = retentionDay();
  if (day === null) {
    // The default: deletion is disabled. Raw rows are kept forever until an operator
    // opts in by setting ANALYTICS_RETENTION_DAY. No DB call is made.
    return { deletedCount: 0, isComplete: true, refusedDay: [] };
  }

  const cutoff = dayStart(day);

  /**
   * REFUSE TO DELETE AN UNROLLED DAY.
   *
   * The stated safety property of this file is "rollup, verify, then delete", but
   * nothing verified. ROLLUP_LOOKBACK_DAY is 3 while the sweep deletes at 90, so a
   * process down for more than 3 days never rolls the days it missed — and 90 days
   * later the raw rows were deleted with no aggregate ever written. Silent, total,
   * unrecoverable history loss.
   *
   * So: before deleting anything at the cutoff, confirm that day has a rollup row.
   * If it does not, roll it now; if that still produces nothing, skip the delete and
   * say so out loud rather than destroying the only copy.
   */
  const refusedDay: string[] = [];
  const cutoffKey = dayKey(cutoff);

  const [existingRollup] = await db()
    .select({ analyticsEventRollupId: analyticsEventRollup.analyticsEventRollupId })
    .from(analyticsEventRollup)
    .where(eq(analyticsEventRollup.period, cutoffKey))
    .limit(1);

  if (!existingRollup) {
    const written = await rollupAnalyticsEvent(day);
    if (written === 0) {
      const [orphan] = await db()
        .select({ orphanCount: count() })
        .from(analyticsEvent)
        .where(and(gte(analyticsEvent.receivedAt, cutoff), lt(analyticsEvent.receivedAt, dayStart(day - 1))));

      if ((orphan?.orphanCount ?? 0) > 0) {
        refusedDay.push(cutoffKey);
        log.warn(
          { period: cutoffKey, rowCount: orphan?.orphanCount },
          "refusing to delete analytics_event for a day with no rollup row",
        );
        return { deletedCount: 0, isComplete: false, refusedDay };
      }
    }
  }

  const doomed = await db()
    .select({ analyticsEventId: analyticsEvent.analyticsEventId })
    .from(analyticsEvent)
    .where(lt(analyticsEvent.receivedAt, cutoff))
    .orderBy(analyticsEvent.analyticsEventId)
    .limit(SWEEP_BATCH_SIZE);

  if (doomed.length === 0) return { deletedCount: 0, isComplete: true, refusedDay };

  // Delete by the id ceiling of the batch rather than by an id list — one indexed range
  // predicate instead of a 5000-element IN.
  const ceiling = doomed[doomed.length - 1]!.analyticsEventId;
  await db()
    .delete(analyticsEvent)
    .where(
      and(
        lt(analyticsEvent.receivedAt, cutoff),
        lte(analyticsEvent.analyticsEventId, ceiling)
      )
    );

  return { deletedCount: doomed.length, isComplete: doomed.length < SWEEP_BATCH_SIZE, refusedDay };
}

/**
 * One full pass: roll up the recent unrolled days, THEN sweep. Never the other way round.
 * A rollup failure aborts the pass with the raw rows intact.
 */
export async function runRetention(): Promise<RetentionResult> {
  const rolledDay: string[] = [];
  let rollupRowCount = 0;

  for (let dayAgo = 1; dayAgo <= ROLLUP_LOOKBACK_DAY; dayAgo += 1) {
    const written = await rollupAnalyticsEvent(dayAgo);
    if (written > 0) {
      rolledDay.push(dayKey(dayStart(dayAgo)));
      rollupRowCount += written;
    }
  }

  const swept = await sweepAnalyticsEvent();
  const day = retentionDay();

  return {
    retentionDay: day,
    isRetentionEnabled: day !== null,
    rolledDay,
    rollupRowCount,
    deletedCount: swept.deletedCount,
    isComplete: swept.isComplete,
  };
}

// ─── Scheduling ───────────────────────────────────────
//
// Same shape as startPlaudPoll (services/plaud-poll.service.ts): a self-rescheduling
// setTimeout with an unref'd handle and an explicit stop for graceful shutdown. No new
// scheduler dependency — the repo already decided this is how background work runs here.

let timer: ReturnType<typeof setTimeout> | null = null;
let isStopped = true;

function intervalMillisecond(): number {
  return SWEEP_INTERVAL_HOUR * 60 * 60 * 1000;
}

function schedule(delayMillisecond: number): void {
  if (isStopped) return;
  timer = setTimeout(() => {
    void runTick();
  }, delayMillisecond);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
}

async function runTick(): Promise<void> {
  if (isStopped) return;
  try {
    const result = await runRetention();
    if (result.rollupRowCount > 0 || result.deletedCount > 0) {
      log.info(result, "analytics retention pass");
    }
    // An incomplete sweep still has rows past the window — come back in a minute rather
    // than waiting a full day to resume.
    schedule(result.isComplete ? intervalMillisecond() : 60 * 1000);
    return;
  } catch (err) {
    recordError("retention", err);
    log.error({ err }, "analytics retention pass failed");
    schedule(intervalMillisecond());
  }
}

export function startRetentionSweep(): void {
  if (!isStopped) return;
  isStopped = false;
  // First pass is delayed a minute so boot is not competing with a table scan.
  schedule(60 * 1000);
  log.info({ retentionDay: retentionDay(), intervalHour: SWEEP_INTERVAL_HOUR }, "analytics retention sweep started");
}

export function stopRetentionSweep(): void {
  isStopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
