import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting, meetingAttendee, meetingRecording, backgroundJob, project, client, deliverable, teamMember, user } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import { requireAdmin } from "../middleware/rbac.js";
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

const ORDER_MESSAGE = "End must be after start.";
const isOutOfOrder = (a?: string | null, b?: string | null) =>
  Boolean(a && b && new Date(b) <= new Date(a));

// Base shape — used for both create (with superRefine) and partial update.
const meetingBaseShape = z.object({
  projectId: z.number().int().optional().nullable(),
  title: z.string().min(1).max(255),
  // recordedAt kept optional for backward compat; old clients still send it.
  recordedAt: z.string().datetime().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  transcript: z.string().max(500_000).optional().default(""),
  summary: z.string().max(200_000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  plaudShareKey: z.string().max(500).nullable().optional(),
  plaudFileId: z.string().max(64).nullable().optional(),
  isVisibleClient: z.boolean().optional(),
});

// updateSchema is a plain partial — no superRefine cross-field checks on partial patches.
const updateSchema = meetingBaseShape.partial();

// createSchema requires at least one date field.
const createSchema = meetingBaseShape.superRefine((v, ctx) => {
  if (!v.recordedAt && !v.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a date or scheduled time.",
      path: ["startsAt"],
    });
  }
  if (isOutOfOrder(v.startsAt, v.endsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: ORDER_MESSAGE,
      path: ["endsAt"],
    });
  }
});

const importSchema = z.object({
  projectId: z.number().int(),
  fileId: z.string().min(1).max(128).optional(),
  shareUrl: z.string().min(1).max(2000).optional(),
});

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
  method: z.enum(["heuristic", "ai", "note", "ask"]).optional(),
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

