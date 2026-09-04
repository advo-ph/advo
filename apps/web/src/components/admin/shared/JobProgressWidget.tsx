/**
 * Global background job progress widget.
 *
 * Fixed bottom-right. Appears when any job is active or recently finished.
 * Disappears 3 seconds after all jobs finish with status 'done'.
 * Stays visible on failure with a dismiss button.
 *
 * The title bar collapses/expands the step list via a chevron button.
 * The title bar itself always stays visible while the widget is shown.
 *
 * Multiple jobs stack vertically, most recent on top.
 *
 * Grouping rule: all concurrent 'transcribe_recording' jobs are merged into a
 * single card titled "Transcribing Audio". Each individual file name appears as
 * a sub-item inside that card. All other job types render as individual cards.
 *
 * The 6b "Generating Draft" behaviour is unchanged: title, loading icon, chevron
 * collapse, done message ("Finished Draft!"), disappears after 3 seconds.
 */

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { useJobPoller, type ActiveJob, type JobStep } from "@/hooks/useJobPoller";

const DONE_LINGER_MS = 3_000;

// ─── Step indicator ───────────────────────────────────

function StepRow({ step }: { step: JobStep }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="shrink-0">
        {step.status === "running" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        )}
        {step.status === "done" && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        )}
        {step.status === "failed" && (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        )}
        {step.status === "pending" && (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </span>
      <span
        className={
          "text-xs " +
          (step.status === "done"
            ? "text-muted-foreground"
            : step.status === "failed"
              ? "text-destructive"
              : "text-foreground")
        }
      >
        {step.label}
      </span>
    </div>
  );
}

// ─── Single job card (non-transcription) ─────────────

