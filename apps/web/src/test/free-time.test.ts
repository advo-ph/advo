/**
 * The arithmetic behind "Find free time" (AdminAvailability): the 12-hour labels, the
 * Free Time everyone/majority sweep, and the Free Members groups. All pure, so these run
 * without the API.
 */
import { describe, it, expect } from "vitest";
import { minutesToClock12h } from "@/lib/manila-time";
import {
  classifyAttendance,
  defaultMeetingWindow,
  findDaySlots,
  formatClockRange12h,
  majorityLabel,
  meetingDays,
  meetingSpan,
  type BusyInterval,
} from "@/lib/free-time";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// ─── 12-hour labels ───

describe("minutesToClock12h", () => {
  it("names midnight, noon and minute-precision times", () => {
    expect(minutesToClock12h(1440)).toBe("12am");
    expect(minutesToClock12h(720)).toBe("12pm");
    expect(minutesToClock12h(1190)).toBe("7:50pm");
    expect(minutesToClock12h(0)).toBe("12am");
    expect(minutesToClock12h(at("18:00"))).toBe("6pm");
    expect(minutesToClock12h(at("09:05"))).toBe("9:05am");
  });

  it("wraps minutes on a multi-day timeline", () => {
    expect(minutesToClock12h(-30)).toBe("11:30pm");
    expect(minutesToClock12h(1500)).toBe("1am");
  });
});

describe("formatClockRange12h", () => {
  it("drops the first period when both ends share it", () => {
    expect(formatClockRange12h(at("19:00"), at("19:30"))).toBe("7–7:30pm");
    expect(formatClockRange12h(at("12:00"), at("13:00"))).toBe("12–1pm");
  });

  it("keeps both periods when they differ", () => {
    expect(formatClockRange12h(at("18:00"), 1440)).toBe("6pm–12am");
    expect(formatClockRange12h(1190, 1440)).toBe("7:50pm–12am");
    expect(formatClockRange12h(at("11:00"), at("13:00"))).toBe("11am–1pm");
  });

  it("keeps both periods for a range of twelve hours or more", () => {
    expect(formatClockRange12h(at("01:00"), 1440)).toBe("1am–12am");
  });
});

// ─── Free Members ───

describe("classifyAttendance", () => {
  // A two-hour meeting, 6–8pm. D = 120, so D/4 = 30 minutes.
  const meeting = { start: at("18:00"), end: at("20:00") };
  const school = (start: string, end: string): BusyInterval => ({ start: at(start), end: at(end), label: "School" });
  const busyAs = (label: string, start: string, end: string): BusyInterval => ({ start: at(start), end: at(end), label });

  it("is Available with nothing nearby", () => {
    expect(classifyAttendance([], meeting)).toEqual({ status: "available", reason: null });
  });

  it("a block ending exactly at the start is Will be late", () => {
    expect(classifyAttendance([school("13:00", "18:00")], meeting)).toEqual({
      status: "will-be-late",
      reason: "School until 6pm",
    });
  });

  it("a block ending 30 minutes before the start is May be late", () => {
    expect(classifyAttendance([school("13:00", "17:30")], meeting)).toEqual({
      status: "may-be-late",
      reason: "School until 5:30pm",
    });
  });

  it("a block ending 31 minutes before the start is Available", () => {
    expect(classifyAttendance([school("13:00", "17:29")], meeting)).toEqual({
      status: "available",
      reason: null,
    });
  });

  it("late by exactly D/4 is Not available", () => {
    expect(classifyAttendance([school("13:00", "18:30")], meeting)).toEqual({
      status: "not-available",
      reason: "School until 6:30pm",
    });
  });

  it("late by just under D/4 is Will be late", () => {
    expect(classifyAttendance([school("13:00", "18:29")], meeting).status).toBe("will-be-late");
  });

  it("a block starting exactly at the start is Will be late", () => {
    expect(classifyAttendance([busyAs("Meeting", "18:00", "18:10")], meeting)).toEqual({
      status: "will-be-late",
      reason: "Meeting until 6:10pm",
    });
  });

  it("a short busy stretch mid-meeting is Leaves early", () => {
    expect(classifyAttendance([busyAs("Meeting", "19:00", "19:15")], meeting)).toEqual({
      status: "leaves-early",
      reason: "Meeting 7–7:15pm",
    });
  });

  it("late and leaving early is Will be late", () => {
    const result = classifyAttendance(
      [school("17:00", "18:10"), busyAs("Meeting", "19:30", "19:40")],
      meeting,
    );
    expect(result).toEqual({ status: "will-be-late", reason: "School until 6:10pm" });
  });

  it("busy for D/4 in the middle is Not available, named by when it happens", () => {
    expect(classifyAttendance([busyAs("Unavailable", "19:00", "19:30")], meeting)).toEqual({
      status: "not-available",
      reason: "Unavailable 7–7:30pm",
    });
  });

  it("D/4 added up across separate stretches is Not available", () => {
    const result = classifyAttendance(
      [busyAs("Meeting", "18:40", "18:55"), busyAs("Unavailable", "19:20", "19:35")],
      meeting,
    );
    expect(result.status).toBe("not-available");
    expect(result.reason).toBe("Meeting 6:40–6:55pm");
  });

  it("a block starting at the end does not touch the meeting", () => {
    expect(classifyAttendance([school("20:00", "22:00")], meeting).status).toBe("available");
  });

  it("back-to-back blocks read as one stretch, named by the last", () => {
    expect(
      classifyAttendance([school("16:00", "17:00"), busyAs("Meeting", "17:00", "18:15")], meeting),
    ).toEqual({ status: "will-be-late", reason: "Meeting until 6:15pm" });
  });

  it("a previous-day block ending at midnight makes a 12am meeting Will be late", () => {
    const [previousDay] = meetingDays("2026-10-20", "2026-10-20");
    const busy: BusyInterval[] = [
      { start: previousDay.offset + at("22:00"), end: previousDay.offset + 1440, label: "Unavailable" },
    ];
    expect(classifyAttendance(busy, { start: 0, end: 60 })).toEqual({
      status: "will-be-late",
      reason: "Unavailable until 12am",
    });
  });
});

