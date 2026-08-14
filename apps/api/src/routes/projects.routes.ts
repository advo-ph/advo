import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import {
  project,
  client,
  progressUpdate,
  projectAsset,
  projectAccess,
  teamMember,
  githubEvent,
  notification,
  activityLog,
  deliverable,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import { sendNotificationEmail } from "../services/email.service.js";
import { signPreviewToken, PREVIEW_TTL_MINUTES } from "../services/preview.service.js";
import { suggestTimeline } from "../services/timeline-suggestion.service.js";
import { buildRevisionTaskDescription } from "../services/revision-task.service.js";
import { buildPresentationDraft } from "../services/presentation-draft.service.js";
import { looseUrl, requiredUrl } from "../utils/validators.js";
import { attachTeamMemberId } from "../utils/project-capacity.js";
import type { Variables, AuthUser } from "../types/context.js";

const projects = new Hono<{ Variables: Variables }>();

// All routes require auth
projects.use("*", requireAuth);

// Throw 404 unless `user` may access `projectId`: admins always; clients only
// their own projects; team only projects they have an access grant to. 404 (not
// 403) so a client can't probe which project IDs exist.
async function assertProjectAccess(
  d: ReturnType<typeof db>,
  user: AuthUser,
  projectId: number,
) {
  if (user.role === "admin") return;

  if (user.role === "client") {
    const [own] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .leftJoin(client, eq(project.clientId, client.clientId))
      .where(and(eq(project.projectId, projectId), eq(client.userId, user.userId)))
      .limit(1);
    if (!own) throw new HTTPException(404, { message: "Project not found" });
    return;
  }

  // team
  const [tm] = await d
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, user.userId))
    .limit(1);
  if (!tm) throw new HTTPException(404, { message: "Project not found" });

  const [access] = await d
    .select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(
      and(
        eq(projectAccess.teamMemberId, tm.teamMemberId),
        eq(projectAccess.projectId, projectId),
      ),
    )
    .limit(1);
  if (!access) throw new HTTPException(404, { message: "Project not found" });
}

// Attach singular collection key `teamMemberId: number[]` from project_access.
// CamelCase matches drizzle field names in every other list response.
async function withTeamMemberId(
  d: ReturnType<typeof db>,
  rows: Array<{
    project: typeof project.$inferSelect;
    client: typeof client.$inferSelect | null;
  }>,
) {
  if (!rows.length) return [];

  const projectRow = rows.map((r) => ({ ...r.project, client: r.client }));
  const access = await d
    .select({
      projectId: projectAccess.projectId,
      teamMemberId: projectAccess.teamMemberId,
    })
    .from(projectAccess)
    .where(inArray(projectAccess.projectId, projectRow.map((p) => p.projectId)));

  return attachTeamMemberId(projectRow, access);
}

// ─── List Projects ────────────────────────────────────

projects.get("/", async (c) => {
  const user = c.get("user");
  const d = db();

  if (user.role === "admin") {
    const rows = await d
      .select()
      .from(project)
      .leftJoin(client, eq(project.clientId, client.clientId))
      .orderBy(desc(project.createdAt));

    return c.json({
      data: await withTeamMemberId(d, rows),
      error: null,
    });
  }

  if (user.role === "client") {
    const rows = await d
      .select()
      .from(project)
      .leftJoin(client, eq(project.clientId, client.clientId))
      .where(eq(client.userId, user.userId))
      .orderBy(desc(project.createdAt));

    return c.json({
      data: await withTeamMemberId(d, rows),
      error: null,
    });
  }

  // Team: only assigned projects
  const tm = await d
    .select()
    .from(teamMember)
    .where(eq(teamMember.userId, user.userId))
    .limit(1);

  if (!tm.length) return c.json({ data: [], error: null });

  const accessRows = await d
    .select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(eq(projectAccess.teamMemberId, tm[0].teamMemberId));

  if (!accessRows.length) return c.json({ data: [], error: null });

  const projectIds = accessRows.map((r) => r.projectId);
  const rows = await d
    .select()
    .from(project)
    .leftJoin(client, eq(project.clientId, client.clientId))
    .where(inArray(project.projectId, projectIds))
    .orderBy(desc(project.createdAt));

  return c.json({
    data: await withTeamMemberId(d, rows),
    error: null,
  });
});

// ─── Get Single Project ───────────────────────────────

