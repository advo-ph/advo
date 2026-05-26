/**
 * Brand Analysis Routes
 *
 * POST /api/scrape/analyze-brand  — Run full brand analysis on a scraped FB page
 * GET  /api/scrape/brand-profile  — Get cached brand profile
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import { analyzeBrand, analyzePostEngagement } from "../services/brand-analysis.service.js";
import type { Variables } from "../types/context.js";

const brandRoutes = new Hono<{ Variables: Variables }>();

// ─── Analyze Brand (from raw scrape data) ────────────

const analyzeSchema = z.object({
  scrapeData: z.object({
    url: z.string(),
    pageInfo: z.any(),
    posts: z.array(z.any()),
    photos: z.array(z.string()).optional(),
  }),
  options: z.object({
    maxImages: z.number().optional().default(30),
    skipGemini: z.boolean().optional().default(false),
  }).optional(),
});

brandRoutes.post("/analyze-brand", requireAuth, requireTeam, zValidator("json", analyzeSchema), async (c) => {
  const { scrapeData, options } = c.req.valid("json");

  const profile = await analyzeBrand(
    scrapeData.posts,
    scrapeData.pageInfo,
    scrapeData.photos || [],
    options || {},
  );

  return c.json({ data: profile, error: null });
});

// ─── Quick Analytics (no Gemini, instant) ────────────

const quickSchema = z.object({
  posts: z.array(z.any()),
  pageInfo: z.any(),
});

brandRoutes.post("/quick-analytics", requireAuth, requireTeam, zValidator("json", quickSchema), async (c) => {
  const { posts, pageInfo } = c.req.valid("json");
  const analytics = analyzePostEngagement(posts, pageInfo);
  return c.json({ data: analytics, error: null });
});

export default brandRoutes;
