# Phase 4 — Deliverables Inside the Project, Tab Renames
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 3 complete
**Blocks:** Phase 5 (Contracts tab work begins; tabs array must be stable)

---

## Goal

Give the project Deliverables tab full CRUD instead of the current read-only empty state. Rename the "Dev & Deploy" tab to "Website". Rename the "Show Client Now" card inside that tab to "Website". Move the GitHub repo paste-and-save input into the Website tab, removing the instruction "Add one in project settings." Extract a shared `DeliverablesPanel` component to avoid copy-paste between this tab and `AdminSchedule.tsx`.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 95–104 (TABS const) | Rename "Dev & Deploy" tab label |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 415–442 (Deliverables tab) | Replace read-only empty state with `<DeliverablesPanel>` |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 532–623 (Dev tab, now Website) | Repo input; rename "Show Client Now" card; adjust tab value reference |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 533–559 (Repository panel) | Add editable repo URL input with save button |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 556 | Remove text "No GitHub repo linked. Add one in project settings." |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 561–623 ("Show Client Now" card) | Rename card heading to "Website" |
| `apps/web/src/components/admin/AdminSchedule.tsx` | entire file | Replace deliverables table with `<DeliverablesPanel hideProjectColumn>` |
| `apps/web/src/components/admin/shared/DeliverablesPanel.tsx` | new | Shared deliverables CRUD component |
| `apps/api/src/routes/projects.routes.ts` | new endpoint | `PATCH /api/projects/:id/repository` |

---

## Blast Radius

- `ProjectCommandCenter.tsx`: Deliverables tab, Dev tab (now Website tab), and TABS const change.
- `AdminSchedule.tsx`: refactored to use shared component. The page itself (the sidebar item labelled "Deliverables") remains. The shared component replaces the inline table/dialog code.
- New shared component: `apps/web/src/components/admin/shared/DeliverablesPanel.tsx`.
- One new API endpoint for saving the repo name in-tab.
- No schema changes. No new migrations.

---

## Shared Component Decision: Extract vs Copy

**Decision: Extract a shared component.** Rationale: the Deliverables CRUD in `AdminSchedule.tsx` (lines 385–518 dialog, 244–252 table cols) and the new project tab need identical mutations (`POST/PATCH/DELETE /api/deliverables`). A bug fix in one place must fix both. Copy-paste would create two diverging code paths.

The shared component is `apps/web/src/components/admin/shared/DeliverablesPanel.tsx`.

---

## DeliverablesPanel Component Spec

Props:
```
projectId: number          -- required; used as default on create and as query filter
hideProjectColumn: boolean -- when true, the "Project" column is not rendered and the
                             project field on the create form is pre-filled and hidden
```

Internal state: dialog open/closed, form values, selected deliverable for edit/delete.

Data: `GET /api/deliverables?projectId={projectId}` — same query `AdminSchedule.tsx` already uses.

Table columns when `hideProjectColumn=false` (in AdminSchedule): Status, Title, Assigned to, Due date, Project, Actions.
Table columns when `hideProjectColumn=true` (in project tab): Status, Title, Assigned to, Due date, Actions.

Dialog (add/edit): Title, Description, Assigned to (team member picker), Due date, Status. Project field: pre-filled with `projectId`, hidden when `hideProjectColumn=true`.

Status change: click the status cell to cycle or pick from a dropdown — same interaction as the existing `AdminSchedule.tsx` implementation.

Verify action: existing verified_at toggle — keep same logic.

Delete: use `<ConfirmDeleteDialog>` (already exists).

---

## Step-by-Step Changes

### Step 1 — Extract DeliverablesPanel
Create `apps/web/src/components/admin/shared/DeliverablesPanel.tsx`.
Copy the deliverables table (lines 244–252) and dialog (lines 385–518) logic from `AdminSchedule.tsx` into the new component. Parameterise `projectId` and `hideProjectColumn`. Remove the Project column and field when `hideProjectColumn=true`. Wire the same API endpoints.

