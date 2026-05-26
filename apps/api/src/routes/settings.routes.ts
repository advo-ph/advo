import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { siteConfig } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const settings = new Hono<{ Variables: Variables }>();

settings.use("*", requireAuth);
settings.use("*", requireAdmin);

// ─── List All ─────────────────────────────────────────

settings.get("/", async (c) => {
  const rows = await db().select().from(siteConfig);
  return c.json({ data: rows, error: null });
});

// ─── Get One ──────────────────────────────────────────

settings.get("/:key", async (c) => {
  const key = c.req.param("key");
  const [row] = await db()
    .select()
    .from(siteConfig)
    .where(eq(siteConfig.key, key))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Setting not found" });
  return c.json({ data: row, error: null });
});

// ─── Upsert ───────────────────────────────────────────

settings.patch(
  "/:key",
  zValidator("json", z.object({ value: z.unknown() })),
  async (c) => {
    const key = c.req.param("key");
    const { value } = c.req.valid("json");
    const d = db();

    const [existing] = await d
      .select()
      .from(siteConfig)
      .where(eq(siteConfig.key, key))
      .limit(1);

    if (existing) {
      const [updated] = await d
        .update(siteConfig)
        .set({ value, updatedAt: new Date() })
        .where(eq(siteConfig.key, key))
        .returning();

      return c.json({ data: updated, error: null });
    }

    const [created] = await d
      .insert(siteConfig)
      .values({ key, value, updatedAt: new Date() })
      .returning();

    return c.json({ data: created, error: null }, 201);
  }
);

export default settings;
