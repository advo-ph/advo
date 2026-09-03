# Admin Simplify — Umbrella Program Plan
**Date:** 02-09-26
**Feature folder:** `process/features/admin-simplify/`
**Complexity:** COMPLEX — 10 sequential/semi-parallel phases
**Status:** PLAN APPROVED — pending EXECUTE

---

## Overview

A comprehensive simplification pass over the ADVO admin interface. The current UI was built for people with a business and technical background. The users are regular people tracking what needs to be done and finishing it. This program removes clutter, restructures money pages, introduces per-project job roles, adds background jobs for long-running work, and rewrites all copy in plain language.

The program has 10 phases. Most are sequential because `ProjectCommandCenter.tsx` is a shared touchpoint. Where true parallel work is possible it is called out explicitly.

---

## Goals

1. Remove every button, badge, and indicator that gives no decision-making value.
2. Introduce per-project job role assignments so the Commission page knows who worked on a project and in what capacity. The owner sees and edits everything by virtue of the `is_owner` flag — no permission-editing UI is built.
3. Give the Finance and Commission pages layouts that match how the owner thinks about money.
4. Add background jobs so AI work and audio transcription do not block the browser.
5. Make all copy understandable to someone who has never used project management software.

---

## Scope Boundary

IN:
- `apps/web/src/components/admin/` — all admin components listed in Phase 10
- `apps/api/src/` — routes, services, schema, migrations for new/changed data
- `apps/web/src/hooks/useRoles.ts` — real implementation replacing stub
- `apps/web/src/App.tsx` — global background-job widget mount

OUT:
- Permission-editing UI or capability management screens — cut entirely. No UI for assigning system roles to people.
- Client hub (`/hub`) unless a shared API contract forces a change
- Authentication flow (login, session, refresh)
- Plaud API keys and poll logic (config stays env-only; Phase 6 only removes UI inputs)
- Email/notification delivery

---

## Phase Sequence and Dependency Graph

```
Phase 1 — Projects list cleanup
  |
Phase 2 — Project job roles                 <── shared source of truth for Phase 8
  |
Phase 3 — Project overview layout + header
  |
Phase 4 — Deliverables inside project + tab renames
  |
Phase 5 — Contracts + contract file AI review
  |
Phase 6 — Background jobs + Generate Draft + Upload recording
  |                   (6a infra must land before 6b and 6c)
Phase 7 — Finance tab inside project        <── shared components for Phase 9
  |
Phase 8 — Commission and Expenses rework    <── uses Phase 2 assignment data
  |
Phase 9 — Main Finance page                 <── consumes Phase 7 components
  |
Phase 10 — Plain-language pass
```

Phases 2 and 8 share `project_role_assignment` data.
Phases 7 and 9 share the same invoice/recurring/commission/expense components.
Phase 6a (background job infra) must be deployed before 6b and 6c.
Phases 1–5 touch `ProjectCommandCenter.tsx` — their edits must follow this order:
  Phase 1 edits `AdminProjects.tsx` only. Phase 2 adds new table + new panel.
  Phase 3 restructures Overview tab. Phase 4 restructures Deliverables + Dev tabs.
  Phase 5 restructures Contracts tab. Phase 6 adds Sign-off and Meetings work.

---

## Database Migration Plan

All migrations are hand-written SQL in `apps/api/migrations/`. The drizzle-kit config at `apps/api/drizzle.config.ts` points at `src/db/migrations` for schema generation but the applied-migration-probe in `docs/deploy/` confirms the `apps/api/migrations/` numbered sequence is what actually runs on the database. Use that sequence. Next number is 025.

| Number | File | Phase | Purpose |
|--------|------|-------|---------|
| 025 | `025_project_role_assignment.sql` | 2 | New `project_role_assignment` table; partial unique index for Referral |
| 026 | `026_owner_flag.sql` | 2 | `is_owner boolean NOT NULL DEFAULT false` column on `user`; one-time update for admin@advo.ph |
| 027 | `027_contract_files.sql` | 5 | `contract_file` table (project_id, file_url, file_name, mime_type, status, ai_review_text, ai_reviewed_at) |
| 028 | `028_background_job.sql` | 6a | `background_job` table (job_id, job_type, project_id, status, title, steps jsonb, result jsonb, error, created_by, created_at, started_at, finished_at) |
| 029 | `029_meeting_recording.sql` | 6c | `meeting_recording` table (recording_id, meeting_id, file_url, file_name, mime_type, transcript text, job_id FK, created_at) |
| 030 | `030_commission_defaults_and_roles.sql` | 8 | ALTER commission_plan defaults (developer 5500, staff 3500, company 1000); drop `idx_commission_share_assistant_dev` unique index; add `creatives_developer` to app-validated role list (no DB enum change needed — role is varchar); update DEFAULT_BPS in service |
| 031 | `031_invoice_file.sql` | 7 | `invoice_file` table (invoice_file_id, project_id, file_url, file_name, file_number int, billing_month varchar, total_cents int, phase_status, paid_status, created_at) |
| 032 | `032_expense_remove_receipt_reimbursable.sql` | 8 | Remove `receipt_url` from `expense`; add `expense_type` varchar (Development Expenses | General Expenses); add `expense_paid_status` varchar (Paid | Unpaid) |
| 033 | `033_project_tier_assignment.sql` | 8 | `project_tier_assignment` table for assistant/creatives developer tier picks per commission_share_id |

