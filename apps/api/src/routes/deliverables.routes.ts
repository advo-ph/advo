import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, asc, ne, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { deliverable, project, teamMember, client, projectAccess } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import { notifyProjectClient } from "../services/notify.service.js";
import type { Variables } from "../types/context.js";
import { flexibleDateTime } from "../utils/validators.js";

const deliverables = new Hono<{ Variables: Variables }>();

deliverables.use("*", requireAuth);

// ─── List ─────────────────────────────────────────────

deliverables.get("/", async (c) => {
  const user = c.get("user");
  const d = db();

  const mapRow = (r: {
    deliverable: typeof deliverable.$inferSelect;
    project: typeof project.$inferSelect | null;
    team_member: typeof teamMember.$inferSelect | null;
  }) => ({ ...r.deliverable, project: r.project, assignee: r.team_member });

  // Admin: every deliverable.
  if (user.role === "admin") {
    const rows = await d
      .select()
      .from(deliverable)
      .leftJoin(project, eq(deliverable.projectId, project.projectId))
      .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
      .orderBy(asc(deliverable.dueDate));

    return c.json({ data: rows.map(mapRow), error: null });
  }

  // Client: only deliverables on their own projects.
  if (user.role === "client") {
    const rows = await d
      .select()
      .from(deliverable)
      .leftJoin(project, eq(deliverable.projectId, project.projectId))
      .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
      .leftJoin(client, eq(project.clientId, client.clientId))
      .where(eq(client.userId, user.userId))
      .orderBy(asc(deliverable.dueDate));

    return c.json({ data: rows.map(mapRow), error: null });
  }

  // Team: only deliverables on projects they have access to.
  const [tm] = await d
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, user.userId))
    .limit(1);

  if (!tm) return c.json({ data: [], error: null });

  const accessRows = await d
    .select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(eq(projectAccess.teamMemberId, tm.teamMemberId));

  if (!accessRows.length) return c.json({ data: [], error: null });

  const rows = await d
    .select()
    .from(deliverable)
    .leftJoin(project, eq(deliverable.projectId, project.projectId))
    .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
    .where(inArray(deliverable.projectId, accessRows.map((r) => r.projectId)))
    .orderBy(asc(deliverable.dueDate));

  return c.json({ data: rows.map(mapRow), error: null });
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
  dueDate: flexibleDateTime(),
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
// verifiedAt is set/cleared explicitly by team (QA sign-off). Independent of
// status — completing a deliverable does not auto-verify; clearing verifiedAt
// does not reopen status.

const updateSchema = createSchema.partial().extend({
  verifiedAt: flexibleDateTime(),
});

deliverables.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.status === "completed") values.completedAt = new Date();
  if (data.dueDate !== undefined) {
    values.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }
  if (data.verifiedAt !== undefined) {
    values.verifiedAt = data.verifiedAt ? new Date(data.verifiedAt) : null;
  }

  // The before-state, so a re-save of an already-completed row does not notify twice.
  const [old] = await db()
    .select({ status: deliverable.status, verifiedAt: deliverable.verifiedAt })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .limit(1);

  const [updated] = await db()
    .update(deliverable)
    .set(values)
    .where(eq(deliverable.deliverableId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Deliverable not found" });

  const isNewlyCompleted = updated.status === "completed" && old?.status !== "completed";
  const isNewlyVerified = updated.verifiedAt != null && old?.verifiedAt == null;
  if (isNewlyCompleted || isNewlyVerified) {
    await notifyProjectClient(updated.projectId, {
      type: "deliverable_completed",
      title: `${updated.title} is done`,
      body: isNewlyVerified
        ? `${updated.title} has been completed and verified by the team.`
        : `${updated.title} has been marked completed.`,
    });
  }

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
