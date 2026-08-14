import { describe, expect, it } from "vitest";
import {
  emptyLibraryDraft,
  fieldsForType,
  filterLibraryItem,
  isLibraryItemType,
  LIBRARY_ITEM_TYPE,
  normalizeTag,
  uniqueTag,
  type LibraryItem,
} from "@/lib/library";

const sample = (partial: Partial<LibraryItem> & Pick<LibraryItem, "libraryItemId" | "title" | "itemType">): LibraryItem => ({
  url: null,
  body: null,
  thumbnailUrl: null,
  tag: [],
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  ...partial,
});

describe("isLibraryItemType", () => {
  it("accepts the five FEATURES.md types", () => {
    expect(LIBRARY_ITEM_TYPE).toEqual(["website", "prompt", "module", "asset", "doc"]);
    for (const itemType of LIBRARY_ITEM_TYPE) {
      expect(isLibraryItemType(itemType)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isLibraryItemType("folder")).toBe(false);
    expect(isLibraryItemType("")).toBe(false);
    expect(isLibraryItemType(null)).toBe(false);
  });
});

describe("normalizeTag", () => {
  it("trims, lowercases, and dedupes", () => {
    expect(normalizeTag([" Brand ", "brand", "PROMPT"])).toEqual(["brand", "prompt"]);
  });

  it("splits a comma-separated string", () => {
    expect(normalizeTag("Clinic,  SEO; clinic")).toEqual(["clinic", "seo"]);
  });

  it("returns empty for junk", () => {
    expect(normalizeTag(null)).toEqual([]);
    expect(normalizeTag("  ")).toEqual([]);
  });
});

describe("fieldsForType", () => {
  it("shows url + thumbnail for website and asset", () => {
    expect(fieldsForType("website")).toEqual({
      showUrl: true,
      showBody: false,
      showThumbnail: true,
    });
    expect(fieldsForType("asset")).toEqual({
      showUrl: true,
      showBody: false,
      showThumbnail: true,
    });
  });

  it("shows body for prompt and doc", () => {
    expect(fieldsForType("prompt").showBody).toBe(true);
    expect(fieldsForType("doc").showBody).toBe(true);
    expect(fieldsForType("prompt").showUrl).toBe(false);
  });

  it("shows url + body for module recipes", () => {
    expect(fieldsForType("module")).toEqual({
      showUrl: true,
      showBody: true,
      showThumbnail: false,
    });
  });
});

describe("filterLibraryItem", () => {
  const item: LibraryItem[] = [
    sample({
      libraryItemId: 1,
      itemType: "website",
      title: "Stripe",
      url: "https://stripe.com",
      tag: ["billing", "ref"],
    }),
    sample({
      libraryItemId: 2,
      itemType: "prompt",
      title: "Vibe landing",
      body: "Make a clinic landing page",
      tag: ["prompt"],
    }),
    sample({
      libraryItemId: 3,
      itemType: "doc",
      title: "KT notes",
      body: "Runbook",
      tag: ["ops"],
    }),
  ];

  it("filters by item type", () => {
    const row = filterLibraryItem(item, { itemType: "prompt", tag: [], search: "" });
    expect(row).toHaveLength(1);
    expect(row[0].title).toBe("Vibe landing");
  });

  it("requires every selected tag", () => {
    const row = filterLibraryItem(item, {
      itemType: "all",
      tag: ["billing"],
      search: "",
    });
    expect(row.map((r) => r.libraryItemId)).toEqual([1]);
  });

  it("searches title, url, body, and tag", () => {
    expect(
      filterLibraryItem(item, { itemType: "all", tag: [], search: "clinic" }).map(
        (r) => r.libraryItemId,
      ),
    ).toEqual([2]);
    expect(
      filterLibraryItem(item, { itemType: "all", tag: [], search: "ops" }).map(
        (r) => r.libraryItemId,
      ),
    ).toEqual([3]);
  });
});

describe("uniqueTag + empty draft", () => {
  it("collects unique tags in sorted order", () => {
    expect(
      uniqueTag([
        sample({ libraryItemId: 1, itemType: "doc", title: "A", tag: ["z", "a"] }),
        sample({ libraryItemId: 2, itemType: "doc", title: "B", tag: ["a"] }),
      ]),
    ).toEqual(["a", "z"]);
  });

  it("starts a website draft empty", () => {
    expect(emptyLibraryDraft()).toEqual({
      itemType: "website",
      title: "",
      url: "",
      body: "",
      thumbnailUrl: "",
      tag: [],
    });
  });
});
