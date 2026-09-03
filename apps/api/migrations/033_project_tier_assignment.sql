-- Migration 033 — project_tier_assignment
-- Phase 8, admin-simplify.
--
-- Stores the tier pick for assistant_developer and creatives_developer commission share rows.
-- The tier label is stored verbatim so it can be displayed later without re-deriving meaning.
--
-- Allowed tier labels (exactly three):
--   "Tier 1 Contribution (5% Allocation): Routine and Assisted Execution. ..."
--   "Tier 2 Contribution (10% Allocation): ..."
--   "Tier 3 Contribution (15% Allocation): ..."
--
-- allocation_bps: derived from tier — Tier 1 = 500, Tier 2 = 1000, Tier 3 = 1500.
-- ONE tier pick per share row (UNIQUE on commission_share_id).

BEGIN;

INSERT INTO schema_migration (filename) VALUES ('033_project_tier_assignment.sql')
  ON CONFLICT (filename) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_tier_assignment (
  tier_assignment_id   bigserial    PRIMARY KEY,
  commission_share_id  bigint       NOT NULL
    REFERENCES commission_share(commission_share_id) ON DELETE CASCADE,
  -- The exact verbatim tier label, stored so it can be shown later.
  tier_label           varchar(500) NOT NULL,
  -- Derived from tier: Tier 1 = 500 bps (5%), Tier 2 = 1000 (10%), Tier 3 = 1500 (15%).
  allocation_bps       integer      NOT NULL,
  created_at           timestamptz  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tier_allocation_bps CHECK (allocation_bps IN (500, 1000, 1500))
);

-- One tier pick per share row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_assignment_share
  ON project_tier_assignment (commission_share_id);

CREATE INDEX IF NOT EXISTS idx_tier_assignment_share_lookup
  ON project_tier_assignment (commission_share_id);

COMMIT;
