/**
 * Accounts this browser remembers.
 *
 * The ask: "even if I log out and there's a saved authentication I should be able to see
 * that account, like there will be a button 'log in to Prince' with no need to type my
 * password or email."
 *
 * So the list is deliberately independent of the session. Signing out ends the session and
 * leaves the entry; only "Forget this account" removes it. Each entry carries a device key,
 * a long-lived per-browser credential the server will exchange for a fresh session without
 * a password. That is a bearer credential sitting in localStorage, which is the trade this
 * internal tool is choosing on purpose.
 *
 * Everything here is defensive about parsing, because this data outlives deploys: an entry
 * written by an older build must never be able to throw on read and take the login page
 * down with it.
 */

const STORAGE_KEY = "advo_saved_accounts";
const LAST_USER_KEY = "advo_last_user";

export interface SavedAccount {
  userId: number;
  email: string;
  /** From team_member.name where the roster knows the person. Never derived from the email. */
  displayName: string;
  avatarUrl: string | null;
  role: string;
  /** Exchanged for a session by POST /api/auth/device-login. Not consumed by use. */
  deviceKey: string;
  lastUsedAt: number;
}

/** The identity a cold load renders before the network has confirmed anything. */
export interface LastUser {
  userId: number;
  email: string;
  role: string;
  displayName?: string;
  avatarUrl?: string | null;
}

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage unavailable. The app still works, it just cannot remember. */
  }
}

function isSavedAccount(value: unknown): value is SavedAccount {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.userId === "number" &&
    typeof a.email === "string" &&
    typeof a.displayName === "string" &&
    typeof a.role === "string" &&
    typeof a.deviceKey === "string" &&
    a.deviceKey.length > 0
  );
}

/** Most recently used first, so the account you actually want is the first tap target. */
export function getSavedAccounts(): SavedAccount[] {
  const parsed = readRaw(STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isSavedAccount)
    .map((a) => ({
      ...a,
      avatarUrl: typeof a.avatarUrl === "string" ? a.avatarUrl : null,
      lastUsedAt: typeof a.lastUsedAt === "number" ? a.lastUsedAt : 0,
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Only one account is remembered per browser. Signing into a different one replaces it,
 * because the login screen no longer offers a way to remove an entry and an append-only
 * list would grow with no way to prune it.
 *
 * Returns the entries this write displaced so the caller can revoke their device keys.
 * The stored shape stays an array: older builds wrote several entries and that data must
 * still parse on read.
 */
export function rememberAccount(account: Omit<SavedAccount, "lastUsedAt">): {
  accounts: SavedAccount[];
  displaced: SavedAccount[];
} {
  const displaced = getSavedAccounts().filter((a) => a.userId !== account.userId);
  const accounts = [{ ...account, lastUsedAt: Date.now() }];
  write(STORAGE_KEY, accounts);
  return { accounts, displaced };
}

export function forgetAccount(userId: number): SavedAccount[] {
  const next = getSavedAccounts().filter((a) => a.userId !== userId);
  write(STORAGE_KEY, next);
  return next;
}

export function findSavedAccount(userId: number): SavedAccount | null {
  return getSavedAccounts().find((a) => a.userId === userId) ?? null;
}

/**
 * The device key this browser already holds for a user, handed back to the server on the
 * next sign-in so it renews the existing key instead of minting a second one.
 */
export function getDeviceKeyFor(userId: number): string | undefined {
  return findSavedAccount(userId)?.deviceKey;
}

// ─── Last Known User ──────────────────────────────────

/**
 * Cached so a cold load can render the signed-in UI immediately and verify in the
 * background. Without it, opening the app offline showed a login page even though the
 * credential was intact — which is the "it logged me out again" complaint, produced by an
 * app that had not actually lost anything.
 *
 * This is a display cache, never an authorisation decision. The API still rejects every
 * request that is not backed by a real token.
 */
export function getLastUser(): LastUser | null {
  const parsed = readRaw(LAST_USER_KEY);
  if (!parsed || typeof parsed !== "object") return null;
  const u = parsed as Record<string, unknown>;
  if (typeof u.userId !== "number" || typeof u.email !== "string" || typeof u.role !== "string") {
    return null;
  }
  return {
    userId: u.userId,
    email: u.email,
    role: u.role,
    displayName: typeof u.displayName === "string" ? u.displayName : undefined,
    avatarUrl: typeof u.avatarUrl === "string" ? u.avatarUrl : null,
  };
}

export function setLastUser(user: LastUser | null) {
  write(LAST_USER_KEY, user);
}
