import { randomBytes, createHash } from "node:crypto";

const TOKEN_PREFIX = "advo_bot_";

/** Raw token shown to the user exactly once. Never stored. */
export function generateBotToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashBotToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Shown in the UI so an admin can tell keys apart. Clamped to fit bot_key.key_prefix's
 * varchar(16) exactly (TOKEN_PREFIX is 9 chars, so 7 more of the random suffix) — the
 * original "+8" here overflowed the column by one character and 500'd every create.
 */
export function botTokenPrefix(raw: string): string {
  return raw.slice(0, TOKEN_PREFIX.length + 7);
}