**Total new migrations: 025–033 (9 migrations)**

Phase 2 uses migrations 025 and 026 only. No other migrations belong to Phase 2.

---

## New npm Dependencies

| Package | Side | Phase | Justification |
|---------|------|-------|---------------|
| `pdf-parse` (Node.js) | API | 7 | Read invoice total from uploaded PDF. No alternative without a paid OCR service. Pin to `^1.1.1`. |
| `mammoth` (Node.js) | API | 5 | Convert Word docx to plain text for AI contract review. Required because Word uploads are new. Pin to `^1.8.0`. |
| `openai` (Node.js) | API | 6c | Whisper API for audio transcription of mp3/m4a meeting recordings. **OPEN ITEM:** confirm OPENAI_API_KEY is available in env before Phase 6 EXECUTE. If not available, the Transcribe button must show "Coming soon" and the job must fail gracefully. No other speech-to-text library ships with the Anthropic SDK. |
| `@radix-ui/react-popover` | Web | 2 | Grid-style assign popup. Already possibly installed — verify before adding. |
| `@radix-ui/react-calendar` or `react-day-picker` | Web | 7 | Billing date picker in recurring invoice popup. Verify existing installs first. |

---

## ProjectCommandCenter.tsx Edit Order (Phase Lock)

Because nearly every phase touches this file, each phase's edits must be applied in phase order and must not overlap. The following is the canonical edit sequence:

| Phase | What changes in ProjectCommandCenter.tsx |
|-------|------------------------------------------|
| 2 | People list panel (Overview tab, 348–412); ProjectAssignDialog component wired to existing Assign button |
| 3 | Header buttons (remove Show Client Now, add Edit/Delete); Overview tab layout (two-column) |
| 4 | Deliverables tab (full CRUD component); Dev tab rename to "Website"; repo input in-tab; Show Client Now card rename |
| 5 | Contracts tab (remove paste panel; add file upload list) |
| 6 | Sign-off tab (Generate Draft button); Meetings tab (Upload recording button; recording list) |
| 7 | Finance tab (new layout: invoices, recurring, commission, expenses) |
| 8 | Commission panel inside Finance tab (updated split UI) |

---

## Shared Component Strategy

**Deliverables CRUD (Phases 4 and the standalone Deliverables page):** Extract a shared `<DeliverablesPanel projectId={number} hideProjectColumn={boolean} />` component at `apps/web/src/components/admin/shared/DeliverablesPanel.tsx`. Use it in both `AdminSchedule.tsx` and the project Deliverables tab. This avoids copy-paste and keeps bug fixes in one place.

**Finance panels (Phases 7 and 9):** Extract shared components at `apps/web/src/components/admin/shared/finance/`:
- `ProjectInvoicesPanel.tsx` — left column, single project
- `RecurringInvoicesPanel.tsx` — right column
- `CommissionPanel.tsx` — bottom-left
- `ExpensesPanel.tsx` — bottom-right
- `FinanceStatCards.tsx` — the 4-stat header row

Phase 7 wires these to a single `projectId`. Phase 9 wraps them in a project-grouped layout that renders one accordion/section per project.

**File view popup (all phases):** A single `<FileViewerDialog url file_name onDelete onClose />` component at `apps/web/src/components/admin/shared/FileViewerDialog.tsx`. Used by contract files (Phase 5), invoice files (Phase 7), and recording uploads (Phase 6c).

---

## Top 5 Risks

### Risk 1 — Commission percentage change touching finalized plans (Phase 8)
**Severity: HIGH.** Changing `DEFAULT_BPS` in code and migration 030 changes defaults for new plans only because the CHECK constraints enforce snapshotted columns per plan. However, the UI must never recompute amounts from the new defaults for a plan whose `finalized_at IS NOT NULL`. Verify in EXECUTE that the allocation service reads from `commission_plan.*_bps` columns, not constants. Mitigation: migration 030 only alters the DEFAULT value of the BPS columns and the constant in `commission.service.ts`. Existing finalized rows are not touched.

### Risk 2 — Money visibility silently failing open (Phase 8)
**Severity: HIGH.** The Phase 8 commission endpoint must return amounts only to participants who share the same project job role as the row being viewed, and return everything to the owner. This filtering is driven by `project_role_assignment` data from migration 025. If Phase 2 EXECUTE completes but migration 025 is not applied to the dev database before Phase 8 begins, the visibility query will return no role matches and may silently return all amounts to everyone. Mitigation: Phase 2 verification step explicitly confirms migration 025 is applied and that a user with no project assignment receives a 403 from `GET /api/projects/:id/members`. Phase 8 must not begin until Phase 2 is fully verified.

