/**
 * The arithmetic behind "Find free time" on the Availability page.
 *
 * Two questions, two modes:
 *
 *   Free Time     "When can the selected people meet?" Per day, the slots where everyone
 *                 is free, and below them the slots where a strict majority is free,
 *                 labelled with who would be missing.
 *   Free Members  "Who can make this meeting?" For one start/end, each selected person
 *                 lands in exactly one of five groups (see `classifyAttendance`).
 *
 * Everything here is pure and works in minutes. A day's minutes run 0..1440, where 1440
 * is midnight at the END of the day ("00:00" as an end time). Free Members uses one
 * timeline anchored at midnight of the meeting's start date, so the day before is
 * -1440..0 and the day after is 1440..2880; that is what lets a meeting cross midnight.
 *
 * Kept out of AdminAvailability.tsx so it can be tested, and kept free of hooks: the
 * component decides which blocks apply on which date (`blockAppliesOn`) and hands this
 * module plain ranges.
 */
import { minutesToClock12h, SCHEDULE_TIMEZONE, timeToMinutes } from "@/lib/manila-time";

export interface Range {
  start: number;
  end: number;
}

const DAY_MINUTES = 1440;
const DAY_MS = 86_400_000;

// ─── Ranges ───

/**
 * Overlapping and touching ranges collapsed into one, sorted by start. Never mutates its
 * input.
 *
 * A member can hold two blocks that overlap ("13:00–23:00" and "13:00–00:00" have both
 * existed in this table). Subtracting without merging first counts the overlap twice
 * and can split a free window that should have stayed whole.
 */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [{ ...sorted[0] }];
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** base minus every blocker, splitting a range that a blocker lands in the middle of. */
export function subtractRanges(base: readonly Range[], blockers: readonly Range[]): Range[] {
  let out: Range[] = base.map((r) => ({ ...r }));
  for (const blocker of blockers) {
    const next: Range[] = [];
    for (const r of out) {
      if (blocker.end <= r.start || blocker.start >= r.end) {
        next.push(r);
        continue;
      }
      if (blocker.start > r.start) next.push({ start: r.start, end: blocker.start });
      if (blocker.end < r.end) next.push({ start: blocker.end, end: r.end });
    }
    out = next;
  }
  return out;
}

// ─── 12-hour labels ───

/**
 * "7–7:30pm", "6pm–12am", "11am–1pm".
 *
 * The first period is dropped only when both ends share it AND the range is under
 * twelve hours, so "1am–12am" (a whole day) never collapses to an ambiguous "1–12am".
 */
export function formatClockRange12h(start: number, end: number): string {
  const from = minutesToClock12h(start);
  const to = minutesToClock12h(end);
  if (from.slice(-2) === to.slice(-2) && end - start < 720) return `${from.slice(0, -2)}–${to}`;
  return `${from}–${to}`;
}

// ─── Free Time: everyone, then the majority ───

export interface MemberBusy {
  id: number;
  /** Every block that applies to this member on this day. Unmerged is fine. */
  busy: readonly Range[];
}

export interface MajoritySlot extends Range {
  /** Who is busy for this slot, in the order the members were passed in. */
  missing: number[];
}

export interface DaySlots {
  everyone: Range[];
  majority: MajoritySlot[];
}

/**
 * One day's free slots for a group: where everyone is free, and where a strict majority
 * is (more than half of the group free, with at most two people unavailable).
 *
 * A sweep over every member's free-range boundaries cuts the day into elementary
 * segments. Inside one segment each member is either wholly free or wholly busy, so the
 * segment has one well-defined set of missing people. Adjacent segments with the same
 * missing set are joined; anything shorter than `minMinutes` is dropped.
 *
 * `bookings` (dated calendar entries, which are not tied to a person) are subtracted
 * from both tiers: a booked meeting blocks the slot for everyone, so neither tier may
 * propose time on top of it.
 */
