/**
 * Global background job poller.
 *
 * Calls GET /api/jobs/active every 2 seconds when there are active or
 * recently-finished jobs. Stops polling when the list is empty. Resumes
 * polling when startPolling() is called (e.g. immediately after the user
 * clicks "Generate Draft").
 *
 * Usage:
 *   const { jobs, startPolling } = useJobPoller();
 *
 * The widget imports this hook. The "Generate Draft" button also calls
 * startPolling() after creating a job so the widget updates immediately.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { get } from "@/lib/api";

export interface JobStep {
  label: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface ActiveJob {
  jobId: number;
  jobType: string;
  projectId: number | null;
  status: "queued" | "running" | "done" | "failed";
  title: string;
  steps: JobStep[];
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const POLL_INTERVAL_MS = 2_000;

// Module-level singleton state so every component that calls useJobPoller()
// shares the same job list without re-fetching independently.
let globalJobs: ActiveJob[] = [];
let subscribers: Array<(jobs: ActiveJob[]) => void> = [];
let pollerTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

function notify(jobs: ActiveJob[]) {
  globalJobs = jobs;
  for (const sub of subscribers) sub(jobs);
}

function hasActiveJobs(jobs: ActiveJob[]): boolean {
  return jobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );
}

function hasRecentlyFinished(jobs: ActiveJob[]): boolean {
  return jobs.some(
    (j) => j.status === "done" || j.status === "failed",
  );
}

async function fetchJobs(): Promise<void> {
  try {
    const res = await get<ActiveJob[]>("/api/jobs/active");
    const jobs = (res.data ?? []) as ActiveJob[];
    notify(jobs);

    // Stop polling once all jobs are gone from the active window
    if (!hasActiveJobs(jobs) && !hasRecentlyFinished(jobs)) {
      stopGlobalPoller();
    }
  } catch {
    // Network error — keep polling, the server may come back
  }
}

function startGlobalPoller() {
  if (isPolling) return;
  isPolling = true;
  void fetchJobs(); // immediate first fetch
  pollerTimer = setInterval(() => {
    void fetchJobs();
  }, POLL_INTERVAL_MS);
}

function stopGlobalPoller() {
  isPolling = false;
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}

/**
 * Call this after creating a job to kick off polling immediately.
 * Safe to call multiple times — idempotent.
 */
export function startPolling() {
  startGlobalPoller();
}

export function useJobPoller() {
  const [jobs, setJobs] = useState<ActiveJob[]>(globalJobs);

  useEffect(() => {
    // Subscribe to updates
    const sub = (j: ActiveJob[]) => setJobs([...j]);
    subscribers.push(sub);

    // Sync current state immediately
    setJobs([...globalJobs]);

    return () => {
      subscribers = subscribers.filter((s) => s !== sub);
    };
  }, []);

  const startPollingCb = useCallback(() => {
    startPolling();
  }, []);

  return { jobs, startPolling: startPollingCb };
}
