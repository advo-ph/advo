-- Applied-migration probe — read-only.
--
-- This repo's numbered migrations in apps/api/migrations/ are hand-applied and
-- there is NO tracking table, so "which migrations are applied" is not a fact
-- anyone can look up. It has to be READ OFF THE SCHEMA, one marker object per
-- migration. That is what this file does.
--
-- It is read-only and safe to run against production at any time.
--
--   ssh advo "sudo -u postgres psql -d advo -f -" < docs/deploy/applied-migration-probe.sql
--
-- A row reading `absent` is a HOLE in the applied history. Prod had one at 005
-- on 2026-08-23 (015 present, 005 absent) — the reason /api/expense answered
-- `relation "expense" does not exist` in the health error buffer.

\pset title 'applied migration probe'

WITH marker(migration, kind, object, detail) AS (VALUES
  ('001_audit_tier1',                  'column', 'site_config',     'created_at'),
  ('002_audit_tier2',                  'column', 'deliverable',     'assigned_to'),
  ('003_calendar_event',               'table',  'calendar_event',  NULL),
  ('004_contract',                     'table',  'contract',        NULL),
  ('005_expense',                      'table',  'expense',         NULL),
  ('006_meeting',                      'table',  'meeting',         NULL),
  ('007_deliverable_verified_at',      'column', 'deliverable',     'verified_at'),
  ('008_team_member_penalty_point',    'column', 'team_member',     'penalty_point_count'),
  ('009_change_order',                 'table',  'change_order',    NULL),
  ('010_proposal',                     'table',  'proposal',        NULL),
  ('011_library_item',                 'table',  'library_item',    NULL),
  ('012_meeting_plaud_import',         'column', 'meeting',         'plaud_file_id'),
  ('013_meeting_is_visible_client',    'column', 'meeting',         'is_visible_client'),
  ('014_proposal_method',              'type',   'proposal_method', NULL),
  ('015_campaign',                     'table',  'campaign',        NULL),
  ('016_project_signoff',              'table',  'project_signoff', NULL),
  ('017_recurring_fee',                'table',  'recurring_fee',   NULL),
  ('018_commission_split',             'table',  'commission_plan', NULL)
)
SELECT
  m.migration,
  CASE
    WHEN m.kind = 'table' THEN
      CASE WHEN to_regclass('public.' || m.object) IS NOT NULL THEN 'present' ELSE 'absent' END
    WHEN m.kind = 'type' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = m.object
      ) THEN 'present' ELSE 'absent' END
    WHEN m.kind = 'column' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = m.object
          AND c.column_name = m.detail
      ) THEN 'present' ELSE 'absent' END
  END                                                   AS state,
  m.kind || ' ' || m.object || COALESCE('.' || m.detail, '') AS marker
FROM marker m
ORDER BY m.migration;

-- Ownership of every table and sequence in public. The app connects as `advo`;
-- anything owned by `postgres` is unreadable to the app even though it exists.
-- This is the 2026-08-19 campaign-table bug, and it is invisible from psql-as-postgres.
\pset title 'object ownership (anything not advo is unreachable by the app)'

SELECT c.relkind, c.relname AS object, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'S')
  AND pg_get_userbyid(c.relowner) <> 'advo'
ORDER BY c.relkind, c.relname;
