-- Migration 005: expense ledger
--
-- Team-facing expense records for Admin Finance. amount_cents is integer cents
-- (same pattern as invoice.amount_cents / contract.value_cents). is_reimbursable
-- is NOT stored — it is derived at read time as (receipt_url IS NOT NULL) so a
-- free-floating boolean cannot disagree with the receipt. category is varchar
-- (app-validated) so the set can grow without a migration. project_id is
-- optional (agency overhead vs project-tied spend).

BEGIN;

CREATE TABLE IF NOT EXISTS expense (
  expense_id     bigserial PRIMARY KEY,
  project_id     integer REFERENCES project(project_id) ON DELETE SET NULL,
  purpose        text NOT NULL,
  authorized_by  varchar(255) NOT NULL,
  amount_cents   integer NOT NULL,
  location       varchar(255),
  receipt_url    varchar(500),
  category       varchar(50) NOT NULL DEFAULT 'other',
  created_by     integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE expense IS
  'Agency expense ledger. amount_cents is integer cents. is_reimbursable is derived (receipt_url IS NOT NULL) — never stored. category is app-validated varchar.';

CREATE INDEX IF NOT EXISTS idx_expense_project   ON expense(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_created_by ON expense(created_by);
CREATE INDEX IF NOT EXISTS idx_expense_created_at ON expense(created_at);

COMMIT;
