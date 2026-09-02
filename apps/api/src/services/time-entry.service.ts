/**
 * Time entry — minutes actually worked, and what they let the business finally say.
 *
 * The pure half of this file (everything above the first `db()` call) is where the value
 * is, and it is separated deliberately: `summarizeProjectTime`, `deriveCapacity` and
 * `formatDuration` are the functions that turn rows into the two answers the P0 tier has
 * been asking for without evidence —
 *
 *   "the 12k isnt enough as a downpayment"  → what did this project actually cost?
 *   "the workload on the developer side"    → who is over, and by how much?
 *
 * Both are pure, both take an injected `now`, and both are unit-tested rather than
 * demonstrated against a live database.
 *
 * ─── The one number this file refuses to compute ──────────────────────────────
 *
 * There is no cost. No rate, no billable amount, no "this project lost money". ADVO bills
 * fixed-price per contract, and a rate column would invent an hourly model nobody agreed
 * to — plus, the moment effort has a peso figure attached per person, a time sheet
 * becomes a performance review. `costOfProject` is the function this file will not have.
 *
 * What it computes instead is EFFORT, and effort compared against the fee is a
 * conversation a human has when pricing the next proposal.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { deliverable, project, teamMember, timeEntry } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("time-entry");

/** Same anchor as 017's billing calendar. "Tuesday" means Tuesday in Manila. */
export const WORK_TIMEZONE = "Asia/Manila";

/** The 024 CHECK, mirrored so the API refuses before the database has to. */
export const MAX_MINUTE_PER_ENTRY = 960;

/** A conventional working day, used only to express capacity in days. Not a target. */
export const MINUTE_PER_WORKING_DAY = 480;

export type TimeEntryRow = typeof timeEntry.$inferSelect;

// ─── Calendar helpers (built-in Intl only — no new dependency) ───

/** Today as YYYY-MM-DD in the working timezone. */
export function todayOn(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WORK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `dayCount` days before `on`, as YYYY-MM-DD. */
export function subtractDay(on: string, dayCount: number): string {
  const [y, m, d] = on.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d - dayCount));
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/**
 * Minutes as a human duration: 930 → "15h 30m".
 *
 * Storage is minutes precisely so this is the ONLY place a division happens, and it
 * happens at render time where a rounding error is cosmetic rather than compounding into
 * a total somebody prices a proposal from.
 */
export function formatDuration(minuteCount: number): string {
  if (minuteCount <= 0) return "0m";
  const hour = Math.floor(minuteCount / 60);
  const minute = minuteCount % 60;
  if (hour === 0) return `${minute}m`;
  if (minute === 0) return `${hour}h`;
  return `${hour}h ${minute}m`;
}

// ─── Pure summaries ──────────────────────────────────

export interface TimeEntryLike {
  projectId: number;
  deliverableId: number | null;
  teamMemberId: number;
  workedOn: string;
  minuteCount: number;
}

export interface ProjectTimeSummary {
  totalMinuteCount: number;
  /** Effort expressed in conventional 8-hour days. Not a schedule, not a deadline. */
  workingDayEquivalent: number;
  byMember: Array<{ teamMemberId: number; minuteCount: number }>;
  byDeliverable: Array<{ deliverableId: number | null; minuteCount: number }>;
  firstWorkedOn: string | null;
  lastWorkedOn: string | null;
  /**
   * Minutes attributed to the project but to no deliverable. Surfaced rather than hidden:
   * a high number here is not sloppiness, it is the calls-and-firefighting a fixed-price
   * quote never accounts for, and it is exactly the thing "the 12k isnt enough" was
   * about.
   */
  unattributedMinuteCount: number;
}

/**
 * PURE. Roll a project's entries into the shape an admin reads.
 *
 * Sorted deterministically (descending minutes, then id) so two runs over the same rows
 * produce the same output — a summary whose row order drifts is a summary nobody can
 * diff against last month.
 */
