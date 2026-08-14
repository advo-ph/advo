import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { changeOrder, project, client, activityLog } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const changeOrderRoutes = new Hono<{ Variables: Variables }>();

changeOrderRoutes.use("*", requireAuth);

// App-validated (not a DB enum) so the set can grow without a migration.
const CHANGE_ORDER_STATUS = ["filed", "quoted", "signed", "declined"] as const;

const createSchema = z.object({
  projectId: z.number().int(),
  scope: z.string().min(1).max(5000),
  reason: z.string().min(1).max(5000),
});

const updateSchema = z.object({
  status: z.enum(CHANGE_ORDER_STATUS).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  timelineNote: z.string().max(2000).nullable().optional(),
});

async function assertClientOwnsProject(userId: number, projectId: number) {
  const [own] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .innerJoin(client, eq(project.clientId, client.clientId))
    .where(and(eq(project.projectId, projectId), eq(client.userId, userId)))
    .limit(1);
  if (!own) throw new HTTPException(404, { message: "Project not found" });
}

// ─── List ─────────────────────────────────────────────
// Team/admin: all (optional ?projectId=). Client: own projects only.

changeOrderRoutes.get("/", async (c) => {
  const user = c.get("user");
  const d = db();
  const projectIdParam = c.req.query("projectId");
  const projectIdFilter = projectIdParam ? Number(projectIdParam) : null;
  if (projectIdParam && Number.isNaN(projectIdFilter)) {
    throw new HTTPException(400, { message: "Invalid projectId" });
  }

  if (user.role === "client") {
    const condition = [eq(client.userId, user.userId)];
    if (projectIdFilter != null) {
      condition.push(eq(changeOrder.projectId, projectIdFilter));
    }
    const row = await d
      .select({
        changeOrderId: changeOrder.changeOrderId,
        projectId: changeOrder.projectId,
        scope: changeOrder.scope,
        reason: changeOrder.reason,
        status: changeOrder.status,
        priceCents: changeOrder.priceCents,
        timelineNote: changeOrder.timelineNote,
        createdBy: changeOrder.createdBy,
        createdAt: changeOrder.createdAt,
        updatedAt: changeOrder.updatedAt,
      })
      .from(changeOrder)
      .innerJoin(project, eq(changeOrder.projectId, project.projectId))
      .innerJoin(client, eq(project.clientId, client.clientId))
      .where(and(...condition))
      .orderBy(desc(changeOrder.createdAt));
    return c.json({ data: row, error: null });
  }

  if (projectIdFilter != null) {
    const row = await d
      .select()
      .from(changeOrder)
      .where(eq(changeOrder.projectId, projectIdFilter))
      .orderBy(desc(changeOrder.createdAt));
    return c.json({ data: row, error: null });
  }

  const row = await d.select().from(changeOrder).orderBy(desc(changeOrder.createdAt));
  return c.json({ data: row, error: null });
});

// ─── File (client on own project; team/admin any) ─────

changeOrderRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  const [proj] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.projectId, data.projectId))
    .limit(1);
  if (!proj) throw new HTTPException(404, { message: "Project not found" });

  if (user.role === "client") {
    await assertClientOwnsProject(user.userId, data.projectId);
  }

  const [created] = await db()
    .insert(changeOrder)
    .values({
      projectId: data.projectId,
      scope: data.scope,
      reason: data.reason,
      status: "filed",
      createdBy: user.userId,
    })
    .returning();

  await db().insert(activityLog).values({
    userId: user.userId,
    action: "change_order_filed",
    entityType: "change_order",
    entityId: created.changeOrderId,
    metadata: { projectId: data.projectId },
  });

  return c.json({ data: created, error: null }, 201);
});

// ─── Quote / status (team) ────────────────────────────
// Team sets price_cents + timeline_note (policy 3 step 1) and status.

changeOrderRoutes.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid change-order id" });
  const data = c.req.valid("json");

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.status !== undefined) values.status = data.status;
  if (data.priceCents !== undefined) values.priceCents = data.priceCents;
  if (data.timelineNote !== undefined) values.timelineNote = data.timelineNote;
  if (
    data.status === undefined &&
    data.priceCents != null &&
    data.priceCents >= 0
  ) {
    values.status = "quoted";
  }

  const [updated] = await db()
    .update(changeOrder)
    .set(values)
    .where(eq(changeOrder.changeOrderId, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Change order not found" });
  return c.json({ data: updated, error: null });
});

export default changeOrderRoutes;
