# Phase 2 — Project Job Roles
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 1 complete
**Blocks:** Phase 3 (Assign button in header area depends on the dialog built here); Phase 8 (project_role_assignment is the shared source of truth for Commission)

---

## Goal

Introduce per-project job role assignments. Track who works on a project and in what capacity. Wire `useRoles.ts` to real data. Populate the project Overview with a people list. Give the owner the `is_owner` flag so Phase 8 money visibility works correctly.

No permission-editing UI is built. No capability table. No screen for assigning system roles to people. The existing `requireAdmin` / `requireTeam` guards are left exactly as they are. The owner (admin@advo.ph) sees and can edit everything by virtue of their `is_owner` flag — no UI is needed to grant that.

---

## Background: What Changes and What Does Not

**Does NOT change:**
- `user.role` (admin | team | client) — the existing session-level role. The `requireAdmin` and `requireTeam` middleware continue to use this unchanged.
- `team_member.permission_role` — this column is not enforced anywhere and is not touched. It may be cleaned up in a future phase.
- `project_access.permission_level` — same: not enforced, not touched.
- Any permission-editing UI or "assign roles to people" management screen. The owner does not need a UI to assign system roles. That feature is cut.

**Does change:**
- `user.is_owner boolean` — added by migration 026. Set true for admin@advo.ph only. Carried in the JWT and `/api/auth/me` response. Consumed by `useRoles.ts` and by Phase 8 money visibility.
- `project_role_assignment` — new table added by migration 025. Tracks which team member holds which named project job role on which project. This is the data source for Commission (Phase 8) and for the per-project people list.
- `useRoles.ts` — rewritten to expose `isOwner`, the current user's `teamMemberId`, and the project job roles the user holds on the project being viewed. Nothing else.

---

## Project Job Roles

These are the five named job roles. They describe the work someone does on a project, not their system access level.

| Role value (stored) | Display label |
|---------------------|---------------|
| `referral` | Referral |
| `project_manager` | Project Manager |
| `lead_developer` | Lead Developer |
| `assistant_developer` | Assistant Developer |
| `creatives_developer` | Creatives Developer |

Constraints:
- Exactly one Referral per project (enforced by partial unique index).
- A person can hold two different roles on the same project (e.g. referral + project_manager).
- A person cannot hold the same role twice on the same project.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/api/migrations/025_project_role_assignment.sql` | new | New table + partial unique index |
| `apps/api/migrations/026_owner_flag.sql` | new | `is_owner` column + one-time owner row update |
| `apps/api/src/db/schema.ts` | after teamMember block (~232) | Add `projectRoleAssignment` table definition |
| `apps/api/src/db/schema.ts` | user table (~18–22 area) | Add `isOwner: boolean` column |
| `apps/api/src/routes/projects.routes.ts` | new endpoints | `GET /api/projects/:id/members`, `POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:assignmentId` |
| `apps/api/src/routes/auth.routes.ts` | token payload + /me response | Include `isOwner` in JWT payload and in `/api/auth/me` response |
| `apps/api/src/services/auth.service.ts` | session creation query | Select `is_owner` from the `user` table |
| `apps/web/src/hooks/useRoles.ts` | full rewrite | Real implementation; exposes `isOwner`, `teamMemberId`, and `getProjectRole(projectId)` |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | Overview tab, Team panel (348–412) | Replace junior-only filter team list with new unified people+role list |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | header area | "Assign" button opens new grid popup (Phase 3 wires it; this phase builds the dialog component) |
| `apps/web/src/components/admin/AdminProjects.tsx` | Assign dialog (858–956) | Remove (superseded by new popup in ProjectCommandCenter); delete `handleGrantAccess` (282–320) |

**Not touched in this phase:**
- `apps/api/src/middleware/auth.ts` — `requireAdmin` / `requireTeam` stay as-is.
- `apps/web/src/components/admin/AdminTeam.tsx` — no owner-only section is added. The permission-editing UI is cut.
- `apps/web/src/components/admin/AdminSettings.tsx` — no capability table or permission management added.

---

## Blast Radius

- Migration 025 adds a new table; no existing data is altered.
- Migration 026 adds `is_owner` column to `user`; the one-time UPDATE sets it for admin@advo.ph. All other users get `false` by default.
- JWT tokens issued before migration 026 do not carry `isOwner`. The `/api/auth/me` endpoint is the authoritative source; `useRoles` calls `/api/auth/me` on mount rather than relying solely on the stored JWT payload.
- The existing `project_access` table and `team_member.permission_role` column are NOT removed in this phase. They remain in the schema but the API stops writing to them from new flows. A future cleanup phase can drop them.
- `AdminProjects.tsx`: the Assign dialog (858–956) and `handleGrantAccess` (282–320) are deleted in this phase because they are superseded. Phase 1 already removed the Assign button from the row UI.

---

## New Database Objects

### Migration 025 — `project_role_assignment`

```
Table: project_role_assignment
  project_role_assignment_id  bigserial PRIMARY KEY
  project_id                  integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE
  team_member_id              integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE RESTRICT
  project_role                varchar(40) NOT NULL
    -- Allowed values (app-validated, varchar so the list can grow):
    -- referral | project_manager | lead_developer | assistant_developer | creatives_developer
  created_at                  timestamptz NOT NULL DEFAULT NOW()
  created_by                  integer REFERENCES "user"(user_id) ON DELETE SET NULL