export function findDaySlots(
  members: readonly MemberBusy[],
  options: { base: Range; bookings?: readonly Range[]; minMinutes: number },
): DaySlots {
  const { base, bookings = [], minMinutes } = options;
  if (members.length === 0) return { everyone: [], majority: [] };

  const free = members.map((m) => ({ id: m.id, free: subtractRanges([base], mergeRanges(m.busy)) }));

  const points = new Set<number>([base.start, base.end]);
  for (const m of free) {
    for (const r of m.free) {
      points.add(r.start);
      points.add(r.end);
    }
  }
  const cuts = [...points].sort((a, b) => a - b);

  const segments: MajoritySlot[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    const missing = free
      .filter((m) => !m.free.some((r) => r.start <= start && r.end >= end))
      .map((m) => m.id);
    const freeCount = members.length - missing.length;
    if (missing.length >= 3 || (missing.length > 0 && freeCount * 2 <= members.length)) continue;

    const last = segments[segments.length - 1];
    if (last && last.end === start && sameIds(last.missing, missing)) last.end = end;
    else segments.push({ start, end, missing });
  }

  const booked = mergeRanges(bookings);

  const everyone = mergeRanges(
    subtractRanges(
      segments.filter((s) => s.missing.length === 0).map(({ start, end }) => ({ start, end })),
      booked,
    ),
  ).filter((r) => r.end - r.start >= minMinutes);

  // A booking splits a majority slot the same way; each piece keeps its missing set.
  const majority = segments
    .filter((s) => s.missing.length > 0)
    .flatMap((s) => subtractRanges([s], booked).map(({ start, end }) => ({ start, end, missing: s.missing })))
    .filter((s) => s.end - s.start >= minMinutes);

  return { everyone, majority };
}

const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** "Most are free except Ardy, Schiffier". Pass first names, in the order to show them. */
export function majorityLabel(missingNames: readonly string[]): string {
  return `Most are free except ${missingNames.join(", ")}`;
}

// ─── Free Members: who can make this meeting ───

export type AttendanceStatus =
  | "available"
  | "may-be-late"
  | "will-be-late"
  | "leaves-early"
  | "not-available";

/** The order the groups are shown in. */
export const ATTENDANCE_ORDER: readonly AttendanceStatus[] = [
  "available",
  "may-be-late",
  "will-be-late",
  "leaves-early",
  "not-available",
];

/** Something ending this close before the start may still make a person late. */
export const MAY_BE_LATE_MINUTES = 30;

export interface BusyInterval extends Range {
  /** What to call it in the reason, e.g. "School". */
  label: string;
}

export interface Attendance {
  status: AttendanceStatus;
  /** Short reason with 12-hour times, e.g. "School until 6:30pm". Null when available. */
  reason: string | null;
}

interface MergedBusy extends Range {
  /** Label of the block that opens this stretch. */
  first: string;
  /** Label of the block that closes it (the one the person is in last). */
  last: string;
}

function mergeBusy(busy: readonly BusyInterval[]): MergedBusy[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: MergedBusy[] = [];
  for (const b of sorted) {
    const prev = out[out.length - 1];
    if (prev && b.start <= prev.end) {
      if (b.end > prev.end) {
        prev.end = b.end;
        prev.last = b.label;
      }
    } else {
      out.push({ start: b.start, end: b.end, first: b.label, last: b.label });
    }
  }
  return out;
}

const until = (r: MergedBusy) => `${r.last} until ${minutesToClock12h(r.end)}`;
const during = (r: MergedBusy) => `${r.first} ${formatClockRange12h(r.start, r.end)}`;

/**
 * Where one person lands for a meeting [start, end] (D = end − start).
 *
 * `busy` is every school / meeting / unavailable block of theirs that applies on any day
 * the meeting touches, plus the day before, on the meeting's timeline. Overlaps merge
 * first, so back-to-back blocks read as one stretch.
 *
 *   Not available  busy for D/4 or more of the meeting, wherever it falls
 *   Will be late   busy at the start, or something ends exactly at the start
 *   Leaves early   busy at some point inside the meeting, but not at the start
 *   May be late    nothing inside the meeting, but something ends within the
 *                  30 minutes before it
 *   Available      none of the above
 *
 * Checked in that order, so late and leaving early is "Will be late".
 */
