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

    const [updated] = await db()
      .update(siteContent)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(siteContent.sectionId, id))
      .returning();

    if (!updated) throw new HTTPException(404, { message: "Section not found" });
    return c.json({ data: updated, error: null });
  }
);

// ─── Portfolio ────────────────────────────────────────

content.get("/portfolio", async (c) => {
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
  previewUrl: z.string().url().max(500).optional(),
  imageUrl: z.string().max(500).optional(),
  imageUrls: z.array(z.string()).optional(),
  techStack: z.array(z.string()).optional(),
  slug: z.string().max(100).optional(),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
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
  imageUrl: z.string().max(500).nullish(),
  scheduledFor: z.string().datetime().nullish(),
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