describe("meetingSpan", () => {
  it("places the end on the start date's timeline", () => {
    expect(
      meetingSpan({ startDate: "2026-10-20", startTime: "18:00", endDate: "2026-10-20", endTime: "19:30" }),
    ).toEqual({ start: at("18:00"), end: at("19:30") });
  });

  it("crosses midnight when the end date is the next day", () => {
    expect(
      meetingSpan({ startDate: "2026-10-20", startTime: "23:00", endDate: "2026-10-21", endTime: "00:30" }),
    ).toEqual({ start: at("23:00"), end: 1440 + 30 });
  });

  it("rejects an end at or before the start", () => {
    const same = meetingSpan({ startDate: "2026-10-20", startTime: "18:00", endDate: "2026-10-20", endTime: "18:00" });
    const before = meetingSpan({ startDate: "2026-10-20", startTime: "18:00", endDate: "2026-10-19", endTime: "19:00" });
    expect(same).toEqual({ problem: "End must be after the start." });
    expect(before).toEqual({ problem: "End must be after the start." });
  });

  it("rejects a cleared field and a window longer than a week", () => {
    expect(meetingSpan({ startDate: "", startTime: "18:00", endDate: "2026-10-20", endTime: "19:00" })).toEqual({
      problem: "Pick a start and an end.",
    });
    expect(
      meetingSpan({ startDate: "2026-10-20", startTime: "18:00", endDate: "2026-11-20", endTime: "19:00" }),
    ).toEqual({ problem: "Keep the meeting under a week." });
  });
});

describe("meetingDays", () => {
  it("covers the day before through the end date, with timeline offsets and weekdays", () => {
    // 2026-10-20 is a Tuesday.
    expect(meetingDays("2026-10-20", "2026-10-21")).toEqual([
      { dateKey: "2026-10-19", dow: 1, offset: -1440 },
      { dateKey: "2026-10-20", dow: 2, offset: 0 },
      { dateKey: "2026-10-21", dow: 3, offset: 1440 },
    ]);
  });
});

describe("defaultMeetingWindow", () => {
  it("starts at the next full hour in Manila and runs one hour", () => {
    expect(defaultMeetingWindow(new Date("2026-10-19T14:20:00+08:00"))).toEqual({
      startDate: "2026-10-19",
      startTime: "15:00",
      endDate: "2026-10-19",
      endTime: "16:00",
    });
  });

  it("rolls over midnight for both ends", () => {
    expect(defaultMeetingWindow(new Date("2026-10-19T22:05:00+08:00"))).toEqual({
      startDate: "2026-10-19",
      startTime: "23:00",
      endDate: "2026-10-20",
      endTime: "00:00",
    });
    expect(defaultMeetingWindow(new Date("2026-10-19T23:10:00+08:00"))).toEqual({
      startDate: "2026-10-20",
      startTime: "00:00",
      endDate: "2026-10-20",
      endTime: "01:00",
    });
  });
});

// ─── Free Time ───