// Attendee row shape used in the list response.
interface AttendeeRow {
  userId: number;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/** Sort meetings: upcoming (startsAt in future) soonest-first, then past newest-first. */
function sortMeetings<T extends { startsAt: Date | null; recordedAt: Date }>(rows: T[]): T[] {
  const now = Date.now();
  const keyOf = (r: T) =>
    r.startsAt ? r.startsAt.getTime() : r.recordedAt.getTime();
  const isUpcoming = (r: T) => r.startsAt != null && r.startsAt.getTime() > now;
  return [...rows].sort((a, b) => {
    const aUp = isUpcoming(a);
    const bUp = isUpcoming(b);
    if (aUp && !bUp) return -1;
    if (!aUp && bUp) return 1;
    if (aUp && bUp) return keyOf(a) - keyOf(b); // upcoming: soonest first
    return keyOf(b) - keyOf(a);                  // past: newest first
  });
}

/** Fetch attendees for a list of meeting IDs in one query; group by meetingId. */
async function fetchAttendeeMap(ids: number[]): Promise<Map<number, AttendeeRow[]>> {
  const map = new Map<number, AttendeeRow[]>();
  if (ids.length === 0) return map;
  const d = db();
  const atts = await d
    .select({
      meetingId: meetingAttendee.meetingId,
      userId: meetingAttendee.userId,
      joinedAt: meetingAttendee.joinedAt,
      name: teamMember.name,
      avatarUrl: teamMember.avatarUrl,
      email: user.email,
    })
    .from(meetingAttendee)
    .innerJoin(user, eq(meetingAttendee.userId, user.userId))
    .leftJoin(teamMember, eq(teamMember.userId, user.userId))
    .where(inArray(meetingAttendee.meetingId, ids));
  for (const a of atts) {
    if (!map.has(a.meetingId)) map.set(a.meetingId, []);
    map.get(a.meetingId)!.push({
      userId: a.userId,
      name: a.name ?? a.email ?? `User #${a.userId}`,
      avatarUrl: a.avatarUrl ?? null,
      joinedAt: a.joinedAt.toISOString(),
    });
  }
  return map;
}

meetingRoutes.get("/", async (c) => {
  const currentUser = c.get("user");
  const d = db();
  const projectIdParam = c.req.query("projectId");
  const projectIdFilter = projectIdParam ? Number(projectIdParam) : null;
  if (projectIdParam && Number.isNaN(projectIdFilter)) {
    throw new HTTPException(400, { message: "Invalid projectId" });
  }

  if (currentUser.role === "client") {
    // Client path: inner join restricts to meetings with a project that belongs to this client.
    const condition = [
      eq(client.userId, currentUser.userId),
      eq(meeting.isVisibleClient, true),
    ];
    if (projectIdFilter != null) {
      condition.push(eq(meeting.projectId, projectIdFilter));
    }
    const rows = await d
      .select({
        meetingId: meeting.meetingId,
        projectId: meeting.projectId,
        title: meeting.title,
        recordedAt: meeting.recordedAt,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        transcript: meeting.transcript,
        summary: meeting.summary,
        location: meeting.location,
        description: meeting.description,
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
      .where(and(...condition));
    const sorted = sortMeetings(rows);
    const attendeeMap = await fetchAttendeeMap(sorted.map((r) => r.meetingId));
    return c.json({
      data: sorted.map((r) => ({ ...r, attendees: attendeeMap.get(r.meetingId) ?? [] })),
      error: null,
    });
  }

  // team + admin
  let rows: (typeof meeting.$inferSelect)[];
  if (projectIdFilter != null) {
    rows = await d.select().from(meeting).where(eq(meeting.projectId, projectIdFilter));
  } else {
    rows = await d.select().from(meeting);
  }

  const sorted = sortMeetings(rows);
  const attendeeMap = await fetchAttendeeMap(sorted.map((r) => r.meetingId));
  return c.json({
    data: sorted.map((r) => ({ ...r, attendees: attendeeMap.get(r.meetingId) ?? [] })),
    error: null,
  });
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
  const currentUser = c.get("user");

  // Only verify project exists when one was provided.
  if (data.projectId != null) {
    const [proj] = await db()
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, data.projectId))
      .limit(1);
    if (!proj) throw new HTTPException(400, { message: "Project not found" });
  }

  // recordedAt is used for list ordering. Fall back to startsAt, then now.
  const recordedAt = data.recordedAt
    ? new Date(data.recordedAt)
    : data.startsAt
      ? new Date(data.startsAt)
      : new Date();

  const [created] = await db()
    .insert(meeting)
    .values({
      projectId: data.projectId ?? null,
      title: data.title,
      recordedAt,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      transcript: data.transcript ?? "",
      summary: data.summary ?? null,
      location: data.location ?? null,
      description: data.description ?? null,
      plaudFileId: data.plaudFileId ?? null,
      plaudShareKey: data.plaudShareKey ?? null,
      isVisibleClient: data.isVisibleClient ?? false,
      createdBy: currentUser.userId,
    })
    .returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Self-serve attendance ────────────────────────────
// /:id/join must be registered BEFORE /:id so Hono does not route "join"
// as a meeting id. requireAuth allows any logged-in user (not just team).

meetingRoutes.post("/:id/join", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const currentUser = c.get("user");

  // Confirm meeting exists.
  const [row] = await db()
    .select({ meetingId: meeting.meetingId })
    .from(meeting)
    .where(eq(meeting.meetingId, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Meeting not found" });

  await db()
    .insert(meetingAttendee)
    .values({ meetingId: id, userId: currentUser.userId })
    .onConflictDoNothing();

  return c.json({ data: { meetingId: id, userId: currentUser.userId }, error: null }, 201);
});

meetingRoutes.delete("/:id/join", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const currentUser = c.get("user");

  await db()
    .delete(meetingAttendee)
    .where(and(eq(meetingAttendee.meetingId, id), eq(meetingAttendee.userId, currentUser.userId)));

  return c.json({ data: { message: "Left meeting" }, error: null });
});

meetingRoutes.patch("/:id", requireTeam, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid meeting id" });
  const data = c.req.valid("json");

  // Only verify project when one is explicitly being set (not when clearing to null).
  if (data.projectId != null) {
    const [proj] = await db()
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, data.projectId))
      .limit(1);
    if (!proj) throw new HTTPException(400, { message: "Project not found" });
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.projectId !== undefined) values.projectId = data.projectId ?? null;
  if (data.title !== undefined) values.title = data.title;
  if (data.recordedAt !== undefined) values.recordedAt = new Date(data.recordedAt);
  if (data.startsAt !== undefined) values.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.endsAt !== undefined) values.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (data.transcript !== undefined) values.transcript = data.transcript;
  if (data.summary !== undefined) values.summary = data.summary ?? null;
  if (data.location !== undefined) values.location = data.location ?? null;
  if (data.description !== undefined) values.description = data.description ?? null;
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
      plaudFileId: meeting.plaudFileId,
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
  if (!row.projectId) {
    throw new HTTPException(400, { message: "Assign a project before generating tasks." });
  }

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
    plaudFileId: row.plaudFileId,
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
  if (!row.projectId) {
    throw new HTTPException(400, { message: "Assign a project before generating tasks." });
  }

  const grounding = await loadGrounding(row.projectId);

  /**
   * Two very different failures used to land in the same `catch`: "there was no
   * body" (fine, the caller wants us to generate) and "there was a body and it
   * did not validate" (absolutely not fine). Collapsing them meant a user who
   * edited the proposed task list and pressed Confirm could get heuristically
   * regenerated tasks written to their project INSTEAD of the ones they wrote,
   * answered 201, with nothing anywhere saying a substitution had happened.
   * A write that silently does something other than what was asked.
   *
   * They are now separate. An empty body still means "generate for me". A body
   * that is present but unreadable is a 400 and writes nothing.
   */
  let confirmed: ProposedTask[] | null = null;
  let methodFromBody: "heuristic" | "ai" | "note" | "ask" | undefined;

