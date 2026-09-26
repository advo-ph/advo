import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { teamMember, user, deliverable, activityLog } from "../db/schema.js";
import { requireAuth, optionalAuth, invalidateUserActive } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { hashPassword, revokeAllUserSessions } from "../services/auth.service.js";
import { sendAdminInviteEmail } from "../services/email.service.js";
import type { Variables } from "../types/context.js";
import { looseUrl } from "../utils/validators.js";
import { usernameFromEmail } from "../utils/username.js";

const team = new Hono<{ Variables: Variables }>();

/**
 * The password every member account created here starts with.
 *
 * Deliberately fixed rather than random. This is an internal tool, the person is told the
 * password in the same room they are hired in, and they change it in Settings. The previous
 * random string was mailed out and read by nobody, which produced accounts that existed but
 * that their owner could not open.
 */
const DEFAULT_NEW_ACCOUNT_PASSWORD = "changeme";

/**
 * Two different switches share the word "active" in this file, so both are named in full
 * wherever they appear:
 *
 *   team_member.is_active — shown on the website and counted in the roster.
 *   user.is_active        — allowed to log in.
 *
 * They are not the same thing and one has never implied the other.
 */

/**
 * Find or create the login row behind a roster entry, and return it.
 *
 * A brand new account is created as role "admin" because that is what every existing roster
 * member already is; team_member.permission_role is the finer-grained field and is stored
 * separately. An account that already exists is left at whatever role it holds unless the
 * caller explicitly asked for "admin", so typing a client's address into the team form cannot
 * quietly promote that client.
 */
async function ensureLoginAccount(
  email: string,
  permissionRole?: string,
): Promise<{ userId: number; created: boolean }> {
  const d = db();

  const [existing] = await d
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    if (permissionRole === "admin" && existing.role !== "admin") {
      await d
        .update(user)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(user.userId, existing.userId));
    }
    return { userId: existing.userId, created: false };
  }

  const username = usernameFromEmail(email);
  const [usernameOwner] = await d
    .select({ userId: user.userId })
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  if (usernameOwner) {
    throw new HTTPException(409, { message: "This email produces a username that is already in use" });
  }

  const passwordHash = await hashPassword(DEFAULT_NEW_ACCOUNT_PASSWORD);
  const [created] = await d
    .insert(user)
    .values({ email, username, passwordHash, role: "admin" })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Could not create the login account" });
  }
  return { userId: created.userId, created: true };
}

/**
 * The login facts an admin screen needs about one roster row.
 *
 * canLogin is null, not false, when there is no account at all. "Cannot log in" and "has no
 * login" are different states and the UI has to be able to tell them apart.
 */
