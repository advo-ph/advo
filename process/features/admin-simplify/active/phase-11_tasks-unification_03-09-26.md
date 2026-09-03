# Phase 11 — Tasks Unification
**Program:** admin-simplify
**Date:** 03-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phases 1–10 may be in any state; this phase touches no file that Phases 1–10 own exclusively, with one exception: `AdminSidebar.tsx` is touched by Phase 10 (plain-language pass). If Phase 10 is in flight, coordinate the sidebar edit. All other files are safe to edit independently.
**Blocks:** Nothing — this is a standalone consolidation.

---

## Goal

Collapse the two parallel task systems (the `task` table + `AdminTasks.tsx` kanban + `useTasks` hook) and the `deliverable` table + `AdminSchedule.tsx` list into one. After this phase:

- The `task` table and every file that exclusively serves it are deleted.
- `AdminTasks.tsx` becomes the primary task surface, rewritten to read/write the `deliverable` table.
- `AdminSchedule.tsx` (the "Work Items" nav item) is hidden from the sidebar; its route still renders `DeliverablesPanel` inside `ProjectCommandCenter.tsx` without change.
- `deliverable_status` has exactly four values: `todo | ongoing | review | finished`.
- The Tasks kanban has four columns matching those values.
- The card is redesigned for clarity: title on its own line, description clipped below it, project name as a small label, assignee name only (no role), a compact four-way status select in the card footer (replaces the old one-way advance button).
- A "My Tasks / All Tasks" toggle replaces the per-person member filter.
- The StatStrip at the top of `AdminTasks.tsx` is deleted.
- An "Add Task" dialog gains a row of hardcoded quick-pick template buttons that pre-fill the title field.

---

## Decision 1 — Exact Enum Values

**Chosen values:** `todo | ongoing | review | finished`

**Rationale:**

The existing `deliverable_status` enum is `not_started | in_progress | review | completed | blocked`. Postgres cannot `DROP VALUE` from a live enum. Two mechanisms exist:

- **Option A (RENAME only):** `ALTER TYPE deliverable_status RENAME VALUE 'not_started' TO 'todo'`, repeat for `in_progress→ongoing` and `completed→finished`. This leaves `blocked` as a dead enum label forever — Postgres has no way to remove it once rows have ever used it (even if zero rows have that value today). The label persists in `pg_enum` and in any `enum_range()` call, causing future schema readers to see a five-value enum that the application only uses four of. A dead label in a live type is a maintenance trap.

- **Option B (CREATE NEW / BACKFILL / SWAP):** Create a new enum `deliverable_status_new` with exactly the four values, backfill all rows to the new values, use `ALTER COLUMN TYPE ... USING` to swap the column to the new type, drop the old enum, rename the new one. This produces a clean four-value type with no dead labels. The column has a `DEFAULT` that must be dropped before the `ALTER COLUMN TYPE` and re-added after.

**Decision: Option B.** The extra SQL complexity is a one-time cost. The resulting schema is clean, matches the application's four-value mental model exactly, and does not leave garbage in `pg_enum`. Verified against all known Postgres 15+ behavior: `ALTER TYPE ... RENAME VALUE` exists and works, but DROP VALUE does not. Option B is the only path to a clean outcome.

**Mapping (old → new):**

| Old value | New value | Rows expected |
|-----------|-----------|---------------|
| `not_started` | `todo` | many |
| `in_progress` | `ongoing` | some |
| `review` | `review` | some (unchanged) |
| `completed` | `finished` | many |
| `blocked` | `ongoing` | verify count before running (see verification query below) |

`blocked → ongoing` is the only lossy remap. `blocked` exists in the enum but the team has confirmed the task table has zero rows. The deliverable table may have `blocked` rows — the verification query below reveals the count. Any `blocked` deliverable becomes `ongoing` because it is active work that is stuck, which is closer to "ongoing" than any other of the four values.

---

## Decision 2 — Advancement Rule

**No assignee-only advancement restriction on the deliverable kanban.**

The `task.routes.ts` implemented `POST /:id/advance` with an assignee-only guard. The deliverable table has never had this restriction: `PATCH /api/deliverables/:id` accepts a `status` from any authenticated team member. The kanban will not re-introduce the restriction. Reasons:

1. The admin is the primary user of this screen and needs to move any card freely.
2. The restriction created the "Assign this task before it can be started" UX friction that was a source of confusion.
3. `DeliverablesPanel` inside `ProjectCommandCenter.tsx` also writes status freely; consistency matters.

Status changes on the Tasks kanban use the same `PATCH /api/deliverables/:id` + `updateStatus` path that `DeliverablesPanel` already uses. No new endpoint is needed.

---

## Decision 3 — Priority and verifiedAt

`priority` and `verified_at` columns stay on the `deliverable` table — they are written by `DeliverablesPanel` inside `ProjectCommandCenter.tsx` and must not be removed.

The Tasks kanban (`AdminTasks.tsx` rewrite) does **not** show `priority` or `verified_at`. Those fields are project-management detail surfaced inside the project context, not the quick daily-driver kanban view. The kanban form omits both fields on create/edit. On save, `priority` defaults to `0` (the column default) and `verified_at` stays null. This is safe because `DeliverablesPanel` continues to manage both fields for project-scoped work.

