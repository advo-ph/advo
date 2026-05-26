import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import {
  findUserByEmail,
  findUserById,
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  generateMagicToken,
  verifyMagicToken,
} from "../services/auth.service.js";
import { sendMagicLinkEmail } from "../services/email.service.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../utils/env.js";
import type { Variables } from "../types/context.js";

const auth = new Hono<{ Variables: Variables }>();

// ─── Login ────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }
  if (!user.isActive) {
    throw new HTTPException(403, { message: "Account is disabled" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const accessToken = await signAccessToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
  });

  const refreshToken = await createRefreshToken(
    user.userId,
    c.req.header("User-Agent"),
    c.req.header("X-Forwarded-For") || "unknown"
  );

  return c.json({
    data: {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    },
    error: null,
  });
});

// ─── Magic Link ───────────────────────────────────────

const magicLinkSchema = z.object({
  email: z.string().email().max(255),
});

auth.post("/magic-link", zValidator("json", magicLinkSchema), async (c) => {
  const { email } = c.req.valid("json");

  // Always return success to prevent email enumeration
  const token = await generateMagicToken(email);
  if (token) {
    const link = `${env().FRONTEND_URL}/login?token=${token}`;
    await sendMagicLinkEmail(email, link);
  }

  return c.json({
    data: { message: "If an account exists, a magic link has been sent" },
    error: null,
  });
});

// ─── Verify Magic Link ───────────────────────────────

const verifyMagicSchema = z.object({
  token: z.string().min(1),
});

auth.post("/magic-link/verify", zValidator("json", verifyMagicSchema), async (c) => {
  const { token } = c.req.valid("json");

  const user = await verifyMagicToken(token);
  if (!user) {
    throw new HTTPException(401, { message: "Invalid or expired magic link" });
  }
  if (!user.isActive) {
    throw new HTTPException(403, { message: "Account is disabled" });
  }

  const accessToken = await signAccessToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
  });

  const refreshToken = await createRefreshToken(
    user.userId,
    c.req.header("User-Agent"),
    c.req.header("X-Forwarded-For") || "unknown"
  );

  return c.json({
    data: {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    },
    error: null,
  });
});

// ─── Refresh Token ────────────────────────────────────

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

auth.post("/refresh", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");

  const result = await rotateRefreshToken(
    refreshToken,
    c.req.header("User-Agent"),
    c.req.header("X-Forwarded-For") || "unknown"
  );

  if (!result) {
    throw new HTTPException(401, { message: "Invalid or expired refresh token" });
  }

  const user = await findUserById(result.userId);
  if (!user || !user.isActive) {
    throw new HTTPException(401, { message: "Account not found or disabled" });
  }

  const accessToken = await signAccessToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
  });

  return c.json({
    data: {
      accessToken,
      refreshToken: result.newToken,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    },
    error: null,
  });
});

// ─── Logout ───────────────────────────────────────────

auth.post("/logout", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  await revokeRefreshToken(refreshToken);
  return c.json({ data: { message: "Logged out" }, error: null });
});

// ─── Change Password ─────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(255),
});

auth.post("/change-password", requireAuth, zValidator("json", changePasswordSchema), async (c) => {
  const authUser = c.get("user");
  const { currentPassword, newPassword } = c.req.valid("json");

  const user = await findUserByEmail(authUser.email);
  if (!user || !user.passwordHash) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new HTTPException(401, { message: "Current password is incorrect" });
  }

  const { hashPassword } = await import("../services/auth.service.js");
  const newHash = await hashPassword(newPassword);

  const { db: getDb } = await import("../db/connection.js");
  const { user: userTable } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  await getDb()
    .update(userTable)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(userTable.userId, authUser.userId));

  return c.json({ data: { message: "Password changed" }, error: null });
});

// ─── Me ───────────────────────────────────────────────

auth.get("/me", requireAuth, async (c) => {
  const authUser = c.get("user");
  const user = await findUserById(authUser.userId);

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({
    data: {
      userId: user.userId,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
    error: null,
  });
});

export default auth;
