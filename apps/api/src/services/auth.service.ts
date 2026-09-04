import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { eq, and, gt, lt, or, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import { user, session, teamMember, client } from "../db/schema.js";
import { env } from "../utils/env.js";

const encoder = new TextEncoder();
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 365;

/**
 * How long a refresh token keeps working after it has already been rotated.
 *
 * This is the whole fix for the concurrency logout. Five parallel requests hitting an
 * expired access token all present the same refresh token; one rotates it and four arrive
 * late. Without a window the four late ones are 401s, and the client used to read a 401
 * here as "your session is over" and delete the credential the winner had just minted.
 *
 * Seven days rather than seconds because the losing presenter is not always another
 * request in the same tick — it can be a second tab, or a laptop lid reopened on Monday.
 * The cost of being generous is rotated rows sticking around for a week, which
 * cleanExpiredSessions sweeps. The cost of being strict is the bug this exists to remove.
 */
const REFRESH_REUSE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Device keys are renewed on every use, so this is an idle timeout, not a deadline. */
const DEVICE_KEY_DAYS = 365;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signAccessToken(payload: {
  userId: number;
  email: string;
  role: string;
}): Promise<string> {
  const secret = encoder.encode(env().JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(token: string) {
  const secret = encoder.encode(env().JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload as { userId: number; email: string; role: string };
}

export async function createRefreshToken(
  userId: number,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  const token = nanoid(64);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await db().insert(session).values({
    userId,
    refreshToken: token,
    familyId: nanoid(32),
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    expiresAt,
    lastUsedAt: new Date(),
  });

  return token;
}

/**
 * Exchange a refresh token for a new one.
 *
 * `reused` is true when the caller presented a token that had already been rotated and was
 * answered with its family's current live token instead of a rejection. Callers do not need
 * to treat that differently — it is returned so the behaviour is visible in tests and logs
 * rather than silent.
 *
 * Returns null only when the token is genuinely unusable: unknown, expired, or rotated
 * longer ago than the grace window with no live successor left.
 */
export async function rotateRefreshToken(
  oldToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ userId: number; newToken: string; reused: boolean } | null> {
  const d = db();
  const now = new Date();

  const [existing] = await d
    .select()
    .from(session)
    .where(and(eq(session.refreshToken, oldToken), eq(session.isDeviceKey, false)))
    .limit(1);

  if (!existing) return null;

  // Already rotated by somebody else. This is the concurrency case, not an attack: hand
  // back whatever token that lineage is currently using so every racer converges on one
  // credential instead of four of them concluding the session is over.
  if (existing.rotatedAt) {
    if (now.getTime() - existing.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) return null;
    const live = await findLiveSessionForFamily(existing.familyId);
    if (!live) return null;
    return { userId: live.userId, newToken: live.refreshToken, reused: true };
  }

  if (existing.expiresAt <= now) return null;

  /**
   * Claim, then insert, both inside one transaction.
   *
   * The claim is an UPDATE guarded by `rotated_at IS NULL`. Under READ COMMITTED a second
   * caller hitting the same row blocks on the row lock until this transaction commits, then
   * re-evaluates the guard against the committed version, finds rotated_at set, and updates
   * nothing. That is a compare-and-swap with the database doing the serialising, so exactly
   * one caller ever rotates a given token.
   *
   * The order matters and the first version of this had it backwards. Inserting the
   * successor before vacating the predecessor means two rows in the lineage briefly have
   * rotated_at NULL, which the partial unique index rejects outright — it caught the mistake
   * on the first real refresh rather than letting a duplicate live row exist. Claiming first
   * frees the slot, and doing both in one transaction means a loser never observes a family
   * with no live row: it either waits for the commit or sees the state from before it.
   */
  const newToken = nanoid(64);

  const claimed = await d.transaction(async (tx) => {
    const rows = await tx
      .update(session)
      .set({ rotatedAt: now, lastUsedAt: now })
      .where(and(eq(session.sessionId, existing.sessionId), isNull(session.rotatedAt)))
      .returning({ sessionId: session.sessionId });

    if (rows.length === 0) return false;

    await tx.insert(session).values({
      userId: existing.userId,
      refreshToken: newToken,
      familyId: existing.familyId,
      userAgent: userAgent || existing.userAgent,
      ipAddress: ipAddress || existing.ipAddress,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      lastUsedAt: now,
    });

    return true;
  });

  if (!claimed) {
    const live = await findLiveSessionForFamily(existing.familyId);
    if (!live) return null;
    return { userId: live.userId, newToken: live.refreshToken, reused: true };
  }

  return { userId: existing.userId, newToken, reused: false };
}

/** The one row in a lineage that has not been superseded, if it is still in date. */
async function findLiveSessionForFamily(familyId: string) {
  const [live] = await db()
    .select()
    .from(session)
    .where(
      and(
        eq(session.familyId, familyId),
        isNull(session.rotatedAt),
        eq(session.isDeviceKey, false),
        gt(session.expiresAt, new Date())
      )
    )
    .limit(1);
  return live || null;
}

/**
 * Sign out. Retires the whole lineage the token belongs to, not just the row presented,
 * because leaving the rotated predecessors behind would let the grace window resurrect a
 * session the user just ended.
 *
 * Device keys are untouched on purpose. Signing out is meant to leave the account on the
 * login screen as a one-tap target; forgetting the account is a separate, explicit action.
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const d = db();
  const [existing] = await d
    .select({ familyId: session.familyId })
    .from(session)
    .where(and(eq(session.refreshToken, token), eq(session.isDeviceKey, false)))
    .limit(1);

  if (!existing) return;

  await d
    .delete(session)
    .where(and(eq(session.familyId, existing.familyId), eq(session.isDeviceKey, false)));
}

/**
 * Removes every credential a user holds, device keys included.
 *
 * Unlike revokeRefreshToken this is not "sign out". It is the lock-the-account operation, so
 * it has to take the saved one-tap logins with it: leaving those behind would mean a user
 * whose sessions were revoked could still get back in from the login screen without typing
 * anything, which is the exact opposite of the intent.
 */
export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db().delete(session).where(eq(session.userId, userId));
}

// ─── Device Keys ──────────────────────────────────────

/**
 * A non-rotating credential for one browser, so the login screen can offer
 * "Log in as Prince Wagan" with nothing typed.
 *
 * One per browser per user: the caller passes the key it already holds, and if that key is
 * still valid its expiry is pushed out and the same key is returned. That keeps a browser
 * from accumulating a new row on every login.
 */
export async function issueDeviceKey(
  userId: number,
  existingKey?: string | null,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  const d = db();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_KEY_DAYS * 24 * 60 * 60 * 1000);

  if (existingKey) {
    const renewed = await d
      .update(session)
      .set({ expiresAt, lastUsedAt: now })
      .where(
        and(
          eq(session.refreshToken, existingKey),
          eq(session.isDeviceKey, true),
          eq(session.userId, userId)
        )
      )
      .returning({ refreshToken: session.refreshToken });
    if (renewed.length > 0) return renewed[0].refreshToken;
  }

  const key = nanoid(64);
  await d.insert(session).values({
    userId,
    refreshToken: key,
    familyId: nanoid(32),
    isDeviceKey: true,
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    expiresAt,
    lastUsedAt: now,
  });
  return key;
}

/**
 * Resolve a device key to its owner and push its expiry out.
 *
 * The key is deliberately not consumed. It is the saved account, and the saved account has
 * to survive both being used and being logged out of.
 */
export async function useDeviceKey(key: string): Promise<number | null> {
  const d = db();
  const now = new Date();

  const [found] = await d
    .select({ userId: session.userId, sessionId: session.sessionId })
    .from(session)
    .where(
      and(
        eq(session.refreshToken, key),
        eq(session.isDeviceKey, true),
        gt(session.expiresAt, now)
      )
    )
    .limit(1);

  if (!found) return null;

  await d
    .update(session)
    .set({
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + DEVICE_KEY_DAYS * 24 * 60 * 60 * 1000),
    })
    .where(eq(session.sessionId, found.sessionId));

  return found.userId;
}

/** "Forget this account". Removes the key server-side so the tap target cannot be revived. */
export async function revokeDeviceKey(key: string): Promise<void> {
  await db()
    .delete(session)
    .where(and(eq(session.refreshToken, key), eq(session.isDeviceKey, true)));
}

// ─── Display Identity ─────────────────────────────────

/**
 * The name and face to show on a saved-account button.
 *
 * Roster first: team_member.name is the name a person actually goes by, and team_member is
 * joined to the account through team_member.user_id. A client-role account has no roster row,
 * so the company on file is the next best real name. The email local part is the last resort
 * and is only reached when the database knows nothing else about the account.
 */
export async function getDisplayIdentity(
  userId: number,
  email: string
): Promise<{ displayName: string; avatarUrl: string | null }> {
  const d = db();

  const [member] = await d
    .select({ name: teamMember.name, avatarUrl: teamMember.avatarUrl })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .limit(1);

  if (member?.name) {
    return { displayName: member.name, avatarUrl: member.avatarUrl || null };
  }

  const [company] = await d
    .select({ companyName: client.companyName })
    .from(client)
    .where(eq(client.userId, userId))
    .limit(1);

  if (company?.companyName) {
    return { displayName: company.companyName, avatarUrl: null };
  }

  return { displayName: email.split("@")[0] || email, avatarUrl: null };
}

export async function generateMagicToken(email: string): Promise<string | null> {
  const d = db();
  const [existing] = await d
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!existing) return null;

  const token = nanoid(48);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await d
    .update(user)
    .set({ magicToken: token, magicTokenExpiresAt: expiresAt })
    .where(eq(user.userId, existing.userId));

  return token;
}