UNIQUE INDEX on (project_id, team_member_id, project_role)
  -- One person cannot hold the same role twice on one project.
  -- A person CAN hold two different roles (e.g. referral + project_manager).

PARTIAL UNIQUE INDEX on (project_id) WHERE project_role = 'referral'
  -- Exactly one referral per project.
```

### Migration 026 — `user.is_owner`

```
ALTER TABLE "user" ADD COLUMN is_owner boolean NOT NULL DEFAULT false;
UPDATE "user" SET is_owner = true WHERE email = 'admin@advo.ph';
```

---

## Step-by-Step Changes

### Step 1 — Write and apply migrations 025 and 026
Write `apps/api/migrations/025_project_role_assignment.sql` per the schema above.
Write `apps/api/migrations/026_owner_flag.sql` per the schema above.
Apply both to the dev database.

### Step 2 — Update Drizzle schema (`schema.ts`)
Add `projectRoleAssignment` table definition after the `teamMember` block.
Add `isOwner: boolean("is_owner").notNull().default(false)` to the `user` table definition.

### Step 3 — New API endpoints in `projects.routes.ts`

`GET /api/projects/:id/members` (requireAuth)
- Returns array of `{ assignmentId, teamMemberId, name, projectRole }` for the project.
- If the caller is the owner (`is_owner = true`) or admin (`user.role = 'admin'`): return all rows.
- If the caller is a team member assigned to this project: return all rows (names and roles are visible to participants).
- If the caller is not assigned and not admin/owner: return 403.

`POST /api/projects/:id/members` (requireAdmin)
- Body: `{ teamMemberId, projectRole }`.
- Validates `projectRole` is one of the five allowed values.
- Enforces the referral partial unique index (DB will reject duplicates; catch the constraint error and return 409 with a readable message).
- Returns the created assignment row.

`DELETE /api/projects/:id/members/:assignmentId` (requireAdmin)
- Deletes one `project_role_assignment` row.
- Returns 204.

### Step 4 — Include `isOwner` in auth flow
In `auth.routes.ts`, when generating the JWT, include `isOwner` from the `user` row.
In `auth.routes.ts` `/api/auth/me` response, include `isOwner`.
In `auth.service.ts`, the session creation query must select `is_owner` from the `user` table.

### Step 5 — Rewrite `useRoles.ts`

The hook returns only what Phase 8 and the people list actually consume:

```
useRoles() returns:
  isOwner: boolean            -- from /api/auth/me response
  teamMemberId: number | null -- the current user's team_member_id (from /api/auth/me)
  getProjectRole(projectId): string | null
    -- the first project_role this user holds on that project
    -- fetched lazily from GET /api/projects/:id/members on first call per projectId
    -- cached in local state; does not re-fetch on re-render
  isLoading: boolean
