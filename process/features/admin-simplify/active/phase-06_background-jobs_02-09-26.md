# Phase 6 — Background Tasks, Generate Draft, Upload Recording
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 5 complete (contract files exist for 6b; file upload pipeline exists for 6c)
**Blocks:** nothing downstream (Phase 7 is independent)

---

## Goal

6a: Build a background job system so long-running AI work and audio processing survives browser navigation and refresh.
6b: Wire the sign-off "Generate Draft" button to a background job that reads the Signed/Final contract and the GitHub repository.
6c: Replace the "Add MoM" meeting flow with an audio recording upload that triggers a Whisper transcription background job. Remove all user-facing Plaud input fields.

Sub-phase order within Phase 6: 6a must be deployed before 6b and 6c are started.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/api/migrations/028_background_job.sql` | new | `background_job` table |
| `apps/api/migrations/029_meeting_recording.sql` | new | `meeting_recording` table |
| `apps/api/src/db/schema.ts` | end of file | Add `backgroundJob` and `meetingRecording` table definitions |
| `apps/api/src/services/job-runner.service.ts` | new | In-process job runner; crash recovery; handler registry |
| `apps/api/src/routes/jobs.routes.ts` | new | Create job, list active jobs, poll one job |
| `apps/api/src/index.ts` | startup | Import and start job runner (same pattern as plaud-poll) |
| `apps/api/src/services/signoff-draft.service.ts` | new | Generate Draft job handler |
| `apps/api/src/routes/files.routes.ts` | 16–31 | Add audio MIME types; raise size cap for recordings bucket |
| `apps/api/src/routes/meeting.routes.ts` | new endpoint | Upload recording |
| `apps/api/src/routes/project-signoff.routes.ts` | new endpoint | POST /api/project-signoff/:id/generate-draft |
| `apps/web/src/App.tsx` | layout | Mount `<JobProgressWidget>` above router |
| `apps/web/src/components/admin/shared/JobProgressWidget.tsx` | new | Global bottom-right floating widget |
| `apps/web/src/hooks/useJobPoller.ts` | new | Polls active jobs; updates widget state |
| `apps/web/src/components/admin/AdminSignoff.tsx` | ~205 | Rename "Draft sign-off" to "Generate Draft"; wire to job |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | Sign-off tab | Rename button; wire to job |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | Meetings tab (~726–760+) | Rename button; recording upload list; Transcribe button |
| `apps/web/src/components/admin/AdminMeetings.tsx` | ~359 | Rename "New MoM" to "Upload recording"; wire new upload flow |
| `apps/web/src/components/admin/AdminMeetings.tsx` | ~549–550 | Remove Plaud share key input |
| `apps/api/package.json` | dependencies | Add `openai` for Whisper |

---

## Blast Radius

- `App.tsx` gains a new global child component. This must not affect routing.
- `AdminSignoff.tsx` and the Sign-off tab in `ProjectCommandCenter.tsx` get a renamed button. The old sign-off generation logic (if any exists beyond the button) is replaced by the job flow.
- `AdminMeetings.tsx`: the Plaud share key input field (line 549–550) is removed from the "New MoM" dialog. The meeting creation flow changes from a metadata-entry dialog to a recording upload. Existing meetings with `plaudShareKey` stored in the database are NOT affected — the column stays, the UI just no longer shows an input for it.
- The meeting form field `plaudFileId` (line ~53 in AdminMeetings.tsx) is also removed from the UI (the column stays for historical rows).
- No Plaud poll service changes — it keeps running and pulling transcripts for any share keys already stored.
- `openai` package added to API.

**OPEN ITEM — transcription backend:** There is no Whisper or speech-to-text integration in the repo today. This phase adds the `openai` npm package and calls `openai.audio.transcriptions.create()`. Before Phase 6 EXECUTE, confirm `OPENAI_API_KEY` exists in `.env.example` and in the production env. If the key is absent at runtime, the Transcribe job must complete with status `failed` and `error: "Transcription is not configured on this server"` — never a generic 500.

---

## New Database Objects

### Migration 028 — `background_job`

```
Table: background_job
  job_id            bigserial PRIMARY KEY
  job_type          varchar(60) NOT NULL
    -- e.g. 'signoff_draft' | 'transcription'
  project_id        integer REFERENCES project(project_id) ON DELETE SET NULL
  status            varchar(20) NOT NULL DEFAULT 'queued'
    -- queued | running | done | failed
  title             text NOT NULL
    -- shown in the widget, e.g. "Generating Draft"
  steps             jsonb NOT NULL DEFAULT '[]'
    -- array of { label: string, status: 'pending' | 'running' | 'done' | 'failed' }
  result            jsonb
  error             text
  created_by        integer REFERENCES "user"(user_id) ON DELETE SET NULL
  created_at        timestamptz NOT NULL DEFAULT NOW()
  started_at        timestamptz
  finished_at       timestamptz

  CONSTRAINT chk_background_job_status CHECK (
    status IN ('queued', 'running', 'done', 'failed')
  )
  CONSTRAINT chk_background_job_stamp CHECK (
    (status IN ('done', 'failed')) = (finished_at IS NOT NULL)
  )