projects.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const d = db();

  await assertProjectAccess(d, c.get("user"), id);

  const [row] = await d
    .select()
    .from(project)
    .leftJoin(client, eq(project.clientId, client.clientId))
    .where(eq(project.projectId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Project not found" });

  // Fetch related data in parallel
  const [updates, assets, access] = await Promise.all([
    d
      .select()
      .from(progressUpdate)
      .where(eq(progressUpdate.projectId, id))
      .orderBy(desc(progressUpdate.createdAt)),
    d
      .select()
      .from(projectAsset)
      .where(eq(projectAsset.projectId, id))
      .orderBy(desc(projectAsset.uploadedAt)),
    d
      .select()
      .from(projectAccess)
      .leftJoin(teamMember, eq(projectAccess.teamMemberId, teamMember.teamMemberId))
      .where(eq(projectAccess.projectId, id)),
  ]);

  return c.json({
    data: {
      ...row.project,
      client: row.client,
      updates,
      assets,
      team: access.map((a) => ({
        ...a.project_access,
        teamMember: a.team_member,
      })),
    },
    error: null,
  });
});

// ─── Create Project ───────────────────────────────────

const createSchema = z.object({
  clientId: z.number(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullish(),
  repositoryName: z.string().max(100).nullish(),
  previewUrl: looseUrl(),
  contractUrl: looseUrl(),
  projectStatus: z
    .enum(["discovery", "architecture", "development", "testing", "shipped"])
    .optional(),
  totalValueCents: z.number().int().min(0).optional(),
  amountPaidCents: z.number().int().min(0).optional(),
  techStack: z.array(z.string()).optional(),
});

projects.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(project).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Update Project ───────────────────────────────────

const updateSchema = createSchema.partial().omit({ clientId: true });

projects.patch("/:id", requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const d = db();

  // Get old status before update
  const [old] = await d.select({ projectStatus: project.projectStatus, clientId: project.clientId })
    .from(project).where(eq(project.projectId, id)).limit(1);

  const [updated] = await d
    .update(project)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(project.projectId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Project not found" });

  // Auto-notify client on status change
  if (data.projectStatus && old && data.projectStatus !== old.projectStatus) {
    try {
      await d.insert(notification).values({
        clientId: old.clientId,
        projectId: id,
        type: "project_status_change",
        title: `Project status updated to ${data.projectStatus}`,
        body: `Your project "${updated.title}" has moved to the ${data.projectStatus} phase.`,
      });
    } catch { /* non-critical */ }
  }

  return c.json({ data: updated, error: null });
});

// ─── Delete Project ───────────────────────────────────

projects.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(project)
    .where(eq(project.projectId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Project not found" });
  return c.json({ data: { message: "Project deleted" }, error: null });
});

// ─── Project Access (team member ↔ project assignment) ─

const grantAccessSchema = z.object({
  teamMemberId: z.number().int().positive(),
  permissionLevel: z.enum(["read", "write", "admin"]).optional(),
});

// Admin assigns a team member to a project (upsert on unique pair).
projects.post(
  "/:id/access",
  requireAdmin,
  zValidator("json", grantAccessSchema),
  async (c) => {
    const projectId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    const d = db();

    const [existingProject] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, projectId))
      .limit(1);
    if (!existingProject) throw new HTTPException(404, { message: "Project not found" });

    const [existingMember] = await d
      .select({ teamMemberId: teamMember.teamMemberId })
      .from(teamMember)
      .where(eq(teamMember.teamMemberId, data.teamMemberId))
      .limit(1);
    if (!existingMember) throw new HTTPException(404, { message: "Team member not found" });

    const [existingAccess] = await d
      .select()
      .from(projectAccess)
      .where(
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.teamMemberId, data.teamMemberId),
        ),
      )
      .limit(1);

    if (existingAccess) {
      if (data.permissionLevel && data.permissionLevel !== existingAccess.permissionLevel) {
        const [updated] = await d
          .update(projectAccess)
          .set({ permissionLevel: data.permissionLevel })
          .where(eq(projectAccess.projectAccessId, existingAccess.projectAccessId))
          .returning();
        return c.json({ data: updated, error: null });
      }
      return c.json({ data: existingAccess, error: null });
    }

    const [created] = await d
      .insert(projectAccess)
      .values({
        projectId,
        teamMemberId: data.teamMemberId,
        permissionLevel: data.permissionLevel ?? "write",
      })
      .returning();

    return c.json({ data: created, error: null }, 201);
  },
);