---

## Verification Query (run before migration)

Run this against the `advo_dev` database and record the output before applying the migration:

```sql
SELECT status, COUNT(*) AS row_count
FROM deliverable
GROUP BY status
ORDER BY status;
```

If `blocked` returns a nonzero count, note the number. Those rows will be remapped to `ongoing`. If the count is zero, the remap is a no-op but is still written into the migration for correctness.

Also run against the task table:

```sql
SELECT COUNT(*) AS task_row_count FROM task;
```

Expected: 0. If nonzero, surface to the user before proceeding — those rows are lost when the table is dropped.

---

## Migration 034 — Full SQL

File: `apps/api/migrations/034_tasks_unification.sql`

```sql
-- ============================================================
-- 034_tasks_unification.sql
-- Collapse deliverable_status to 4 values; drop task system.
-- ============================================================

BEGIN;

-- ── Step 1: Drop the task table (zero rows expected; see pre-flight query) ──
DROP TABLE IF EXISTS task;

-- ── Step 2: Drop the task_status type ────────────────────────────────────────
DROP TYPE IF EXISTS task_status;

-- ── Step 3: Remove the DEFAULT from deliverable.status so ALTER COLUMN TYPE
--    can proceed. Postgres refuses to change the type of a column that has a
--    default referencing the old enum.
ALTER TABLE deliverable ALTER COLUMN status DROP DEFAULT;

-- ── Step 4: Create the clean four-value enum ─────────────────────────────────
CREATE TYPE deliverable_status_new AS ENUM (
  'todo',
  'ongoing',
  'review',
  'finished'
);

-- ── Step 5: Backfill rows to new values, still using old column type ──────────
UPDATE deliverable SET status = 'todo'::text     WHERE status::text = 'not_started';
UPDATE deliverable SET status = 'ongoing'::text  WHERE status::text = 'in_progress';
UPDATE deliverable SET status = 'ongoing'::text  WHERE status::text = 'blocked';
-- 'review' maps to 'review' — no UPDATE needed.
UPDATE deliverable SET status = 'finished'::text WHERE status::text = 'completed';

-- ── Step 6: Swap the column type ─────────────────────────────────────────────
ALTER TABLE deliverable
  ALTER COLUMN status TYPE deliverable_status_new
  USING status::text::deliverable_status_new;

-- ── Step 7: Restore the column default ───────────────────────────────────────
ALTER TABLE deliverable
  ALTER COLUMN status SET DEFAULT 'todo'::deliverable_status_new;

-- ── Step 8: Drop the old enum and rename the new one ─────────────────────────
DROP TYPE deliverable_status;
ALTER TYPE deliverable_status_new RENAME TO deliverable_status;

-- ── Step 9: Ledger entry ──────────────────────────────────────────────────────
INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('034_tasks_unification.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

**Apply manually:** `psql -d advo_dev -f apps/api/migrations/034_tasks_unification.sql`

Verify after applying:
```sql
SELECT enum_range(NULL::deliverable_status);
-- Expected: {todo,ongoing,review,finished}

SELECT COUNT(*) FROM deliverable WHERE status NOT IN ('todo','ongoing','review','finished');
-- Expected: 0

SELECT to_regtype('task_status');
-- Expected: NULL (type is gone)

