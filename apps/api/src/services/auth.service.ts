import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { eq, and, gt, lt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { user, session } from "../db/schema.js";
import { env } from "../utils/env.js";

const encoder = new TextEncoder();
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = 30;

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
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    expiresAt,
  });

  return token;
}

export async function rotateRefreshToken(
  oldToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ userId: number; newToken: string } | null> {
  const d = db();

  const [existing] = await d
    .select()
    .from(session)
    .where(
      and(
        eq(session.refreshToken, oldToken),
        gt(session.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!existing) return null;

  // Delete old token (one-time use)
  await d.delete(session).where(eq(session.sessionId, existing.sessionId));

  // Issue new token
  const newToken = await createRefreshToken(existing.userId, userAgent, ipAddress);
  return { userId: existing.userId, newToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db().delete(session).where(eq(session.refreshToken, token));
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db().delete(session).where(eq(session.userId, userId));
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

export async function cleanExpiredSessions(): Promise<number> {
  const result = await db()
    .delete(session)
    .where(lt(session.expiresAt, new Date()))
    .returning();
  return result.length;
}
