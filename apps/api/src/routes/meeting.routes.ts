import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting, project, client, deliverable, teamMember } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import {
  formatTaskDescription,
  generateTaskFromMeeting,
  groundTask,
  type MeetingGrounding,
  type ProposedTask,
} from "../services/meeting-task.service.js";
import { hasPlaudAuth, listPlaudFile } from "../services/plaud.service.js";
import {
  firstAdminUserId,
  importPlaudMeeting,
  resolveInboxProjectId,
} from "../services/plaud-import.service.js";
import { plaudSyncStatus, syncPlaudFolder } from "../services/plaud-poll.service.js";
import { importSecretOk } from "../utils/import-secret.js";
import type { Variables } from "../types/context.js";

const meetingRoutes = new Hono<{ Variables: Variables }>();

const praudImportSchema = z.object({
  fileId: z.string().min(1).max(128).optional(),
  shareUrl: z.string().min(1).max(2000).optional(),
  projectId: z.number().int().optional(),
});

// Service import from praud (passcode `advo`). Shared secret, no user JWT.
meetingRoutes.post(
  "/import/praud",
  zValidator("json", praudImportSchema),
  async (c) => {
    const secret = process.env.PRAUD_IMPORT_SECRET ?? "";
    if (!secret) {
      throw new HTTPException(503, { message: "Praud import is not configured" });
    }
    if (!importSecretOk(c.req.header("Authorization"), secret)) {
      throw new HTTPException(401, { message: "Invalid import secret" });
    }
    const data = c.req.valid("json");
    if (!data.fileId && !data.shareUrl) {
      throw new HTTPException(400, { message: "Provide a Plaud file id or a share URL" });
    }
    const projectId = await resolveInboxProjectId(data.projectId ?? null);
    const createdBy = await firstAdminUserId();
    const result = await importPlaudMeeting({
      projectId,
      fileId: data.fileId,
      shareUrl: data.shareUrl,
      createdBy,
    });
    return c.json({ data: result, error: null }, result.created ? 201 : 200);
  },
);

meetingRoutes.use("*", requireAuth);

// ─── Meeting MoM records (CRUD) ──────────────────────
// Team: full CRUD. Client: GET list scoped to own projects
// (project → client.user_id). Optional ?projectId= filter.

const createSchema = z.object({
  projectId: z.number().int(),
  title: z.string().min(1).max(255),
  recordedAt: z.string().datetime(),
  transcript: z.string().min(1).max(500_000),
  summary: z.string().max(200_000).nullable().optional(),
  plaudShareKey: z.string().max(500).nullable().optional(),
  plaudFileId: z.string().max(64).nullable().optional(),
  isVisibleClient: z.boolean().optional(),
});

const importSchema = z.object({
  projectId: z.number().int(),
  fileId: z.string().min(1).max(128).optional(),
  shareUrl: z.string().min(1).max(2000).optional(),
});

const updateSchema = createSchema.partial();

const proposedTaskSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(5000).optional(),
  suggestedSkill: z.string().max(40).optional(),
  assignedTo: z.number().int().nullable().optional(),
  assigneeName: z.string().max(255).nullable().optional(),
  ownerRaw: z.string().max(255).nullable().optional(),
  projectId: z.number().int().nullable().optional(),
});

const generateSchema = z.object({
  task: z.array(proposedTaskSchema).min(1).max(8).optional(),
  method: z.enum(["heuristic", "ai", "note"]).optional(),
});

async function loadGrounding(projectId: number): Promise<MeetingGrounding> {
  const d = db();
  const roster = await d
    .select({
      teamMemberId: teamMember.teamMemberId,
      name: teamMember.name,
      role: teamMember.role,
    })
    .from(teamMember)
    .where(eq(teamMember.isActive, true));

  const catalog = await d
    .select({
      projectId: project.projectId,
      title: project.title,
      clientName: client.companyName,
    })
    .from(project)
    .innerJoin(client, eq(project.clientId, client.clientId));

  const current = catalog.find((p) => p.projectId === projectId);
  return {
    roster,
    catalog,
    project: current ?? { projectId, title: `Project #${projectId}` },
  };
}

function asProposed(raw: z.infer<typeof proposedTaskSchema>, grounding: MeetingGrounding): ProposedTask {
  const grounded = groundTask(
    {
      title: raw.title,
      description: raw.description ?? "",
      suggestedSkill: raw.suggestedSkill ?? "general",
      assignedTo: raw.assignedTo ?? null,
      assigneeName: raw.assigneeName ?? null,
      ownerRaw: raw.ownerRaw ?? raw.assigneeName ?? null,
      projectId: raw.projectId ?? grounding.project.projectId,
    },
    grounding,
  );
  return {
    ...grounded,
    assignedTo: raw.assignedTo !== undefined ? raw.assignedTo : grounded.assignedTo,
    assigneeName: raw.assigneeName !== undefined ? raw.assigneeName : grounded.assigneeName,
    projectId: raw.projectId !== undefined && raw.projectId !== null
      ? raw.projectId
      : grounded.projectId,
  };
}

