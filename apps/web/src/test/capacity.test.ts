import { describe, it, expect } from "vitest";
import { projectCountByMember, capacityRemaining } from "@/lib/capacity";

describe("projectCountByMember", () => {
  const project = [
    { teamMemberId: [1, 2], projectStatus: "development" },
    { teamMemberId: [1], projectStatus: "discovery" },
    { teamMemberId: [2, 3], projectStatus: "shipped" },
    { teamMemberId: [3], projectStatus: "review" },
    { teamMemberId: undefined, projectStatus: "development" },
    { projectStatus: "design" },
  ];

  it("counts active projects per member (excludes shipped by default)", () => {
    const map = projectCountByMember(project);
    expect(map.get(1)).toBe(2);
    expect(map.get(2)).toBe(1);
    expect(map.get(3)).toBe(1);
    expect(map.has(99)).toBe(false);
  });

  it("includes shipped when activeOnly is false", () => {
    const map = projectCountByMember(project, false);
    expect(map.get(1)).toBe(2);
    expect(map.get(2)).toBe(2); // + shipped
    expect(map.get(3)).toBe(2); // + shipped
  });

  it("returns empty map for empty input", () => {
    expect(projectCountByMember([]).size).toBe(0);
  });

  it("skips projects with missing teamMemberId", () => {
    const map = projectCountByMember([
      { projectStatus: "development" },
      { teamMemberId: [], projectStatus: "development" },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("capacityRemaining", () => {
  it("uses default cap of 3", () => {
    expect(capacityRemaining(0)).toBe(3);
    expect(capacityRemaining(1)).toBe(2);
    expect(capacityRemaining(3)).toBe(0);
  });

  it("never goes below zero", () => {
    expect(capacityRemaining(5)).toBe(0);
    expect(capacityRemaining(10, 3)).toBe(0);
  });

  it("respects custom cap", () => {
    expect(capacityRemaining(2, 5)).toBe(3);
    expect(capacityRemaining(5, 5)).toBe(0);
  });
});