// Admin revokes a team member's project access.
projects.delete("/:id/access/:teamMemberId", requireAdmin, async (c) => {
  const projectId = Number(c.req.param("id"));
  const teamMemberId = Number(c.req.param("teamMemberId"));

  const [deleted] = await db()
    .delete(projectAccess)
    .where(
      and(
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.teamMemberId, teamMemberId),
      ),
    )
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Project access not found" });
  return c.json({ data: { message: "Access revoked" }, error: null });
});

// ─── Team assignment (project_access via /team) ───────
// POST/DELETE /api/projects/:id/team — same table as /access, junior-assign surface.

const assignTeamSchema = z.object({
  teamMemberId: z.number().int().positive(),
});

/** Admin assigns a team member to a project. Unique pair — ignore conflict. */
projects.post(
  "/:id/team",
  requireAdmin,
  zValidator("json", assignTeamSchema),
  async (c) => {
    const projectId = Number(c.req.param("id"));
    const { teamMemberId } = c.req.valid("json");
    const d = db();

    const [proj] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, projectId))
      .limit(1);
    if (!proj) throw new HTTPException(404, { message: "Project not found" });

    const [member] = await d
      .select({ teamMemberId: teamMember.teamMemberId })
      .from(teamMember)
      .where(eq(teamMember.teamMemberId, teamMemberId))
      .limit(1);
    if (!member) throw new HTTPException(404, { message: "Team member not found" });

    const [created] = await d
      .insert(projectAccess)
      .values({ teamMemberId, projectId })
      .onConflictDoNothing({
        target: [projectAccess.teamMemberId, projectAccess.projectId],
      })
      .returning();

    if (created) {
      return c.json({ data: created, error: null }, 201);
    }

    const [existing] = await d
      .select()
      .from(projectAccess)
      .where(
        and(
          eq(projectAccess.teamMemberId, teamMemberId),
          eq(projectAccess.projectId, projectId),
        ),
      )
      .limit(1);

    return c.json({ data: existing, error: null });
  },
);

/** Admin removes a team member from a project. */
projects.delete("/:id/team/:teamMemberId", requireAdmin, async (c) => {
  const projectId = Number(c.req.param("id"));
  const teamMemberId = Number(c.req.param("teamMemberId"));
  const d = db();

  const [deleted] = await d
    .delete(projectAccess)
    .where(
      and(
        eq(projectAccess.projectId, projectId),
        eq(projectAccess.teamMemberId, teamMemberId),
      ),
    )
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Project access not found" });
  return c.json({ data: { message: "Team member removed" }, error: null });
});

// ─── Progress Updates ─────────────────────────────────

const updateBodySchema = z.object({
  updateTitle: z.string().min(1).max(255),
  updateBody: z.string().max(5000).nullish(),
  commitShaReference: z.string().max(40).nullish(),
});

projects.post(
  "/:id/updates",
  requireTeam,
  zValidator("json", updateBodySchema),
  async (c) => {
    const projectId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    const [created] = await db()
      .insert(progressUpdate)
      .values({ ...data, projectId })
      .returning();

    return c.json({ data: created, error: null }, 201);
  }
);

projects.get("/:id/updates", async (c) => {
  const projectId = Number(c.req.param("id"));
  await assertProjectAccess(db(), c.get("user"), projectId);
  const rows = await db()
    .select()
    .from(progressUpdate)
    .where(eq(progressUpdate.projectId, projectId))
    .orderBy(desc(progressUpdate.createdAt));

  return c.json({ data: rows, error: null });
});

// ─── GitHub Events (cached) ──────────────────────────

projects.get("/:id/github", async (c) => {
  const projectId = Number(c.req.param("id"));
  await assertProjectAccess(db(), c.get("user"), projectId);
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);

  const rows = await db()
    .select()
    .from(githubEvent)
    .where(eq(githubEvent.projectId, projectId))
    .orderBy(desc(githubEvent.createdAt))
    .limit(limit);

  return c.json({ data: rows, error: null });
});

// ─── Assets ───────────────────────────────────────────

projects.get("/:id/assets", async (c) => {
  const projectId = Number(c.req.param("id"));
  await assertProjectAccess(db(), c.get("user"), projectId);
  const rows = await db()
    .select()
    .from(projectAsset)
    .where(eq(projectAsset.projectId, projectId))
    .orderBy(desc(projectAsset.uploadedAt));

  return c.json({ data: rows, error: null });
});

const createAssetSchema = z.object({
  assetType: z
    .enum(["progress_photo", "completion_photo", "document"])
    .optional(),
  url: requiredUrl(),
  caption: z.string().max(255).nullish(),
});

