/**
 * Usernames are the email local part, lowercased with punctuation removed.
 * For example, prince.wagan@advo.ph becomes princewagan.
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function usernameFromEmail(email: string): string {
  const username = normalizeUsername(email.split("@", 1)[0] ?? "");
  if (!username) {
    throw new Error("The email address does not produce a valid username");
  }
  return username;
}
