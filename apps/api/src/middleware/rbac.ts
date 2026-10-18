import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { user as userTable } from "../db/schema.js";
import type { Variables } from "../types/context.js";

type Role = "admin" | "team" | "client";

export function requireRole(...roles: Role[]) {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    await next();
  });
}

export const requireAdmin = requireRole("admin");
export const requireTeam = requireRole("admin", "team");
export const requireAdminOrClient = requireRole("admin", "client");

/**
 * `is_owner` (migration 026/033) is a boolean column, not a role value, so it
 * needs its own lookup rather than requireRole. Every existing owner-gated
 * route (deliverables, commission, team, settings, vps-monitor) re-implements
 * this same `getIsOwner` lookup locally; this is the first shared middleware
 * version — see those files' own `getIsOwner` for the pattern this mirrors.
 */
export const requireOwner = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  const [row] = await db()
    .select({ isOwner: userTable.isOwner })
    .from(userTable)
    .where(eq(userTable.userId, user.userId))
    .limit(1);
  if (!row?.isOwner) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
  await next();
});