```

Index on `(status)` and `(created_by, status)`.

### Migration 029 — `meeting_recording`

```
Table: meeting_recording
  recording_id    bigserial PRIMARY KEY
  meeting_id      integer REFERENCES meeting(meeting_id) ON DELETE CASCADE
  file_url        text NOT NULL
  file_name       text NOT NULL
  mime_type       varchar(100) NOT NULL
  transcript      text
    -- NULL until transcription completes
  job_id          bigint REFERENCES background_job(job_id) ON DELETE SET NULL
  created_at      timestamptz NOT NULL DEFAULT NOW()
```

---

## Sub-Phase 6a — Background Job Infrastructure

### Step 6a-1 — Write and apply migrations 028 and 029
Write `apps/api/migrations/028_background_job.sql` and `029_meeting_recording.sql`.
Apply both to dev database.

### Step 6a-2 — Update schema.ts
Add `backgroundJob` and `meetingRecording` table definitions.

### Step 6a-3 — Job runner service: `job-runner.service.ts`
Location: `apps/api/src/services/job-runner.service.ts`.

Responsibilities:
- Maintain a registry: `Map<string, (job: BackgroundJob) => Promise<void>>` keyed by `job_type`.
- Export `registerHandler(jobType, fn)` for other services to call at startup.
- Export `startRunner()`: starts a `setInterval` loop (poll interval: 2 seconds). Each tick:
  1. SELECT one row WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED.
  2. Update status to 'running', set `started_at = NOW()`.
  3. Look up the handler for `job_type`. If none found: set status 'failed', error 'No handler for job type', finished_at.
  4. Call the handler. On success: set status 'done', finished_at. On error: set status 'failed', error = err.message, finished_at.
- Export `stopRunner()`: clears the interval.
- Export `crashRecovery()`: called once at startup. UPDATE background_job SET status = 'queued', started_at = NULL WHERE status = 'running'. This re-queues jobs that were mid-flight when the server last died.

Handler functions receive a job record. They must update `steps` and `result` in the database incrementally (using UPDATE background_job SET steps = $steps WHERE job_id = $id) so the UI can show partial progress.

### Step 6a-4 — Job API routes: `jobs.routes.ts`

`POST /api/jobs` (requireAdmin)
- Body: `{ jobType, projectId?, title, steps: [{label}] }`.
- Inserts a new `background_job` row with status 'queued'.
- Returns `{ data: { jobId } }`.

`GET /api/jobs/active` (requireAuth)
- Returns all jobs WHERE `created_by = userId AND status IN ('queued', 'running')` ordered by created_at DESC.
- Also returns jobs completed in the last 10 seconds (finished_at > NOW() - interval '10 seconds') so the widget can show the "Finished!" state before hiding.

`GET /api/jobs/:id` (requireAuth)
- Returns one job row including `steps` and `result`.

### Step 6a-5 — Start runner from index.ts
In `apps/api/src/index.ts`, after `startPlaudPoll()`, add:
```
import { startRunner, crashRecovery } from './services/job-runner.service.js'
crashRecovery(); // re-queue any orphaned running jobs
startRunner();
```
On SIGTERM/SIGINT, call `stopRunner()`.

### Step 6a-6 — Global job widget: JobProgressWidget.tsx
Create `apps/web/src/components/admin/shared/JobProgressWidget.tsx`.

State (via `useJobPoller` hook): list of active jobs with their `steps` and `title`.

Layout: fixed bottom-right, z-index above everything. CSS: `fixed bottom-4 right-4 z-50`.
- If no active or recently-finished jobs: renders nothing.
- If jobs exist: a card with:
  - A title bar: spinner icon + "Tasks running" (or a specific title if only one job). On the right: a chevron button that collapses/expands the step list. Collapsing hides the step rows but keeps the title bar visible.
  - Step list: one row per step in the current job's `steps` array. Each row: a step label and a status indicator (pending grey dot, running spinner, done green check, failed red X).
  - When a job finishes with status 'done': title changes to the job's done message (see 6b and 6c for wording). The widget disappears after 3 seconds.
  - When a job finishes with status 'failed': title shows "Something went wrong" in red. Does not auto-hide. Has a dismiss button.
  - When multiple jobs are running: show them stacked, most recent on top.

### Step 6a-7 — useJobPoller hook
Create `apps/web/src/hooks/useJobPoller.ts`.
- Calls `GET /api/jobs/active` every 2 seconds using a `setInterval`.
- Returns `{ jobs: ActiveJob[] }`.
- Stops polling when no active jobs exist (no active jobs AND no recently-finished jobs). Resumes polling when a new job is created (the widget or the "Generate Draft" / "Transcribe" buttons trigger a manual refresh).
- Export a `startPolling()` function that the "Generate Draft" and "Transcribe" handlers can call to kick off polling immediately.

### Step 6a-8 — Mount widget in App.tsx
In `apps/web/src/App.tsx`, import `JobProgressWidget` and render it as a sibling of the router, inside the auth provider but outside the layout:
```
<AuthProvider>
  <JobProgressWidget />
  <Router>...</Router>
