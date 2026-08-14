import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting, project, client, deliverable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import {
  formatTaskDescription,
  generateTaskFromTranscript,
} from "../services/meeting-task.service.js";
import type { Variables } from "../types/context.js";

const meetingRoutes = new Hono<{ Variables: Variables }>();

meetingRoutes.use("*", requireAuth);

// ─── Meeting MoM records (CRUD) ──────────────────────
// Team: full CRUD. Client: GET list scoped to own projects
// (project → client.user_id). Optional ?projectId= filter.

const createSchema = z.object({
  projectId: z.number().int(),
  title: z.string().min(1).max(255),
  recordedAt: z.string().datetime(),
  transcript: z.string().min(1).max(500_000),
  plaudShareKey: z.string().max(255).nullable().optional(),
});

const updateSchema = createSchema.partial();

meetingRoutes.get("/", async (c) => {
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
      condition.push(eq(meeting.projectId, projectIdFilter));
    }
    const row = await d
      .select({
        meetingId: meeting.meetingId,
        projectId: meeting.projectId,
        title: meeting.title,
        recordedAt: meeting.recordedAt,
        transcript: meeting.transcript,
        plaudShareKey: meeting.plaudShareKey,
        createdBy: meeting.createdBy,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt,
      })
      .from(meeting)
      .innerJoin(project, eq(meeting.projectId, project.projectId))
      .innerJoin(client, eq(project.clientId, client.clientId))
      .where(and(...condition))
      .orderBy(desc(meeting.recordedAt));
    return c.json({ data: row, error: null });
  }

  // team + admin
  if (projectIdFilter != null) {
    const row = await d
      .select()
      .from(meeting)
      .where(eq(meeting.projectId, projectIdFilter))
      .orderBy(desc(meeting.recordedAt));
    return c.json({ data: row, error: null });
  }

  const row = await d.select().from(meeting).orderBy(desc(meeting.recordedAt));
  return c.json({ data: row, error: null });
});

meetingRoutes.post("/", requireTeam, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  const [proj] = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(eq(project.projectId, data.projectId))
    .limit(1);
  if (!proj) throw new HTTPException(400, { message: "Project not found" });

  const [created] = await db()
    .insert(meeting)
    .values({
      projectId: data.projectId,
      title: data.title,
      recordedAt: new Date(data.recordedAt),
      transcript: data.transcript,
      plaudShareKey: data.plaudShareKey ?? null,
      createdBy: user.userId,
    })
    .returning();
  return c.json({ data: created, error: null }, 201);
});

meetingRoutes.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const data = c.req.valid("json");

  if (data.projectId !== undefined) {
    const [proj] = await db()
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, data.projectId))
      .limit(1);
    if (!proj) throw new HTTPException(400, { message: "Project not found" });
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.projectId !== undefined) values.projectId = data.projectId;
  if (data.title !== undefined) values.title = data.title;
  if (data.recordedAt !== undefined) values.recordedAt = new Date(data.recordedAt);
  if (data.transcript !== undefined) values.transcript = data.transcript;
  if (data.plaudShareKey !== undefined) values.plaudShareKey = data.plaudShareKey ?? null;

  const [updated] = await db()
    .update(meeting)
    .set(values)
    .where(eq(meeting.meetingId, id))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Meeting not found" });
  return c.json({ data: updated, error: null });
});

meetingRoutes.delete("/:id", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const [deleted] = await db()
    .delete(meeting)
    .where(eq(meeting.meetingId, id))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Meeting not found" });
  return c.json({ data: { message: "Meeting deleted" }, error: null });
});

// ─── AI / heuristic task generation from transcript ──
// requireTeam. Reads meeting.transcript; Claude when ANTHROPIC_API_KEY set,
// else line/bullet heuristic. Inserts deliverable rows on meeting.project_id.
// Refuses empty transcript and refuses empty extraction (no silent success).

meetingRoutes.post("/:id/generate-task", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });

  const [row] = await db()
    .select({
      meetingId: meeting.meetingId,
      projectId: meeting.projectId,
      transcript: meeting.transcript,
    })
    .from(meeting)
    .where(eq(meeting.meetingId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Meeting not found" });

  const transcript = (row.transcript ?? "").trim();
  if (!transcript) {
    throw new HTTPException(400, {
      message: "Meeting has no transcript to generate tasks from",
    });
  }

  const extraction = await generateTaskFromTranscript(transcript);
  if (extraction.task.length === 0) {
    throw new HTTPException(422, {
      message: "No actionable tasks found in transcript",
    });
  }

  const values = extraction.task.map((t) => ({
    projectId: row.projectId,
    title: t.title,
    description: formatTaskDescription(t),
    status: "not_started" as const,
    priority: 0,
  }));

  const created = await db().insert(deliverable).values(values).returning();

  return c.json(
    {
      data: {
        deliverable: created,
        method: extraction.method,
        meetingId: row.meetingId,
        projectId: row.projectId,
      },
      error: null,
    },
    201
  );
});

export default meetingRoutes;
