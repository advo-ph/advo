-- Migration 030 — Commission defaults and role indexes
-- Phase 8, admin-simplify.
--
-- Changes:
--   1. Drop the one-assistant-developer-per-plan unique index so multiple assistant
--      and creatives developers can appear on the same plan.
--   2. Update DEFAULT values on commission_plan for the new 55/35/10 top split and
--      the new 20/50/10/20 staff sub-split. Existing rows are NOT touched.
--
-- The CHECK constraints in 018 still hold:
--   developer_bps + staff_bps + company_bps = 10000  (5500+3500+1000 = 10000)
--   referral_bps + marketing_bps + accounting_bps + management_bps = 10000
--   (2000+5000+1000+2000 = 10000)
--
-- The one-main-developer index and the one-company-row index are NOT touched.

BEGIN;

INSERT INTO schema_migration (filename) VALUES ('037_commission_defaults_and_roles.sql')
  ON CONFLICT (filename) DO NOTHING;

-- Allow multiple assistant developers and creatives developers per plan.
DROP INDEX IF EXISTS idx_commission_share_assistant_dev;

-- Update DEFAULT values so new plans are seeded with the new split.
ALTER TABLE commission_plan
  ALTER COLUMN developer_bps SET DEFAULT 5500,
  ALTER COLUMN staff_bps     SET DEFAULT 3500,
  ALTER COLUMN company_bps   SET DEFAULT 1000,
  ALTER COLUMN referral_bps  SET DEFAULT 2000,
  ALTER COLUMN marketing_bps SET DEFAULT 5000,
  ALTER COLUMN accounting_bps SET DEFAULT 1000,
  ALTER COLUMN management_bps SET DEFAULT 2000;

COMMIT;