export function summarizeProjectTime(entry: TimeEntryLike[]): ProjectTimeSummary {
  const byMemberMap = new Map<number, number>();
  const byDeliverableMap = new Map<number | null, number>();
  let totalMinuteCount = 0;
  let unattributedMinuteCount = 0;
  let firstWorkedOn: string | null = null;
  let lastWorkedOn: string | null = null;

  for (const one of entry) {
    totalMinuteCount += one.minuteCount;
    byMemberMap.set(one.teamMemberId, (byMemberMap.get(one.teamMemberId) ?? 0) + one.minuteCount);
    byDeliverableMap.set(
      one.deliverableId,
      (byDeliverableMap.get(one.deliverableId) ?? 0) + one.minuteCount,
    );
    if (one.deliverableId === null) unattributedMinuteCount += one.minuteCount;
    if (!firstWorkedOn || one.workedOn < firstWorkedOn) firstWorkedOn = one.workedOn;
    if (!lastWorkedOn || one.workedOn > lastWorkedOn) lastWorkedOn = one.workedOn;
  }

  return {
    totalMinuteCount,
    // One decimal. More precision than that is false confidence about self-reported time.
    workingDayEquivalent: Math.round((totalMinuteCount / MINUTE_PER_WORKING_DAY) * 10) / 10,
    byMember: [...byMemberMap.entries()]
      .map(([teamMemberId, minuteCount]) => ({ teamMemberId, minuteCount }))
      .sort((a, b) => b.minuteCount - a.minuteCount || a.teamMemberId - b.teamMemberId),
    byDeliverable: [...byDeliverableMap.entries()]
      .map(([deliverableId, minuteCount]) => ({ deliverableId, minuteCount }))
      .sort(
        (a, b) => b.minuteCount - a.minuteCount || (a.deliverableId ?? 0) - (b.deliverableId ?? 0),
      ),
    firstWorkedOn,
    lastWorkedOn,
    unattributedMinuteCount,
  };
}

export interface MemberCapacity {
  teamMemberId: number;
  minuteCount: number;
  /** How many distinct projects this person touched in the window. */
  projectCount: number;
  /** Effort in conventional days over the window. */
  workingDayEquivalent: number;
  /** Recorded minutes as a share of the window's nominal capacity, 0..n. */
  loadRatio: number;
}

/**
 * PURE. Who is carrying what, over a window.
 *
 * `loadRatio` compares recorded minutes against `workingDayCount * 8h`. It is a
 * MEASUREMENT, not a verdict: a ratio under 1 does not mean somebody is idle, because
 * this table only holds what people bothered to record, and under-recording is the
 * expected failure mode of every timesheet ever built. A ratio ABOVE 1 is the signal
 * worth acting on — it cannot be produced by under-recording.
 *
 * Nothing in this codebase blocks an assignment on this number. Prince's own framing was
 * "1 junior dev per client under supervision"; that is a conversation, not a constraint
 * a scheduler enforces.
 */
export function deriveCapacity(
  entry: TimeEntryLike[],
  workingDayCount: number,
): MemberCapacity[] {
  const minuteByMember = new Map<number, number>();
  const projectByMember = new Map<number, Set<number>>();

  for (const one of entry) {
    minuteByMember.set(one.teamMemberId, (minuteByMember.get(one.teamMemberId) ?? 0) + one.minuteCount);
    if (!projectByMember.has(one.teamMemberId)) projectByMember.set(one.teamMemberId, new Set());
    projectByMember.get(one.teamMemberId)!.add(one.projectId);
  }

  const nominal = Math.max(1, workingDayCount) * MINUTE_PER_WORKING_DAY;

  return [...minuteByMember.entries()]
    .map(([teamMemberId, minuteCount]) => ({
      teamMemberId,
      minuteCount,
      projectCount: projectByMember.get(teamMemberId)?.size ?? 0,
      workingDayEquivalent: Math.round((minuteCount / MINUTE_PER_WORKING_DAY) * 10) / 10,
      loadRatio: Math.round((minuteCount / nominal) * 100) / 100,
    }))
    .sort((a, b) => b.minuteCount - a.minuteCount || a.teamMemberId - b.teamMemberId);
}

// ─── Writes ──────────────────────────────────────────

export interface TimeEntryInput {
  projectId: number;
  deliverableId?: number | null;
  teamMemberId: number;
  workedOn: string;
  minuteCount: number;
  note?: string | null;
}

/**
 * Record time.
 *
 * Two refusals happen here rather than at the DB, so the operator reads a sentence
 * instead of a constraint name: a future date, and a deliverable that belongs to a
 * different project. The second one matters — silently accepting it would attribute one
 * client's effort to another client's deliverable, and every summary downstream would be
 * wrong in a way nobody could see.
 */
