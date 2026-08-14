-- Migration 007: deliverable verification timestamp
--
-- Team marks a deliverable as verified (QA sign-off) independently of status
-- completed. verified_at is nullable TIMESTAMPTZ — null = not verified; set
-- clears via PATCH verifiedAt: null. No penalty points in this migration.

BEGIN;

ALTER TABLE deliverable
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN deliverable.verified_at IS
  'Team QA verification timestamp. Null = unverified. Independent of status/completed_at; set or clear via PATCH /api/deliverables/:id.';

COMMIT;
