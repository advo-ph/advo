import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { teamMember, user } from "../db/schema.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { hashPassword } from "../services/auth.service.js";
import { sendAdminInviteEmail } from "../services/email.service.js";
import { nanoid } from "nanoid";
import type { Variables } from "../types/context.js";
import { looseUrl } from "../utils/validators.js";

const team = new Hono<{ Variables: Variables }>();

// ─── Public: list active team ─────────────────────────

team.get("/", optionalAuth, async (c) => {
  const user = c.get("user");
  const isAdmin = user?.role === "admin";

  const rows = await db()
    .select()
    .from(teamMember)
    .where(isAdmin ? undefined : eq(teamMember.isActive, true))
    .orderBy(teamMember.teamMemberId);

  return c.json({ data: rows, error: null });
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

const createSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(100),
  email: z.string().email().max(255).nullish(),
  avatarUrl: looseUrl(),
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

  let userId: number | undefined;
  let tempPassword = "";

  // Add Admin must create a login-capable user with role: "admin", not only a directory row.
  if (data.permissionRole === "admin" && data.email) {
    const [existingUser] = await d
      .select()
      .from(user)
      .where(eq(user.email, data.email))
      .limit(1);

    if (existingUser) {
      if (existingUser.role !== "admin") {
        await d
          .update(user)
          .set({ role: "admin", updatedAt: new Date() })
          .where(eq(user.userId, existingUser.userId));
      }
      userId = existingUser.userId;
    } else {
      tempPassword = nanoid(16);
      const passwordHash = await hashPassword(tempPassword);
      const [createdUser] = await d
        .insert(user)
        .values({
          email: data.email,
          passwordHash,
          role: "admin",
        })
        .returning();
      userId = createdUser.userId;
    }

    sendAdminInviteEmail(data.email, tempPassword || undefined).catch((err) => {
      console.error("[team] admin invite email failed:", err);
    });
  }

  const [created] = await d
    .insert(teamMember)
    .values({ ...data, ...(userId !== undefined && { userId }) })
    .returning();

  return c.json(
    { data: { ...created, ...(tempPassword && { tempPassword }) }, error: null },
    201,
  );
});

// ─── Update ───────────────────────────────────────────

team.patch("/:id", requireAuth, requireAdmin, zValidator("json", updateSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const data = c.req.valid("json");

  const [updated] = await db()
    .update(teamMember)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(teamMember.teamMemberId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Team member not found" });
  return c.json({ data: updated, error: null });
});

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

// ─── Delete (deactivate) ─────────────────────────────

team.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [updated] = await db()
    .update(teamMember)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(teamMember.teamMemberId, id))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Team member not found" });
  return c.json({ data: { message: "Team member deactivated" }, error: null });
});

export default team;
