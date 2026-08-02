import { describe, it, expect } from "vitest";
import {
  normalizeLibraryEntry,
  parseLibraryValue,
  DEFAULT_LIBRARY_ENTRY,
} from "@/lib/library";

describe("normalizeLibraryEntry", () => {
  it("normalizes a complete entry", () => {
    const entry = normalizeLibraryEntry({
      id: "a1",
      title: "Stripe",
      url: "https://stripe.com",
      tag: "website",
      note: "Billing ref",
    });
    expect(entry).toEqual({
      id: "a1",
      title: "Stripe",
      url: "https://stripe.com",
      tag: "website",
      note: "Billing ref",
    });
  });

  it("trims string fields", () => {
    const entry = normalizeLibraryEntry({
      id: "  x  ",
      title: "  Hello  ",
      url: "  https://x.com  ",
      tag: "  doc  ",
      note: "  n  ",
    });
    expect(entry).toMatchObject({
      id: "x",
      title: "Hello",
      url: "https://x.com",
      tag: "doc",
      note: "n",
    });
  });

  it("uses url as title when title missing", () => {
    const entry = normalizeLibraryEntry({ url: "https://example.com" });
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("https://example.com");
    expect(entry!.url).toBe("https://example.com");
    expect(entry!.id).toBeTruthy();
  });

  it("returns null for empty / invalid payloads", () => {
    expect(normalizeLibraryEntry(null)).toBeNull();
    expect(normalizeLibraryEntry(undefined)).toBeNull();
    expect(normalizeLibraryEntry("string")).toBeNull();
    expect(normalizeLibraryEntry([])).toBeNull();
    expect(normalizeLibraryEntry({})).toBeNull();
    expect(normalizeLibraryEntry({ title: "", url: "" })).toBeNull();
  });

  it("coerces missing optional fields to empty strings", () => {
    const entry = normalizeLibraryEntry({ title: "Only title" });
    expect(entry).toEqual({
      id: expect.any(String),
      title: "Only title",
      url: "",
      tag: "",
      note: "",
    });
  });
});

describe("parseLibraryValue", () => {
  it("parses an array of entries", () => {
    const entry = parseLibraryValue([
      { id: "1", title: "A", url: "https://a.com", tag: "website", note: "" },
      { id: "2", title: "B", url: "https://b.com", tag: "doc", note: "x" },
    ]);
    expect(entry).toHaveLength(2);
    expect(entry[0].title).toBe("A");
    expect(entry[1].tag).toBe("doc");
  });

  it("parses a JSON string", () => {
    const entry = parseLibraryValue(
      JSON.stringify([{ id: "1", title: "From JSON", url: "https://j.com" }]),
    );
    expect(entry).toHaveLength(1);
    expect(entry[0].title).toBe("From JSON");
  });

  it("returns empty array for invalid JSON string", () => {
    expect(parseLibraryValue("{not json")).toEqual([]);
    expect(parseLibraryValue("")).toEqual([]);
  });

  it("wraps a single object", () => {
    const entry = parseLibraryValue({ title: "Solo", url: "https://solo.com" });
    expect(entry).toHaveLength(1);
    expect(entry[0].title).toBe("Solo");
  });

  it("drops invalid rows from arrays", () => {
    const entry = parseLibraryValue([
      null,
      { title: "" },
      { id: "ok", title: "Keep", url: "https://k.com" },
      "nope",
    ]);
    expect(entry).toHaveLength(1);
    expect(entry[0].id).toBe("ok");
  });

  it("returns empty for null / undefined", () => {
    expect(parseLibraryValue(null)).toEqual([]);
    expect(parseLibraryValue(undefined)).toEqual([]);
  });

  it("exports seed defaults with required fields", () => {
    expect(DEFAULT_LIBRARY_ENTRY.length).toBeGreaterThan(0);
    for (const row of DEFAULT_LIBRARY_ENTRY) {
      expect(row.id).toBeTruthy();
      expect(row.title).toBeTruthy();
      expect(typeof row.url).toBe("string");
      expect(typeof row.tag).toBe("string");
      expect(typeof row.note).toBe("string");
    }
  });
});
