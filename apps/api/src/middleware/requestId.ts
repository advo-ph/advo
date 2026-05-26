import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";
import type { Variables } from "../types/context.js";

export const requestId = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const id = c.req.header("X-Request-ID") || nanoid(12);
    c.set("requestId", id);
    c.header("X-Request-ID", id);
    await next();
  }
);