SELECT to_regclass('task');
-- Expected: NULL (table is gone)
```

---

## Ordered, Atomic Step List

### Group A — Migration SQL

**A1.** Run the pre-flight verification query. Record counts. Confirm `task` table has 0 rows.
**A2.** Apply `034_tasks_unification.sql` to `advo_dev`.
**A3.** Run the four post-migration verification queries above.

### Group B — schema.ts

**B1.** In `apps/api/src/db/schema.ts` line 32–38: replace the `deliverableStatusEnum` values array from `["not_started","in_progress","review","completed","blocked"]` to `["todo","ongoing","review","finished"]`.
**B2.** In `apps/api/src/db/schema.ts` line 302: change the column default from `"not_started"` to `"todo"`.
**B3.** Delete the `taskStatusEnum` definition (lines 45–49) from `schema.ts`.
**B4.** Delete the entire `task` table definition (lines 329–357) from `schema.ts`.

### Group C — API status literals

**C1.** `apps/api/src/routes/deliverables.routes.ts` line 161: change `ne(status, "completed")` to `ne(deliverable.status, "finished")`. (The `upcoming` route filters out finished deliverables.)
**C2.** `apps/api/src/routes/deliverables.routes.ts` lines 185: update the Zod `createSchema` status enum from `["not_started","in_progress","review","completed","blocked"]` to `["todo","ongoing","review","finished"]`.
**C3.** `apps/api/src/routes/deliverables.routes.ts` line 235: change the `completedAt` branch from `data.status === "completed"` to `data.status === "finished"`. (When status transitions to `finished`, stamp `completedAt`; when transitioning away, clear it.)
**C4.** `apps/api/src/routes/meeting.routes.ts` line 467: change `status: "not_started" as const` to `status: "todo" as const`.
**C5.** `apps/api/src/routes/projects.routes.ts` line 725: change `status: "not_started"` to `status: "todo"`.
**C6.** `apps/api/src/services/project-signoff.service.ts` line 745: change `status: "not_started"` to `status: "todo"`.
**C7.** `apps/api/src/services/timeline-suggestion.service.ts` lines 195–196: change `s !== "completed"` to `s !== "finished"` (wherever the service filters non-completed statuses).
**C8.** `apps/api/src/db/seed.ts` line 211: change `status: "in_progress"` to `status: "ongoing"`.

### Group D — Delete task system

**D1.** Delete `apps/api/src/routes/task.routes.ts` entirely.
**D2.** In `apps/api/src/index.ts`: remove the import of `taskRoutes` (line 29) and remove `app.route("/api/tasks", taskRoutes)` (line 143).
**D3.** Delete `apps/web/src/hooks/useTasks.ts` entirely.

### Group E — Hooks and types

**E1.** In `apps/web/src/hooks/useAdminDeliverables.ts` lines 5–10: replace the `DeliverableStatus` union from `"not_started" | "in_progress" | "review" | "completed" | "blocked"` to `"todo" | "ongoing" | "review" | "finished"`.
**E2.** In `apps/web/src/hooks/useAdminDeliverables.ts` line 50 (the `mapDeliverable` function's status fallback): change `"not_started"` to `"todo"`.
**E3.** Add `viewerTeamMemberId` support to `useAdminDeliverables`: the GET /api/deliverables response must return the viewer's `teamMemberId`. See Group F for the API change. On the client, update `fetchDeliverables` to return `{ deliverables: Deliverable[], viewerTeamMemberId: number | null }` and expose `viewerTeamMemberId` from the hook (mirrors the `useTasks` pattern exactly).
**E4.** In `apps/web/src/hooks/useClientData.ts` lines 7–12: replace `DeliverableStatus` union to `"todo" | "ongoing" | "review" | "finished"`.

### Group F — GET /api/deliverables: add viewerTeamMemberId

**F1.** In `apps/api/src/routes/deliverables.routes.ts`, update the admin branch of `GET /` to also return `viewerTeamMemberId`. For admin callers, look up their own `teamMemberId` (same pattern as the team-member branch: `SELECT team_member_id FROM team_member WHERE user_id = user.userId LIMIT 1`; if not found, return null).

The response shape changes from:
```
{ data: Deliverable[], error: null }
```
to:
```
{ data: { deliverables: Deliverable[], viewerTeamMemberId: number | null }, error: null }
```

All three role branches (admin, client, team) must return this shape. For the client branch, `viewerTeamMemberId` is always `null` (clients are not team members).

**F2.** Update `useAdminDeliverables.fetchDeliverables` to read `res.data.deliverables` and `res.data.viewerTeamMemberId`.

**F3.** Update `apps/web/src/test/api-wiring.test.ts` line 306: the expected response shape for `GET /api/deliverables` is now `{ data: { deliverables: [...], viewerTeamMemberId: ... } }`. Update the assertion.

### Group G — AdminTasks.tsx rewrite

**G1.** Replace the entire content of `apps/web/src/components/admin/AdminTasks.tsx` with the new implementation described in the Card Redesign, Kanban Layout, Toggle, and Template Quick-Picks sections below. Key changes:

- Import `useAdminDeliverables` instead of `useTasks`.
- Remove the `StatStrip` and all four `Stat` components.
- Replace the 3-column mobile picker with a 4-column version (see Kanban Layout section).
- Replace `TaskCard` with the new `DeliverableCard` (see Card Redesign section).
- Replace the per-person member filter with a "My Tasks / All Tasks" toggle (see Toggle section).
- Add template quick-picks to the Add dialog (see Template Quick-Picks section).
- Require project selection on create (project field is mandatory, no "No project" option).
- Remove the assignee `· role` display from the picker and card.
- Replace the old one-way `advanceTask` button with a four-way status `<Select>` in the card footer (Row 5 — see Card Redesign section). The `<Select>` calls `updateStatus(deliverable.deliverable_id, value)` from `useAdminDeliverables`, which is already an optimistic mutation: the card moves columns immediately in the UI without waiting for the server round-trip. Movement in any direction is permitted, including backward (e.g. "For Review" back to "Ongoing"), which is intentional — work can always be kicked back.

**G2.** Remove the `Stat`, `StatStrip` import from the `_ui` import line in `AdminTasks.tsx` (they are no longer used in this file).

### Group H — DeliverablesPanel, client hub, and ProjectCommandCenter literal updates

**H1.** In `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` lines 46–60: update `statusConfig` to the four new values:
```
todo:     { label: "To do",      dot: "bg-muted-foreground" }
ongoing:  { label: "Ongoing",    dot: "bg-blue-500" }
review:   { label: "For Review", dot: "bg-purple-500" }
finished: { label: "Finished",   dot: "bg-green-500" }
```
Remove the `not_started`, `in_progress`, `completed`, `blocked` entries.

**H2.** In `DeliverablesPanel.tsx` lines 54–60: update `STATUS_ORDER` array to `["todo","ongoing","review","finished"]`.

**H3.** In `DeliverablesPanel.tsx` line 89 (the `emptyForm` function): change the `status` default from `"not_started"` to `"todo"`.

**H4.** In `DeliverablesPanel.tsx` line 276 (overdue check): change `deliverable.status !== "completed"` to `deliverable.status !== "finished"`.

**H5.** In `apps/web/src/components/hub/ProjectDashboard.tsx` lines 70–103: update `statusConfig` to the four new values, replacing the five-value map. Match the visual treatment: `todo` gets the current `not_started` muted style, `ongoing` gets the `in_progress` blue, `review` keeps the purple, `finished` gets the `completed` green. The `blocked` red entry is deleted. No new icons need to be added — `Circle`, `Clock`, `AlertCircle`, `CheckCircle2` remain.

**H6.** In `ProjectDashboard.tsx` lines 224–225: change `d.status === "completed"` to `d.status === "finished"` in the `completedDeliverables` filter.

**H7.** In `ProjectDashboard.tsx` line 395: change `d.status !== "completed"` to `d.status !== "finished"` in the overdue check.

**H8.** In `apps/web/src/components/admin/ProjectCommandCenter.tsx` line 605: change `d.status !== "completed"` to `d.status !== "finished"` in the open-tasks stat.

### Group I — Nav changes

**I1.** In `apps/web/src/components/admin/AdminSidebar.tsx` lines 85–127 (`navGroups`): remove the `{ id: "schedule", label: "Work Items", icon: Calendar }` entry from the Operations group. Do not remove the `{ id: "tasks", label: "Tasks", icon: ListChecks }` entry — it stays and is the primary entry.

**I2.** The `AdminSection` type (line 42) retains `"schedule"` as a valid value — `Admin.tsx` still renders `<AdminSchedule />` for it, and `ProjectCommandCenter.tsx` may deep-link to it. Removing it from the nav is the only change needed.

**I3.** In `apps/web/src/pages/Admin.tsx` line 49: change the `SECTION_LABEL` entry for `schedule` from `"Deliverables"` to `"Work Items"` (makes the label consistent with the sidebar if somehow reached directly; not user-visible since the nav item is hidden).

---

## Touchpoint Table

| File | Lines | What changes | Why |
|------|-------|-------------|-----|
| `apps/api/migrations/034_tasks_unification.sql` | new file | Drop `task` table + `task_status` type; migrate `deliverable_status` to 4 values via create-new/backfill/swap | Core schema change |
| `apps/api/src/db/schema.ts` | 32–38 | `deliverableStatusEnum` values → `["todo","ongoing","review","finished"]` | Match new DB enum |
| `apps/api/src/db/schema.ts` | 302 | Column default `"not_started"` → `"todo"` | Match new enum default |
| `apps/api/src/db/schema.ts` | 45–49 | Delete `taskStatusEnum` | Type deleted in DB |
| `apps/api/src/db/schema.ts` | 329–357 | Delete `task` table definition | Table deleted in DB |
| `apps/api/src/routes/deliverables.routes.ts` | 161 | `ne(status,"completed")` → `ne(deliverable.status,"finished")` | Renamed enum value |
| `apps/api/src/routes/deliverables.routes.ts` | 185 | Zod status enum values updated | Renamed enum values |
| `apps/api/src/routes/deliverables.routes.ts` | 235 | `"completed"` → `"finished"` in completedAt branch | Renamed enum value |
| `apps/api/src/routes/deliverables.routes.ts` | GET / (all branches) | Add `viewerTeamMemberId` to response | "My Tasks" toggle needs viewer identity |
| `apps/api/src/routes/task.routes.ts` | entire file | Delete | Task system removed |
| `apps/api/src/routes/meeting.routes.ts` | 467 | `status: "not_started"` → `status: "todo"` | Renamed enum value |
| `apps/api/src/routes/projects.routes.ts` | 725 | `status: "not_started"` → `status: "todo"` | Renamed enum value |
| `apps/api/src/services/project-signoff.service.ts` | 745 | `status: "not_started"` → `status: "todo"` | Renamed enum value |
| `apps/api/src/services/timeline-suggestion.service.ts` | 195–196 | `s !== "completed"` → `s !== "finished"` | Renamed enum value |
| `apps/api/src/db/seed.ts` | 211 | `status: "in_progress"` → `status: "ongoing"` | Renamed enum value |
| `apps/api/src/index.ts` | 29, 143 | Remove taskRoutes import and mount | Task system removed |
| `apps/web/src/hooks/useTasks.ts` | entire file | Delete | Task system removed |
| `apps/web/src/hooks/useAdminDeliverables.ts` | 5–10 | `DeliverableStatus` union → 4 values | Renamed enum values |
| `apps/web/src/hooks/useAdminDeliverables.ts` | 50 | Default fallback `"not_started"` → `"todo"` | Renamed enum value |
| `apps/web/src/hooks/useAdminDeliverables.ts` | fetchDeliverables | Return `{ deliverables, viewerTeamMemberId }` | "My Tasks" toggle |
| `apps/web/src/hooks/useClientData.ts` | 7–12 | `DeliverableStatus` union → 4 values | Renamed enum values |
| `apps/web/src/components/admin/AdminTasks.tsx` | entire file | Full rewrite: deliverable-backed kanban, 4 columns, new card with Row 5 status select, toggle, quick-picks, no StatStrip | Core UI change |
| `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` | 46–60 | `statusConfig` → 4 values | Renamed enum values |
| `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` | 54–60 | `STATUS_ORDER` → 4 values | Renamed enum values |
| `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` | 89 | Default status `"not_started"` → `"todo"` | Renamed enum value |
| `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` | 276 | `!== "completed"` → `!== "finished"` | Renamed enum value |
| `apps/web/src/components/hub/ProjectDashboard.tsx` | 70–103 | `statusConfig` → 4 values; remove `blocked` entry | **HIGHEST RISK — client-facing** |
| `apps/web/src/components/hub/ProjectDashboard.tsx` | 224–225 | `=== "completed"` → `=== "finished"` | Renamed enum value |
| `apps/web/src/components/hub/ProjectDashboard.tsx` | 395 | `!== "completed"` → `!== "finished"` | Renamed enum value |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 605 | `!== "completed"` → `!== "finished"` | Renamed enum value |
| `apps/web/src/components/admin/AdminSidebar.tsx` | 95 | Remove `{ id: "schedule", label: "Work Items", ... }` from nav | Hide Work Items tab |
| `apps/web/src/pages/Admin.tsx` | 49 | `SECTION_LABEL.schedule` → `"Work Items"` (was `"Deliverables"`) | Label consistency |
| `apps/web/src/test/api-wiring.test.ts` | 306 | Update expected response shape for GET /api/deliverables | Response shape changed |

---

## My Tasks / All Tasks Toggle Design

### Problem
`AuthUser` (from `useAuth`) has `userId`, `email`, `role`, `displayName`, `avatarUrl`, and `id` — but no `teamMemberId`. The card must know whether it belongs to the viewer so the toggle can filter "mine". The `task.routes.ts` solved this by piggybacking `viewerTeamMemberId` on the list response; this phase applies the same pattern to `GET /api/deliverables`.

### API change (Group F above)
`GET /api/deliverables` response shape becomes:
```
{
  data: {
    deliverables: Deliverable[],
    viewerTeamMemberId: number | null
  },
  error: null
}
```
- Admin callers: look up `team_member` row for `user.userId`; return `teamMemberId` or null.
- Client callers: always null (clients are not team members).
- Team callers: already look up `tm.teamMemberId` to scope the query; return it.

### Toggle UI
The toggle sits in the `PageHeader` action area of the rewritten `AdminTasks.tsx`, to the left of the "Add task" button.

```
[ My Tasks ][ All Tasks ]   [+ Add task]
```

Implementation: two `<button>` elements styled as a pill toggle, not a `<Select>`. No `SegmentedControl` primitive exists in the codebase; build inline.

Active state: `bg-accent text-accent-foreground rounded-md`
Inactive state: `bg-secondary text-muted-foreground hover:text-foreground rounded-md`
Container: `flex items-center gap-0 rounded-md border border-border overflow-hidden`
Button size: `h-9 px-3 text-sm font-medium`

**Default on load:** "All Tasks". The toggle state is local React state (`useState<"mine" | "all">("all")`).

**Filter logic:**
- "All Tasks": show every deliverable returned by `useAdminDeliverables` (no client-side filter).
- "My Tasks": `deliverables.filter(d => d.assigned_to === viewerTeamMemberId)`. If `viewerTeamMemberId` is null (user is admin but not on the team roster), "My Tasks" returns an empty list with a message "You are not on the team roster."

The filter is applied before the `byStatus` grouping so column counts reflect the filtered set.

**Deleted:** The per-person member filter pill row from `AdminSchedule.tsx` is simply gone because `AdminSchedule.tsx` is hidden. No replacement is needed in the Tasks kanban — the toggle covers the "show mine" use case.

---

## Card Redesign Spec

### Problem with the current card
The current `TaskCard` renders three consecutive lines of same-weight `text-xs text-muted-foreground` text: description, project title, and assignee name + role. They visually collide because there is no visual hierarchy — same size, same color, same weight.

### New `DeliverableCard` layout

```
┌────────────────────────────────────┐
│ Title text                [✎] [🗑] │  ← row 1: title bold sm, icons top-right
│ Optional description text          │  ← row 2: xs muted, line-clamp-2, only if non-empty
│ PROJECT NAME              ← label  │  ← row 3: 10px muted uppercase, truncate
│ ○ Assignee Name                    │  ← row 4: avatar h-5 w-5 + name only, xs medium
│ [To do          ▾]                 │  ← row 5: status select, h-9 phone / h-7 lg, full-width
└────────────────────────────────────┘
```

**Tailwind class specification:**

Outer container:
```
border-b border-border last:border-b-0 px-3 py-3 space-y-1.5
```

Row 1 — title + action icons:
```
<div className="flex items-start gap-2">
  <p className="flex-1 min-w-0 text-sm font-medium leading-snug">
    {deliverable.title}
  </p>
  <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-0.5">
    <button aria-label="Edit" className="h-9 w-9 lg:h-7 lg:w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
      <Pencil className="h-3.5 w-3.5" />
    </button>
    <button aria-label="Delete" className="h-9 w-9 lg:h-7 lg:w-7 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary/60 transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
