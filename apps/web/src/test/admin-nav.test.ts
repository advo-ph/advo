import { describe, it, expect } from "vitest";
import { isToolsSection, TOOLS_SECTION } from "@/lib/admin-nav";

describe("isToolsSection", () => {
  it("returns true for brand-scraper and fb-scraper", () => {
    expect(isToolsSection("brand-scraper")).toBe(true);
    expect(isToolsSection("fb-scraper")).toBe(true);
  });

  it("returns false for non-tools sections", () => {
    expect(isToolsSection("dashboard")).toBe(false);
    expect(isToolsSection("projects")).toBe(false);
    expect(isToolsSection("settings")).toBe(false);
    expect(isToolsSection("")).toBe(false);
  });

  it("covers every id listed in TOOLS_SECTION", () => {
    for (const section of TOOLS_SECTION) {
      expect(isToolsSection(section)).toBe(true);
    }
  });
});
