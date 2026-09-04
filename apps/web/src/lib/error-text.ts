/**
 * Turns whatever a mutation threw into a sentence worth showing a user.
 *
 * There are two kinds of message arriving here and they need opposite
 * treatment:
 *
 *   - The SERVER's message. Written to be read, already says what to do
 *     ("That lead is already on this campaign"). Passed through untouched.
 *     Rewording it here would throw away the only part with real detail.
 *
 *   - The BROWSER's message. "Failed to fetch" is what fetch() says when the
 *     network is gone, the API is down, DNS failed, or CORS refused. It is
 *     accurate and completely useless to the person reading it, because it
 *     names a function they have never heard of and suggests nothing to do.
 *     Those get replaced.
 */

/** What fetch() and friends produce when the request never reached a server. */
const NETWORK_MESSAGE = [
  "failed to fetch",
  "network request failed",
  "load failed",
  "networkerror when attempting to fetch resource.",
  "the internet connection appears to be offline.",
  "fetch failed",
];

const OFFLINE_TEXT =
  "Could not reach the server. Check your connection and try again.";

export function errorText(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (NETWORK_MESSAGE.includes(trimmed.toLowerCase())) return OFFLINE_TEXT;

  // An unhandled server crash reaches us as this exact string. It tells the
  // user nothing they can act on, so say what they can do instead.
  if (trimmed === "Internal server error") {
    return "The server hit an error and did not save this. Try again, and tell the team if it keeps happening.";
  }

  return trimmed;
}
