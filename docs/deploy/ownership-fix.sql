-- Ownership fix for everything migrations 005 / 016 / 017 / 018 create.
--
-- WHY THIS FILE EXISTS: on 2026-08-19 migration 015 was applied to prod as the
-- `postgres` superuser. Every campaign table it created was therefore owned by
-- `postgres`, and the app — which connects as `advo` — could not read a single
-- one of them. The tables existed and the feature was still broken. Nothing in
-- the deploy output said so; it surfaced later as runtime errors.
--
-- Running the migrations AS `advo` avoids this by construction and is the
-- preferred path (see the runbook). This file is the belt-and-braces: it is
-- idempotent, safe to run either way, and it ENDS IN A VERIFICATION that fails
-- loudly rather than reporting success on a bad state.
--
--   ssh advo "sudo -u postgres psql -d advo -v ON_ERROR_STOP=1 -f -" < docs/deploy/ownership-fix.sql

\set ON_ERROR_STOP on

BEGIN;

-- 005
ALTER TABLE  IF EXISTS expense                            OWNER TO advo;
ALTER SEQUENCE IF EXISTS expense_expense_id_seq           OWNER TO advo;

-- 016
ALTER TABLE  IF EXISTS project_signoff                    OWNER TO advo;
ALTER SEQUENCE IF EXISTS project_signoff_project_signoff_id_seq   OWNER TO advo;
ALTER TABLE  IF EXISTS signoff_revision                   OWNER TO advo;
ALTER SEQUENCE IF EXISTS signoff_revision_signoff_revision_id_seq OWNER TO advo;

-- 017
ALTER TABLE  IF EXISTS recurring_fee                      OWNER TO advo;
ALTER SEQUENCE IF EXISTS recurring_fee_recurring_fee_id_seq       OWNER TO advo;
ALTER TYPE recurring_fee_status                           OWNER TO advo;

-- 018
ALTER TABLE  IF EXISTS commission_plan                    OWNER TO advo;
ALTER SEQUENCE IF EXISTS commission_plan_commission_plan_id_seq   OWNER TO advo;
ALTER TABLE  IF EXISTS commission_share                   OWNER TO advo;
ALTER SEQUENCE IF EXISTS commission_share_commission_share_id_seq OWNER TO advo;

COMMIT;

-- Verification. Raises rather than returning a row, so a caller running with
-- ON_ERROR_STOP cannot mistake a bad state for a good one.
DO $$
DECLARE
  stray text;
BEGIN
  SELECT string_agg(c.relname || ' (' || pg_get_userbyid(c.relowner) || ')', ', ' ORDER BY c.relname)
    INTO stray
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'S')
    AND pg_get_userbyid(c.relowner) <> 'advo';

  IF stray IS NOT NULL THEN
    RAISE EXCEPTION 'objects in public are not owned by advo and are unreachable by the app: %', stray;
  END IF;

  RAISE NOTICE 'ownership verified: every table and sequence in public is owned by advo';
END
$$;
