import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, asc, ne, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { deliverable, deliverableComment, project, teamMember, client, projectAccess, user } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { flexibleDateTime, zodMessageHook } from "../utils/validators.js";
import { toManilaInstant } from "../utils/manila-date.js";

const deliverables = new Hono<{ Variables: Variables }>();

deliverables.use("*", requireAuth);

/**
 * Which project ids may this user see?
 *
 * `null` means "every project" (admin). An empty array means "none", and callers must
 * treat it as a hard stop rather than an absent filter — an empty IN () that gets
 * optimised away is how a scoping bug turns into a data leak.
 *
 * Extracted because GET / had this logic and GET /upcoming did not: /upcoming was mounted
 * under requireAuth with no scoping at all, so a client with zero projects could read
 * three other clients' deliverables, project titles, tech stacks and money columns.
 * Scoping is now a function two routes call, not a thing one route remembers to do.
 */
async function visibleProjectIds(user: { role: string; userId: number }): Promise<number[] | null> {
  const d = db();

  if (user.role === "admin") return null;

  if (user.role === "client") {
    const rows = await d
      .select({ projectId: project.projectId })
      .from(project)
      .innerJoin(client, eq(project.clientId, client.clientId))
      .where(eq(client.userId, user.userId));
    return rows.map((r) => r.projectId);
  }

  const [tm] = await d
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, user.userId))
    .limit(1);
  if (!tm) return [];

  const rows = await d
    .select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(eq(projectAccess.teamMemberId, tm.teamMemberId));
  return rows.map((r) => r.projectId);
}

/** `new Date(...)` at the boundary, resolved in Manila, with a 400 instead of a throw. */
function parseDueDate(value: string | null | undefined): Date | null {
  try {
    return toManilaInstant(value);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid date",
    });
  }
}

/**
 * Look up whether a user is the owner (is_owner column).
 * Lazy — only called when a request actually needs the gate.
 */
async function getIsOwner(userId: number): Promise<boolean> {
  const [u] = await db()
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1);
  return u?.isOwner ?? false;
}

/**
 * Build a subquery map of comment stats keyed by deliverable_id.
 * Returns a Map<deliverableId, { commentCount, maxCreatedAt }>.
 * Single grouped query — no N+1.
 */
async function commentStatsByDeliverableIds(
  deliverableIds: number[],
): Promise<Map<number, { commentCount: number; maxCreatedAt: Date | null }>> {
  if (deliverableIds.length === 0) return new Map();

  const rows = await db()
    .select({
      deliverableId: deliverableComment.deliverableId,
      commentCount: sql<number>`COUNT(*)::int`,
      maxCreatedAt: sql<Date | null>`MAX(${deliverableComment.createdAt})`,
    })
    .from(deliverableComment)
    .where(inArray(deliverableComment.deliverableId, deliverableIds))
    .groupBy(deliverableComment.deliverableId);

  const map = new Map<number, { commentCount: number; maxCreatedAt: Date | null }>();
  for (const row of rows) {
    map.set(row.deliverableId, {
      commentCount: row.commentCount,
      maxCreatedAt: row.maxCreatedAt,
    });
  }
  return map;
}

/**
 * Attach commentCount and hasUnreadComments to a deliverable row.
 * commentsReadAt is the per-deliverable timestamp from the DB row.
 */
function withCommentStats(
  d: typeof deliverable.$inferSelect,
  stats: Map<number, { commentCount: number; maxCreatedAt: Date | null }>,
) {
  const s = stats.get(d.deliverableId);
  const commentCount = s?.commentCount ?? 0;
  const maxCreatedAt = s?.maxCreatedAt ?? null;
  const commentsReadAt = d.commentsReadAt;

  const hasUnreadComments =
    commentCount > 0 &&
    (commentsReadAt === null || (maxCreatedAt !== null && maxCreatedAt > commentsReadAt));

  return {
    ...d,
    commentCount,
    hasUnreadComments,
  };
}

// ─── List ─────────────────────────────────────────────