</div>
```

Row 2 — description (conditional, only rendered when `deliverable.description` is non-empty):
```
{deliverable.description && (
  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
    {deliverable.description}
  </p>
)}
```

Row 3 — project label:
```
<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 truncate">
  {deliverable.project?.title ?? "No project"}
</p>
```

The project label uses `text-[10px] uppercase tracking-wide` to visually distinguish it from the description (which is `text-xs` normal case). This creates a clear hierarchy: **bold title → body description → SMALL CAPS PROJECT → assignee**.

Row 4 — assignee (name only, no role):
```
<div className="flex items-center gap-1.5 min-w-0">
  {deliverable.assignee ? (
    <>
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={deliverable.assignee.avatar_url ?? undefined} />
        <AvatarFallback className="text-[9px]">{getInitials(deliverable.assignee.name)}</AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium truncate">{deliverable.assignee.name}</span>
    </>
  ) : (
    <span className="text-xs text-muted-foreground">Unassigned</span>
  )}
</div>
```

Row 5 — status select (replaces the old one-way advance button):

**Layout decision: its own full-width row below the assignee.** A `justify-between` arrangement on the same row as the assignee was considered and rejected: on a 390px phone, a long assignee name such as "Alexandra Martinez" combined with a visible select trigger would require both to truncate to the point of illegibility. Placing the select on its own row costs one row of vertical space but guarantees both elements always read clearly. The select is intentionally positioned at the card bottom — it is a footer utility control, not a primary content element, so the visual weight is appropriate.

The `updateStatus` mutation in `useAdminDeliverables` is optimistic: when the user picks a new value, the local state updates instantly and the card moves to the new column without waiting for the server. Movement in any direction is permitted, including backward — for example, "For Review" back to "Ongoing". This is intentional. "For Review" implies the work can be kicked back; restricting backward movement would incorrectly imply finality at intermediate states.

```
<Select
  value={deliverable.status}
  onValueChange={(value) =>
    updateStatus(deliverable.deliverable_id, value as KanbanStatus)
  }