// Authenticated clients with project access may POST document assets;
// team/admin may set any allowed assetType. Delete stays requireTeam.
projects.post(
  "/:id/assets",
  zValidator("json", createAssetSchema),
  async (c) => {
    const projectId = Number(c.req.param("id"));
    const user = c.get("user");
    await assertProjectAccess(db(), user, projectId);
    const data = c.req.valid("json");

    let assetType = data.assetType ?? "document";
    if (user.role === "client") {
      // Clients only upload supporting materials as documents
      if (data.assetType && data.assetType !== "document") {
        throw new HTTPException(403, {
          message: "Clients may only upload document assets",
        });
      }
      assetType = "document";
    }

    const [created] = await db()
      .insert(projectAsset)
      .values({ ...data, assetType, projectId })
      .returning();

    return c.json({ data: created, error: null }, 201);
  }
);

// ─── Delete a project asset (Files / Drive) ─────────

projects.delete("/:id/assets/:assetId", requireTeam, async (c) => {
  const projectId = Number(c.req.param("id"));
  const assetId = Number(c.req.param("assetId"));
  const [deleted] = await db()
    .delete(projectAsset)
    .where(and(eq(projectAsset.projectAssetId, assetId), eq(projectAsset.projectId, projectId)))
    .returning();
  if (!deleted) throw new HTTPException(404, { message: "Asset not found" });
  return c.json({ data: { message: "Asset deleted" }, error: null });
});

// ─── Show Client Now — signed expiring preview link ──

// Team mints a short-lived link to the project's stored preview_url.
projects.post("/:id/preview-link", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db()
    .select({ previewUrl: project.previewUrl })
    .from(project)
    .where(eq(project.projectId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Project not found" });
  if (!row.previewUrl) {
    throw new HTTPException(400, { message: "Set a preview URL on the project first." });
  }

  const { token, expiresAt } = await signPreviewToken(id);
  const origin = new URL(c.req.url).origin;
  return c.json({
    data: { url: `${origin}/api/preview/${token}`, expiresAt, ttlMinutes: PREVIEW_TTL_MINUTES },
    error: null,
  });
});

// Client (or team) requests a fresh preview from their Hub — logged for the team.
projects.post("/:id/preview-request", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const d = db();
  await assertProjectAccess(d, user, id);

  await d.insert(activityLog).values({
    userId: user.userId,
    action: "preview_requested",
    entityType: "project",
    entityId: id,
  });

  return c.json({ data: { message: "Preview requested" }, error: null }, 201);
});

// Team sees recent client preview requests for a project.
projects.get("/:id/preview-requests", requireTeam, async (c) => {
  const id = Number(c.req.param("id"));
  const rows = await db()
    .select({
      activityId: activityLog.activityId,
      userId: activityLog.userId,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.entityType, "project"),
        eq(activityLog.entityId, id),
        eq(activityLog.action, "preview_requested"),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(10);

  return c.json({ data: rows, error: null });
});

// ─── Client revision → deliverable ───────────────────
// requireTeam. Body: revision_note. Creates deliverable titled "Client revision"
// with description = (optional AI polish of note) + CONTRACTS.md policy reminder
// (2 rounds/phase). Claude polish only when ANTHROPIC_API_KEY set; else raw note.

const revisionTaskBodySchema = z.object({
  revisionNote: z.string().min(1).max(4000),
});

projects.post(
  "/:id/revision-task",
  requireTeam,
  zValidator("json", revisionTaskBodySchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid project id" });

    const { revisionNote } = c.req.valid("json");
    const d = db();

    const [row] = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.projectId, id))
      .limit(1);

    if (!row) throw new HTTPException(404, { message: "Project not found" });

    const { description, method } = await buildRevisionTaskDescription(revisionNote);

    const [created] = await d
      .insert(deliverable)
      .values({
        projectId: id,
        title: "Client revision",
        description,
        status: "not_started",
        priority: 0,
      })
      .returning();

    return c.json(
      {
        data: {
          deliverable: created,
          method,
          projectId: id,
        },
        error: null,
      },
      201,
    );
  },
);

// ─── AI / heuristic timeline suggestion ──────────────
// requireTeam. Loads project (+ DB deliverable if body.deliverable omitted).
// Claude when ANTHROPIC_API_KEY set; else complexity heuristic.
// Response-only suggestion; optional activity_log audit row (no project column write).

