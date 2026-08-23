-- Migration 019: Schema ledger — the first record this repo keeps of what a database
-- has actually seen.
--
-- Discovered 2026-08-23, reported by nothing: prod's own health payload carries
-- `relation "expense" does not exist`, dated 2026-08-19. `/api/expense` is mounted and
-- 401-gates correctly, so every probe short of an authenticated call looks healthy —
-- but `005_expense.sql` was never applied there, while 012–015 are on the box. The
-- applied set has a HOLE in the middle of it.
--
-- The defect is not the missing table. It is that "which migration has this database
-- seen?" was unanswerable. `apps/api/migrations/*.sql` is applied by hand; the only
-- evidence a migration ran was the schema it happened to leave behind. This table is
-- that evidence, written down.
--
-- THE BACKFILL IS DELIBERATELY NOT A BLANKET INSERT. Prod has 17 of 18 migrations
-- applied and no record of any of them, so a ledger that seeds 001–018 unconditionally
-- would write down the very lie that hid the hole — it would mark 005 applied on the
-- one database where it is not. Instead each backfill row is guarded by a SENTINEL:
-- the object that migration creates. A row is seeded only where the object is present.
-- On prod, 005 gets no row and the detector reports it, which is the entire point.
--
-- The sentinel is evidence, not proof: someone who created `expense` by hand would be
-- recorded as having applied 005. That is an acceptable trade against the alternative,
-- which is every existing database reporting total drift on day one. It applies ONCE,
-- to databases that predate this table; every migration from 020 on writes its own row
-- as it runs and is never inferred.
--
-- is_backfilled marks exactly that distinction. A backfilled row's applied_at is the
-- moment this migration ran, NOT the moment the migration it names ran — that timestamp
-- is gone and inventing one would be a second lie. Read applied_at on a backfilled row
-- as "known applied by", never as "applied at".
--
-- Retention: permanent. This is deploy history; a ledger you prune is a ledger that can
-- grow a hole again.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migration (
  schema_migration_id  bigserial PRIMARY KEY,
  filename             varchar(255) NOT NULL,
  applied_at           timestamptz NOT NULL DEFAULT NOW(),
  is_backfilled        boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migration IS
  'One row per migration file a database has applied. The ordinal in the filename is data, not order — a gap in the middle is the failure this table exists to make visible.';

COMMENT ON COLUMN schema_migration.filename IS
  'The migration filename exactly as it appears in apps/api/migrations, e.g. 005_expense.sql. Matched by name so a renumbering is caught rather than absorbed.';

COMMENT ON COLUMN schema_migration.is_backfilled IS
  'True when the row was inferred from a sentinel object rather than written by the migration as it ran. On such a row applied_at means "known applied by", not "applied at".';

-- One row per migration, ever. The detector counts absence, so a duplicate would be a
-- second kind of lie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migration_filename
  ON schema_migration (filename);

-- Backfill for databases that predate this table. Each row is gated on the object its
-- migration creates; a database missing that object gets no row and reports as drifted.
INSERT INTO schema_migration (filename, is_backfilled)
SELECT candidate.filename, true
FROM (
  VALUES
    ('001_audit_tier1.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'site_config' AND column_name = 'created_at')),
    ('002_audit_tier2.sql', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'github_event_project_id_project_project_id_fk' AND confdeltype = 'c')),
    ('003_calendar_event.sql', to_regclass('public.calendar_event') IS NOT NULL),
    ('004_contract.sql', to_regclass('public.contract') IS NOT NULL),
    ('005_expense.sql', to_regclass('public.expense') IS NOT NULL),
    ('006_meeting.sql', to_regclass('public.meeting') IS NOT NULL),
    ('007_deliverable_verified_at.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deliverable' AND column_name = 'verified_at')),
    ('008_team_member_penalty_point_count.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'team_member' AND column_name = 'penalty_point_count')),
    ('009_change_order.sql', to_regclass('public.change_order') IS NOT NULL),
    ('010_proposal.sql', to_regclass('public.proposal') IS NOT NULL),
    ('011_library_item.sql', to_regclass('public.library_item') IS NOT NULL),
    ('012_meeting_plaud_import.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting' AND column_name = 'plaud_file_id')),
    ('013_meeting_is_visible_client.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting' AND column_name = 'is_visible_client')),
    ('014_proposal_method.sql', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'proposal' AND column_name = 'method')),
    ('015_campaign.sql', to_regclass('public.campaign') IS NOT NULL),
    ('016_project_signoff.sql', to_regclass('public.project_signoff') IS NOT NULL),
    ('017_recurring_fee.sql', to_regclass('public.recurring_fee') IS NOT NULL),
    ('018_commission_split.sql', to_regclass('public.commission_plan') IS NOT NULL)
) AS candidate (filename, is_present)
WHERE candidate.is_present
ON CONFLICT (filename) DO NOTHING;

-- This migration writes its own row, unbackfilled: it is the first one whose application
-- is recorded as it happens rather than inferred afterwards.
INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('019_schema_ledger.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
