/**
 * /api/jobs — background job queue endpoints.
 *
 * POST /api/jobs            Create a queued job (admin only)
 * GET  /api/jobs/active     List the calling user's active + recently-finished jobs
 * GET  /api/jobs/:id        Fetch one job by id (auth required)
 *
 * The widget polls GET /api/jobs/active every 2 seconds.
 * "Recently finished" = done or failed within the last 10 seconds, so the
 * widget can show the "Finished!" state before it disappears.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { eq, and, or, inArray, sql, gt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { backgroundJob } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const jobRoutes = new Hono<{ Variables: Variables }>();

jobRoutes.use("*", requireAuth);

// ─── Schemas ──────────────────────────────────────────

const createSchema = z.object({
  jobType: z.string().min(1).max(60),
  projectId: z.number().int().optional(),
  title: z.string().min(1).max(255),
  steps: z.array(z.object({ label: z.string().min(1) })).min(1),
});

// ─── POST /api/jobs ───────────────────────────────────

jobRoutes.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const steps = body.steps.map((s) => ({ label: s.label, status: "pending" as const }));

  const [created] = await db()
    .insert(backgroundJob)
    .values({
      jobType: body.jobType,
      projectId: body.projectId ?? null,
      title: body.title,
      steps,
      createdBy: user.userId,
    })
    .returning({ jobId: backgroundJob.jobId });

  return c.json({ data: { jobId: created.jobId }, error: null }, 201);
});

// ─── GET /api/jobs/active ─────────────────────────────
// Must be declared BEFORE /:id or the literal "active" matches the id param.

jobRoutes.get("/active", async (c) => {
  const user = c.get("user");

  const rows = await db().execute(
    sql`SELECT job_id, job_type, project_id, status, title, steps, result, error,
               created_by, created_at, started_at, finished_at
        FROM background_job
        WHERE created_by = ${user.userId}
          AND (
            status IN ('queued', 'running')
            OR (
              status IN ('done', 'failed')
              AND finished_at > NOW() - INTERVAL '10 seconds'
            )
          )
        ORDER BY created_at DESC`,
  );

  const data = (rows as Record<string, unknown>[]).map((r) => ({
    jobId: Number(r.job_id),
    jobType: String(r.job_type),
    projectId: r.project_id != null ? Number(r.project_id) : null,
    status: String(r.status),
    title: String(r.title),
    steps: r.steps,
    result: r.result ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
    startedAt: r.started_at ?? null,
    finishedAt: r.finished_at ?? null,
  }));

  return c.json({ data, error: null });
});

// ─── GET /api/jobs/:id ────────────────────────────────

jobRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid job id" });

  const [row] = await db()
    .select()
    .from(backgroundJob)
    .where(
      and(
        eq(backgroundJob.jobId, id),
        eq(backgroundJob.createdBy, user.userId),
      ),
    )
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Job not found" });

  return c.json({
    data: {
      jobId: row.jobId,
      jobType: row.jobType,
      projectId: row.projectId,
      status: row.status,
      title: row.title,
      steps: row.steps,
      result: row.result ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? null,
      finishedAt: row.finishedAt ?? null,
    },
    error: null,
  });
});

export default jobRoutes;