const suggestTimelineBodySchema = z.object({
  deliverable: z
    .array(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(5000).nullish(),
        priority: z.number().int().nullish(),
        status: z.string().max(40).nullish(),
      }),
    )
    .max(50)
    .optional(),
  contractNotes: z.string().max(20_000).nullish(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
    .nullish(),
});

projects.post(
  "/:id/suggest-timeline",
  requireTeam,
  zValidator("json", suggestTimelineBodySchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid project id" });

    const body = c.req.valid("json");
    const user = c.get("user");
    const d = db();

    const [row] = await d
      .select({
        projectId: project.projectId,
        title: project.title,
        description: project.description,
        projectStatus: project.projectStatus,
        techStack: project.techStack,
        totalValueCents: project.totalValueCents,
      })
      .from(project)
      .where(eq(project.projectId, id))
      .limit(1);

    if (!row) throw new HTTPException(404, { message: "Project not found" });

    let deliverableInput = body.deliverable ?? null;
    if (!deliverableInput) {
      const rows = await d
        .select({
          title: deliverable.title,
          description: deliverable.description,
          priority: deliverable.priority,
          status: deliverable.status,
        })
        .from(deliverable)
        .where(eq(deliverable.projectId, id))
        .orderBy(desc(deliverable.priority));
      deliverableInput = rows.map((r) => ({
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
      }));
    }

    const suggestion = await suggestTimeline({
      project: {
        title: row.title,
        description: row.description,
        projectStatus: row.projectStatus,
        techStack: row.techStack,
        totalValueCents: row.totalValueCents,
      },
      deliverable: deliverableInput,
      contractNotes: body.contractNotes ?? null,
      startDate: body.startDate ?? null,
    });

    // Lightweight audit trail — suggestion stays response-primary.
    try {
      await d.insert(activityLog).values({
        userId: user.userId,
        action: "timeline_suggested",
        entityType: "project",
        entityId: id,
        metadata: {
          method: suggestion.method,
          totalDurationDays: suggestion.totalDurationDays,
          phaseCount: suggestion.phase.length,
          summary: suggestion.summary,
        },
      });
    } catch {
      /* non-critical */
    }

    return c.json({
      data: {
        projectId: id,
        ...suggestion,
      },
      error: null,
    });
  },
);

// ─── Final client presentation draft (markdown) ──────
// requireTeam. Loads project title + deliverable list (body.deliverable optional).
// Claude when ANTHROPIC_API_KEY set; else structured template.
// Response-primary markdown outline — no file storage.

const presentationDraftBodySchema = z.object({
  deliverable: z
    .array(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(5000).nullish(),
        status: z.string().max(40).nullish(),
      }),
    )
    .max(50)
    .optional(),
  clientName: z.string().max(255).nullish(),
  note: z.string().max(4000).nullish(),
});

projects.post(
  "/:id/presentation-draft",
  requireTeam,
  zValidator("json", presentationDraftBodySchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid project id" });

    const body = c.req.valid("json");
    const d = db();

    const [row] = await d
      .select({
        projectId: project.projectId,
        title: project.title,
        description: project.description,
        projectStatus: project.projectStatus,
        techStack: project.techStack,
        clientId: project.clientId,
      })
      .from(project)
      .where(eq(project.projectId, id))
      .limit(1);

    if (!row) throw new HTTPException(404, { message: "Project not found" });

    let deliverableInput = body.deliverable ?? null;
    if (!deliverableInput) {
      const rows = await d
        .select({
          title: deliverable.title,
          description: deliverable.description,
          status: deliverable.status,
        })
        .from(deliverable)
        .where(eq(deliverable.projectId, id))
        .orderBy(desc(deliverable.priority));
      deliverableInput = rows.map((r) => ({
        title: r.title,
        description: r.description,
        status: r.status,
      }));
    }

    let clientName = body.clientName?.trim() || null;
    if (!clientName && row.clientId) {
      const [clientRow] = await d
        .select({ companyName: client.companyName })
        .from(client)
        .where(eq(client.clientId, row.clientId))
        .limit(1);
      clientName = clientRow?.companyName ?? null;
    }

    const draft = await buildPresentationDraft({
      project: {
        title: row.title,
        description: row.description,
        projectStatus: row.projectStatus,
        techStack: row.techStack,
      },
      deliverable: deliverableInput,
      clientName,
      note: body.note ?? null,
    });

    return c.json({
      data: {
        projectId: id,
        markdown: draft.markdown,
        method: draft.method,
        disclaimer: draft.disclaimer,
      },
      error: null,
    });
  },
);

export default projects;
