import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { user } from "../db/schema.js";
import { env } from "../utils/env.js";
import type { Variables } from "../types/context.js";

const encoder = new TextEncoder();

/**
 * How long a "this account is still enabled" answer is trusted before asking the database
 * again.
 *
 * A JWT is valid for 15 minutes and carries no revocation signal, so without a check here a
 * disabled account keeps full API access until its access token happens to expire. Checking
 * on every single request would add a query to every authenticated call in the app, which is
 * a real cost for a flag that changes maybe twice a year.
 *
 * The cache is the middle: one query per user per 15 seconds. Disabling does not wait for the
 * window to close, because the route that disables calls invalidateUserActive and the account
 * is cut off on the next request. The window only matters if some other process changed the
 * flag, and 15 seconds of lag there is acceptable.
 */
const ACTIVE_CACHE_TTL_MS = 15_000;

const activeCache = new Map<number, { isActive: boolean; checkedAt: number }>();

/**
 * Forget the cached answer for one account.
 *
 * Called by whatever turns a login off so the cut-off is immediate rather than "within 15
 * seconds". Exported instead of inlined so the disable path cannot silently forget it.
 */
export function invalidateUserActive(userId: number): void {
  activeCache.delete(userId);
}

/** Clears every cached answer. Used by tests. */
export function clearUserActiveCache(): void {
  activeCache.clear();
}

/**
 * True when the account behind a valid token is still allowed in.
 *
 * A missing user row counts as not allowed: the token outlived the account it named, and
 * letting it through would be the same hole this function exists to close.
 */
async function isUserActive(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = activeCache.get(userId);
  if (cached && now - cached.checkedAt < ACTIVE_CACHE_TTL_MS) {
    return cached.isActive;
  }

  const [row] = await db()
    .select({ isActive: user.isActive })
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1);

  const isActive = row ? row.isActive : false;
  activeCache.set(userId, { isActive, checkedAt: now });
  return isActive;
}

export const requireAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Missing authorization token" });
    }

    const token = header.slice(7);
    let payload;
    try {
      const secret = encoder.encode(env().JWT_SECRET);
      ({ payload } = await jwtVerify(token, secret));
    } catch {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    const userId = payload.userId as number;

    // Outside the try above on purpose. A 403 raised here must reach the client as a 403,
    // and a catch around it would relabel a disabled account as a bad token.
    if (!(await isUserActive(userId))) {
      throw new HTTPException(403, { message: "Account is disabled" });
    }

    c.set("user", {
      userId,
      email: payload.email as string,
      role: payload.role as "admin" | "team" | "client",
    });

    await next();
  }
);

export const optionalAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      try {
        const secret = encoder.encode(env().JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        const userId = payload.userId as number;
        // A disabled account falls through as an anonymous visitor rather than an error,
        // which is what "optional" means here. It still must not keep the admin view.
        if (await isUserActive(userId)) {
          c.set("user", {
            userId,
            email: payload.email as string,
            role: payload.role as "admin" | "team" | "client",
          });
        }
      } catch {
        // Token invalid — continue as unauthenticated
      }
    }
    await next();
  }
);
