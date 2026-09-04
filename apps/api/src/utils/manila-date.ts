/**
 * Manila calendar primitives for scheduling.
 *
 * The house rule is already written down in migrations/017_recurring_fee.sql:
 *
 *     "Every billing anchor is DATE, not timestamptz. 'The 1st' means the 1st in
 *      Asia/Manila."
 *
 * recurring-fee.service.ts and project-signoff.service.ts both hold that line. The
 * calendar/availability/deliverable subsystem did not, and had no timezone handling at
 * all, which is why a deliverable due today turned red at 08:00 in the morning: an
 * `<input type="date">` sends "2026-09-02", `new Date("2026-09-02")` is UTC midnight,
 * and UTC midnight is 08:00 in Manila.
 *
 * THE STORAGE CONVENTION, stated once so nothing has to guess again:
 *
 *   A date-only due date is stored as MANILA MIDNIGHT of that date
 *   (`YYYY-MM-DDT00:00:00+08:00`), exactly like instantOf() in recurring-fee.service.ts.
 *   "Due 2026-09-02" names the whole of 2026-09-02 in Manila. It is not overdue until
 *   Manila's current date is strictly after it.
 *
 * Start-of-day, not end-of-day, for three reasons: it is what the house helper already
 * does, it is what every row in the table already holds (so this needs no backfill), and
 * end-of-day encodes a display decision into stored data where a read-time comparison
 * belongs. "Has this day passed in Manila" is a date comparison, and is done as one.
 *
 * Built-in Intl only. No new dependency, and no reliance on the server process TZ —
 * which is an unpinned host default, and is the other half of the same bug.
 */

/** Scheduling, like billing, happens on the Manila calendar. */
export const SCHEDULE_TIMEZONE = "Asia/Manila";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Manila calendar date of an instant, as YYYY-MM-DD. */
export function manilaDateOf(at: Date): string {
  return dateFormatter.format(at);
}

/** Today in Manila, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

/** Midnight of a Manila calendar date, as the instant that date stores. */
export function manilaStartOfDay(on: string): Date {
  return new Date(`${on}T00:00:00+08:00`);
}

/** The last representable instant of a Manila calendar date. */
export function manilaEndOfDay(on: string): Date {
  return new Date(`${on}T23:59:59.999+08:00`);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** "2026-09-02T13:45" or "2026-09-02T13:45:30" — a datetime-local value, no offset. */
const OFFSETLESS_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Resolve a value from `flexibleDateTime()` to an instant, without ever consulting the
 * server process timezone.
 *
 *   "2026-09-02"                 → 2026-09-02 00:00 Manila   (the whole of that day)
 *   "2026-09-02T13:45"           → 2026-09-02 13:45 Manila   (what the admin typed)
 *   "2026-09-02T13:45:00Z"       → unchanged, the offset was explicit
 *   "2026-09-02T13:45:00+08:00"  → unchanged, the offset was explicit
 *
 * The first two are the shapes `<input type="date">` and `<input type="datetime-local">`
 * emit. Both are ambiguous on the wire; both are read as Manila, because Manila is where
 * the person filling in the form is.
 *
 * Returns null for null/undefined/blank. Throws RangeError for an unparseable value, so
 * a bad date fails loudly at the boundary instead of writing an Invalid Date.
 */
export function toManilaInstant(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (DATE_ONLY.test(raw)) return manilaStartOfDay(raw);

  const at = OFFSETLESS_DATETIME.test(raw) ? new Date(`${raw}+08:00`) : new Date(raw);
  if (Number.isNaN(at.getTime())) {
    throw new RangeError(`Unparseable date or time: ${raw}`);
  }
  return at;
}

// ─── Clock times on the weekly availability grid ───

/**
 * "HH:MM" as minutes past midnight, with one deliberate exception: an END time of
 * "00:00" means midnight at the END of the day (1440), not the start of it.
 *
 * The exception is load-bearing rather than clever. `<input type="time">` cannot emit
 * "24:00", so "13:00–00:00" is the only way a person can say "from 1pm until midnight",
 * and rows shaped exactly like that already exist in the table. Read literally, that
 * block ends 780 minutes before it starts, which is how it managed to be simultaneously
 * saveable, invisible, and poisonous to the free-time intersection.
 */
export function timeToMinutes(hhmm: string, isEnd = false): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m;
  return isEnd && total === 0 ? 1440 : total;
}

/** Why this start/end pair is not a valid block, or null when it is. */
export function timeRangeProblem(startTime: string, endTime: string): string | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime, true);
  if (end <= start) {
    return `End time must be after start time (got ${startTime.slice(0, 5)} to ${endTime.slice(0, 5)}). For a block that runs to midnight, use 00:00 as the end time.`;
  }
  return null;
}