meetingRoutes.get("/", async (c) => {
  const user = c.get("user");
  const d = db();
  const projectIdParam = c.req.query("projectId");
  const projectIdFilter = projectIdParam ? Number(projectIdParam) : null;
  if (projectIdParam && Number.isNaN(projectIdFilter)) {
    throw new HTTPException(400, { message: "Invalid projectId" });
  }

  if (user.role === "client") {
    const condition = [
      eq(client.userId, user.userId),
      eq(meeting.isVisibleClient, true),
    ];
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
        summary: meeting.summary,
        plaudFileId: meeting.plaudFileId,
        plaudShareKey: meeting.plaudShareKey,
        isVisibleClient: meeting.isVisibleClient,
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

// List Plaud recordings. query=advo resolves the ADVO filetag, then
// filters GET /file/simple/web. Team only.
meetingRoutes.get("/plaud", requireTeam, async (c) => {
  if (!hasPlaudAuth()) {
    throw new HTTPException(503, {
      message: "Plaud auth is not configured (PLAUD_TOKEN or ~/.piper/plaud-auth.json)",
    });
  }
  const query = c.req.query("query") ?? "advo";
  try {
    const file = await listPlaudFile(query);
    return c.json({ data: { file }, error: null });
  } catch (err) {
    throw new HTTPException(502, {
      message: err instanceof Error ? err.message : "Plaud list failed",
    });
  }
});

meetingRoutes.get("/plaud/status", requireTeam, (c) => {
  return c.json({ data: plaudSyncStatus(), error: null });
});

meetingRoutes.post("/plaud/sync", requireTeam, async (c) => {
  if (!hasPlaudAuth()) {
    throw new HTTPException(503, {
      message: "Plaud auth is not configured (PLAUD_TOKEN or ~/.piper/plaud-auth.json)",
    });
  }
  const result = await syncPlaudFolder();
  return c.json({ data: result, error: null });
});

// Import from Plaud file id or public share URL. Team only.
meetingRoutes.post("/import", requireTeam, zValidator("json", importSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");
  const result = await importPlaudMeeting({
    projectId: data.projectId,
    fileId: data.fileId,
    shareUrl: data.shareUrl,
    createdBy: user.userId,
  });
  return c.json({ data: result, error: null }, result.created ? 201 : 200);
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
      summary: data.summary ?? null,
      plaudFileId: data.plaudFileId ?? null,
      plaudShareKey: data.plaudShareKey ?? null,
      isVisibleClient: data.isVisibleClient ?? false,
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
  if (data.summary !== undefined) values.summary = data.summary ?? null;
  if (data.plaudFileId !== undefined) values.plaudFileId = data.plaudFileId ?? null;
  if (data.plaudShareKey !== undefined) values.plaudShareKey = data.plaudShareKey ?? null;
  if (data.isVisibleClient !== undefined) values.isVisibleClient = data.isVisibleClient;

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

// ─── Grounded extract (preview) + confirm insert ──
// requireTeam. Prefers Plaud note action items, then Claude / heuristic.
// Owners resolve against team_member. Preview writes nothing.

async function loadMeetingForTask(id: number) {
  const [row] = await db()
    .select({
      meetingId: meeting.meetingId,
      projectId: meeting.projectId,
      title: meeting.title,
      transcript: meeting.transcript,
      summary: meeting.summary,
    })
    .from(meeting)
    .where(eq(meeting.meetingId, id))
    .limit(1);
  return row ?? null;
}

meetingRoutes.post("/:id/propose-task", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });

  const row = await loadMeetingForTask(id);
  if (!row) throw new HTTPException(404, { message: "Meeting not found" });

  const transcript = (row.transcript ?? "").trim();
  const summary = (row.summary ?? "").trim();
  if (!transcript && !summary) {
    throw new HTTPException(400, {
      message: "Meeting has no transcript or note to generate tasks from",
    });
  }

  const grounding = await loadGrounding(row.projectId);
  const extraction = await generateTaskFromMeeting({
    transcript,
    summary,
    grounding,
  });
  if (extraction.task.length === 0) {
    throw new HTTPException(422, {
      message: "No actionable tasks found in transcript",
    });
  }

  return c.json({
    data: {
      task: extraction.task,
      method: extraction.method,
      meetingId: row.meetingId,
      projectId: row.projectId,
    },
    error: null,
  });
});

meetingRoutes.post("/:id/generate-task", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });

  const row = await loadMeetingForTask(id);
  if (!row) throw new HTTPException(404, { message: "Meeting not found" });

  const grounding = await loadGrounding(row.projectId);

  let confirmed: ProposedTask[] | null = null;
  let methodFromBody: "heuristic" | "ai" | "note" | undefined;
  try {
    const raw = await c.req.json();
    const parsed = generateSchema.parse(raw ?? {});
    if (parsed.task?.length) {
      confirmed = parsed.task.map((t) => asProposed(t, grounding));
      methodFromBody = parsed.method;
    }
  } catch {
    confirmed = null;
  }

  let method: "heuristic" | "ai" | "note" = methodFromBody ?? "heuristic";
  let extracted = confirmed;
  if (!extracted) {
    const transcript = (row.transcript ?? "").trim();
    const summary = (row.summary ?? "").trim();
    if (!transcript && !summary) {
      throw new HTTPException(400, {
        message: "Meeting has no transcript or note to generate tasks from",
      });
    }
    const extraction = await generateTaskFromMeeting({
      transcript,
      summary,
      grounding,
    });
    extracted = extraction.task;
    method = extraction.method;
  }

  if (extracted.length === 0) {
    throw new HTTPException(422, {
      message: "No actionable tasks found in transcript",
    });
  }

  const values = extracted.map((t) => ({
    projectId: t.projectId ?? row.projectId,
    title: t.title,
    description: formatTaskDescription(t),
    status: "not_started" as const,
    priority: 0,
    assignedTo: t.assignedTo,
  }));

  const created = await db().insert(deliverable).values(values).returning();

  return c.json(
    {
      data: {
        deliverable: created,
        task: extracted,
        method,
        meetingId: row.meetingId,
        projectId: row.projectId,
      },
      error: null,
    },
    201
  );
});

export default meetingRoutes;
