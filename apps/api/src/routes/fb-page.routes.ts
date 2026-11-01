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
  const cdp = process.env.FB_CDP_URL;
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

export default fbPage;