</AuthProvider>
```

---

## Sub-Phase 6b — Sign-off "Generate Draft"

### Step 6b-1 — Rename button
In `AdminSignoff.tsx` line ~205: change button label from "Draft sign-off" to "Generate Draft".
In the Sign-off tab of `ProjectCommandCenter.tsx`: same rename.

### Step 6b-2 — signoff-draft.service.ts
Create `apps/api/src/services/signoff-draft.service.ts`.

Register as handler for `job_type = 'signoff_draft'` in `job-runner.service.ts`.

Handler steps (update the job's `steps` jsonb as each starts and finishes):
Step 1 label: "Analyzing Contract Information"
- Query `contract_file WHERE project_id = job.project_id AND status = 'signed'` ORDER BY created_at DESC LIMIT 1.
- If none: query for `status = 'final'` instead.
- If neither exists: fail the job with error "No signed or final contract found for this project."
- Call `extractContractText(filePath, mimeType)` from Phase 5 to get the text.
- Mark step 1 done.

Step 2 label: "Analyzing Website Features"
- Read `project.repositoryName`. If none: skip GitHub reading; note "No repository linked."
- If repository exists: call the GitHub API (or the existing GitHub integration in `apps/api/src/routes/github.routes.ts`) to fetch the repository README and any package.json. Parse out what the website does.
- Mark step 2 done.

Generate sign-off content:
- Call `claude-opus-5` with a prompt that takes the contract text and repo summary and generates a sign-off document. The prompt must instruct: "Write in plain English, no jargon. Describe what was built, based on the contract and the repository. List the features. Keep descriptions short and non-technical but not so vague they are useless. Do not say 'As per the contract'."
- Store the result as the sign-off draft. Use the existing `project_signoff` table: create a `projectSignoff` row with the generated text as the `content` field (or whichever column stores the draft text — read the schema at lines 846+ before implementing).
- Update the job `result` jsonb with `{ signoffId: ... }`.
- Mark job done.

On finish: the widget title changes to "Finished Draft!" then disappears after 3 seconds.

### Step 6b-3 — New endpoint: POST /api/project-signoff/:id/generate-draft
Body: `{ projectId }`.
Creates a `background_job` row with:
- `job_type = 'signoff_draft'`
- `title = 'Generating Draft'`
- `steps = [{ label: 'Analyzing Contract Information', status: 'pending' }, { label: 'Analyzing Website Features', status: 'pending' }]`
Returns `{ data: { jobId } }`.

The "Generate Draft" button calls this endpoint, then calls `startPolling()` on the job poller.

---

## Sub-Phase 6c — Meetings: Upload Recording

### Step 6c-1 — Widen MIME whitelist in files.routes.ts
Add to the whitelist in lines 16–31:
- `audio/mpeg` (mp3)
- `audio/mp4` (m4a)
- `audio/x-m4a` (m4a alternate)

Add a `recordings` bucket with a size cap of 500 MB.

### Step 6c-2 — Rename buttons
In `ProjectCommandCenter.tsx` line ~741: change "Add MoM" to "Upload recording".
In `AdminMeetings.tsx` line ~359: change "New MoM" to "Upload recording".

### Step 6c-3 — Remove Plaud UI inputs
In `AdminMeetings.tsx`:
- Remove the `plaudShareKey` input field (lines 549–550) from the meeting form.
- Remove the `plaudFileId` input if it exists as a visible form field (line ~53 area — check the actual form JSX).
- Keep all Plaud-related state and API calls that already exist; just remove the input fields. The Plaud poll service continues to work for existing share keys.

In `ProjectCommandCenter.tsx` lines ~749–826:
- Remove the "Plaud file id or share URL" text input (line ~749).
- Remove the Plaud share key input (line ~800–802).
- Remove the `importPlaudMeeting` call from the submit handler if it is triggered by the removed input. Keep any Plaud display that shows an already-linked transcript.

### Step 6c-4 — Recording upload flow in AdminMeetings.tsx and ProjectCommandCenter.tsx
Replace the "Add MoM" / "New MoM" dialog with an "Upload recording" flow:
- A file picker accepting `.mp3` and `.m4a`.
- On file select: upload to `POST /api/files/upload` (recordings bucket).
- On upload success: call `POST /api/meeting/recordings` with `{ meetingId (optional for standalone page), fileUrl, fileName, mimeType }`.
- If called from the project Meetings tab: `meetingId` is the selected or new meeting id (create a bare meeting row first if needed).
- Show the recording as a list row with: file name, date, and a "Transcribe" button.

### Step 6c-5 — Meeting recording endpoint: POST /api/meeting/recordings
Body: `{ meetingId?, fileUrl, fileName, mimeType }`.
Inserts a `meeting_recording` row with `transcript = NULL`, `job_id = NULL`.
Returns the created row.

### Step 6c-6 — Transcription handler and endpoint
`POST /api/meeting/recordings/:id/transcribe` (requireAdmin):
- Creates a `background_job` with `job_type = 'transcription'`, `title = 'Transcribing Audio'`, `steps = [{ label: fileName, status: 'pending' }]`.
- Updates `meeting_recording.job_id` to the new job id.
- Returns `{ data: { jobId } }`.

Register handler `'transcription'` in job-runner:
- Download the audio file from `file_url`.
- Call `openai.audio.transcriptions.create({ file: ..., model: 'whisper-1' })`.
- On success: UPDATE `meeting_recording SET transcript = result.text` WHERE recording_id = ...
- Update `meeting.summary` or `meeting.transcript` with the transcript text (use whichever column the existing schema uses for this purpose — read the schema at lines 455+ before implementing).
- Mark step done, job done.
- On OpenAI key missing: fail with error "Transcription is not configured on this server".

Multiple concurrent transcription jobs: each recording gets its own job. The widget groups them under the shared title "Transcribing Audio" if multiple jobs with that title are running simultaneously (the widget renders all active jobs stacked; the grouping is visual, not a structural change to the job table).

### Step 6c-7 — Recording list UI
Both `AdminMeetings.tsx` and the Meetings tab in `ProjectCommandCenter.tsx` show the recording list for a meeting. Each row:
- File name (left).
- "Transcribe" button — calls the transcribe endpoint and starts polling. Disabled while a transcription job is active for this recording. After transcription: button changes to "View transcript" and opens a dialog showing the transcript text.
- Delete icon — ConfirmDeleteDialog, then DELETE /api/meeting/recordings/:id.

---

## Public Contracts

New endpoints:
- `POST /api/jobs` → `{ data: { jobId } }`
- `GET /api/jobs/active` → `{ data: [{ jobId, title, status, steps, finishedAt }] }`
- `GET /api/jobs/:id` → `{ data: { jobId, title, status, steps, result, error } }`
- `POST /api/project-signoff/:id/generate-draft` → `{ data: { jobId } }`
- `POST /api/meeting/recordings` → `{ data: { recordingId, ... } }`
- `POST /api/meeting/recordings/:id/transcribe` → `{ data: { jobId } }`
- `DELETE /api/meeting/recordings/:id` → 204

---

## Verification Evidence

**6a:**
1. Run `pnpm test --filter web`. All tests pass.
2. Apply migrations 028 and 029.
3. POST to `/api/jobs` with a dummy `job_type`. Confirm job appears in `/api/jobs/active`.
4. Restart the API server while a job is stuck in `running`. Confirm it re-queues to `queued` after startup.
5. Open any admin page. Confirm `JobProgressWidget` does not render when no jobs are active.
6. Trigger a test job from the API. Confirm the widget appears bottom-right with a spinner and step list.
7. Confirm the widget disappears 3 seconds after the job completes with status 'done'.

**6b:**
8. Click "Generate Draft" on a project that has a Signed contract file (from Phase 5). Confirm the widget shows "Generating Draft" with two sub-tasks.
9. Confirm both sub-tasks progress from pending to done in the widget.
10. After completion: widget says "Finished Draft!". Confirm it disappears after 3 seconds.
11. Confirm a new projectSignoff row exists in the database with non-empty content.
12. Try on a project with no contract file. Confirm the job fails with a readable error in the widget.

**6c:**
13. Upload an mp3 file from the Meetings tab. Confirm a recording row appears.
14. Click "Transcribe". Confirm a job appears in the widget titled "Transcribing Audio".
15. If `OPENAI_API_KEY` is set: confirm transcript text appears in the recording row after job completes.
16. If `OPENAI_API_KEY` is absent: confirm the widget shows "Something went wrong" with the error message, not a blank failure.
17. Confirm no Plaud input fields are visible in the meeting form.

---

## Rollback

- Revert `App.tsx`, `AdminSignoff.tsx`, `AdminMeetings.tsx`, `ProjectCommandCenter.tsx`.
- Delete new service files and route files.
- Drop tables: `DROP TABLE meeting_recording; DROP TABLE background_job;`
- Remove `openai` from `apps/api/package.json`.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-06_background-jobs_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-07_finance-tab_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
