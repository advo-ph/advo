import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { manilaTime, parseListPage, parseNotice, pesos } from "./philgeps.service.js";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("philgeps open list", () => {
  const page = parseListPage(fixture("philgeps-open-list.html"));

  it("reads all 20 rows of a page with buyer and business category split apart", () => {
    expect(page.rows).toHaveLength(20);
    const row = page.rows[0];
    expect(row.ref).toMatch(/^\d+$/);
    expect(row.title.length).toBeGreaterThan(5);
    expect(row.buyer).not.toMatch(/^,/);
    expect(row.businessCategory).not.toContain(",");
    expect(row.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.closingAt).toMatch(/\+08:00$/);
  });

  it("finds every page in the drop-down, so the whole list can be walked", () => {
    expect(page.pageValues.length).toBeGreaterThan(100);
    expect(page.pageValues[0]).toBe("1");
    expect(page.pageValues[1]).toBe("21");
    expect(page.hidden.__VIEWSTATE).toBeTruthy();
  });
});

describe("philgeps notice", () => {
  it("reads the structured fields by id, including the pre-bid table", () => {
    const n = parseNotice("13299446", fixture("philgeps-notice-13299446.html"));
    expect(n.buyer).toBe("PROVINCE OF SOUTHERN LEYTE");
    expect(n.abc).toBe(14_500_000);
    expect(n.closingAt).toBe("2026-11-12T10:00:00+08:00");
    expect(n.preBid?.at).toBe("2026-10-30T10:00:00+08:00");
    expect(n.contactEmail).toBe("bacsouthernleyte@gmail.com");
    expect(n.contactName).toBe("Jay O. Rodriguez");
    expect(n.description).toContain("INVITATION TO BID");
  });

  it("reads an 'Estimated Budget', which the label-based reader recorded as no budget", () => {
    const n = parseNotice("13303860", fixture("philgeps-notice-13303860.html"));
    expect(n.abc).toBe(3_800_000);
    // The real bid deadline lives in Other Information, not the closing date.
    expect(n.description).toContain("Deadline of Submission");
    expect(n.closingAt).toBe("2026-11-06T10:00:00+08:00");
  });
});

describe("small parsers", () => {
  it("turns PhilGEPS dates into Manila instants", () => {
    expect(manilaTime("03/11/2026 02:00 PM")).toBe("2026-11-03T14:00:00+08:00");
    expect(manilaTime("03/11/2026 12:01 AM")).toBe("2026-11-03T00:01:00+08:00");
    expect(manilaTime("30/10/2026", "10:00:00 AM")).toBe("2026-10-30T10:00:00+08:00");
    expect(manilaTime("no date")).toBeNull();
  });

  it("reads pesos and treats blanks as unknown", () => {
    expect(pesos("14,500,000.00")).toBe(14_500_000);
    expect(pesos("")).toBeNull();
    expect(pesos("0.00")).toBeNull();
  });
});
