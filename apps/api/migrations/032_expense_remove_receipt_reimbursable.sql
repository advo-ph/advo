-- Migration 032 — Expense table: remove receipt_url; add expense_type and expense_paid_status
-- Phase 8, admin-simplify.
--
-- receipt_url is removed. The derived is_reimbursable field (receipt_url IS NOT NULL) loses its
-- basis and is removed from all API response paths. Existing rows that had a non-null receipt_url
-- will lose that data — acceptable per Phase 8 simplification decision.
--
-- expense_type:         'development_expenses' | 'general_expenses'
-- expense_paid_status:  'paid' | 'unpaid'
--
-- Existing rows default to: expense_type = 'general_expenses', expense_paid_status = 'unpaid'.

BEGIN;

INSERT INTO schema_migration (filename) VALUES ('032_expense_remove_receipt_reimbursable.sql')
  ON CONFLICT (filename) DO NOTHING;

ALTER TABLE expense
  DROP COLUMN IF EXISTS receipt_url,
  ADD COLUMN IF NOT EXISTS team_member_id      bigint       REFERENCES team_member(team_member_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_type        varchar(40)  NOT NULL DEFAULT 'general_expenses',
  ADD COLUMN IF NOT EXISTS expense_paid_status varchar(20)  NOT NULL DEFAULT 'unpaid';

ALTER TABLE expense
  ADD CONSTRAINT chk_expense_type
    CHECK (expense_type IN ('development_expenses', 'general_expenses')),
  ADD CONSTRAINT chk_expense_paid_status
    CHECK (expense_paid_status IN ('paid', 'unpaid'));

-- authorizedBy and location are no longer in the Phase 8 form but the columns
-- stay in the database to preserve existing data. They are simply not returned
-- by the updated routes.

COMMIT;
