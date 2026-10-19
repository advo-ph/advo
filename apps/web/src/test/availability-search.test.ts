import { describe, expect, it } from "vitest";
import {
  advancePastSearchDates,
  availabilityHorizon,
  defaultAvailabilityMeeting,
  defaultSearchDates,
} from "@/lib/availability-search";
import { meetingSpan } from "@/lib/free-time";

describe("availability search dates", () => {
  it("defaults to Manila today through 14 days later, including both endpoints", () => {
    const range = defaultSearchDates(new Date("2026-10-18T18:30:00Z"));
    expect(range).toEqual({ start: "2026-10-19", end: "2026-11-02" });
    const horizon = availabilityHorizon(range.start, range.end);
    expect(horizon.days).toHaveLength(15);
    expect(horizon.days.at(-1)?.key).toBe("2026-11-02");
    expect(horizon.from.toISOString()).toBe("2026-10-18T16:00:00.000Z");
    expect(horizon.to.toISOString()).toBe("2026-11-02T15:59:59.999Z");
  });

  it("preserves today's and future selections even after the selected clock time", () => {
    const now = new Date("2026-10-19T23:30:00+08:00");
    for (const range of [
      { start: "2026-10-19", end: "2026-10-19" },
      { start: "2026-10-21", end: "2026-11-04" },
    ]) {
      expect(advancePastSearchDates(range, now)).toBe(range);
    }
  });

  it("advances only expired endpoints when Manila rolls into a new day", () => {
    const now = new Date("2026-10-19T16:00:00Z"); // Oct 20 in Manila.
    expect(advancePastSearchDates({ start: "2026-10-19", end: "2026-11-04" }, now))
      .toEqual({ start: "2026-10-20", end: "2026-11-04" });
    expect(advancePastSearchDates({ start: "2026-10-18", end: "2026-10-19" }, now))
      .toEqual({ start: "2026-10-20", end: "2026-10-20" });
  });

  it("covers an inclusive multi-month range with matching weekdays", () => {
    const { days } = availabilityHorizon("2026-10-19", "2026-11-04");
    expect(days).toHaveLength(17);
    expect(days[0]).toMatchObject({ key: "2026-10-19", dow: 1 });
    expect(days.at(-1)).toMatchObject({ key: "2026-11-04", dow: 3 });
    expect(availabilityHorizon("2026-11-04", "2026-11-04").days).toHaveLength(
      1
    );
  });

  it("handles year boundaries and leap days", () => {
    expect(
      availabilityHorizon("2028-02-28", "2028-03-01").days.map((d) => d.key)
    ).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(defaultSearchDates(new Date("2026-12-25T04:00:00Z")).end).toBe(
      "2027-01-08"
    );
  });

  it("keeps default meetings on one date, including near midnight", () => {
    for (const hour of [0, 12, 21, 22, 23]) {
      const value = defaultAvailabilityMeeting(
        new Date(`2026-10-19T${String(hour).padStart(2, "0")}:30:00+08:00`)
      );
      expect(value.endDate).toBe(value.startDate);
      expect(meetingSpan(value)).not.toHaveProperty("problem");
    }
  });
});