export async function createTimeEntry(
  input: TimeEntryInput,
  createdBy: number | null,
  now: Date = new Date(),
): Promise<TimeEntryRow> {
  if (input.minuteCount <= 0 || input.minuteCount > MAX_MINUTE_PER_ENTRY) {
    throw new HTTPException(400, {
      message: `minuteCount must be between 1 and ${MAX_MINUTE_PER_ENTRY} (16 hours). A longer day is two entries, which is also the more honest record.`,
    });
  }

  if (input.workedOn > todayOn(now)) {
    throw new HTTPException(400, {
      message: "Cannot log time against a future date.",
    });
  }

  const d = db();

  if (input.deliverableId) {
    const owner = (
      await d
        .select({ projectId: deliverable.projectId })
        .from(deliverable)
        .where(eq(deliverable.deliverableId, input.deliverableId))
        .limit(1)
    )[0];
    if (!owner) throw new HTTPException(404, { message: "Deliverable not found" });
    if (owner.projectId !== input.projectId) {
      throw new HTTPException(400, {
        message:
          "That deliverable belongs to a different project. Accepting it would attribute this effort to the wrong client, invisibly.",
      });
    }
  }

  const inserted = await d
    .insert(timeEntry)
    .values({
      projectId: input.projectId,
      deliverableId: input.deliverableId ?? null,
      teamMemberId: input.teamMemberId,
      workedOn: input.workedOn,
      minuteCount: input.minuteCount,
      note: input.note ?? null,
      createdBy,
    })
    .returning();

  return inserted[0];
}

export async function updateTimeEntry(
  timeEntryId: number,
  patch: { minuteCount?: number; note?: string | null; workedOn?: string },
): Promise<TimeEntryRow> {
  if (patch.minuteCount !== undefined && (patch.minuteCount <= 0 || patch.minuteCount > MAX_MINUTE_PER_ENTRY)) {
    throw new HTTPException(400, {
      message: `minuteCount must be between 1 and ${MAX_MINUTE_PER_ENTRY}.`,
    });
  }
  const updated = await db()
    .update(timeEntry)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(timeEntry.timeEntryId, timeEntryId))
    .returning();
  if (!updated[0]) throw new HTTPException(404, { message: "Time entry not found" });
  return updated[0];
}

/**
 * Delete an entry outright.
 *
 * A correction is an edit or a delete, never a negative entry — 024 CHECKs minute_count
 * positive precisely so an "anti-entry" cannot exist. A ledger containing both a mistake
 * and its cancellation reads as twice the work to anyone who sums it without knowing.
 */
export async function deleteTimeEntry(timeEntryId: number): Promise<void> {
  const deleted = await db()
    .delete(timeEntry)
    .where(eq(timeEntry.timeEntryId, timeEntryId))
    .returning();
  if (!deleted[0]) throw new HTTPException(404, { message: "Time entry not found" });
}

// ─── Reads ───────────────────────────────────────────

export async function listTimeEntry(filter: {
  projectId?: number;
  teamMemberId?: number;
  fromOn?: string;
  toOn?: string;
}): Promise<TimeEntryRow[]> {
  const clause = [];
  if (filter.projectId) clause.push(eq(timeEntry.projectId, filter.projectId));
  if (filter.teamMemberId) clause.push(eq(timeEntry.teamMemberId, filter.teamMemberId));
  if (filter.fromOn) clause.push(gte(timeEntry.workedOn, filter.fromOn));
  if (filter.toOn) clause.push(lte(timeEntry.workedOn, filter.toOn));

  const q = db().select().from(timeEntry).orderBy(desc(timeEntry.workedOn));
  return clause.length ? q.where(and(...clause)) : q.limit(500);
}

export async function getProjectTimeSummary(projectId: number): Promise<ProjectTimeSummary> {
  const row = await db()
    .select({
      projectId: timeEntry.projectId,
      deliverableId: timeEntry.deliverableId,
      teamMemberId: timeEntry.teamMemberId,
      workedOn: timeEntry.workedOn,
      minuteCount: timeEntry.minuteCount,
    })
    .from(timeEntry)
    .where(eq(timeEntry.projectId, projectId));
  return summarizeProjectTime(row);
}

/**
 * Capacity over a trailing window. Default 14 days — short enough that "who is buried
 * right now" is the question being answered, rather than "who was busy last quarter".
 */
export async function getCapacity(
  dayCount = 14,
  now: Date = new Date(),
): Promise<{ fromOn: string; toOn: string; member: MemberCapacity[] }> {
  const toOn = todayOn(now);
  const fromOn = subtractDay(toOn, dayCount - 1);
  const row = await db()
    .select({
      projectId: timeEntry.projectId,
      deliverableId: timeEntry.deliverableId,
      teamMemberId: timeEntry.teamMemberId,
      workedOn: timeEntry.workedOn,
      minuteCount: timeEntry.minuteCount,
    })
    .from(timeEntry)
    .where(and(gte(timeEntry.workedOn, fromOn), lte(timeEntry.workedOn, toOn)));

  // Nominal capacity counts WORKING days, not calendar days: a 14-day window holds
  // roughly 10 of them, and dividing by 14 would make everyone look permanently idle.
  const workingDayCount = Math.round((dayCount * 5) / 7);
  return { fromOn, toOn, member: deriveCapacity(row, workingDayCount) };
}
