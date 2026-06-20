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
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import { sendNotificationEmail } from "../services/email.service.js";
import { signPreviewToken, PREVIEW_TTL_MINUTES } from "../services/preview.service.js";
import { looseUrl, requiredUrl } from "../utils/validators.js";
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
      data: rows.map((r) => ({ ...r.project, client: r.client })),
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
      data: rows.map((r) => ({ ...r.project, client: r.client })),
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
    data: rows.map((r) => ({ ...r.project, client: r.client })),
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

projects.post(
  "/:id/assets",
  requireTeam,
  zValidator("json", createAssetSchema),
  async (c) => {
    const projectId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    const [created] = await db()
      .insert(projectAsset)
      .values({ ...data, projectId })
      .returning();

    return c.json({ data: created, error: null }, 201);
  }
);

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

export default projects;