### Step 2 — Replace AdminSchedule.tsx deliverables section
In `AdminSchedule.tsx`, replace the inline table and dialog with:
```
<DeliverablesPanel projectId={selectedProjectId} hideProjectColumn={false} />
```
Where `selectedProjectId` is the currently selected project filter. If `AdminSchedule.tsx` currently shows all deliverables across all projects, keep that behaviour (pass `projectId={undefined}` or use the existing all-projects query) and adjust the component to handle an optional `projectId` that when absent fetches all.

### Step 3 — Rename "Dev & Deploy" tab
In `ProjectCommandCenter.tsx` TABS const (lines 95–104):
- Find the entry with `value: "dev"` (label currently "Dev & Deploy" at line 99).
- Change `label` to `"Website"`.
- The `value` string `"dev"` stays unchanged (changing it would break any deep-link URLs).

### Step 4 — Replace Deliverables tab content
In `ProjectCommandCenter.tsx` lines 415–442 (the Deliverables tab), replace:
```
Empty text "No deliverables on this project yet. Add them from the Deliverables section."
```
with:
```
<DeliverablesPanel projectId={project.projectId} hideProjectColumn={true} />
```
Delete the old empty-state text and any surrounding read-only wrapper.

### Step 5 — Website tab: in-tab repo input
In the current Repository panel (lines 533–559) inside the Dev (now Website) tab:
- Remove the static text "No GitHub repo linked. Add one in project settings." (line 556).
- Add an editable text input labelled "GitHub repository" pre-filled with `project.repositoryName` (or empty string).
- Add a "Save" button beside it.
- On Save: call `PATCH /api/projects/:id/repository` with `{ repositoryName: value }`.
- On success: show a toast "Repository saved." and update local state.
- If `project.repositoryName` is already set on load, show it pre-filled.

### Step 6 — New API endpoint: PATCH /api/projects/:id/repository
In `projects.routes.ts`, add:
`PATCH /api/projects/:id/repository` (requireAdmin)
Body: `{ repositoryName: string }` (zod: `z.object({ repositoryName: z.string().max(255) })`)
Updates `project.repositoryName` for the given project id.
Returns `{ data: { projectId, repositoryName } }`.

### Step 7 — Website tab: rename "Show Client Now" card
In lines 561–623, the card that was titled "Show Client Now":
- Change the card heading text from "Show Client Now" to "Website".
- All other content inside the card (the live preview iframe or link mechanism) stays unchanged.

---

## Public Contracts

New endpoint:
- `PATCH /api/projects/:id/repository` → `{ data: { projectId: number, repositoryName: string } }`

Existing endpoint used (unchanged):
- `GET /api/deliverables?projectId=:id`
- `POST /api/deliverables`
- `PATCH /api/deliverables/:id`
- `DELETE /api/deliverables/:id`

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Open the Projects page in the browser. Navigate to the Deliverables sidebar item (AdminSchedule). Confirm the deliverables table renders correctly with the Project column visible. Add a deliverable. Edit it. Delete it. Confirm all three actions work.
3. Open a project detail. Go to the Deliverables tab. Confirm the full CRUD table renders. Add a deliverable — it must default to this project and the Project column must not be visible. Edit it. Delete it.
4. Go to the Website tab (was "Dev & Deploy"). Confirm the tab label is "Website".
5. In the Website tab Repository panel: paste a repo URL and click Save. Confirm "Repository saved." toast appears. Refresh and confirm the repo URL is still there.
6. Confirm the text "Add one in project settings." is gone from the Website tab.
7. Confirm the "Show Client Now" card heading is now "Website".
8. Confirm no duplicate deliverables across AdminSchedule and the project tab (they share the same data source).

---

## Rollback

Revert `ProjectCommandCenter.tsx` and `AdminSchedule.tsx`. Delete `apps/web/src/components/admin/shared/DeliverablesPanel.tsx`. Revert the new endpoint in `projects.routes.ts`. No database changes.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-04_deliverables-tabs_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-05_contracts_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
