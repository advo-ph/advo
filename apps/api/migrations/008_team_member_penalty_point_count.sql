-- Migration 008: team_member penalty point counter (P11)
--
-- Optional penalty-point tally on team_member. integer NOT NULL DEFAULT 0.
-- Admin adjusts via PATCH /api/team/:id body penaltyPointCount.
-- Automatic accrual is DEFERRED — rules still open; no hooks from
-- deliverable late/verify or other events in this migration.

BEGIN;

ALTER TABLE team_member
  ADD COLUMN IF NOT EXISTS penalty_point_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN team_member.penalty_point_count IS
  'Manual penalty point tally (P11). Default 0. Admin sets via PATCH /api/team/:id. Auto-accrual deferred — rules open.';

COMMIT;
