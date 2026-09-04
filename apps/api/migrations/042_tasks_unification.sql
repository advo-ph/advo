-- ============================================================
-- 035_tasks_unification.sql
-- Collapse deliverable_status to 4 values; drop task system.
-- ============================================================

BEGIN;

-- ── Step 1: Drop the task table (zero rows expected; see pre-flight query) ──
DROP TABLE IF EXISTS task;

-- ── Step 2: Drop the task_status type ────────────────────────────────────────
DROP TYPE IF EXISTS task_status;

-- ── Step 3: Add the four new values to the existing enum so we can UPDATE rows
--    using them before swapping the column type. ALTER TYPE ADD VALUE cannot run
--    inside a transaction in Postgres < 12, but Postgres 12+ allows it.
ALTER TYPE deliverable_status ADD VALUE IF NOT EXISTS 'todo';
ALTER TYPE deliverable_status ADD VALUE IF NOT EXISTS 'ongoing';
ALTER TYPE deliverable_status ADD VALUE IF NOT EXISTS 'finished';

COMMIT;

-- ALTER TYPE ADD VALUE cannot be used in the same transaction as its first use.
-- Re-open a transaction for the rest.
BEGIN;

-- ── Step 4: Remove the DEFAULT so ALTER COLUMN TYPE can proceed ───────────────
ALTER TABLE deliverable ALTER COLUMN status DROP DEFAULT;

-- ── Step 5: Backfill rows to new values using the now-extended old enum ───────
UPDATE deliverable SET status = 'todo'::deliverable_status     WHERE status::text = 'not_started';
UPDATE deliverable SET status = 'ongoing'::deliverable_status  WHERE status::text = 'in_progress';
UPDATE deliverable SET status = 'ongoing'::deliverable_status  WHERE status::text = 'blocked';
-- 'review' maps to 'review' — no UPDATE needed.
UPDATE deliverable SET status = 'finished'::deliverable_status WHERE status::text = 'completed';

-- ── Step 6: Create the clean four-value enum ──────────────────────────────────
CREATE TYPE deliverable_status_new AS ENUM (
  'todo',
  'ongoing',
  'review',
  'finished'
);

-- ── Step 7: Swap the column type ──────────────────────────────────────────────
ALTER TABLE deliverable
  ALTER COLUMN status TYPE deliverable_status_new
  USING status::text::deliverable_status_new;

-- ── Step 8: Restore the column default ───────────────────────────────────────
ALTER TABLE deliverable
  ALTER COLUMN status SET DEFAULT 'todo'::deliverable_status_new;

-- ── Step 9: Drop the old enum and rename the new one ─────────────────────────
DROP TYPE deliverable_status;
ALTER TYPE deliverable_status_new RENAME TO deliverable_status;

-- ── Step 10: Ledger entry ─────────────────────────────────────────────────────
INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('042_tasks_unification.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
