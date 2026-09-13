-- 045: correct the commission staff-pool defaults for marketing and management.
--
-- 037 set marketing_bps DEFAULT 5000 and management_bps DEFAULT 2000, the reverse of
-- the signed internal commission agreement
-- (data/corpus/document/internal-commission-agreement.json): Lead Partnerships 20% /
-- Management 50% / Marketing 20% / Accounting 10%. This swaps the two DEFAULTs.
--
-- Existing rows are NOT touched: a plan is a snapshot of the split it was agreed under.
-- Prod had no commission_plan rows when this was written, so there is nothing to backfill.
--
-- The 018 CHECK still holds on the defaults:
--   referral_bps + marketing_bps + accounting_bps + management_bps = 10000
--   (2000 + 2000 + 1000 + 5000 = 10000)
-- SET DEFAULT is idempotent, so re-running this file is harmless.

ALTER TABLE commission_plan
  ALTER COLUMN marketing_bps  SET DEFAULT 2000,
  ALTER COLUMN management_bps SET DEFAULT 5000;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('045_commission_staff_split_fix.sql', false)
ON CONFLICT (filename) DO NOTHING;