deliverables.get("/", async (c) => {
  const user = c.get("user");
  const d = db();

  const mapRow = (r: {
    deliverable: typeof deliverable.$inferSelect;
    project: typeof project.$inferSelect | null;
    team_member: typeof teamMember.$inferSelect | null;
  }) => ({ ...r.deliverable, project: r.project, assignee: r.team_member });

  // Admin: every deliverable. Also look up admin's own teamMemberId for "My Tasks" toggle.
  if (user.role === "admin") {
    const rows = await d
      .select()
      .from(deliverable)
      .leftJoin(project, eq(deliverable.projectId, project.projectId))
      .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
      .orderBy(asc(deliverable.dueDate));

    const [adminTm] = await d
      .select({ teamMemberId: teamMember.teamMemberId })
      .from(teamMember)
      .where(eq(teamMember.userId, user.userId))
      .limit(1);

    const ids = rows.map((r) => r.deliverable.deliverableId);
    const stats = await commentStatsByDeliverableIds(ids);

    return c.json({
      data: {
        deliverables: rows.map((r) => ({
          ...mapRow(r),
          ...withCommentStats(r.deliverable, stats),
        })),
        viewerTeamMemberId: adminTm?.teamMemberId ?? null,
      },
      error: null,
    });
  }

  // Client: only deliverables on their own projects. viewerTeamMemberId is always null for clients.
  if (user.role === "client") {
    const rows = await d
      .select()
      .from(deliverable)
      .leftJoin(project, eq(deliverable.projectId, project.projectId))
      .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
      .leftJoin(client, eq(project.clientId, client.clientId))
      .where(eq(client.userId, user.userId))
      .orderBy(asc(deliverable.dueDate));

    const ids = rows.map((r) => r.deliverable.deliverableId);
    const stats = await commentStatsByDeliverableIds(ids);

    return c.json({
      data: {
        deliverables: rows.map((r) => ({
          ...mapRow(r),
          ...withCommentStats(r.deliverable, stats),
        })),
        viewerTeamMemberId: null,
      },
      error: null,
    });
  }

  // Team: only deliverables on projects they have access to.
  const [tm] = await d
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, user.userId))
    .limit(1);

  if (!tm) return c.json({ data: { deliverables: [], viewerTeamMemberId: null }, error: null });

  const accessRows = await d
    .select({ projectId: projectAccess.projectId })
    .from(projectAccess)
    .where(eq(projectAccess.teamMemberId, tm.teamMemberId));

  if (!accessRows.length) return c.json({ data: { deliverables: [], viewerTeamMemberId: tm.teamMemberId }, error: null });

  const rows = await d
    .select()
    .from(deliverable)
    .leftJoin(project, eq(deliverable.projectId, project.projectId))
    .leftJoin(teamMember, eq(deliverable.assignedTo, teamMember.teamMemberId))
    .where(inArray(deliverable.projectId, accessRows.map((r) => r.projectId)))
    .orderBy(asc(deliverable.dueDate));

  const ids = rows.map((r) => r.deliverable.deliverableId);
  const stats = await commentStatsByDeliverableIds(ids);

  return c.json({
    data: {
      deliverables: rows.map((r) => ({
        ...mapRow(r),
        ...withCommentStats(r.deliverable, stats),
      })),
      viewerTeamMemberId: tm.teamMemberId,
    },
    error: null,
  });
});

// ─── Upcoming Deadlines ──────────────────────────────
// Scoped exactly like GET / above. This route previously applied no user scoping at all;
// see visibleProjectIds().
//
// The project join is also narrowed to the four display columns. The old `leftJoin` spread
// the whole project row into the response, which is how totalValueCents, amountPaidCents
// and techStack ended up in a widget that renders a title and a date.

