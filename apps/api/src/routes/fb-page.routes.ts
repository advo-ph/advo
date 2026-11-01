/**
 * Facebook page scraper — job API over scrapers/fb-page.
 *
 * Attach-only: needs FB_CDP_URL pointing at an already-signed-in Chrome
 * (see docs/FB-PAGE-SCRAPER.md). The legacy /facebook-full + /facebook-stream
 * routes (fb-scrape.routes.ts) launch their own browser from a session file;
 * they stay untouched so the admin UI keeps working.
 *
 * One job at a time: it is one account, and a checkpoint costs more than any speed-up.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { analyze } from "../scrapers/fb-page/analyze.js";
import { collect, DEFAULT } from "../scrapers/fb-page/collect.js";
import { debrief } from "../scrapers/fb-page/debrief.js";
import { persistRun } from "../services/fb-page-store.service.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { env } from "../utils/env.js";
import { fbComment, fbPage as fbPageTable, fbPost, fbScrapeRun } from "../db/schema.js";

const fbPage = new Hono<{ Variables: Variables }>();

interface Job {
  job_id: string;
  url: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  progress: { event: string; data?: Record<string, unknown> } | null;
  result: {
    page: unknown; post: unknown; analysis: unknown; audit: unknown; stat: unknown; debrief_markdown: string;
  } | null;
  error: string | null;
  saved: { fb_page_id: number; fb_scrape_run_id: number; post: number; comment: number } | null;
}

const job = new Map<string, Job>();
let running: string | null = null;

const body = z.object({
  url: z.string().url().max(2000).refine((u) => /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(u), "Must be a Facebook URL"),
  deep: z.boolean().optional(),
});

fbPage.post("/facebook-page", requireAuth, requireTeam, zValidator("json", body), async (c) => {
  const cdp = env().FB_CDP_URL;
  if (!cdp) throw new HTTPException(503, { message: "FB_CDP_URL is not set: point it at a signed-in Chrome (attach-only)." });
  if (running) throw new HTTPException(409, { message: `A scrape is already running (job ${running}).` });

  const { url, deep } = c.req.valid("json");
  const scraped_by = c.get("user").userId;
  const j: Job = {
    job_id: randomUUID(), url, status: "running", started_at: new Date().toISOString(),
    finished_at: null, progress: null, result: null, error: null, saved: null,
  };
  job.set(j.job_id, j);
  running = j.job_id;

  void (async () => {
    try {
      const r = await collect({
        ...DEFAULT, url, cdp, deep: deep ?? true,
        out_dir: mkdtempSync(join(tmpdir(), "fb-page-")),
        log: (event, data) => { j.progress = { event, data }; },
      });
      const analysis = analyze(r.post, r.page);
      // Persist first: a result that exists only in server memory is lost on restart.
      const saved = await persistRun({ url, page: r.page, post: r.post, analysis, audit: r.audit, stat: r.stat, scraped_by });
      j.saved = saved;
      j.result = {
        page: r.page, post: r.post, analysis, audit: r.audit, stat: r.stat,
        debrief_markdown: debrief(url, r.page, analysis, r.post, r.audit, r.stat),
      };
      j.status = "done";
    } catch (e) {
      j.status = "failed";
      j.error = (e as Error).message;
    } finally {
      j.finished_at = new Date().toISOString();
      running = null;
    }
  })();

  return c.json({ job_id: j.job_id, status: j.status }, 202);
});

fbPage.get("/facebook-page/:id", requireAuth, requireTeam, (c) => {
  const j = job.get(c.req.param("id"));
  if (!j) throw new HTTPException(404, { message: "No such job" });
  // Poll without the heavy payload until done.
  return c.json(j.status === "done" ? j : { ...j, result: null });
});

// ── Stored scrapes (read-only) ─────────────────────────────────────────────────
// What a finished scrape left in fb_* (migration 062). No browser, no FB_CDP_URL needed, so
// these work on any host that has the tables — the scrape itself runs where the signed-in Chrome is.

const page_query = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["posted_at", "reaction", "comment", "share"]).default("posted_at"),
});

async function pageByCode(code: string) {
  const [row] = await db().select().from(fbPageTable).where(eq(fbPageTable.pageCode, code)).limit(1);
  if (!row) throw new HTTPException(404, { message: "No such page" });
  return row;
}

/** Every stored page with its latest run. */
fbPage.get("/facebook-page-data", requireAuth, requireTeam, async (c) => {
  const row = await db().execute(sql`
    select p.page_code, p.name, p.category, p.follower_count,
           r.fb_scrape_run_id as latest_run_id, r.status, r.is_audit_ok, r.post_count, r.comment_count, r.created_at as scraped_at
    from fb_page p
    left join lateral (select * from fb_scrape_run x where x.fb_page_id = p.fb_page_id order by x.created_at desc limit 1) r on true
    order by p.name`);
  return c.json({ data: [...row], error: null });
});

/** One page: brand fields + the latest run's analysis, audit and stat. */
fbPage.get("/facebook-page-data/:code", requireAuth, requireTeam, async (c) => {
  const page = await pageByCode(c.req.param("code"));
  const [run] = await db().select().from(fbScrapeRun).where(eq(fbScrapeRun.fbPageId, page.fbPageId)).orderBy(desc(fbScrapeRun.createdAt)).limit(1);
  return c.json({ data: { page, run: run ?? null }, error: null });
});

/** A page's posts, newest first by default. Comments are fetched per post below. */
fbPage.get("/facebook-page-data/:code/post", requireAuth, requireTeam, zValidator("query", page_query), async (c) => {
  const page = await pageByCode(c.req.param("code"));
  const { limit, offset, sort } = c.req.valid("query");
  // Postgres sorts NULL first on DESC; an unknown count must never outrank a real one.
  const order = { posted_at: sql`${fbPost.postedAt} desc nulls last`, reaction: sql`${fbPost.reactionCount} desc nulls last`, comment: sql`${fbPost.commentCount} desc nulls last`, share: sql`${fbPost.shareCount} desc nulls last` }[sort];
  const post = await db().select().from(fbPost).where(eq(fbPost.fbPageId, page.fbPageId)).orderBy(order).limit(limit).offset(offset);
  return c.json({ data: post, error: null });
});

/** One post's captured comments and replies (depth > 0), oldest first. */
fbPage.get("/facebook-page-data/:code/post/:post_code/comment", requireAuth, requireTeam, async (c) => {
  const page = await pageByCode(c.req.param("code"));
  const [post] = await db().select().from(fbPost).where(and(eq(fbPost.fbPageId, page.fbPageId), eq(fbPost.postCode, c.req.param("post_code")))).limit(1);
  if (!post) throw new HTTPException(404, { message: "No such post" });
  const comment = await db().select().from(fbComment).where(eq(fbComment.fbPostId, post.fbPostId)).orderBy(asc(fbComment.createdAt));
  return c.json({ data: { post, comment }, error: null });
});

export default fbPage;
