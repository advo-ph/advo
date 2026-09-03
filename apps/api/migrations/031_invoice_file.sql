-- Migration 031: invoice_file table
-- Phase 7 of admin-simplify: upload-first invoice PDFs with extracted totals.
-- The existing `invoice` table is left intact for backward compatibility.
-- New UI uses `invoice_file` exclusively for the Finance tab.

CREATE TABLE invoice_file (
  invoice_file_id  bigserial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  recurring_fee_id integer REFERENCES recurring_fee(recurring_fee_id) ON DELETE SET NULL,
  file_url         text NOT NULL,
  file_name        text NOT NULL,
  file_number      integer NOT NULL,
  billing_month    varchar(20),
  total_cents      integer,
  phase_status     varchar(30) NOT NULL DEFAULT 'downpayment',
  paid_status      varchar(20) NOT NULL DEFAULT 'unpaid',
  created_by       integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_invoice_file_phase CHECK (phase_status IN ('downpayment', 'full')),
  CONSTRAINT chk_invoice_file_paid  CHECK (paid_status  IN ('unpaid', 'paid', 'overdue')),
  CONSTRAINT chk_invoice_file_number CHECK (file_number >= 0)
);

-- Unique sequential number per project
CREATE UNIQUE INDEX idx_invoice_file_project_number
  ON invoice_file (project_id, file_number);

CREATE INDEX idx_invoice_file_project
  ON invoice_file (project_id);

CREATE INDEX idx_invoice_file_recurring
  ON invoice_file (recurring_fee_id)
  WHERE recurring_fee_id IS NOT NULL;
