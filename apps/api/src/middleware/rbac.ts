import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
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
