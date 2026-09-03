-- Migration 024: availability_block gets a migration, and an end date.
--
-- TWO PROBLEMS, ONE FILE. They belong together because the second cannot be fixed
-- without the first existing.
--
-- ─── 1. THE TABLE HAD NO MIGRATION ───
--
-- `availability_block` reached every database in this project through `drizzle-kit push`
-- and nothing else. It is in schema.ts, it is in prod, and there is no file in this
-- directory that creates it. That means it was absent from the 019 ledger backfill and
-- absent from docs/deploy/applied-migration-probe.sql, so `npm run migration:drift`
-- could report a database as clean while having no opinion about this table whatsoever.
--
-- This is precisely the failure class 019_schema_ledger.sql was written to prevent: prod
-- was missing 005_expense.sql while 012-015 were on the box, and nothing in the repo
-- could say so. A push-only table is that hole, pre-dug. So the CREATE TABLE below is
-- written IF NOT EXISTS against the shape that is actually live today, verified against
-- advo_dev with \d rather than copied from schema.ts:
--
--     start_time / end_time  varchar(5)   NOT time. docs/SCHEMA.md said TIME and was
--                                         wrong; it also had team_member_id as BIGINT,
--                                         block_type as an ENUM, and label as
--                                         VARCHAR(255). All four are corrected there in
--                                         the same change as this migration.
--
-- On a database that already has the table this whole block is a no-op. On a fresh one it
-- is the definition. Either way the ledger row at the bottom means the drift detector can
-- finally see it.
--
-- ─── 2. A RECURRING BLOCK WITH NO DATES IS ASSERTED FOR ALL OF RECORDED TIME ───
--
-- The table stored `day_of_week` and nothing else. The calendar's only match predicate
-- was `block.day_of_week === cell.getDay()`, looped over every cell of whatever month you
-- navigated to. Navigate to 2029 and a student's Tuesday class is still there. Navigate
-- back to 2019 and it was there before they enrolled.
--
-- `effective_from` and `effective_to` bound the projection. Both are DATE and both are
-- NULLABLE, and the nullability is the design:
--
--     effective_from NULL  →  "as far back as anyone asks"
--     effective_to   NULL  →  open-ended, the normal case for a standing work schedule
--
-- so every existing row keeps its current meaning and nothing needs backfilling. A block
-- only stops projecting once someone says when it ends, which is the only moment anyone
-- actually knows.
--
-- DATE, not timestamptz, and read in Asia/Manila — the rule migration 017 states for
-- billing anchors ("'the 1st' means the 1st in Asia/Manila") applies to a semester's end
-- date for the same reason. See apps/api/src/utils/manila-date.ts.
--
-- Retention: permanent, with the team member. Rows cascade on member delete.

BEGIN;

-- ─── The definition that was only ever pushed ───

CREATE TABLE IF NOT EXISTS availability_block (
  block_id       bigserial PRIMARY KEY,
  team_member_id integer NOT NULL REFERENCES team_member (team_member_id) ON DELETE CASCADE,
  day_of_week    integer NOT NULL,
  start_time     varchar(5) NOT NULL,
  end_time       varchar(5) NOT NULL,
  block_type     varchar(20) NOT NULL DEFAULT 'work',
  label          varchar(100),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_member ON availability_block (team_member_id);
CREATE INDEX IF NOT EXISTS idx_availability_day    ON availability_block (day_of_week);

-- ─── The bounds ───

ALTER TABLE availability_block
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to   date;

COMMENT ON COLUMN availability_block.effective_from IS
  'First Manila date this recurring block applies. NULL = unbounded backwards. A semester start.';

COMMENT ON COLUMN availability_block.effective_to IS
  'Last Manila date this recurring block applies, inclusive. NULL = open-ended, the normal case for a standing work schedule. A semester end.';

-- ─── Constraints the table never had ───

-- An end before its start was saveable, and the row it produced was invisible in the
-- grid and wrong in the free-time intersection. '00:00' is the one legal inversion:
-- <input type="time"> cannot emit '24:00', so it is the only way to say "until
-- midnight", and rows shaped that way already exist in this table.
DO $$ BEGIN
  ALTER TABLE availability_block
    ADD CONSTRAINT chk_availability_block_time_order
    CHECK (end_time = '00:00' OR end_time > start_time);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE availability_block
    ADD CONSTRAINT chk_availability_block_time_format
    CHECK (
      start_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      AND end_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      AND left(start_time, 2)::int <= 23
      AND left(end_time, 2)::int <= 23
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE availability_block
    ADD CONSTRAINT chk_availability_block_day_of_week
    CHECK (day_of_week BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE availability_block
    ADD CONSTRAINT chk_availability_block_type
    CHECK (block_type IN ('school', 'break', 'work', 'unavailable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A window that closes before it opens is a data-entry error, not an empty schedule.
DO $$ BEGIN
  ALTER TABLE availability_block
    ADD CONSTRAINT chk_availability_block_effective_order
    CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The read is "which blocks apply on this date", so the expiring ones are what the index
-- is for. Open-ended rows are the majority and are found by the day_of_week index.
CREATE INDEX IF NOT EXISTS idx_availability_effective
  ON availability_block (effective_to)
  WHERE effective_to IS NOT NULL;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('024_availability_block_bounds.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
