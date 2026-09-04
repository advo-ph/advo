# Phase 1 — Projects List Cleanup
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** nothing (first phase)
**Blocks:** Phase 3 (Edit/Delete dialogs move here from list rows)

---

## Goal

Strip every low-signal visual element from the project list rows in `AdminProjects.tsx`. Make each row communicate exactly one thing per scan: the project name, its current stage, the client, and two action buttons. Move the Edit and Delete flows to the project detail header (Phase 3 will wire them there; this phase preserves the dialog code so Phase 3 can reuse it without hunting).

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/web/src/components/admin/AdminProjects.tsx` | 58–64 | Remove `STATUS_DOT` color map constant |
| `apps/web/src/components/admin/AdminProjects.tsx` | 645–799 | Rewrite row JSX (see step-by-step below) |
| `apps/web/src/components/admin/AdminProjects.tsx` | 746–753 | Rename "Open" button label to "View project" |
| `apps/web/src/components/admin/AdminProjects.tsx` | 654–663 | Remove colored dot span; keep stage word as plain grey `text-muted-foreground text-xs` |
| `apps/web/src/components/admin/AdminProjects.tsx` | 677–682 | Remove GitBranch icon and repo/branch indicator |
| `apps/web/src/components/admin/AdminProjects.tsx` | 684–694 | Remove "Preview" text link |
| `apps/web/src/components/admin/AdminProjects.tsx` | 696–698 | Remove `{n} assigned` count |
| `apps/web/src/components/admin/AdminProjects.tsx` | 701–713 | Remove team avatar badges |
| `apps/web/src/components/admin/AdminProjects.tsx` | 754–794 | Remove "Assign", "Post update", Edit (pencil), Delete (trash) right-side buttons — but DO NOT delete the dialog/handler code they call |
| `apps/web/src/components/admin/AdminProjects.tsx` | new | Add "View site" button after "View project" button |

---

## Blast Radius

- Only `AdminProjects.tsx` is modified in this phase.
- No API routes change.
- No schema changes.
- The Edit dialog (`EditProjectDialog` or the inline edit form, lines 491–517), the Delete handler, and the Assign dialog (858–956) must remain in the file as dead code until Phase 3 (Edit/Delete) and Phase 2 (Assign) are implemented. Do not remove handler functions `handleGrantAccess` (282–320) or any delete/edit mutation hooks.
- GitHub enrichment block (715–742) also removed from the row display.
- `STATUS_DOT` map at 58–64: remove the map. If any other part of the file references it, replace those references with nothing (the stage word is already a string; no import of a dot color is needed).

---

## Step-by-Step Changes

### Step 1 — Remove STATUS_DOT color map
In `AdminProjects.tsx` lines 58–64: delete the `STATUS_DOT` constant entirely. It maps status strings to Tailwind color classes. After this step, nothing in the file should reference `STATUS_DOT`.

### Step 2 — Rewrite the project row structure
In the row JSX (currently lines 645–799), the new structure per row is:

Left side (flex col, gap-0.5):
- Project name: existing `font-medium` span, unchanged.
- Stage word: existing status label string (e.g. "discovery"), class changed to `text-xs text-muted-foreground` — no colored dot before it.
- Client name: existing client line (lines 666–668), unchanged.

Right side (flex row, gap-2, items-center):
- "View project" button — was "Open" at lines 746–753. Change label text only, keep `onClick` navigating to project detail.
- "View site" button — new. Renders as a secondary button (outline variant). `href={project.previewUrl}` opened with `target="_blank" rel="noopener noreferrer"`. When `project.previewUrl` is falsy: render the button with `disabled` and `aria-disabled="true"`. Do not hide it entirely (presence signals the feature exists).

### Step 3 — Remove these elements from the row
Locate and delete the JSX for each of these (do not delete surrounding layout containers that hold other kept elements):
- The colored status dot span (the `<span>` or `<Dot>` referencing `STATUS_DOT[...]`).
- The GitBranch icon and branch text (lines 677–682).
- The "Preview" external link (lines 684–694).
- The `{n} assigned` count span (lines 696–698).
- The team avatar badge group (lines 701–713).
- The GitHub enrichment block (lines 715–742) — this renders enriched data from GitHub; remove from the row. If it imports `@/lib/github` or similar only for that block, remove the import too.
- The right-side "Assign" button (lines 754–765).
- The right-side "Post update" button (lines 766–774).
- The right-side Edit pencil button (lines 775–782).
- The right-side Delete trash button (lines 783–794).

### Step 4 — Remove unused imports
After step 3, scan the import block at the top of `AdminProjects.tsx`. Remove any import that is now unreferenced: `GitBranch` icon, any GitHub enrichment utility, any dot-color utility. Keep all dialog, mutation, and state imports — those are still needed by the preserved dialog code.

### Step 5 — Verify no orphaned state
The Assign dialog state (open/closed boolean, selectedProject for assign) must remain declared and functional. The Edit and Delete state and handlers must remain declared and functional. They are just no longer connected to buttons in the row. This is intentional — Phase 2 and Phase 3 will reconnect them.

---

## Public Contracts (API surface — unchanged)

No API endpoints change in this phase. The list query (`GET /api/projects`) is called with the same parameters. The project object shape is unchanged.

---

## Verification Evidence

1. Run `pnpm test --filter web`. All 516 tests must pass.
2. Open the Projects page in the browser. Confirm:
   - No colored dot visible in any row.
   - Stage word ("discovery", "development", etc.) shows as small grey text.
   - No branch/repo indicator visible.
   - No "Preview" text link visible.
   - No assigned-count badge visible.
   - No team avatar badges visible.
   - No "Assign", "Post update", Edit, or Delete buttons in the row.
   - "View project" button navigates to the project detail page.
   - "View site" button on a project WITH a previewUrl opens the URL in a new tab.
   - "View site" button on a project WITHOUT a previewUrl is visible but disabled (greyed, not clickable).
3. Confirm no console errors about `STATUS_DOT` or undefined references.
4. Confirm that clicking "View project" still navigates correctly.

---

## Rollback

Revert `AdminProjects.tsx` to the prior git state. No database or API changes exist to roll back.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-01_projects-list_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-02_project-job-roles_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
