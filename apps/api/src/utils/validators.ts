import { z } from "zod";
import { HTTPException } from "hono/http-exception";

/**
 * zValidator hook that turns a Zod failure into a sentence a person can act on.
 *
 * Without it, `zValidator` replies with its own envelope — `{ success: false, error: {
 * issues: [...] } }` — and the web client's error mapper reads `error.message`, which on a
 * ZodError is undefined. Every validation failure therefore surfaced in the UI as the
 * string "HTTP 400", so "End time must be after start time" was written, sent, and thrown
 * away one layer short of the human it was written for.
 *
 * HTTPException is what app.onError renders as `{ data: null, error: "<message>" }`, which
 * is the shape the client already understands.
 *
 * Usage: `zValidator("json", schema, zodMessageHook)`.
 */
export function zodMessageHook(
  result: { success: boolean; error?: z.ZodError },
  _c: unknown,
): void {
  if (result.success) return;
  const issues = result.error?.issues ?? [];
  const message =
    issues
      .map((issue) => {
        const field = issue.path.filter((p) => p !== "").join(".");
        return field ? `${field}: ${issue.message}` : issue.message;
      })
      .join("; ") || "Invalid request";
  throw new HTTPException(400, { message });
}

/**
 * Lenient optional URL for user-entered links (team profile pages, project
 * preview/contract links, uploaded asset URLs).
 *
 * Strict `z.string().url()` rejects scheme-less input like "linkedin.com/in/foo"
 * and "github.com/foo", which made admin "Save" buttons 400 whenever a stored
 * link lacked a scheme: editing a record re-submits every field, so one loosely
 * formatted URL failed the whole request (e.g. toggling a team member inactive).
 *
 * This trims the value, normalizes a missing scheme to https:// (which also
 * repairs the stored value and keeps anchor hrefs absolute), and maps blank
 * input to null. null/undefined pass through untouched.
 *
 */
export function looseUrl(max = 500) {
  return z
    .string()
    .max(max)
    .transform((v): string | null => {
      const trimmed = v.trim();
      if (!trimmed) return null;
      // A root-relative path is already a valid link into this app. Prefixing it
      // produced "https:///team/johann.svg", which broke every seeded avatar and
      // every avatar uploaded through the admin UI.
      if (trimmed.startsWith("/")) return trimmed;
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .nullish();
}

/**
 * Required counterpart to {@link looseUrl} for fields that must hold a link
 * (e.g. a project asset URL). Same scheme normalization, but rejects blank input.
 */
export function requiredUrl(max = 500) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((v): string =>
      v.startsWith("/") || /^https?:\/\//i.test(v) ? v : `https://${v}`
    );
}

/**
 * Flexible optional timestamp that accepts every shape HTML date/datetime-local
 * inputs and `Date.prototype.toISOString()` emit: "2026-05-29", "2026-05-29T10:00",
 * full ISO with or without offset, etc.
 *
 * Strict `z.string().datetime()` only accepted UTC "...Z" strings and rejected
 * date-only, datetime-local (no seconds), and offset values, breaking schedule and
 * due-date saves. Returns the raw string for route code to wrap in `new Date(...)`;
 * blank input becomes null.
 */
export function flexibleDateTime() {
  return z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: "Invalid date or time",
    })
    .nullish();
}
