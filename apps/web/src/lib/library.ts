/**
 * Internal Library — pure helpers for siteConfig key `library`.
 * Value shape: LibraryEntry[] stored as JSON via GET/PATCH /api/settings/library.
 */

export interface LibraryEntry {
  id: string;
  title: string;
  url: string;
  tag: string;
  note: string;
}

/** Seed defaults when settings key is missing or empty. */
export const DEFAULT_LIBRARY_ENTRY: LibraryEntry[] = [
  {
    id: "seed-advo-site",
    title: "ADVO website",
    url: "https://advo.ph",
    tag: "website",
    note: "Public marketing site",
  },
  {
    id: "seed-features",
    title: "FEATURES.md",
    url: "https://github.com",
    tag: "doc",
    note: "Product surface inventory",
  },
];

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return fallback;
  return String(value).trim();
}

/**
 * Coerce a single raw object into a LibraryEntry, or null if unusable.
 * Requires at least a non-empty title or url.
 */
export function normalizeLibraryEntry(raw: unknown): LibraryEntry | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const title = asString(obj.title);
  const url = asString(obj.url);
  if (!title && !url) return null;

  const id = asString(obj.id) || cryptoRandomId();
  const tag = asString(obj.tag);
  const note = asString(obj.note);

  return { id, title: title || url, url, tag, note };
}

/**
 * Parse a settings value (array, JSON string, or single object) into LibraryEntry[].
 * Drops invalid rows; never throws.
 */
export function parseLibraryValue(value: unknown): LibraryEntry[] {
  let raw: unknown = value;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const entry: LibraryEntry[] = [];
    for (const item of raw) {
      const normalized = normalizeLibraryEntry(item);
      if (normalized) entry.push(normalized);
    }
    return entry;
  }

  // Single object payload
  const single = normalizeLibraryEntry(raw);
  return single ? [single] : [];
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Generate a stable client-side id for a new entry. */
export function newLibraryEntryId(): string {
  return cryptoRandomId();
}