deliverables.get("/upcoming", async (c) => {
  const user = c.get("user");
  const parsed = Number(c.req.query("limit"));
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 50) : 10;

  const allowed = await visibleProjectIds(user);
  if (allowed !== null && allowed.length === 0) {
    return c.json({ data: [], error: null });
  }

  const rows = await db()
    .select({
      deliverable: deliverable,
      project: { projectId: project.projectId, title: project.title },
    })
    .from(deliverable)
    .leftJoin(project, eq(deliverable.projectId, project.projectId))
    .where(
      allowed === null
        ? ne(deliverable.status, "finished")
        : and(ne(deliverable.status, "finished"), inArray(deliverable.projectId, allowed)),
    )
    .orderBy(asc(deliverable.dueDate))
    .limit(limit);

  const ids = rows.map((r) => r.deliverable.deliverableId);
  const stats = await commentStatsByDeliverableIds(ids);

  return c.json({
    data: rows.map((r) => ({
      ...r.deliverable,
      project: r.project,
      ...withCommentStats(r.deliverable, stats),
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
    .enum(["todo", "ongoing", "review", "finished"])
    .optional(),
  dueDate: flexibleDateTime(),
});

deliverables.post("/", requireTeam, zValidator("json", createSchema, zodMessageHook), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db()
    .insert(deliverable)
    .values({
      ...data,
      // "2026-09-02" means the whole of 2026-09-02 in Manila, stored as Manila midnight.
      // `new Date("2026-09-02")` is UTC midnight, which is 08:00 Manila — the reason a
      // deliverable due today used to turn red at breakfast.
      dueDate: parseDueDate(data.dueDate),
    })
    .returning();

  return c.json({ data: created, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────
// verifiedAt is set/cleared explicitly by team (QA sign-off). Independent of
// status — completing a deliverable does not auto-verify; clearing verifiedAt
// does not reopen status.
//
// Server-side gate: setting status = "finished" requires admin OR isOwner.

const updateSchema = createSchema.partial().extend({
  verifiedAt: flexibleDateTime(),
  attachmentUrl: z.string().max(500).nullish(),
});

deliverables.patch("/:id", requireTeam, zValidator("json", updateSchema, zodMessageHook), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid deliverable id" });
  }
  const data = c.req.valid("json");

  // Gate: only admin or owner may mark a deliverable finished.
  if (data.status === "finished") {
    const caller = c.get("user");
    if (caller.role !== "admin") {
      const isOwner = await getIsOwner(caller.userId);
      if (!isOwner) {
        throw new HTTPException(403, { message: "Only the owner or an admin can mark a deliverable as finished" });
      }
    }
  }

  const [existing] = await db()
    .select({ status: deliverable.status })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Deliverable not found" });

  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  // completed_at tracks status in both directions, and only on the transition. It used to
  // be set on completion and never cleared, so a reopened deliverable kept claiming a
  // completion date. Stamping it on every save of an already-complete row would be the
  // same lie in the other direction, so an unchanged status leaves it alone.
  if (data.status !== undefined && data.status !== existing.status) {
    values.completedAt = data.status === "finished" ? new Date() : null;
  } else {
    delete values.completedAt;
  }
  if (data.dueDate !== undefined) {
    values.dueDate = parseDueDate(data.dueDate);
  }
  if (data.verifiedAt !== undefined) {
    values.verifiedAt = parseDueDate(data.verifiedAt);
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

// ─── Comments ─────────────────────────────────────────

/**
 * GET /:id/comments
 * Returns all comments for a deliverable, oldest first.
 * requireAuth is already applied at the top via deliverables.use("*", requireAuth).
 */
deliverables.get("/:id/comments", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid deliverable id" });
  }

  // Confirm the deliverable exists (scoping is enforced on list; this endpoint is
  // intentionally open to any authenticated user who knows the id — same policy as PATCH).
  const [existing] = await db()
    .select({ deliverableId: deliverable.deliverableId })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Deliverable not found" });

  const comments = await db()
    .select({
      commentId: deliverableComment.commentId,
      body: deliverableComment.body,
      authorName: deliverableComment.authorName,
      createdAt: deliverableComment.createdAt,
    })
    .from(deliverableComment)
    .where(eq(deliverableComment.deliverableId, id))
    .orderBy(asc(deliverableComment.createdAt));

  return c.json({ data: { comments }, error: null });
});

/**
 * POST /:id/comments
 * Owner or admin only. Inserts a comment and resets the deliverable back to "ongoing"
 * in a single transaction.
 */
const commentBodySchema = z.object({
  body: z.string().min(1).max(5000),
});

deliverables.post("/:id/comments", zValidator("json", commentBodySchema, zodMessageHook), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid deliverable id" });
  }

  const caller = c.get("user");

  // Gate: only admin or owner may post a review comment.
  if (caller.role !== "admin") {
    const isOwner = await getIsOwner(caller.userId);
    if (!isOwner) {
      throw new HTTPException(403, { message: "Only the owner or an admin can post review comments" });
    }
  }

  const { body } = c.req.valid("json");

  // Resolve author display name: prefer team_member.name, fall back to user.email.
  const [callerUser] = await db()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.userId, caller.userId))
    .limit(1);

  const [callerTm] = await db()
    .select({ name: teamMember.name })
    .from(teamMember)
    .where(eq(teamMember.userId, caller.userId))
    .limit(1);

  const authorName = callerTm?.name ?? callerUser?.email ?? "Unknown";

  // Confirm deliverable exists.
  const [existing] = await db()
    .select({ deliverableId: deliverable.deliverableId })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Deliverable not found" });

  // Transaction: insert comment + reset deliverable status.
  const d = db();
  const created = await d.transaction(async (tx) => {
    const [comment] = await tx
      .insert(deliverableComment)
      .values({
        deliverableId: id,
        authorUserId: caller.userId,
        authorName,
        body,
      })
      .returning();

    await tx
      .update(deliverable)
      .set({
        status: "ongoing",
        completedAt: null,
        verifiedAt: null,
        commentsReadAt: null,
        updatedAt: new Date(),
      })
      .where(eq(deliverable.deliverableId, id));

    return comment;
  });

  return c.json(
    {
      data: {
        commentId: created.commentId,
        body: created.body,
        authorName: created.authorName,
        createdAt: created.createdAt,
      },
      error: null,
    },
    201,
  );
});

/**
 * POST /:id/comments/read
 * Sets comments_read_at = now() on the deliverable. No-op-safe if called twice.
 * Any authenticated user may mark their own read state.
 */
deliverables.post("/:id/comments/read", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: "Invalid deliverable id" });
  }

  const [existing] = await db()
    .select({ deliverableId: deliverable.deliverableId })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, id))
    .limit(1);
  if (!existing) throw new HTTPException(404, { message: "Deliverable not found" });

  await db()
    .update(deliverable)
    .set({ commentsReadAt: new Date() })
    .where(eq(deliverable.deliverableId, id));

  return c.json({ data: { ok: true }, error: null });
});

export default deliverables;