async function loginStateFor(userId: number | null | undefined) {
  if (userId == null) return { canLogin: null, loginEmail: null, loginRole: null };

  const [row] = await db()
    .select({ isActive: user.isActive, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1);

  if (!row) return { canLogin: null, loginEmail: null, loginRole: null };
  return { canLogin: row.isActive, loginEmail: row.email, loginRole: row.role };
}

// ─── Public: list active team ─────────────────────────

team.get("/", optionalAuth, async (c) => {
  const authUser = c.get("user");
  const isAdmin = authUser?.role === "admin";

  // The public list stays exactly what it was: roster rows, nothing about accounts.
  if (!isAdmin) {
    const rows = await db()
      .select()
      .from(teamMember)
      .where(eq(teamMember.isActive, true))
      .orderBy(teamMember.teamMemberId);

    return c.json({ data: rows, error: null });
  }

  // Admins get the login state joined on, so the team screen can show whether a person can
  // actually get in without a second request per row.
  const rows = await db()
    .select({
      ...getTableColumns(teamMember),
      canLogin: user.isActive,
      loginEmail: user.email,
      loginRole: user.role,
    })
    .from(teamMember)
    .leftJoin(user, eq(teamMember.userId, user.userId))
    .orderBy(teamMember.teamMemberId);

  return c.json({ data: rows, error: null });
});

// ─── Accountability (derived, read-only) ──────────────
//
// MUST stay above "/:id" — a literal path registered after "/:id" is shadowed
// by it in Hono. This repo has already been bitten by that once.
//
// Nothing here is collected: every figure is derived from deliverable rows that
// already exist (status / due_date / completed_at / verified_at / assigned_to),
// team_member.penalty_point_count, and activity_log. No telemetry.
//
// Honesty rule: an on-time RATE is only meaningful with a denominator behind it.
// A member with one gradable deliverable is not "100% reliable" — so the rate is
// returned as null below ON_TIME_MIN_SAMPLE and the client must show the raw
// counts instead. The denominator ships with every rate.

/** Fewer gradable deliverables than this and no rate is reported at all. */
const ON_TIME_MIN_SAMPLE = 5;

team.get("/accountability", requireAuth, requireAdmin, async (c) => {
  const now = new Date();

  // One pass over deliverable, grouped per assignee. `gradable` = completed AND
  // had a due date — only those can be judged on-time, so it is the denominator.
  const stat = await db()
    .select({
      teamMemberId: deliverable.assignedTo,
      assignedCount: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${deliverable.status} <> 'completed')::int`,
      overdueCount: sql<number>`count(*) filter (where ${deliverable.status} <> 'completed' and ${deliverable.dueDate} is not null and ${deliverable.dueDate} < now())::int`,
      blockedCount: sql<number>`count(*) filter (where ${deliverable.status} = 'blocked')::int`,
      completedCount: sql<number>`count(*) filter (where ${deliverable.completedAt} is not null)::int`,
      gradableCount: sql<number>`count(*) filter (where ${deliverable.completedAt} is not null and ${deliverable.dueDate} is not null)::int`,
      onTimeCount: sql<number>`count(*) filter (where ${deliverable.completedAt} is not null and ${deliverable.dueDate} is not null and ${deliverable.completedAt} <= ${deliverable.dueDate})::int`,
      verifiedCount: sql<number>`count(*) filter (where ${deliverable.verifiedAt} is not null)::int`,
      lastCompletedAt: sql<string | null>`max(${deliverable.completedAt})`,
    })
    .from(deliverable)
    .where(sql`${deliverable.assignedTo} is not null`)
    .groupBy(deliverable.assignedTo);

  const statByMember = new Map(stat.map((s) => [Number(s.teamMemberId), s]));

  // Last activity: activity_log is keyed by user_id, team_member by team_member_id.
  // Members with no linked user account simply have no activity trail.
  const activity = await db()
    .select({
      userId: activityLog.userId,
      lastActivityAt: sql<string | null>`max(${activityLog.createdAt})`,
    })
    .from(activityLog)
    .where(sql`${activityLog.userId} is not null`)
    .groupBy(activityLog.userId);

  const activityByUser = new Map(activity.map((a) => [Number(a.userId), a.lastActivityAt]));

  const memberRow = await db()
    .select()
    .from(teamMember)
    .where(eq(teamMember.isActive, true));

  const row = memberRow.map((m) => {
    const s = statByMember.get(m.teamMemberId);
    const gradableCount = s?.gradableCount ?? 0;
    const onTimeCount = s?.onTimeCount ?? 0;
    const overdueCount = s?.overdueCount ?? 0;
    const openCount = s?.openCount ?? 0;

    // Null, not 0 and not 1 — an unmeasurable rate is not a rate.
    const onTimeRate =
      gradableCount >= ON_TIME_MIN_SAMPLE ? onTimeCount / gradableCount : null;

    const lastActivityAt = m.userId != null ? activityByUser.get(m.userId) ?? null : null;
    const lastCompletedAt = s?.lastCompletedAt ?? null;

    // Ranking weight, not a score shown to anyone as a judgement. Overdue work
    // dominates; a missing rate contributes nothing rather than guessing.
    const behindScore =
      overdueCount * 3 +
      openCount * 0.5 +
      m.penaltyPointCount * 2 +
      (onTimeRate === null ? 0 : (1 - onTimeRate) * 5);

    return {
      teamMemberId: m.teamMemberId,
      name: m.name,
      role: m.role,
      avatarUrl: m.avatarUrl,
      penaltyPointCount: m.penaltyPointCount,
      assignedCount: s?.assignedCount ?? 0,
      openCount,
      overdueCount,
      blockedCount: s?.blockedCount ?? 0,
      completedCount: s?.completedCount ?? 0,
      verifiedCount: s?.verifiedCount ?? 0,
      onTimeCount,
      /** Denominator for onTimeRate. Always render it beside the rate. */
      gradableCount,
      /** null = below ON_TIME_MIN_SAMPLE; render the counts, never a percentage. */
      onTimeRate,
      lastCompletedAt,
      lastActivityAt,
      behindScore: Math.round(behindScore * 100) / 100,
    };
  });

  // Most behind first; ties broken by overdue, then name so the order is stable.
  row.sort(
    (a, b) =>
      b.behindScore - a.behindScore ||
      b.overdueCount - a.overdueCount ||
      a.name.localeCompare(b.name)
  );

  return c.json({
    data: { row, onTimeMinSample: ON_TIME_MIN_SAMPLE, asOf: now.toISOString() },
    error: null,
  });
});

// ─── Get One ──────────────────────────────────────────

team.get("/:id", optionalAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db()
    .select()
    .from(teamMember)
    .where(eq(teamMember.teamMemberId, id))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Team member not found" });
  return c.json({ data: row, error: null });
});

// ─── Create ───────────────────────────────────────────

/**
 * An avatar is usually not a link.
 *
 * Roster photos are served from the web app's own public folder as root-relative paths
 * ("/team/johann.svg"), and file uploads come back in the same shape. The shared looseUrl
 * prepends a scheme to anything without one, which turns "/team/johann.svg" into
 * "https:///team/johann.svg" and the picture stops loading. Paths are kept exactly as
 * written; a bare host like "cdn.example.com/face.png" still gets its https:// .
 */
function avatarPath(max = 500) {
  return z
    .string()
    .max(max)
    .transform((v): string | null => {
      const trimmed = v.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith("/")) return trimmed;
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .nullish();
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(100),
  email: z.string().email().max(255).nullish(),
  avatarUrl: avatarPath(),
  previewImageUrl: avatarPath(),
  bio: z.string().max(2000).nullish(),
  linkedinUrl: looseUrl(),
  githubUrl: looseUrl(),
  permissionRole: z.enum(["admin", "developer", "designer", "manager"]).optional(),
  isActive: z.boolean().optional(),
});

// Admin-only adjustment of penalty_point_count (manual tally; auto-accrual deferred).
const updateSchema = createSchema.partial().extend({
  penaltyPointCount: z.number().int().min(0).optional(),
});

team.post("/", requireAuth, requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const d = db();

  // An email address is what makes a roster row a person who can log in. It used to also
  // require permissionRole === "admin", which the Add-member form never sent, so every member
  // added through the UI got a directory row and no account.
  let userId: number | undefined;
  let accountCreated = false;

  if (data.email) {
    const account = await ensureLoginAccount(data.email, data.permissionRole);
    userId = account.userId;
    accountCreated = account.created;

    if (accountCreated) {
      sendAdminInviteEmail(data.email, DEFAULT_NEW_ACCOUNT_PASSWORD).catch((err) => {
        console.error("[team] admin invite email failed:", err);
      });
    }
  }

  const [created] = await d
    .insert(teamMember)
    .values({ ...data, ...(userId !== undefined && { userId }) })
    .returning();

  const login = await loginStateFor(userId);

  return c.json(
    {
      data: {
        ...created,
        ...login,
        ...(accountCreated && { defaultPassword: DEFAULT_NEW_ACCOUNT_PASSWORD }),
      },
      error: null,
    },
    201,
  );
});

// ─── Update ───────────────────────────────────────────

team.patch("/:id", requireAuth, requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const d = db();

  const [existing] = await d
    .select()
    .from(teamMember)
    .where(eq(teamMember.teamMemberId, id))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Team member not found" });

  // Giving an existing member an email address is how their login gets created after the
  // fact. PATCH could never write user_id before, so anyone added without an email stayed
  // permanently locked out with no way back short of SQL.
  const email = data.email !== undefined ? data.email : existing.email;
  let userId = existing.userId;
  let accountCreated = false;

  if (userId == null && email) {
    const account = await ensureLoginAccount(
      email,
      data.permissionRole ?? existing.permissionRole,
    );
    userId = account.userId;
    accountCreated = account.created;

    if (accountCreated) {
      sendAdminInviteEmail(email, DEFAULT_NEW_ACCOUNT_PASSWORD).catch((err) => {
        console.error("[team] admin invite email failed:", err);
      });
    }
  }

  const [updated] = await d
    .update(teamMember)
    .set({ ...data, ...(userId != null && { userId }), updatedAt: new Date() })
    .where(eq(teamMember.teamMemberId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Team member not found" });

  const login = await loginStateFor(userId);

  return c.json({
    data: {
      ...updated,
      ...login,
      ...(accountCreated && { defaultPassword: DEFAULT_NEW_ACCOUNT_PASSWORD }),
    },
    error: null,
  });
});

// ─── Login account: on or off ─────────────────────────

const loginAccessSchema = z.object({ canLogin: z.boolean() });

/**
 * Turn one person's login on or off.
 *
 * This writes user.is_active, not team_member.is_active. Turning it off also deletes every
 * credential the account holds, because the alternative is a 15 minute window where a
 * disabled person keeps working and a saved one-tap login that walks straight back in
 * afterwards.
 */
team.patch(
  "/:id/login",
  requireAuth,
  requireAdmin,
  zValidator("json", loginAccessSchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new HTTPException(400, { message: "Invalid team member id" });
    }

    const { canLogin } = c.req.valid("json");
    const d = db();

    const [member] = await d
      .select()
      .from(teamMember)
      .where(eq(teamMember.teamMemberId, id))
      .limit(1);

    if (!member) throw new HTTPException(404, { message: "Team member not found" });

    if (member.userId == null) {
      throw new HTTPException(400, {
        message: "This member has no login account. Add an email address first.",
      });
    }

    const actor = c.get("user");
    if (!canLogin && actor?.userId === member.userId) {
      throw new HTTPException(400, { message: "You cannot turn off your own login" });
    }

    const [updated] = await d
      .update(user)
      .set({ isActive: canLogin, updatedAt: new Date() })
      .where(eq(user.userId, member.userId))
      .returning({ userId: user.userId, email: user.email, isActive: user.isActive });

    if (!updated) throw new HTTPException(404, { message: "Login account not found" });

    // Drop the cached "still enabled" answer before revoking, so no request can slip through
    // on a stale yes between the two writes.
    invalidateUserActive(updated.userId);
    if (!canLogin) {
      await revokeAllUserSessions(updated.userId);
    }

    return c.json({
      data: {
        teamMemberId: id,
        userId: updated.userId,
        loginEmail: updated.email,
        canLogin: updated.isActive,
        message: canLogin
          ? `${member.name} can log in again`
          : `${member.name} can no longer log in. Open sessions were ended.`,
      },
      error: null,
    });
  },
);

// ─── Reorder ─────────────────────────────────────────

const reorderSchema = z.object({
  order: z.array(z.number()),
});

team.post("/reorder", requireAuth, requireAdmin, zValidator("json", reorderSchema), async (c) => {
  const { order } = c.req.valid("json");
  const d = db();

  // Store the desired order in a site_config key for frontend consumption
  const { siteConfig } = await import("../db/schema.js");
  // Store the raw array in the jsonb column (not a JSON-encoded string) so the
  // value is a proper JSON array, matching how settings.routes.ts persists values.
  // The frontend read path tolerates both shapes, so this stays backward compatible.
  await d
    .insert(siteConfig)
    .values({ key: "team_order", value: order })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: order, updatedAt: new Date() },
    });

  return c.json({ data: { message: "Order saved" }, error: null });
});

// ─── Remove (hide from website AND turn off the login) ───

/**
 * Remove someone from the team.
 *
 * This used to set team_member.is_active = false and stop there, which meant a "removed"
 * person kept a working admin login and every live session they had. The row is still soft
 * deleted rather than dropped, because the roster is referenced by meetings, tasks and
 * commissions, but the account behind it is now switched off in the same breath.
 */
team.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const d = db();

  const [member] = await d
    .select()
    .from(teamMember)
    .where(eq(teamMember.teamMemberId, id))
    .limit(1);

  if (!member) throw new HTTPException(404, { message: "Team member not found" });

  const actor = c.get("user");
  if (member.userId != null && actor?.userId === member.userId) {
    throw new HTTPException(400, { message: "You cannot remove your own account" });
  }

  await d
    .update(teamMember)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(teamMember.teamMemberId, id));

  let loginDisabled = false;
  if (member.userId != null) {
    await d
      .update(user)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(user.userId, member.userId));

    invalidateUserActive(member.userId);
    await revokeAllUserSessions(member.userId);
    loginDisabled = true;
  }

  return c.json({
    data: {
      loginDisabled,
      message: loginDisabled
        ? `${member.name} was hidden from the website and can no longer log in.`
        : `${member.name} was hidden from the website. There was no login account to turn off.`,
    },
    error: null,
  });
});

export default team;
