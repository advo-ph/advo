-- Migration 025 — project_role_assignment
--
-- Tracks which team member holds which named project job role on which project.
-- This is the source of truth for Commission (Phase 8) and for the per-project
-- people list shown in ProjectCommandCenter.
--
-- The five allowed role values are app-validated (varchar, not enum) so the list
-- can grow without a migration. The allowed set is:
--   referral | project_manager | lead_developer | assistant_developer | creatives_developer
--
-- Constraints:
--   • One person cannot hold the same role twice on one project (composite unique).
--   • A person CAN hold two different roles on the same project.
--   • Exactly one referral per project (partial unique index).
--
-- Idempotent (2026-09-13): on a fresh database `db:push` has already created this table
-- from schema.ts, and the bare CREATE TABLE stopped `npm run db:local` here. Every
-- statement is now IF NOT EXISTS / ON CONFLICT, so the file is a no-op where the objects
-- exist and the definition where they do not.

CREATE TABLE IF NOT EXISTS project_role_assignment (
  project_role_assignment_id bigserial PRIMARY KEY,
  project_id                  integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  team_member_id              integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE RESTRICT,
  project_role                varchar(40) NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT NOW(),
  created_by                  integer REFERENCES "user"(user_id) ON DELETE SET NULL
);

-- One person cannot hold the same role twice on one project.
-- A person CAN hold two different roles (e.g. referral + project_manager).
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_role_assignment_unique
  ON project_role_assignment (project_id, team_member_id, project_role);

-- Exactly one referral per project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_role_assignment_referral
  ON project_role_assignment (project_id)
  WHERE project_role = 'referral';

CREATE INDEX IF NOT EXISTS idx_project_role_assignment_project
  ON project_role_assignment (project_id);

CREATE INDEX IF NOT EXISTS idx_project_role_assignment_member
  ON project_role_assignment (team_member_id);

INSERT INTO schema_migration (filename) VALUES ('032_project_role_assignment.sql')
ON CONFLICT (filename) DO NOTHING;