```

The hook calls `/api/auth/me` on mount (share the data already fetched by `useAuth` rather than making a duplicate request). For project assignments, call `GET /api/projects/:id/members` lazily when `getProjectRole(id)` is first called and cache the result.

Do NOT add `isAdmin`, `role`, `projectIds`, or any other field. Keep the surface minimal.

### Step 6 — Assign popup component in `ProjectCommandCenter.tsx` (header area)
Build `<ProjectAssignDialog projectId={...} />` at `apps/web/src/components/admin/shared/ProjectAssignDialog.tsx`.

Layout: a Radix Dialog modal. Inside: a grid, one cell per role. Roles: Referral, Project Manager, Lead Developer, Assistant Developer, Creatives Developer. Each cell has a label at the top and a list below:
- Referral: radio buttons (single select — enforces the one-referral constraint in the UI before the API also rejects duplicates).
- All other roles: checkboxes (multi-select).
A search/filter input at the top of each cell filters the member list by name.

On Confirm: POST each new assignment and DELETE each removed assignment. Close on success. Show a toast on error (including the 409 "referral already assigned" message from the API).

Wire the "Assign" button in the ProjectCommandCenter header to open this dialog. The button is already placed by Phase 1; this phase provides the dialog it opens. Phase 3 will position the button in the restructured header — this phase connects the existing button to the dialog.

### Step 7 — People list in ProjectCommandCenter Overview tab (348–412)
Replace the junior-only filter team panel with:
- A `<PeopleList projectId={...} />` component (inline in ProjectCommandCenter or extracted to `apps/web/src/components/admin/shared/PeopleList.tsx`).
- Calls `GET /api/projects/:id/members`.
- Renders one row per assignment: member name on the left, role label on the right in `text-muted-foreground text-xs`.
- If the user is owner or admin, show the "Assign" button at the top of this panel that opens `<ProjectAssignDialog>`.

### Step 8 — Remove old Assign dialog from `AdminProjects.tsx`
Delete the Assign dialog JSX (lines 858–956) and `handleGrantAccess` function (282–320). Remove any state variables used only by those blocks.

---

## Public Contracts

New endpoints:
- `GET /api/projects/:id/members` → `{ data: [{ assignmentId, teamMemberId, name, projectRole }] }`
- `POST /api/projects/:id/members` → `{ data: { assignmentId, teamMemberId, projectRole } }`
- `DELETE /api/projects/:id/members/:assignmentId` → 204

Existing contract change:
- `GET /api/auth/me` response gains `isOwner: boolean` and `teamMemberId: number | null`.

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Apply migrations 025 and 026 to dev database. Confirm `psql -c "\d project_role_assignment"` shows table with partial unique index on `(project_id) WHERE project_role = 'referral'`.
3. Log in as admin@advo.ph. Confirm `GET /api/auth/me` returns `isOwner: true`.
4. Open a project. Open the Assign dialog. Assign a team member as "Lead Developer". Confirm row appears in `GET /api/projects/:id/members`.
5. Try to assign a second "Referral" to the same project via the API. Confirm 409 with a readable message. Confirm the radio button UI prevents selecting two referrals.
6. Log in as a team member with no project assignment. Try `GET /api/projects/:id/members` for that project. Confirm 403.
7. Confirm `useRoles().isOwner` is `true` in browser devtools for admin@advo.ph session.
8. Confirm the Overview people list shows the correct names and roles after assignment.
9. Confirm `AdminTeam.tsx` has no new owner-only section (cut item was not built).

---

## Rollback

- Revert changes to `AdminProjects.tsx`, `ProjectCommandCenter.tsx`, `useRoles.ts`, `projects.routes.ts`, `auth.routes.ts`, `auth.service.ts`, `schema.ts`.
- Drop the two new objects: `DROP TABLE project_role_assignment; ALTER TABLE "user" DROP COLUMN is_owner;`
- Redeploy.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-02_project-job-roles_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-03_overview-layout_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
