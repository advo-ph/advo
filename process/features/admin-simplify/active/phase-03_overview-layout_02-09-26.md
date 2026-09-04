# Phase 3 — Project Overview Layout and Header Buttons
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 2 complete (people list component exists, Assign dialog built)
**Blocks:** Phase 4 (tabs exist; this phase locks the header shape that Phase 4 extends)

---

## Goal

Restructure `ProjectCommandCenter.tsx` header and Overview tab. The header loses "Show Client Now" and gains Edit and Delete. The Overview tab shifts from a 4-stat row spanning the full width to a two-column layout on desktop. Nothing is deleted — Brief and Tech stack move to the left column.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 232–288 (header) | Remove Show Client Now button (281–286); add Edit and Delete buttons |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 305–412 (Overview tab) | Two-column desktop layout |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 261–266 | Branch indicator — evaluate whether to keep or remove; see decision below |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 267–276 | "Live preview" link — keep as is |
| `apps/web/src/components/admin/ConfirmDeleteDialog.tsx` | read-only | Reuse as-is for project delete |

---

## Blast Radius

- Only `ProjectCommandCenter.tsx` changes in this phase (header + Overview tab JSX).
- The Edit form code already exists (it lives in `AdminProjects.tsx`); in this phase we open it from the header. If the edit form is a standalone component that can be imported, import it. If it is inline JSX in `AdminProjects.tsx`, extract it to `apps/web/src/components/admin/shared/EditProjectDialog.tsx` in this phase.
- The Delete handler and its confirmation dialog are already in `AdminProjects.tsx`. Extract the delete call (the mutation/fetch) to a shared hook at `apps/web/src/hooks/useDeleteProject.ts` so both pages can use it.
- No API changes. No schema changes. No new migrations.

---

## Decision: Branch Indicator in Header

The branch indicator at lines 261–266 is a repo/branch name in the header. Phase 4 moves repo editing into the Website tab. In this phase: keep the branch indicator in the header as read-only display only if the project has a `repositoryName`. If no `repositoryName`, render nothing. Do not remove the field — it gives useful context at a glance.

---

## Step-by-Step Changes

### Step 1 — Extract EditProjectDialog if needed
Check whether the edit form (lines 491–517 in `AdminProjects.tsx`) is already an importable component. If it is inline JSX wired to local state, extract it to `apps/web/src/components/admin/shared/EditProjectDialog.tsx`. The component receives `project` (the current project object) and `onSaved` callback. It contains all existing edit fields: name, status, client, total value, preview URL, GitHub repo name, contract URL, tech stack, and any others present. Keep all fields — none are removed here.

### Step 2 — Extract useDeleteProject hook
Create `apps/web/src/hooks/useDeleteProject.ts`.
It wraps the `DELETE /api/projects/:id` fetch call, handles loading and error state, and calls a passed `onDeleted` callback on success.
Import and use this hook in `AdminProjects.tsx` (replacing the inline delete handler there) to confirm no regression, then also use it in `ProjectCommandCenter.tsx`.

### Step 3 — Header: remove Show Client Now, add Edit and Delete
In `ProjectCommandCenter.tsx` lines 281–286: delete the "Show Client Now" button and its JSX entirely.
In the header button group, add two buttons:
- "Edit" — opens `<EditProjectDialog project={project} onSaved={refetch} />` where `refetch` re-fetches the project data.
- "Delete" — opens `<ConfirmDeleteDialog onConfirm={handleDelete} />` where `handleDelete` calls `useDeleteProject` and then navigates back to the projects list on success.

Position these buttons where "Show Client Now" was (right side of header). Keep "Live preview" link (267–276) if present.

### Step 4 — Overview tab: two-column desktop layout
Replace the current Overview tab JSX (305–412) with a two-column grid on desktop, stacked on mobile.
Wrapper: `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`.

LEFT column (top to bottom):
1. 2x2 stat grid: Paid, Outstanding, Open deliverables, Stage.
   - Paid = `project.amountPaidCents` formatted as peso.
   - Outstanding = `project.totalValueCents - project.amountPaidCents` formatted as peso.
   - Open deliverables = count of deliverables where `completedAt IS NULL` (fetch from `/api/deliverables?projectId=...`).
   - Stage = `project.projectStatus` as plain text label.
   - Use the existing `StatStrip` / `Stat` shared UI components. Grid class: `grid grid-cols-2 gap-px`.
2. Payment progress panel (currently lines 313–325) — keep as is, move below the stat grid.
3. Brief panel (currently lines 327–331) — move here from its current location.
4. Tech stack panel (currently lines 333–346) — move here below Brief.

RIGHT column (top to bottom):
1. Team / People panel — the `<PeopleList>` component from Phase 2 (currently lines 348–412, but now using the new component). At the top of this panel, the "Assign" button opens `<ProjectAssignDialog>` from Phase 2. Show "Assign" only when `isOwner || isAdmin`.

On mobile (single column): left column stacks first, right column below.

### Step 5 — Remove the old 4-stat grid container
The existing `grid grid-cols-2 lg:grid-cols-4 gap-px` at lines 306–311 is replaced by the new 2x2 grid inside the left column. Delete the old container.

---

## Public Contracts (unchanged)

No new endpoints. Reads same project data. Deliverables count uses existing `GET /api/deliverables?projectId=:id`.

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Open a project detail page on desktop (>= 1024px wide):
   - Header has "Edit" and "Delete" buttons where "Show Client Now" was.
   - No "Show Client Now" button visible anywhere in the header.
   - Clicking "Edit" opens a dialog pre-filled with project data; saving updates the page.
   - Clicking "Delete" shows a confirmation dialog; confirming deletes the project and navigates back to the list.
3. Overview tab on desktop: two columns visible side by side. Left: 2x2 stats, payment progress, brief, tech stack. Right: people list with roles.
4. Overview tab on mobile (< 1024px): single column. Left column content first, then right.
5. All four stats (Paid, Outstanding, Open deliverables, Stage) display correct values.
6. Brief and Tech stack are not lost — they appear in left column.
7. "Assign" button in People panel is visible for admin@advo.ph and hidden for a non-admin session.

---

## Rollback

Revert `ProjectCommandCenter.tsx`. If `EditProjectDialog` and `useDeleteProject` were extracted as new files, delete them and restore the inline code to `AdminProjects.tsx`. No database changes to roll back.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-03_overview-layout_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-04_deliverables-tabs_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