describe("findDaySlots", () => {
  const base = { start: at("07:00"), end: 1440 };
  const options = { base, minMinutes: 30 };
  const ARDY = 1;
  const SCHIFFIER = 2;
  const free = (id: number) => ({ id, busy: [] });
  const busy = (id: number, start: string, end: string) => ({ id, busy: [{ start: at(start), end: at(end) }] });

  it("everyone free all day is one everyone slot and no majority", () => {
    expect(findDaySlots([free(ARDY), free(SCHIFFIER)], options)).toEqual({
      everyone: [base],
      majority: [],
    });
  });

  it("one of three busy is a majority slot naming them", () => {
    const { everyone, majority } = findDaySlots([busy(ARDY, "18:00", "20:00"), free(SCHIFFIER), free(3)], options);
    expect(everyone).toEqual([
      { start: at("07:00"), end: at("18:00") },
      { start: at("20:00"), end: 1440 },
    ]);
    expect(majority).toEqual([{ start: at("18:00"), end: at("20:00"), missing: [ARDY] }]);
  });

  it("an even split is not a majority", () => {
    const { majority } = findDaySlots(
      [busy(ARDY, "18:00", "20:00"), busy(SCHIFFIER, "18:00", "20:00"), free(3), free(4)],
      options,
    );
    expect(majority).toEqual([]);
  });

  it("excludes three or more unavailable people even when most of the team is free", () => {
    const { everyone, majority } = findDaySlots(
      [busy(1, "09:00", "12:00"), busy(2, "09:00", "11:00"), busy(3, "09:00", "10:00"),
        busy(4, "09:00", "09:30"), free(5), free(6), free(7), free(8), free(9)],
      options,
    );
    expect(everyone).toEqual([
      { start: at("07:00"), end: at("09:00") },
      { start: at("12:00"), end: 1440 },
    ]);
    expect(majority).toEqual([
      { start: at("10:00"), end: at("11:00"), missing: [1, 2] },
      { start: at("11:00"), end: at("12:00"), missing: [1] },
    ]);
  });

  it("each distinct missing set is its own slot, in time order", () => {
    const { majority } = findDaySlots(
      [busy(ARDY, "18:00", "20:00"), busy(SCHIFFIER, "19:00", "21:00"), free(3), free(4), free(5)],
      options,
    );
    expect(majority).toEqual([
      { start: at("18:00"), end: at("19:00"), missing: [ARDY] },
      { start: at("19:00"), end: at("20:00"), missing: [ARDY, SCHIFFIER] },
      { start: at("20:00"), end: at("21:00"), missing: [SCHIFFIER] },
    ]);
  });

  it("dated bookings come out of the everyone tier", () => {
    const { everyone, majority } = findDaySlots([busy(ARDY, "18:00", "20:00"), free(SCHIFFIER), free(3)], {
      ...options,
      bookings: [{ start: at("09:00"), end: at("10:00") }],
    });
    expect(everyone).toEqual([
      { start: at("07:00"), end: at("09:00") },
      { start: at("10:00"), end: at("18:00") },
      { start: at("20:00"), end: 1440 },
    ]);
    expect(majority).toEqual([{ start: at("18:00"), end: at("20:00"), missing: [ARDY] }]);
  });

  it("dated bookings come out of majority slots too, keeping who is missing", () => {
    // Booked 6:40–7:15pm, inside the "except Ardy" 6–8pm slot: 6–6:40 and 7:15–8 survive.
    const { majority } = findDaySlots([busy(ARDY, "18:00", "20:00"), free(SCHIFFIER), free(3)], {
      ...options,
      bookings: [{ start: at("18:40"), end: at("19:15") }],
    });
    expect(majority).toEqual([
      { start: at("18:00"), end: at("18:40"), missing: [ARDY] },
      { start: at("19:15"), end: at("20:00"), missing: [ARDY] },
    ]);
    // A booking leaving under 30 minutes on either side drops both pieces.
    const squeezed = findDaySlots([busy(ARDY, "18:00", "19:00"), free(SCHIFFIER), free(3)], {
      ...options,
      bookings: [{ start: at("18:20"), end: at("18:45") }],
    });
    expect(squeezed.majority).toEqual([]);
  });

  it("drops slots under the minimum and clips blocks to the base window", () => {
    const { everyone, majority } = findDaySlots(
      [busy(ARDY, "05:00", "08:00"), busy(SCHIFFIER, "08:20", "23:50"), free(3)],
      options,
    );
    // 8:00–8:20 is everyone free but only 20 minutes; 23:50–00:00 is only 10.
    expect(everyone).toEqual([]);
    expect(majority).toEqual([
      { start: at("07:00"), end: at("08:00"), missing: [ARDY] },
      { start: at("08:20"), end: at("23:50"), missing: [SCHIFFIER] },
    ]);
  });

  it("an overlapping pair of blocks is subtracted once", () => {
    const member = { id: ARDY, busy: [{ start: at("13:00"), end: at("23:00") }, { start: at("13:00"), end: 1440 }] };
    expect(findDaySlots([member, free(SCHIFFIER)], options).everyone).toEqual([
      { start: at("07:00"), end: at("13:00") },
    ]);
  });
});

describe("majorityLabel", () => {
  it("names who is missing, by first name, in order", () => {
    expect(majorityLabel(["Ardy", "Schiffier"])).toBe("Most are free except Ardy, Schiffier");
    expect(majorityLabel(["Ardy"])).toBe("Most are free except Ardy");
  });
});
