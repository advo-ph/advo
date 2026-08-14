import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { libraryItem } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const library = new Hono<{ Variables: Variables }>();

library.use("*", requireAuth, requireTeam);

const LIBRARY_ITEM_TYPE = ["website", "prompt", "module", "asset", "doc"] as const;

const upsertSchema = z.object({
  itemType: z.enum(LIBRARY_ITEM_TYPE),
  title: z.string().min(1).max(255),
  url: z.string().max(2000).nullish(),
  body: z.string().max(20000).nullish(),
  thumbnailUrl: z.string().max(2000).nullish(),
  tag: z.array(z.string().min(1).max(40)).max(20).optional(),
});

function normalizeTag(tag: string[] | undefined): string[] {
  if (!tag) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tag) {
    const value = raw.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

library.get("/", async (c) => {
  const itemType = c.req.query("itemType");
  const row = await db()
    .select()
    .from(libraryItem)
    .where(
      itemType && LIBRARY_ITEM_TYPE.includes(itemType as (typeof LIBRARY_ITEM_TYPE)[number])
        ? eq(libraryItem.itemType, itemType as (typeof LIBRARY_ITEM_TYPE)[number])
        : undefined,
    )
    .orderBy(desc(libraryItem.createdAt));

  return c.json({ data: row, error: null });
});

library.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });

  const [row] = await db()
    .select()
    .from(libraryItem)
    .where(eq(libraryItem.libraryItemId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Library item not found" });
  return c.json({ data: row, error: null });
});

library.post("/", zValidator("json", upsertSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(libraryItem)
    .values({
      itemType: data.itemType,
      title: data.title.trim(),
      url: data.url?.trim() || null,
      body: data.body?.trim() || null,
      thumbnailUrl: data.thumbnailUrl?.trim() || null,
      tag: normalizeTag(data.tag),
    })
    .returning();

  return c.json({ data: created, error: null }, 201);
});

library.patch("/:id", zValidator("json", upsertSchema.partial()), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });

  const data = c.req.valid("json");
  const [updated] = await db()
    .update(libraryItem)
    .set({
      ...(data.itemType ? { itemType: data.itemType } : {}),
      ...(data.title != null ? { title: data.title.trim() } : {}),
      ...(data.url !== undefined ? { url: data.url?.trim() || null } : {}),
      ...(data.body !== undefined ? { body: data.body?.trim() || null } : {}),
      ...(data.thumbnailUrl !== undefined
        ? { thumbnailUrl: data.thumbnailUrl?.trim() || null }
        : {}),
      ...(data.tag !== undefined ? { tag: normalizeTag(data.tag) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(libraryItem.libraryItemId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Library item not found" });
  return c.json({ data: updated, error: null });
});

library.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });

  const [deleted] = await db()
    .delete(libraryItem)
    .where(eq(libraryItem.libraryItemId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Library item not found" });
  return c.json({ data: { message: "Deleted" }, error: null });
});

export default library;
