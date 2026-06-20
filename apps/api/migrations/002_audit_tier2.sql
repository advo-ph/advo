-- Migration 002: Database audit Tier 2 — explicit ON DELETE on the 8 drifted FKs
--
-- Why: drizzle-kit push creates FK constraints on first sync but never ALTERs the
-- ON DELETE action of an existing one. So the DB drifted from schema.ts: 8 FKs sit at
-- NO ACTION (Postgres default, RESTRICT-like) even though some are declared cascade in
-- schema.ts. NO ACTION isn't just untidy — it actively blocks real deletion paths today:
--   • DELETE /api/team/:id fails if the member has assigned deliverables or leads
--     (deliverable.assigned_to + lead.assigned_to are NO ACTION → restrict).
--   • DELETE /api/clients/:id cascades to its projects, but those projects can't be
--     deleted while notification.project_id / github_event.project_id stay NO ACTION.
--
-- Per-FK policy was decided with the database-conventions skill (rule 17) + the owner
-- on 2026-06-20. Two CASCADEs are pure drift-repair (schema.ts already declares them);
-- the four assignment/audit FKs and the two user-account links are SET NULL so deleting
-- a parent detaches the child instead of erasing or blocking it:
--
--   CASCADE  (child is meaningless without parent; schema already declares it)
--     github_event.project_id  → project
--     notification.project_id  → project
--   SET NULL (nullable ref; preserve the child row, just detach)
--     activity_log.user_id        → user        (audit trail must survive user deletion)
--     deliverable.assigned_to     → team_member (keep the work item, unassign)
--     lead.assigned_to            → team_member (keep the lead, unassign)
--     scrape_result.scraped_by    → user        (keep the cached scrape, null the actor)
--     client.user_id              → user        (keep business + billing history)
--     team_member.user_id         → user        (keep public profile; hide via is_active)
--
-- Risk: all 8 child tables are ≤6 rows today, all on nullable columns, wrapped in one
-- transaction. Each ADD CONSTRAINT re-validates against existing rows (instant at this
-- size). Constraint names are preserved so schema.ts and the DB stay legible.
--
-- Rollback: re-run with ON DELETE NO ACTION in place of the policies below. The reverse
-- of CASCADE/SET NULL→NO ACTION is non-destructive (it only tightens future deletes).

BEGIN;

-- ── CASCADE: drift-repair (schema.ts already declares cascade) ──────────────

ALTER TABLE github_event
  DROP CONSTRAINT IF EXISTS github_event_project_id_project_project_id_fk;
ALTER TABLE github_event
  ADD CONSTRAINT github_event_project_id_project_project_id_fk
  FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE CASCADE;

ALTER TABLE notification
  DROP CONSTRAINT IF EXISTS notification_project_id_project_project_id_fk;
ALTER TABLE notification
  ADD CONSTRAINT notification_project_id_project_project_id_fk
  FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE CASCADE;

-- ── SET NULL: nullable refs — detach the child, don't erase or block ────────

ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_user_id_user_user_id_fk;
ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_user_id_user_user_id_fk
  FOREIGN KEY (user_id) REFERENCES "user"(user_id) ON DELETE SET NULL;

ALTER TABLE deliverable
  DROP CONSTRAINT IF EXISTS deliverable_assigned_to_team_member_team_member_id_fk;
ALTER TABLE deliverable
  ADD CONSTRAINT deliverable_assigned_to_team_member_team_member_id_fk
  FOREIGN KEY (assigned_to) REFERENCES team_member(team_member_id) ON DELETE SET NULL;

ALTER TABLE lead
  DROP CONSTRAINT IF EXISTS lead_assigned_to_team_member_team_member_id_fk;
ALTER TABLE lead
  ADD CONSTRAINT lead_assigned_to_team_member_team_member_id_fk
  FOREIGN KEY (assigned_to) REFERENCES team_member(team_member_id) ON DELETE SET NULL;

ALTER TABLE scrape_result
  DROP CONSTRAINT IF EXISTS scrape_result_scraped_by_fkey;
ALTER TABLE scrape_result
  ADD CONSTRAINT scrape_result_scraped_by_fkey
  FOREIGN KEY (scraped_by) REFERENCES "user"(user_id) ON DELETE SET NULL;

ALTER TABLE client
  DROP CONSTRAINT IF EXISTS client_user_id_user_user_id_fk;
ALTER TABLE client
  ADD CONSTRAINT client_user_id_user_user_id_fk
  FOREIGN KEY (user_id) REFERENCES "user"(user_id) ON DELETE SET NULL;

ALTER TABLE team_member
  DROP CONSTRAINT IF EXISTS team_member_user_id_user_user_id_fk;
ALTER TABLE team_member
  ADD CONSTRAINT team_member_user_id_user_user_id_fk
  FOREIGN KEY (user_id) REFERENCES "user"(user_id) ON DELETE SET NULL;

COMMIT;