>
  <SelectTrigger className="h-9 lg:h-7 w-full text-xs text-muted-foreground border-border">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {DELIVERABLE_STATUS_ORDER.map((s) => (
      <SelectItem key={s} value={s} className="text-xs">
        {STATUS_LABEL[s]}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

The four options in order are: To do / Ongoing / For Review / Finished. These reuse the `STATUS_LABEL` record already defined for the kanban column headers. The trigger is `text-xs text-muted-foreground` so it reads as a supporting footer detail and does not compete with the bold title on row 1.

The one-way `advanceTask` button from the old `TaskCard` is not retained anywhere. It is fully replaced by this four-way select. The endpoint it called (`POST /api/tasks/:id/advance`) is deleted with the task system in Group D.

**Edge cases:**
- **Empty description:** Row 2 is not rendered. The card collapses to 4 rows: title, project, assignee, status select.
- **Long project title:** `truncate` on row 3 clips it. The container is fixed-width by the column panel.
- **Narrow phone (390px viewport):** The card renders in a single visible column (selected by the mobile picker). All text is `text-xs` or smaller; no horizontal overflow occurs because the outer panel has `overflow-hidden`. The `h-9 w-9` touch targets on icon buttons are maintained per house rule. Row 5 uses `h-9` on phone (matching the house rule for touch targets) and shrinks to `h-7` on `lg:` where precise pointer input is available. The full-width select trigger (`w-full`) ensures the tap target spans the card width on narrow viewports.

---

## 4-Column Kanban Layout

### Column order
`["todo", "ongoing", "review", "finished"]`
Labels: `"To do" | "Ongoing" | "For Review" | "Finished"`

### Status labels and config (in AdminTasks.tsx rewrite)
```typescript
export const DELIVERABLE_STATUS_ORDER = ["todo", "ongoing", "review", "finished"] as const;
export type KanbanStatus = typeof DELIVERABLE_STATUS_ORDER[number];

const STATUS_LABEL: Record<KanbanStatus, string> = {
  todo: "To do",
  ongoing: "Ongoing",
  review: "For Review",
  finished: "Finished",
};
```

### Mobile column picker
The existing picker is `grid-cols-3` with `lg:hidden`. With 4 columns, `grid-cols-4` fits 4 buttons on 390px at `text-xs` — each button is ~86px wide, which passes the h-11 touch-target rule vertically. Use `grid-cols-4` (not wrapping), because 4×86px = 344px which fits within a 390px viewport minus horizontal padding.

```
<div className="grid grid-cols-4 gap-1 lg:hidden">
```

Button class (same as current, unchanged):
```
h-11 rounded-md text-xs font-medium transition-colors px-1
```
Active: `bg-accent text-accent-foreground`
Inactive: `bg-secondary text-muted-foreground hover:text-foreground`

### Desktop grid
```
<div className="grid gap-3 lg:grid-cols-4 lg:items-start">
```
(was `lg:grid-cols-3`)

Each column's visibility rule:
```
className={cn("lg:block", visibleList === status ? "block" : "hidden")}
```
(unchanged logic, works for 4 statuses)

Default `visibleList` initial state: `"todo"` (first column).

---

## Template Quick-Picks

### Constant definition
Located at the top of `apps/web/src/components/admin/AdminTasks.tsx`, before the component:

```typescript
const TASK_TEMPLATES: { label: string; title: string }[] = [
  { label: "Proposal",   title: "Proposal Creation" },
  { label: "Sign-off",   title: "Sign-off Creation" },
  { label: "Contract",   title: "Contract Signing" },
  { label: "Onboarding", title: "Client Onboarding" },
  { label: "Discovery",  title: "Discovery Call" },
  { label: "Revisions",  title: "Client Revisions" },
];
```

No database table. No settings screen. No admin-configurable anything. This is a hardcoded constant.

### Interaction
The quick-pick row appears inside the Add Task dialog, between the "Title" label and the title `<Input>`:

```
<label className="text-xs text-muted-foreground">Title</label>
<div className="flex flex-wrap gap-1.5">
  {TASK_TEMPLATES.map((t) => (
    <button
      key={t.label}
      type="button"
      onClick={() => setForm({ ...form, title: t.title })}
      className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      {t.label}
    </button>
  ))}
</div>
<Input value={form.title} onChange={...} placeholder="What needs doing" />
```

Clicking a quick-pick sets `form.title` to the full title string. The user can then edit the `<Input>` to customise it. There is no "selected" highlight on the button — it is a one-shot fill action, not a persistent mode.

Quick-picks only appear in the Add dialog (when `editing` is null). They are hidden in the Edit dialog.

---

## Assignee Picker — Name Only

In the Add/Edit dialog, the assignee `<Select>`:

```tsx
{activeMembers.map((m) => (
  <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
    {m.name}
  </SelectItem>
))}
```

No `· {m.role}` suffix. The `role` field is present on the team member object but is intentionally not rendered. This applies to both the kanban card (Row 4 above) and the dialog picker.

---

## Project Field — Required on Create

The Add Task dialog must require a project. Remove the "No project" sentinel option. If `projects` is empty (no projects exist), show the select disabled with placeholder "No projects yet". Validation: `handleSave` returns early and shows a toast if `form.project_id` is empty (same pattern as `DeliverablesPanel.handleSave` lines 185–193).

The project `<Select>` is always visible in the Add/Edit dialog in `AdminTasks.tsx` — there is no `hideProjectColumn` prop here. The kanban is not project-scoped, so the project field is always required and always shown.

---

## Public Contracts

### Changed
`GET /api/deliverables` response shape (all callers must update):
```
Before: { data: Deliverable[], error: null }
After:  { data: { deliverables: Deliverable[], viewerTeamMemberId: number | null }, error: null }
```

### Removed
- `GET /api/tasks` — deleted
- `POST /api/tasks` — deleted
- `PATCH /api/tasks/:id` — deleted
- `DELETE /api/tasks/:id` — deleted
- `POST /api/tasks/:id/advance` — deleted

### Unchanged
- `GET /api/deliverables/upcoming` — shape unchanged
- `POST /api/deliverables` — shape unchanged
- `PATCH /api/deliverables/:id` — shape unchanged
- `DELETE /api/deliverables/:id` — shape unchanged

---

## Blast Radius

### HIGHEST RISK — Client-facing progress tracker
**`apps/web/src/components/hub/ProjectDashboard.tsx` lines 224–225 and 377–379.**

This is the progress bar and completion counter that clients see in the client hub. It filters `d.status === "completed"` to count done deliverables. After this phase, every deliverable that was `completed` in the database becomes `finished`. If this file is not updated in sync with the migration, the progress bar reads 0% for all projects until the file is deployed. This is the highest-regression-risk touchpoint.

**Mitigation:** Steps H5, H6, H7 must be executed in the same deployment as the migration. Do not apply the migration without deploying the web changes in the same release.

### HIGH RISK — DeliverablesPanel (used inside ProjectCommandCenter)
`DeliverablesPanel.tsx` renders status via `statusConfig` and filters overdue via `!== "completed"`. If the config is not updated, all deliverables will show "Unknown status" badges and the overdue check will never fire. Steps H1–H4 are required.

### MEDIUM RISK — Upcoming deadlines widget
`GET /api/deliverables/upcoming` (step C1) filters `ne(status, "completed")`. If not updated, finished deliverables will continue to appear in the upcoming widget indefinitely.

### LOW RISK — API wiring tests
`apps/web/src/test/api-wiring.test.ts` line 306 asserts on the shape of `GET /api/deliverables`. The response shape change (Group F) will cause this test to fail if not updated (step F3).

### LOW RISK — calendar-scheduling.test.ts
`apps/web/src/test/calendar-scheduling.test.ts` lines 171–232 cover `/api/deliverables/upcoming`. The status filter change (C1) may affect fixture data if any fixture uses `status: "completed"`. Verify test fixtures and update any hardcoded status strings to `"finished"`.

### NO RISK — meeting-task.service.ts, MeetingTaskPreview.tsx, revision-task.service.ts
These files use the word "task" locally but write to the `deliverable` table. They are not deleted. They set `status: "not_started"` — covered by steps C4, C6.

---

## Rollback Plan

The migration is the irreversible step. Everything else is file-level.

**If the migration has NOT been applied:**
Discard all file changes. No database state has changed.

**If the migration HAS been applied and a rollback is needed:**
There is no automatic reverse. The following manual steps restore the schema:

1. Create `deliverable_status_old` enum with the original 5 values.
2. Add a `DEFAULT` to the column pointing to `deliverable_status_old`.
3. `UPDATE deliverable SET status = 'not_started' WHERE status = 'todo'`, and so on for each value.
4. `ALTER COLUMN TYPE` back to `deliverable_status_old`.
5. Drop `deliverable_status`, rename `deliverable_status_old` to `deliverable_status`.
6. Recreate `task_status` enum.
7. Recreate `task` table (DDL from 023_task.sql).

**Practical note:** Because the `task` table had zero rows at the time of migration, the data loss from dropping it is zero. The schema DDL to recreate it is preserved in `023_task.sql`. The row data loss on the `deliverable` table is limited to the `blocked→ongoing` remap, which is lossy but acceptable per user decision.

**Recommended rollback action for a web-only bug:** revert the web files only and keep the database as-is. The API and schema are the ground truth; the web can be rolled back independently.

---

## Verification Evidence

### TypeScript / build

```bash
# From repo root
pnpm --filter api tsc --noEmit
pnpm --filter web tsc --noEmit
pnpm --filter web build
```

All three must complete with zero errors.

### Automated tests

```bash
# Full web test suite (must stay at 516 passing, 0 failing)
pnpm --filter web test

# Specifically the two affected test files
pnpm --filter web test api-wiring.test.ts
pnpm --filter web test calendar-scheduling.test.ts
```

Expected: all pass. If `api-wiring.test.ts` fails on the deliverables response shape, step F3 was not applied. If `calendar-scheduling.test.ts` fails, update fixture status strings from `"completed"` to `"finished"`.

### Database verification (post-migration)

```sql
-- Clean enum
SELECT enum_range(NULL::deliverable_status);
-- Expected: {todo,ongoing,review,finished}

-- No orphaned rows
SELECT COUNT(*) FROM deliverable WHERE status NOT IN ('todo','ongoing','review','finished');
-- Expected: 0

-- Task system gone
SELECT to_regtype('task_status');    -- Expected: NULL
SELECT to_regclass('task');          -- Expected: NULL
```

### Manual browser checks

1. Navigate to `/admin/tasks`. Confirm:
   - No StatStrip at the top.
   - Four kanban columns: "To do", "Ongoing", "For Review", "Finished".
   - On a 390px-wide viewport, the mobile column picker shows 4 buttons in a row, all tappable.
   - "My Tasks / All Tasks" toggle appears next to the "Add task" button.
   - Toggle defaults to "All Tasks".
   - Switching to "My Tasks" filters cards to those assigned to the current user.

2. Click "Add task". Confirm:
   - Quick-pick buttons appear above the title field.
   - Clicking "Proposal" fills the title input with "Proposal Creation".
   - Assignee picker shows name only, no role suffix.
   - Project field is required; saving without a project shows a toast.
   - Saving with all fields creates a card in the "To do" column.

3. Confirm a card:
   - Shows title in bold on its own line.
   - Shows description clipped to 2 lines, or absent if empty.
   - Shows project name in small-caps muted label.
   - Shows assignee avatar + name only (no role text).
   - Shows a status select in the card footer (Row 5), currently reflecting the card's column.
   - No old one-way advance button is present anywhere on the card.
   - Edit and delete icon buttons are h-9 on phone (touch-reachable).
   - The status select trigger is h-9 on phone and h-7 on desktop.
   - Change a card's status forward: e.g. set a "To do" card to "Ongoing". Confirm the card moves to the "Ongoing" column immediately (optimistic update) and the column count badges update.
   - Change a card's status backward: set a "For Review" card back to "Ongoing". Confirm the card moves to "Ongoing" immediately. This backward movement must work — it is intentional.
   - Change a card's status from "Finished" all the way back to "Ongoing" in one select action. Confirm the card appears in the "Ongoing" column and the "Finished" column count decrements.
   - Reload the page after each status change and confirm the card remains in the column matching the last-set status (server round-trip persisted).

4. Navigate to a project via Projects → open project → Deliverables tab. Confirm:
   - `DeliverablesPanel` renders the four-value status dropdown (To do / Ongoing / For Review / Finished).
   - Creating a deliverable inside the project tab pre-selects the project and still works.

5. Log in as a client in the hub. Open a project. Confirm:
   - The Deliverables tracker shows the correct count and the progress bar reflects `finished` deliverables.
   - No "Blocked" status appears anywhere in the UI.

6. Confirm `/admin/schedule` (Work Items) is no longer in the sidebar but is still reachable by direct URL. Confirm `DeliverablesPanel` still renders correctly at that route.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent:
`process/features/admin-simplify/active/phase-11_tasks-unification_03-09-26.md`

Execute in group order: A → B → C → D → E → F → G → H → I.

The migration (Group A) must be applied to the database before the TypeScript compiler will accept the new enum values in schema.ts. Apply A before B.

Groups C through I are web/API file edits that can proceed after the schema is updated (B complete). Groups C and D are API-side and should be done before Groups E–I which are web-side, to keep the client and server in sync through any intermediate build.

The highest-risk touchpoint (`ProjectDashboard.tsx`) is in Group H. Do not deploy the migration without also deploying Group H in the same release.

Archive this file to `process/features/admin-simplify/completed/` when all verification checks pass.

There is no "next phase" defined in the current umbrella. If the user defines Phase 12, create a new phase plan at that time.