export function classifyAttendance(busy: readonly BusyInterval[], meeting: Range): Attendance {
  const { start, end } = meeting;
  const duration = end - start;
  const merged = mergeBusy(busy);

  let missed = 0;
  for (const r of merged) missed += Math.max(0, Math.min(r.end, end) - Math.max(r.start, start));

  if (missed > 0 && missed * 4 >= duration) {
    const covering = merged.find((r) => r.start <= start && r.end > start);
    const firstInside = merged.find((r) => r.start < end && r.end > start);
    return { status: "not-available", reason: covering ? until(covering) : during(firstInside!) };
  }

  const atStart = merged.find((r) => r.start <= start && r.end >= start);
  if (atStart) return { status: "will-be-late", reason: until(atStart) };

  const inside = merged.find((r) => r.start > start && r.start < end);
  if (inside) return { status: "leaves-early", reason: during(inside) };

  let recent: MergedBusy | undefined;
  for (const r of merged) {
    if (r.end >= start - MAY_BE_LATE_MINUTES && r.end < start) recent = r;
  }
  if (recent) return { status: "may-be-late", reason: until(recent) };

  return { status: "available", reason: null };
}

// ─── Free Members: the meeting window ───

/** What the four inputs hold: Manila dates (YYYY-MM-DD) and clock times (HH:MM). */
export interface MeetingWindowInput {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

/** A meeting longer than this is a typo, not a meeting (and would mean a long loop). */
export const MAX_MEETING_MINUTES = 7 * DAY_MINUTES;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateMs = (dateKey: string) => Date.parse(`${dateKey}T00:00:00Z`);

/** YYYY-MM-DD plus whole days, on the calendar (no timezone involved). */
export function addDays(dateKey: string, days: number): string {
  return new Date(dateMs(dateKey) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The meeting as [start, end] minutes on a timeline anchored at midnight of its start
 * date, or the short message to show instead of results.
 *
 * Here an end time of "00:00" is the start of the end date, not the end of it: the date
 * is explicit, so midnight after Monday is "Tuesday 00:00".
 */
export function meetingSpan(input: MeetingWindowInput): Range | { problem: string } {
  const { startDate, startTime, endDate, endTime } = input;
  if (
    !DATE_ONLY.test(startDate) ||
    !DATE_ONLY.test(endDate) ||
    !HHMM.test(startTime) ||
    !HHMM.test(endTime) ||
    Number.isNaN(dateMs(startDate)) ||
    Number.isNaN(dateMs(endDate))
  ) {
    return { problem: "Pick a start and an end." };
  }
  const start = timeToMinutes(startTime);
  const end =
    Math.round((dateMs(endDate) - dateMs(startDate)) / DAY_MS) * DAY_MINUTES + timeToMinutes(endTime);
  if (end <= start) return { problem: "End must be after the start." };
  if (end - start > MAX_MEETING_MINUTES) return { problem: "Keep the meeting under a week." };
  return { start, end };
}

/**
 * Every date the busy lookup has to read for a meeting: the day before the start (a
 * block ending at its midnight ends exactly at a 12am start, and the 30-minute
 * may-be-late window can reach back into it) through the end date. `offset` places that
 * date's minutes on the meeting timeline.
 */
export function meetingDays(
  startDate: string,
  endDate: string,
): { dateKey: string; dow: number; offset: number }[] {
  const days: { dateKey: string; dow: number; offset: number }[] = [];
  for (let i = -1; ; i++) {
    const dateKey = addDays(startDate, i);
    if (dateKey > endDate) break;
    days.push({ dateKey, dow: new Date(dateMs(dateKey)).getUTCDay(), offset: i * DAY_MINUTES });
  }
  return days;
}

const manilaClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The form's default: the next full hour in Manila, one hour long. */
export function defaultMeetingWindow(now: Date = new Date()): MeetingWindowInput {
  const part = Object.fromEntries(manilaClock.formatToParts(now).map((p) => [p.type, p.value]));
  const today = `${part.year}-${part.month}-${part.day}`;
  const startHour = (Number(part.hour) % 24) + 1;
  const startDate = startHour >= 24 ? addDays(today, 1) : today;
  const endHour = (startHour % 24) + 1;
  const endDate = endHour >= 24 ? addDays(startDate, 1) : startDate;
  return {
    startDate,
    startTime: `${pad2(startHour % 24)}:00`,
    endDate,
    endTime: `${pad2(endHour % 24)}:00`,
  };
}
