import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { availabilityBlock } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const availability = new Hono<{ Variables: Variables }>();

// ─── List All ────────────────────────────────────────

availability.get("/", requireAuth, requireTeam, async (c) => {
  const rows = await db()
    .select()
    .from(availabilityBlock)
    .orderBy(availabilityBlock.teamMemberId, availabilityBlock.dayOfWeek, availabilityBlock.startTime);
  return c.json({ data: rows, error: null });
});

// ─── Create ──────────────────────────────────────────

const createSchema = z.object({
  teamMemberId: z.number().int().positive(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  blockType: z.enum(["school", "break", "work", "unavailable"]),
  label: z.string().max(100).optional(),
});

availability.post("/", requireAuth, requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(availabilityBlock).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Update ──────────────────────────────────────────

availability.patch("/:id", requireAuth, requireTeam, zValidator("json", createSchema.partial()), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const [updated] = await db()
    .update(availabilityBlock)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(availabilityBlock.blockId, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Block not found" });
  return c.json({ data: updated, error: null });
});

// ─── Delete ──────────────────────────────────────────

availability.delete("/:id", requireAuth, requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(availabilityBlock)
    .where(eq(availabilityBlock.blockId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Block not found" });
  return c.json({ data: { message: "Block deleted" }, error: null });
});

export default availability;
