import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { HTTPException } from "hono/http-exception";
import { env } from "../utils/env.js";
import type { Variables } from "../types/context.js";

const encoder = new TextEncoder();

export const requireAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Missing authorization token" });
    }

    const token = header.slice(7);
    try {
      const secret = encoder.encode(env().JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      c.set("user", {
        userId: payload.userId as number,
        email: payload.email as string,
        role: payload.role as "admin" | "team" | "client",
      });
    } catch {
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

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
        c.set("user", {
          userId: payload.userId as number,
          email: payload.email as string,
          role: payload.role as "admin" | "team" | "client",
        });
      } catch {
        // Token invalid — continue as unauthenticated
      }
    }
    await next();
  }
);