  const rawBody = await c.req.text().catch(() => "");
  if (rawBody.trim().length > 0) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      throw new HTTPException(400, {
        message:
          "The task list could not be read, so nothing was saved. Reload the meeting and confirm the tasks again.",
      });
    }

    const parsed = generateSchema.safeParse(parsedJson ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw new HTTPException(400, {
        message: `The task list was rejected, so nothing was saved. ${where}${issue?.message ?? "Invalid task list."}`,
      });
    }

    if (parsed.data.task?.length) {
      confirmed = parsed.data.task.map((t) => asProposed(t, grounding));
      methodFromBody = parsed.data.method;
    }
  }

  let method: "heuristic" | "ai" | "note" | "ask" = methodFromBody ?? "heuristic";
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
      plaudFileId: row.plaudFileId,
    });
    extracted = extraction.task;
    method = extraction.method;
  }

  if (extracted.length === 0) {
    throw new HTTPException(422, {
      message: "No actionable tasks found in transcript",
    });
  }

  // row.projectId is guaranteed non-null here (checked above).
  const values = extracted.map((t) => ({
    projectId: (t.projectId ?? row.projectId)!,
    title: t.title,
    description: formatTaskDescription(t),
    status: "todo" as const,
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

// ─── Meeting Recordings ──────────────────────────────
// Upload an audio file and store a row. Transcription is a separate request.

const recordingCreateSchema = z.object({
  meetingId: z.number().int().optional(),
  fileUrl: z.string().url(),
  fileName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
});

// POST /api/meeting/recordings — create a recording row
meetingRoutes.post(
  "/recordings",
  requireTeam,
  zValidator("json", recordingCreateSchema),
  async (c) => {
    const data = c.req.valid("json");

    const [created] = await db()
      .insert(meetingRecording)
      .values({
        meetingId: data.meetingId ?? null,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
      })
      .returning();

    return c.json({ data: created, error: null }, 201);
  },
);

// GET /api/meeting/recordings?meetingId= — list recordings for a meeting
meetingRoutes.get("/recordings", requireTeam, async (c) => {
  const meetingIdParam = c.req.query("meetingId");
  if (!meetingIdParam) {
    throw new HTTPException(400, { message: "meetingId query param is required" });
  }
  const meetingId = Number(meetingIdParam);
  if (Number.isNaN(meetingId)) {
    throw new HTTPException(400, { message: "Invalid meetingId" });
  }

  const rows = await db()
    .select()
    .from(meetingRecording)
    .where(eq(meetingRecording.meetingId, meetingId))
    .orderBy(desc(meetingRecording.createdAt));

  return c.json({ data: rows, error: null });
});

// POST /api/meeting/recordings/:id/transcribe — create a transcription background job
meetingRoutes.post("/recordings/:id/transcribe", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid recording id" });

  const user = c.get("user");
  const d = db();

  const [rec] = await d
    .select()
    .from(meetingRecording)
    .where(eq(meetingRecording.recordingId, id))
    .limit(1);

  if (!rec) throw new HTTPException(404, { message: "Recording not found" });

  // Check there isn't already an active job for this recording.
  if (rec.jobId) {
    const [existingJob] = await d
      .select({ status: backgroundJob.status })
      .from(backgroundJob)
      .where(eq(backgroundJob.jobId, rec.jobId))
      .limit(1);

    if (existingJob && (existingJob.status === "queued" || existingJob.status === "running")) {
      throw new HTTPException(409, { message: "A transcription is already running for this recording" });
    }
  }

  // Create the background job. Store recordingId in result so the handler knows which row to update.
  const [newJob] = await d
    .insert(backgroundJob)
    .values({
      jobType: "transcribe_recording",
      title: "Transcribing Audio",
      steps: [{ label: rec.fileName, status: "pending" }],
      result: { recordingId: id },
      createdBy: user.userId,
    })
    .returning({ jobId: backgroundJob.jobId });

  // Link the job back to the recording.
  await d
    .update(meetingRecording)
    .set({ jobId: newJob.jobId })
    .where(eq(meetingRecording.recordingId, id));

  return c.json({ data: { jobId: newJob.jobId }, error: null }, 201);
});

// DELETE /api/meeting/recordings/:id — delete a recording row
meetingRoutes.delete("/recordings/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid recording id" });

  const [deleted] = await db()
    .delete(meetingRecording)
    .where(eq(meetingRecording.recordingId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Recording not found" });

  return c.body(null, 204);
});

export default meetingRoutes;
