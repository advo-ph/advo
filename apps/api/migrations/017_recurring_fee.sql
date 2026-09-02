-- Migration 017: Recurring infrastructure fee — the FIRST recurring money in this repo.
--
-- The FourlinQ MOA (2026-08-11) commits the client to a ₱3,000.00/month infrastructure
-- fee "billed on the 1st of every month" covering hosting, database maintenance and
-- domain renewal, and grants ADVO the RIGHT to suspend hosting and API access if that
-- fee "is not paid within 15 days of the due date". Until now `invoice` was one-shot
-- only (unpaid/paid/overdue) and nothing in the codebase could bill twice.
--
-- NO parallel billing system. The generated charge IS an ordinary `invoice` row; this
-- migration only adds two nullable columns to `invoice` so a row can point back at the
-- schedule that minted it and at the period it settles. An invoice with
-- recurring_fee_id IS NULL behaves exactly as it does today.
--
-- Three deliberate non-decisions, recorded so nobody assumes them:
--   * NO new invoice_status value. "suspended" is not a payment state.
--   * NO penalty interest. The contract's 2%/month clause is a separate, deferred model;
--     amount_cents here is the flat fee only.
--   * NO automatic suspension. suspended_at is written ONLY by an explicit human POST.
--     The model derives whether suspension is JUSTIFIED; invoking it stays a legal act.
--
-- Every billing anchor is DATE, not timestamptz. "The 1st" means the 1st in Asia/Manila,
-- and a timestamptz anchor would generate the December invoice on Nov 30 16:00 UTC.
-- The service resolves "today" through one BILLING_TIMEZONE constant.
--
-- Retention: a generated invoice is billing history. The FK is ON DELETE SET NULL so
-- deleting a schedule can never erase the invoices it already raised.

BEGIN;

DO $$ BEGIN
  CREATE TYPE recurring_fee_status AS ENUM (
    'active',
    'paused',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS recurring_fee (
  recurring_fee_id       bigserial PRIMARY KEY,
  project_id             integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,
  label                  varchar(255) NOT NULL,
  amount_cents           integer NOT NULL,
  billing_interval       varchar(20) NOT NULL DEFAULT 'monthly',
  billing_day_of_month   integer NOT NULL DEFAULT 1,
  grace_day_count        integer NOT NULL DEFAULT 15,
  status                 recurring_fee_status NOT NULL DEFAULT 'active',
  starts_on              date NOT NULL,
  ends_on                date,
  next_run_on            date NOT NULL,
  last_generated_on      date,
  is_suspension_enabled  boolean NOT NULL DEFAULT true,
  suspended_at           timestamptz,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_recurring_fee_amount CHECK (amount_cents >= 0),
  CONSTRAINT chk_recurring_fee_grace  CHECK (grace_day_count >= 0),
  -- Capped at 28 precisely so February and the 30-day months never silently skip a
  -- billing period. A client demanding the 31st is a schema decision, not a workaround.
  CONSTRAINT chk_recurring_fee_day    CHECK (billing_day_of_month BETWEEN 1 AND 28),
  CONSTRAINT chk_recurring_fee_window CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

COMMENT ON TABLE recurring_fee IS
  'Per-project recurring infrastructure/retainer fee (migration 017). Generates real invoice rows on a monthly anchor. FourlinQ: ₱3,000.00/month, billed on the 1st, 15-day grace. Suspension is DERIVED, never stored as a status.';

COMMENT ON COLUMN recurring_fee.amount_cents IS
  'Integer CENTS. FourlinQ monthly infrastructure fee = 300000 (₱3,000.00). Never float, never string. The flat fee ONLY — penalty interest is not modelled here.';

COMMENT ON COLUMN recurring_fee.grace_day_count IS
  'Calendar days after due_date before suspension becomes justified (contract hosting clause: "within 15 days of the due date"). NOTE: the payment clause elsewhere in the same contract says 15 BUSINESS days — the two readings differ by about a week. This column implements the hosting clause, in calendar days.';

COMMENT ON COLUMN recurring_fee.next_run_on IS
  'The generator idempotency anchor. Advanced only forward, never rewound by an update. Initialized to max(starts_on, today) so a fee back-dated by a year does not mint a year of invoices on its first tick.';

COMMENT ON COLUMN recurring_fee.suspended_at IS
  'Set ONLY by an explicit human POST /suspend, and only when suspension is already justified. Justified != done. Nothing in this model auto-suspends hosting, revokes an API key, or touches a deploy.';

COMMENT ON COLUMN recurring_fee.billing_interval IS
  'App-validated growable set: monthly | quarterly | annual. varchar not an enum so the set can grow without a migration (contract / change_order precedent). The contract uses monthly.';

CREATE INDEX IF NOT EXISTS idx_recurring_fee_project ON recurring_fee (project_id);

-- The generator's only scan.
CREATE INDEX IF NOT EXISTS idx_recurring_fee_due
  ON recurring_fee (next_run_on) WHERE status = 'active';

-- ─── invoice: two nullable columns. Nothing existing changes. ───

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS recurring_fee_id integer
  REFERENCES recurring_fee (recurring_fee_id) ON DELETE SET NULL;

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS period_start_on date;

COMMENT ON COLUMN invoice.recurring_fee_id IS
  'NULL = an ordinary one-shot milestone invoice, exactly as before migration 017. Non-NULL = generated by a recurring_fee. Recurring rows are excluded from project contract-value and collection aggregates: the contract states the Total Fee "does not cover the ongoing costs".';

COMMENT ON COLUMN invoice.period_start_on IS
  'The billing period this row settles (the anchor date, e.g. 2026-09-01). NULL for one-shot invoices. Half of the double-bill guard.';

-- THE double-bill guard, enforced by the DB rather than by application care
-- (campaign_recipient precedent). A double-clicked /run generates nothing twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_recurring_period
  ON invoice (recurring_fee_id, period_start_on) WHERE recurring_fee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_recurring_fee
  ON invoice (recurring_fee_id) WHERE recurring_fee_id IS NOT NULL;

COMMIT;
