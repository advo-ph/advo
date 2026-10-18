import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, asc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { siteContent, portfolioProject, socialPost } from "../db/schema.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { flexibleDateTime, looseUrl } from "../utils/validators.js";

const content = new Hono<{ Variables: Variables }>();

// ─── Site Content Sections ────────────────────────────

content.get("/sections", optionalAuth, async (c) => {
  const user = c.get("user");
  const rows = await db()
    .select()
    .from(siteContent)
    .orderBy(siteContent.sectionId);

  if (user?.role === "admin") {
    return c.json({ data: rows, error: null });
  }

  // Public: only visible sections
  return c.json({
    data: rows.filter((r) => r.visiblePublic),
    error: null,
  });
});

content.patch(
  "/sections/:id",
  requireAuth,
  requireAdmin,
  zValidator(
    "json",
    z.object({
      visiblePublic: z.boolean().optional(),
      visibleClientPortal: z.boolean().optional(),
      content: z.record(z.unknown()).optional(),
      label: z.string().max(255).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // Upsert: a section row may not have been seeded yet (e.g. client_dashboard
    // used by the Notifications auto-rules toggle). Create it on first write so
    // the toggle persists instead of 404ing.
    const [row] = await db()
      .insert(siteContent)
      .values({ sectionId: id, ...data })
      .onConflictDoUpdate({
        target: siteContent.sectionId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();

    return c.json({ data: row, error: null });
  }
);

// ─── Portfolio ────────────────────────────────────────

content.get("/portfolio", async (c) => {
  const rows = await db()
    .select()
    .from(portfolioProject)
    .where(eq(portfolioProject.isFeatured, true))
    .orderBy(asc(portfolioProject.displayOrder));

  return c.json({ data: rows, error: null });
});

content.get("/portfolio/admin", requireAuth, requireAdmin, async (c) => {
  const rows = await db()
    .select()
    .from(portfolioProject)
    .orderBy(asc(portfolioProject.displayOrder));

  return c.json({ data: rows, error: null });
});

content.get("/portfolio/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [row] = await db()
    .select()
    .from(portfolioProject)
    .where(eq(portfolioProject.slug, slug))
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Portfolio project not found" });
  return c.json({ data: row, error: null });
});

const portfolioSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  previewUrl: z.string().max(500).optional(),
  imageUrl: z.string().max(500).optional(),
  imageUrls: z.array(z.string()).optional(),
  // Null clears the logo, and the landing shows the title text again.
  logoUrl: z.string().max(500).nullable().optional(),
  techStack: z.array(z.string()).optional(),
  slug: z.string().max(100).optional(),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  deviceType: z.enum(["laptop", "phone"]).optional(),
  caseStudy: z.record(z.unknown()).optional(),
});

content.post(
  "/portfolio",
  requireAuth,
  requireAdmin,
  zValidator("json", portfolioSchema),
  async (c) => {
    const data = c.req.valid("json");
    const [created] = await db().insert(portfolioProject).values(data).returning();
    return c.json({ data: created, error: null }, 201);
  }
);

// Saves the full list order. Position in the array becomes display_order,
// so every item gets its own number.
content.patch(
  "/portfolio/order",
  requireAuth,
  requireAdmin,
  zValidator("json", z.object({ ids: z.array(z.number().int()).max(500) })),
  async (c) => {
    const { ids } = c.req.valid("json");
    await db().transaction(async (tx) => {
      for (const [idx, id] of ids.entries()) {
        await tx
          .update(portfolioProject)
          .set({ displayOrder: idx, updatedAt: new Date() })
          .where(eq(portfolioProject.portfolioProjectId, id));
      }
    });
    return c.json({ data: { ids }, error: null });
  }
);

content.patch(
  "/portfolio/:id",
  requireAuth,
  requireAdmin,
  zValidator("json", portfolioSchema.partial()),
  async (c) => {
    const id = Number(c.req.param("id"));
    const data = c.req.valid("json");

    const [updated] = await db()
      .update(portfolioProject)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(portfolioProject.portfolioProjectId, id))
      .returning();

    if (!updated) throw new HTTPException(404, { message: "Portfolio project not found" });
    return c.json({ data: updated, error: null });
  }
);

content.delete("/portfolio/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(portfolioProject)
    .where(eq(portfolioProject.portfolioProjectId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Portfolio project not found" });
  return c.json({ data: { message: "Portfolio project deleted" }, error: null });
});

// ─── Social Posts ─────────────────────────────────────

content.get("/social", requireAuth, requireAdmin, async (c) => {
  const rows = await db()
    .select()
    .from(socialPost)
    .orderBy(desc(socialPost.createdAt));

  return c.json({ data: rows, error: null });
});

const socialSchema = z.object({
  platform: z.string().max(50).optional(),
  content: z.string().max(5000).optional(),
  imageUrl: looseUrl(),
  scheduledFor: flexibleDateTime(),
});

content.post(
  "/social",
  requireAuth,
  requireAdmin,
  zValidator("json", socialSchema),
  async (c) => {
    const data = c.req.valid("json");
    const [created] = await db()
      .insert(socialPost)
      .values({
        ...data,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      })
      .returning();

    return c.json({ data: created, error: null }, 201);
  }
);

content.patch(
  "/social/:id",
  requireAuth,
  requireAdmin,
  zValidator("json", socialSchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    const data = c.req.valid("json");

    const [updated] = await db()
      .update(socialPost)
      .set({
        ...data,
        scheduledFor:
          data.scheduledFor === undefined
            ? undefined
            : data.scheduledFor
              ? new Date(data.scheduledFor)
              : null,
      })
      .where(eq(socialPost.socialPostId, id))
      .returning();

    if (!updated) throw new HTTPException(404, { message: "Social post not found" });
    return c.json({ data: updated, error: null });
  }
);

content.delete("/social/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db()
    .delete(socialPost)
    .where(eq(socialPost.socialPostId, id))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Social post not found" });
  return c.json({ data: { message: "Social post deleted" }, error: null });
});

export default content;
