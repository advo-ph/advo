import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, asc, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { deliverable, project, teamMember } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const deliverables = new Hono<{ Variables: Variables }>();

deliverables.use("*", requireAuth);

// ─── List ─────────────────────────────────────────────

deliverables.get("/", async (c) => {
  const rows = await db()
    .select()
    .from(deliverable)
    .leftJoin(project, eq(deliverable.projectId, project.projectId))
    .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
    .orderBy(asc(deliverable.dueDate));

  return c.json({
    data: rows.map((r) => ({
      ...r.deliverable,
      project: r.project,
      assignee: r.team_member,
    })),
    error: null,
  });
});

// ─── Upcoming Deadlines ──────────────────────────────

deliverables.get("/upcoming", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 10), 50);

  const rows = await db()
    .select()
    .from(deliverable)
    .leftJoin(project, eq(deliverable.projectId, project.projectId))
    .where(ne(deliverable.status, "completed"))
    .orderBy(asc(deliverable.dueDate))
    .limit(limit);

  return c.json({
    data: rows.map((r) => ({
      ...r.deliverable,
      project: r.project,
    })),
    error: null,
  });
});

// ─── Create ───────────────────────────────────────────

const createSchema = z.object({
  projectId: z.number(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  assignedTo: z.number().nullable().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  status: z
    .enum(["not_started", "in_progress", "review", "completed", "blocked"])
    .optional(),
  dueDate: z.string().datetime().nullish(),
});

deliverables.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(deliverable)
    .values({
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    })
    .returning();

  return c.json({ data: created, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────

deliverables.patch("/:id", requireTeam, zValidator("json", createSchema.partial()), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.status === "completed") values.completedAt = new Date();
  if (data.dueDate !== undefined) {
    values.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  const [updated] = await db()
    .update(deliverable)
    .set(values)
    .where(eq(deliverable.deliverableId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Deliverable not found" });
  return c.json({ data: updated, error: null });
});

// ─── Delete ───────────────────────────────────────────

deliverables.delete("/:id", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Deliverable not found" });
  return c.json({ data: { message: "Deliverable deleted" }, error: null });
});

export default deliverables;
