/**
 * In-process background job runner.
 *
 * Polls the background_job table every 2 seconds. Picks one queued job at a
 * time (SKIP LOCKED so multiple processes do not stomp), runs the registered
 * handler, and writes the final status back. Crash recovery re-queues any job
 * that was left in 'running' by the previous process.
 *
 * Handlers register themselves at startup via registerHandler(). Each handler
 * receives the full job row and is responsible for updating `steps` incrementally
 * so the browser widget can show partial progress.
 *
 * The runner is intentionally simple and best-effort. A job that was halfway done
 * when the process crashed will be re-queued and run again — every handler must
 * be idempotent or tolerant of partial re-runs.
 *
 * 6c extension note: to add transcription support later, call
 *   registerHandler('transcribe_recording', yourHandler)
 * from the transcription service at startup. No changes to this file are needed.
 */

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { backgroundJob } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import { recordError } from "../utils/error-capture.js";

const log = createLogger("job-runner");

const POLL_INTERVAL_MS = 2_000;

// ─── Types ────────────────────────────────────────────

export interface JobStep {
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface BackgroundJob {
  jobId: number;
  jobType: string;
  projectId: number | null;
  status: string;
  title: string;
  steps: JobStep[];
  result: Record<string, unknown> | null;
  error: string | null;
  createdBy: number | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

type JobHandler = (job: BackgroundJob) => Promise<void>;

// ─── Handler registry ────────────────────────────────

const handlers = new Map<string, JobHandler>();

/**
 * Register a handler for a job type. Call this at startup from each service
 * that wants to handle background jobs.
 *
 * Example:
 *   registerHandler('signoff_draft', signoffDraftHandler);
 *   registerHandler('transcribe_recording', transcribeHandler); // future 6c
 */
export function registerHandler(jobType: string, fn: JobHandler): void {
  handlers.set(jobType, fn);
  log.info({ jobType }, "Job handler registered");
}

// ─── Step helpers (exported for handlers) ─────────────

/**
 * Update a single step's status in the database. Call this from handlers to
 * show incremental progress in the widget.
 */
export async function updateStep(
  jobId: number,
  stepIndex: number,
  stepStatus: JobStep["status"],
): Promise<void> {
  // We use a JSON path update so we only write the changed step, not the whole array.
  await db().execute(
    sql`UPDATE background_job
        SET steps = jsonb_set(steps, ${sql.raw(`'{${stepIndex},status}'`)}, ${sql.raw(`'"${stepStatus}"'`)})
        WHERE job_id = ${jobId}`,
  );
}

/**
 * Write the final result payload to the job row. Call this from handlers
 * before returning (the runner will set status = 'done' after the handler returns).
 */
export async function setJobResult(
  jobId: number,
  result: Record<string, unknown>,
): Promise<void> {
  await db()
    .update(backgroundJob)
    .set({ result })
    .where(eq(backgroundJob.jobId, jobId));
}

// ─── Crash recovery ──────────────────────────────────

/**
 * Re-queue any job that was left in 'running' by the previous process.
 * Call this once at server startup, before startRunner().
 */
export async function crashRecovery(): Promise<void> {
  const result = await db()
    .update(backgroundJob)
    .set({ status: "queued", startedAt: null })
    .where(eq(backgroundJob.status, "running"))
    .returning({ jobId: backgroundJob.jobId });

  if (result.length > 0) {
    log.warn(
      { requeued: result.map((r) => r.jobId) },
      "Crash recovery: re-queued orphaned running jobs",
    );
  }
}

// ─── Runner ──────────────────────────────────────────

let runnerTimer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  const d = db();

  // Pick exactly one queued job, skip any that another process has locked.
  const rows = await d.execute(
    sql`SELECT job_id, job_type, project_id, status, title, steps, result, error,
               created_by, created_at, started_at, finished_at
        FROM background_job
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
  );

  if (rows.length === 0) return;

  const raw = rows[0] as Record<string, unknown>;
  const job: BackgroundJob = {
    jobId: Number(raw.job_id),
    jobType: String(raw.job_type),
    projectId: raw.project_id != null ? Number(raw.project_id) : null,
    status: String(raw.status),
    title: String(raw.title),
    steps: (raw.steps as JobStep[]) ?? [],
    result: (raw.result as Record<string, unknown>) ?? null,
    error: raw.error != null ? String(raw.error) : null,
    createdBy: raw.created_by != null ? Number(raw.created_by) : null,
    createdAt: new Date(raw.created_at as string),
    startedAt: raw.started_at != null ? new Date(raw.started_at as string) : null,
    finishedAt: raw.finished_at != null ? new Date(raw.finished_at as string) : null,
  };

  // Mark as running
  await d
    .update(backgroundJob)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(backgroundJob.jobId, job.jobId));

  job.status = "running";
  log.info({ jobId: job.jobId, jobType: job.jobType }, "Job started");

  const handler = handlers.get(job.jobType);

  if (!handler) {
    await d
      .update(backgroundJob)
      .set({
        status: "failed",
        error: `No handler registered for job type '${job.jobType}'`,
        finishedAt: new Date(),
      })
      .where(eq(backgroundJob.jobId, job.jobId));
    log.warn({ jobId: job.jobId, jobType: job.jobType }, "No handler for job type");
    return;
  }

  try {
    await handler(job);
    await d
      .update(backgroundJob)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(backgroundJob.jobId, job.jobId));
    log.info({ jobId: job.jobId }, "Job completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await d
      .update(backgroundJob)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(backgroundJob.jobId, job.jobId));
    recordError("job-runner", err);
    log.error({ err, jobId: job.jobId }, "Job failed");
  }
}

/**
 * Start the polling loop. Call once at server startup after crashRecovery().
 */
export function startRunner(): void {
  if (runnerTimer) return;
  runnerTimer = setInterval(() => {
    void tick().catch((err) => {
      recordError("job-runner-tick", err);
      log.error({ err }, "Job runner tick error");
    });
  }, POLL_INTERVAL_MS);

  // Allow the process to exit even while the interval is armed.
  if (typeof runnerTimer === "object" && runnerTimer && "unref" in runnerTimer) {
    (runnerTimer as NodeJS.Timeout).unref();
  }

  log.info({ pollIntervalMs: POLL_INTERVAL_MS }, "Job runner started");
}

/**
 * Stop the polling loop. Call on SIGTERM/SIGINT.
 */
export function stopRunner(): void {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
    log.info("Job runner stopped");
  }
}
