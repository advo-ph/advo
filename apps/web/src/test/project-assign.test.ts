import { describe, it, expect } from "vitest";
import { isJuniorRole } from "@/lib/project-assign";

describe("isJuniorRole", () => {
  it("matches junior", () => {
    expect(isJuniorRole("Junior")).toBe(true);
    expect(isJuniorRole("junior developer")).toBe(true);
  });

  it("matches developer / dev", () => {
    expect(isJuniorRole("Developer")).toBe(true);
    expect(isJuniorRole("Full-stack developer")).toBe(true);
    expect(isJuniorRole("Dev")).toBe(true);
    expect(isJuniorRole("frontend dev")).toBe(true);
  });

  it("matches intern", () => {
    expect(isJuniorRole("Intern")).toBe(true);
    expect(isJuniorRole("Software Intern")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isJuniorRole("JUNIOR")).toBe(true);
    expect(isJuniorRole("DEVELOPER")).toBe(true);
    expect(isJuniorRole("INTERN")).toBe(true);
  });

  it("rejects non-junior roles", () => {
    expect(isJuniorRole("Admin")).toBe(false);
    expect(isJuniorRole("Project Manager")).toBe(false);
    expect(isJuniorRole("Designer")).toBe(false);
    expect(isJuniorRole("")).toBe(false);
  });
});
