/**
 * Manila calendar helpers for the browser.
 *
 * Mirror of apps/api/src/utils/manila-date.ts. Read that file for the storage convention
 * and why it is start-of-day. The short version:
 *
 *   A date-only due date is stored as MANILA MIDNIGHT of that date. "Due 2026-09-02"
 *   names the whole of 2026-09-02 in Manila, and is not overdue until Manila's current
 *   date is strictly after it.
 *
 * The browser half matters independently of the server half. `new Date(due) < new Date()`
 * compares two instants, so a deliverable due today went red at 08:00 Manila. And a
 * viewer in another timezone must still see ADVO's dates: the client hub is read by
 * people who are not in Manila, and "Overdue" is a claim about ADVO's work.
 *
 * So every date this subsystem renders or compares is resolved in Asia/Manila, not in
 * whatever timezone the browser happens to be in.
 */

export const SCHEDULE_TIMEZONE = "Asia/Manila";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Manila calendar date of an instant, as YYYY-MM-DD. Null-safe. */
export function manilaDateOf(at: string | Date | null | undefined): string | null {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return dateFormatter.format(d);
}

/** Today in Manila, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

/**
 * Is this due date now in the past, on the Manila calendar?
 *
 * A date comparison, not an instant comparison. The day a thing is due is a day the
 * thing may still be delivered; it is late the morning after, not at 08:00 that morning.
 */
export function isPastDue(dueDate: string | Date | null | undefined, now?: Date): boolean {
  const due = manilaDateOf(dueDate);
  if (!due) return false;
  return due < manilaToday(now);
}

/** Whole Manila days from today to `dueDate`. Negative when already past. */
export function daysUntil(dueDate: string | Date | null | undefined, now?: Date): number | null {
  const due = manilaDateOf(dueDate);
  if (!due) return null;
  const from = Date.parse(`${manilaToday(now)}T00:00:00+08:00`);
  const to = Date.parse(`${due}T00:00:00+08:00`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Format an instant on the Manila calendar. Defaults to the "Sep 2" short form the
 * schedule tables use.
 *
 * This is what keeps the edit dialog honest: the dialog prefills from manilaDateOf() and
 * the table renders through here, so both name the same day. Prefilling from a UTC
 * .slice(0,10) while rendering a browser-local date is what walked a due date backwards
 * one day on every save.
 */
export function formatManilaDate(
  at: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  if (!at) return "—";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { ...options, timeZone: SCHEDULE_TIMEZONE });
}

/** Format an instant with a time, on the Manila calendar. */
export function formatManilaDateTime(
  at: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  if (!at) return "—";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { ...options, timeZone: SCHEDULE_TIMEZONE });
}

// ─── Clock times on the weekly availability grid ───

/**
 * "HH:MM" as minutes past midnight. An END time of "00:00" means midnight at the END of
 * the day (1440).
 *
 * `<input type="time">` cannot emit "24:00", so "13:00–00:00" is the only way to say
 * "until midnight", and rows shaped that way already exist. See the API twin for the
 * full note.
 */
export function timeToMinutes(hhmm: string, isEnd = false): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0);
  return isEnd && total === 0 ? 1440 : total;
}

/** Minutes past midnight back to "HH:MM". 1440 renders as "24:00". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Why this start/end pair is not a valid block, or null when it is. */
export function timeRangeProblem(startTime: string, endTime: string): string | null {
  if (!startTime || !endTime) return "Both a start and an end time are required.";
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime, true);
  if (Number.isNaN(start) || Number.isNaN(end)) return "Enter a valid time.";
  if (end <= start) {
    return `End time must be after start time. Use 00:00 as the end time for a block that runs to midnight.`;
  }
  return null;
}

// ─── Local YYYY-MM-DD keys for the month grid ───

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a Date read in its own local fields. Used for month-grid cell keys. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
