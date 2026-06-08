import { z } from "zod";

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
    .transform((v): string => (/^https?:\/\//i.test(v) ? v : `https://${v}`));
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
