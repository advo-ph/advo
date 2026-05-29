import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { teamMember } from "../db/schema.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

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
  avatarUrl: z.string().url().max(500).nullish(),
  bio: z.string().max(2000).nullish(),
  linkedinUrl: z.string().url().max(500).nullish(),
  githubUrl: z.string().url().max(500).nullish(),
  permissionRole: z.enum(["admin", "developer", "designer", "manager"]).optional(),
  isActive: z.boolean().optional(),
});

team.post("/", requireAuth, requireAdmin, zValidator("json", createSchema), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db().insert(teamMember).values(data).returning();
  return c.json({ data: created, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────

team.patch("/:id", requireAuth, requireAdmin, zValidator("json", createSchema.partial()), async (c) => {
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