export async function verifyMagicToken(token: string) {
  const d = db();
  const [found] = await d
    .select()
    .from(user)
    .where(
      and(
        eq(user.magicToken, token),
        gt(user.magicTokenExpiresAt, new Date())
      )
    )
    .limit(1);

  if (!found) return null;

  // Clear the token (one-time use)
  await d
    .update(user)
    .set({ magicToken: null, magicTokenExpiresAt: null })
    .where(eq(user.userId, found.userId));

  return found;
}

/**
 * Return the team_member_id for a user, or null if they have no team member row.
 * Used by /api/auth/me and the userPayload helper so the frontend can look up
 * project role assignments without a separate round-trip.
 */
export async function getTeamMemberId(userId: number): Promise<number | null> {
  const [row] = await db()
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .limit(1);
  return row?.teamMemberId ?? null;
}

export async function findUserByEmail(email: string) {
  const [found] = await db()
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return found || null;
}

export async function findUserById(userId: number) {
  const [found] = await db()
    .select()
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1);
  return found || null;
}

/**
 * Sweeps rows that can no longer authenticate anything: expired tokens, and superseded ones
 * whose grace window has closed. Rotated rows are the new garbage this creates, so removing
 * them is part of the same job rather than a follow-up nobody schedules.
 */
export async function cleanExpiredSessions(): Promise<number> {
  const graceCutoff = new Date(Date.now() - REFRESH_REUSE_GRACE_MS);
  const result = await db()
    .delete(session)
    .where(
      or(
        lt(session.expiresAt, new Date()),
        and(isNotNull(session.rotatedAt), lt(session.rotatedAt, graceCutoff))
      )
    )
    .returning();
  return result.length;
}