Note: there is no permission-editing UI and no system-role assignment endpoint in this program. The existing `requireAdmin` / `requireTeam` guards are unchanged. The only role-based API enforcement added is the Phase 8 money visibility check and the Phase 2 `GET /api/projects/:id/members` access check.

### Risk 3 — Background job runner crash and re-queue (Phase 6a)
**Severity: MEDIUM.** The in-process runner (started from `index.ts` same as plaud-poll) will lose in-flight jobs on server restart. The crash-recovery sweep re-queues jobs stuck in `running` at boot. This means a job can run twice if it was halfway done when the process died. Mitigation: all job handlers must be idempotent; write partial results to `steps` jsonb so the UI shows what completed; document that the runner is best-effort and not a guarantee.

### Risk 4 — Local disk file storage (all file upload phases)
**Severity: MEDIUM.** Files land at `env().UPLOAD_DIR` on local disk. There is no S3 or cloud storage. On a restart or deploy the upload directory must persist. Plan note: all file upload paths must use the existing `POST /api/files/upload` route and the existing static serve middleware. No new storage abstraction is introduced. Flag for the owner that disk storage is not suitable for production scale without a volume mount or object storage migration.

### Risk 5 — No speech-to-text service in repo (Phase 6c)
**Severity: MEDIUM.** There is no Whisper, Google STT, or any speech-to-text library installed. Phase 6c adds `openai` package for Whisper. This requires `OPENAI_API_KEY` in env. If the key is not present, the Transcribe background job must fail with a user-readable error "Transcription is not configured on this server" rather than a generic 500. This is an open item that must be confirmed before Phase 6 EXECUTE begins.

---

## Parallel Execution Notes

- Phases 1 through 10 should run sequentially to avoid merge conflicts in `ProjectCommandCenter.tsx`.
- The only safe parallel pair is Phase 10 (plain-language pass) beginning its research/rename-table work while Phase 9 EXECUTE is still running — but Phase 10 must not write any component files until Phase 9 is merged.
- Phase 6a (background job table + runner) can be database-migrated in parallel with Phase 5 if the dev database is available, but the API code and UI code for 6b/6c must wait for 6a to be complete and verified.

---

## Verification Strategy (Program Level)

- Each phase plan contains its own verification checklist.
- The existing vitest suite (`apps/web/src/test/`, 516 tests) must pass after each phase. Run `pnpm test --filter web` before marking a phase done.
- After Phase 2, confirm that a user with no project assignment receives 403 from `GET /api/projects/:id/members`, and that `GET /api/auth/me` returns `isOwner: true` for admin@advo.ph.
- After Phase 8, confirm a commission plan with `finalized_at IS NOT NULL` cannot have its BPS columns updated via the API. Confirm a team member not on the project cannot see any amount figures in the commission endpoint response.
- After Phase 10, a plain-language audit table must be reviewed by the owner before the phase is marked complete.

---

## Plan Files

| Phase | File |
|-------|------|
| Umbrella | `process/features/admin-simplify/active/admin-simplify_UMBRELLA_02-09-26.md` |
| Phase 1 | `process/features/admin-simplify/active/phase-01_projects-list_02-09-26.md` |
| Phase 2 | `process/features/admin-simplify/active/phase-02_project-job-roles_02-09-26.md` |
| Phase 3 | `process/features/admin-simplify/active/phase-03_overview-layout_02-09-26.md` |
| Phase 4 | `process/features/admin-simplify/active/phase-04_deliverables-tabs_02-09-26.md` |
| Phase 5 | `process/features/admin-simplify/active/phase-05_contracts_02-09-26.md` |
| Phase 6 | `process/features/admin-simplify/active/phase-06_background-jobs_02-09-26.md` |
| Phase 7 | `process/features/admin-simplify/active/phase-07_finance-tab_02-09-26.md` |
| Phase 8 | `process/features/admin-simplify/active/phase-08_commission-expenses_02-09-26.md` |
| Phase 9 | `process/features/admin-simplify/active/phase-09_main-finance_02-09-26.md` |
| Phase 10 | `process/features/admin-simplify/active/phase-10_plain-language_02-09-26.md` |

---

## Resume and Execution Handoff

The active plan for EXECUTE is always the individual phase file, not this umbrella.
Pass the phase file path explicitly to vc-execute-agent. Do not let it infer which phase to run.
When one phase is complete, archive it to `process/features/admin-simplify/completed/` before starting the next.
Current phase to execute first: **Phase 1** — `process/features/admin-simplify/active/phase-01_projects-list_02-09-26.md`
