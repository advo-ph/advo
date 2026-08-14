/**
 * Pure helpers for junior / developer team assignment to projects.
 */

/** True when role looks like a junior / developer / intern (case-insensitive). */
export function isJuniorRole(role: string): boolean {
  return /junior|developer|dev|intern/i.test(role);
}
