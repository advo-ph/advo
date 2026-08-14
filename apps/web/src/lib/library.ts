/**
 * Internal Library — types + pure helpers for /admin → Library.
 * Item types match FEATURES.md: website / prompt / module / asset / doc.
 */

export const LIBRARY_ITEM_TYPE = ["website", "prompt", "module", "asset", "doc"] as const;
export type LibraryItemType = (typeof LIBRARY_ITEM_TYPE)[number];

export interface LibraryItem {
  libraryItemId: number;
  itemType: LibraryItemType;
  title: string;
  url: string | null;
  body: string | null;
  thumbnailUrl: string | null;
  tag: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryItemDraft {
  itemType: LibraryItemType;
  title: string;
  url: string;
  body: string;
  thumbnailUrl: string;
  tag: string[];
}

export interface LibraryFilter {
  itemType: LibraryItemType | "all";
  tag: string[];
  search: string;
}

export const emptyLibraryDraft = (): LibraryItemDraft => ({
  itemType: "website",
  title: "",
  url: "",
  body: "",
  thumbnailUrl: "",
  tag: [],
});

export function isLibraryItemType(value: unknown): value is LibraryItemType {
  return typeof value === "string" && (LIBRARY_ITEM_TYPE as readonly string[]).includes(value);
}

export function normalizeTag(raw: unknown): string[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;]/)
      : [];
  const seen = new Set<string>();
  const tag: string[] = [];
  for (const entry of source) {
    const value = String(entry ?? "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    tag.push(value);
  }
  return tag;
}

export function fieldsForType(itemType: LibraryItemType): {
  showUrl: boolean;
  showBody: boolean;
  showThumbnail: boolean;
} {
  switch (itemType) {
    case "website":
      return { showUrl: true, showBody: false, showThumbnail: true };
    case "prompt":
      return { showUrl: false, showBody: true, showThumbnail: false };
    case "module":
      return { showUrl: true, showBody: true, showThumbnail: false };
    case "asset":
      return { showUrl: true, showBody: false, showThumbnail: true };
    case "doc":
      return { showUrl: false, showBody: true, showThumbnail: false };
  }
}

export function filterLibraryItem(item: LibraryItem[], filter: LibraryFilter): LibraryItem[] {
  const search = filter.search.trim().toLowerCase();
  return item.filter((row) => {
    if (filter.itemType !== "all" && row.itemType !== filter.itemType) return false;
    if (filter.tag.length > 0 && !filter.tag.every((t) => row.tag.includes(t))) return false;
    if (!search) return true;
    const haystack = [row.title, row.url ?? "", row.body ?? "", ...row.tag]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function uniqueTag(item: LibraryItem[]): string[] {
  const seen = new Set<string>();
  const tag: string[] = [];
  for (const row of item) {
    for (const value of row.tag) {
      if (seen.has(value)) continue;
      seen.add(value);
      tag.push(value);
    }
  }
  return tag.sort();
}
