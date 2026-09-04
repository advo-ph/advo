import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { availabilityBlock } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { timeRangeProblem } from "../utils/manila-date.js";
import { zodMessageHook } from "../utils/validators.js";

const availability = new Hono<{ Variables: Variables }>();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A block is in force on a date when its window contains that date. A NULL bound is an
 * open end, not a closed one — see migration 024.
 */
const inForce = (from: string, to: string) =>
  and(
    or(isNull(availabilityBlock.effectiveFrom), lte(availabilityBlock.effectiveFrom, to)),
    or(isNull(availabilityBlock.effectiveTo), gte(availabilityBlock.effectiveTo, from)),
  );

// ─── List ────────────────────────────────────────────
// Filterable. It used to return every block for every member with no parameters at all,
// which is fine at 3 rows and not fine at 3 years of semesters.

const listSchema = z.object({
  teamMemberId: z.coerce.number().int().positive().optional(),
  /** Manila dates. Both must be present to bound the result. */
  from: z.string().regex(DATE_ONLY).optional(),
  to: z.string().regex(DATE_ONLY).optional(),
});

availability.get("/", requireAuth, requireTeam, zValidator("query", listSchema, zodMessageHook), async (c) => {
  const { teamMemberId, from, to } = c.req.valid("query");

  const filter = [
    teamMemberId ? eq(availabilityBlock.teamMemberId, teamMemberId) : undefined,
    from && to ? inForce(from, to) : undefined,
  ].filter(Boolean);

  const rows = await db()
    .select()
    .from(availabilityBlock)
    .where(filter.length ? and(...filter) : undefined)
    .orderBy(availabilityBlock.teamMemberId, availabilityBlock.dayOfWeek, availabilityBlock.startTime);

  return c.json({ data: rows, error: null });
});

// ─── Create ──────────────────────────────────────────

const blockShape = {
  teamMemberId: z.number().int().positive(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(HHMM, "Time must be HH:MM between 00:00 and 23:59"),
  endTime: z.string().regex(HHMM, "Time must be HH:MM between 00:00 and 23:59"),
  blockType: z.enum(["school", "break", "work", "unavailable"]),
  // null clears the label. undefined (absent) leaves it alone on PATCH. The two are not
  // the same thing, and collapsing them is why clearing a label used to do nothing.
  label: z.string().max(100).nullish(),
  effectiveFrom: z.string().regex(DATE_ONLY).nullish(),
  effectiveTo: z.string().regex(DATE_ONLY).nullish(),
};

/** The checks that need more than one field. Mirrors the CHECKs in migration 024. */
function crossFieldProblem(v: {
  startTime: string;
  endTime: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}): string | null {
  const timeProblem = timeRangeProblem(v.startTime, v.endTime);
  if (timeProblem) return timeProblem;
  if (v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
    return "Effective end date must be on or after the effective start date.";
  }
  return null;
}

const createSchema = z
  .object(blockShape)
  .superRefine((v, ctx) => {
    const problem = crossFieldProblem(v);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ["endTime"] });
  });

availability.post("/", requireAuth, requireTeam, zValidator("json", createSchema, zodMessageHook), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(availabilityBlock).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Update ──────────────────────────────────────────
// A partial patch cannot be validated in isolation: sending only endTime="09:00" against
// a stored startTime="17:00" is an inversion that no per-field rule can see. So the patch
// is merged onto the stored row first, and the merged result is what gets checked.

const updateSchema = z.object(blockShape).partial();

availability.patch("/:id", requireAuth, requireTeam, zValidator("json", updateSchema, zodMessageHook), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid block id" });
  }
  const data = c.req.valid("json");

  const [existing] = await db()
    .select()
    .from(availabilityBlock)
    .where(eq(availabilityBlock.blockId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Block not found" });

  const merged = {
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
    effectiveFrom: data.effectiveFrom !== undefined ? data.effectiveFrom : existing.effectiveFrom,
    effectiveTo: data.effectiveTo !== undefined ? data.effectiveTo : existing.effectiveTo,
  };
  const problem = crossFieldProblem(merged);
  if (problem) throw new HTTPException(400, { message: problem });

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
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid block id" });
  }
  const [deleted] = await db()
    .delete(availabilityBlock)
    .where(eq(availabilityBlock.blockId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Block not found" });
  return c.json({ data: { message: "Block deleted" }, error: null });
});

export default availability;
