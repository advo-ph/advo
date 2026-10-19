import { describe, expect, it } from "vitest";
import { layoutAvailabilitySlots } from "@/lib/availability-layout";

const slot = (id: number, start: number, end: number, day = 1) => ({
  block: { block_id: id, day_of_week: day }, start, top: Math.max(start, 420), end,
});

describe("availability overlap layout", () => {
  it("places earlier slots on the left regardless of input order", () => {
    const result = layoutAvailabilitySlots([slot(2, 600, 720), slot(1, 540, 660)]);
    expect(result.map(s => [s.block.block_id, s.column, s.columns])).toEqual([[1, 0, 2], [2, 1, 2]]);
  });

  it("reuses columns through chained overlaps and handles triple overlaps", () => {
    const result = layoutAvailabilitySlots([
      slot(1, 540, 660), slot(2, 600, 720), slot(3, 630, 690), slot(4, 690, 780),
    ]);
    expect(result.map(s => [s.column, s.columns])).toEqual([[0, 3], [1, 3], [2, 3], [0, 3]]);
    for (const a of result) for (const b of result) {
      if (a !== b && a.top < b.end && b.top < a.end) expect(a.column).not.toBe(b.column);
    }
  });

  it("keeps touching slots and different days full width", () => {
    expect(layoutAvailabilitySlots([slot(1, 540, 600), slot(2, 600, 660), slot(3, 540, 660, 2)])
      .map(s => s.columns)).toEqual([1, 1, 1]);
  });

  it("keeps clipped starts chronological and equal starts deterministic", () => {
    expect(layoutAvailabilitySlots([slot(3, 420, 600), slot(2, 360, 540), slot(1, 360, 540)])
      .map(s => [s.block.block_id, s.column])).toEqual([[1, 0], [2, 1], [3, 2]]);
  });
});
