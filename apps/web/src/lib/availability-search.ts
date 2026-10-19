import { manilaToday } from "@/lib/manila-time";
import { defaultMeetingWindow } from "@/lib/free-time";

const DAY_MS = 86_400_000;

export function shiftScheduleDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function defaultSearchDates(now = new Date()) {
  const start = manilaToday(now);
  return { start, end: shiftScheduleDate(start, 14) };
}

/** Keep current/future endpoints; only advance dates before Manila today. */
export function advancePastSearchDates(
  range: { start: string; end: string },
  now = new Date(),
) {
  const today = manilaToday(now);
  if (range.start >= today && range.end >= today) return range;
  return {
    start: range.start < today ? today : range.start,
    end: range.end < today ? today : range.end,
  };
}

export function defaultAvailabilityMeeting(now = new Date()) {
  const window = defaultMeetingWindow(now);
  return {
    ...window,
    endDate: window.startDate,
    endTime: window.endDate === window.startDate ? window.endTime : "23:55",
  };
}

/** Inclusive Manila dates, regardless of the browser's timezone. */
export function availabilityHorizon(start: string, end: string) {
  const days: { date: Date; key: string; dow: number }[] = [];
  for (let key = start; key <= end; key = shiftScheduleDate(key, 1)) {
    days.push({
      date: new Date(`${key}T00:00:00+08:00`),
      key,
      dow: new Date(`${key}T00:00:00Z`).getUTCDay(),
    });
  }
  return {
    days,
    from: new Date(`${start}T00:00:00+08:00`),
    to: new Date(new Date(`${end}T00:00:00+08:00`).getTime() + DAY_MS - 1),
  };
}