function JobCard({
  job,
  collapsed,
  onToggle,
  onDismiss,
}: {
  job: ActiveJob;
  collapsed: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const isFailed = job.status === "failed";
  const isDone = job.status === "done";
  const isActive = job.status === "queued" || job.status === "running";

  let titleText = job.title;
  if (isDone && job.jobType === "signoff_draft") titleText = "Draft ready!";

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden min-w-[240px] max-w-[300px]">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
        <span className="shrink-0">
          {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {isFailed && <XCircle className="h-3.5 w-3.5 text-destructive" />}
        </span>
        <span
          className={
            "flex-1 text-xs font-medium truncate " +
            (isFailed ? "text-destructive" : "text-foreground")
          }
        >
          {isFailed ? "We hit an issue. Try again." : titleText}
        </span>
        {/* Collapse/expand toggle */}
        <button
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 hover:bg-border transition-colors"
          aria-label={collapsed ? "Expand job details" : "Collapse job details"}
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {/* Dismiss — only on failure */}
        {isFailed && (
          <button
            onClick={onDismiss}
            className="shrink-0 rounded p-0.5 hover:bg-border transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Step list */}
      {!collapsed && (
        <div className="px-3 py-2 space-y-0.5">
          {(job.steps as JobStep[]).map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
          {isFailed && job.error && (
            <p className="text-xs text-destructive mt-1 leading-snug">{job.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grouped transcription card ───────────────────────
// Shows all concurrent transcribe_recording jobs under one "Transcribing Audio"
// header. Each file name is listed as a sub-item inside.

function TranscriptionGroupCard({
  jobs,
  collapsed,
  onToggle,
  onDismissAll,
}: {
  jobs: ActiveJob[];
  collapsed: boolean;
  onToggle: () => void;
  onDismissAll: () => void;
}) {
  const allDone = jobs.every((j) => j.status === "done");
  const anyFailed = jobs.some((j) => j.status === "failed");
  const isActive = !allDone && !anyFailed;

  const title = allDone
    ? "Transcription done"
    : anyFailed
      ? "We hit an issue. Try again."
      : "Transcribing audio";

  // Collect all file-level step rows across all jobs, preserving job-level status.
  const fileRows: { label: string; status: JobStep["status"]; error?: string | null }[] = [];
  for (const job of jobs) {
    const stepStatus: JobStep["status"] =
      job.status === "done"
        ? "done"
        : job.status === "failed"
          ? "failed"
          : (job.steps as JobStep[])[0]?.status ?? "pending";

    const label = (job.steps as JobStep[])[0]?.label ?? `Recording ${job.jobId}`;
    fileRows.push({ label, status: stepStatus, error: job.error });
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden min-w-[240px] max-w-[300px]">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
        <span className="shrink-0">
          {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
          {allDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {anyFailed && !allDone && <XCircle className="h-3.5 w-3.5 text-destructive" />}
        </span>
        <span
          className={
            "flex-1 text-xs font-medium truncate " +
            (anyFailed && !allDone ? "text-destructive" : "text-foreground")
          }
        >
          {title}
        </span>
        <button
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 hover:bg-border transition-colors"
          aria-label={collapsed ? "Expand details" : "Collapse details"}
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {/* Dismiss — only when all finished (done or failed) */}
        {!isActive && (
          <button
            onClick={onDismissAll}
            className="shrink-0 rounded p-0.5 hover:bg-border transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* File list */}
      {!collapsed && (
        <div className="px-3 py-2 space-y-0.5">
          {fileRows.map((row, i) => (
            <div key={i}>
              <StepRow step={{ label: row.label, status: row.status }} />
              {row.status === "failed" && row.error && (
                <p className="pl-6 text-xs text-destructive leading-snug">{row.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Widget root ──────────────────────────────────────

export function JobProgressWidget() {
  const { jobs } = useJobPoller();
  // collapsed state keyed by job id for individual cards; "transcription-group" for the group
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const lingerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // For each newly-done job, start a 3-second hide timer.
  useEffect(() => {
    const timers = lingerTimers.current;
    for (const job of jobs) {
      if (job.status === "done" && !timers[job.jobId]) {
        timers[job.jobId] = setTimeout(() => {
          setDismissed((prev) => new Set(prev).add(job.jobId));
          delete timers[job.jobId];
        }, DONE_LINGER_MS);
      }
    }
  }, [jobs]);

  // Cleanup timers on unmount.
  useEffect(() => {
    const timers = lingerTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const visible = jobs.filter((j) => !dismissed.has(j.jobId));

  // Split jobs: transcription jobs go into the group, others render individually.
  const transcriptionJobs = visible.filter((j) => j.jobType === "transcribe_recording");
  const otherJobs = visible.filter((j) => j.jobType !== "transcribe_recording");

  // If all transcription jobs are done, start a group linger timer.
  const allTranscriptionDone =
    transcriptionJobs.length > 0 &&
    transcriptionJobs.every((j) => j.status === "done");

  const transcriptionGroupKey = "transcription-group";
  useEffect(() => {
    const timers = lingerTimers.current;
    if (allTranscriptionDone && !timers[transcriptionGroupKey]) {
      const ids = transcriptionJobs.map((j) => j.jobId);
      timers[transcriptionGroupKey] = setTimeout(() => {
        setDismissed((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.add(id);
          return next;
        });
        delete timers[transcriptionGroupKey];
      }, DONE_LINGER_MS);
    }
  // The effect only needs to re-run when the done state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTranscriptionDone]);

  if (visible.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end"
      role="status"
      aria-live="polite"
    >
      {/* Individual non-transcription jobs — newest on top */}
      {[...otherJobs].reverse().map((job) => (
        <JobCard
          key={job.jobId}
          job={job}
          collapsed={!!collapsed[job.jobId]}
          onToggle={() =>
            setCollapsed((prev) => ({ ...prev, [job.jobId]: !prev[job.jobId] }))
          }
          onDismiss={() => setDismissed((prev) => new Set(prev).add(job.jobId))}
        />
      ))}

      {/* Grouped transcription card — shown when at least one transcribe job is visible */}
      {transcriptionJobs.length > 0 && (
        <TranscriptionGroupCard
          jobs={transcriptionJobs}
          collapsed={!!collapsed[transcriptionGroupKey]}
          onToggle={() =>
            setCollapsed((prev) => ({
              ...prev,
              [transcriptionGroupKey]: !prev[transcriptionGroupKey],
            }))
          }
          onDismissAll={() =>
            setDismissed((prev) => {
              const next = new Set(prev);
              for (const j of transcriptionJobs) next.add(j.jobId);
              return next;
            })
          }
        />
      )}
    </div>
  );
}
