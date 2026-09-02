-- Migration 025: The CHECK constraints this repo has been declaring but never creating.
--
-- ─── The defect, and how it was found ─────────────────────────────────────────
--
-- Found 2026-09-02 by applying every migration in order to a throwaway database and then
-- asking Postgres which constraints actually existed. **30 of the 34 CHECK constraints
-- declared across apps/api/migrations do not exist in any database bootstrapped the way
-- docs/SETUP.md prescribes.**
--
-- The mechanism, exactly:
--
--   1. SETUP.md line 31 says `npm --workspace apps/api run db:push` — create the tables
--      from `schema.ts` — and that is how every dev box and prod was bootstrapped.
--   2. `schema.ts` is a drizzle model. Drizzle does not express CHECK constraints, so
--      push creates every table WITHOUT them.
--   3. The migrations then run `CREATE TABLE IF NOT EXISTS <same table>`. The table
--      already exists, so the statement is a NO-OP — and every CHECK constraint declared
--      *inside* that CREATE TABLE is silently skipped.
--   4. Nothing failed. The migration reported success, the ledger recorded it as applied,
--      and the constraints simply were not there.
--
-- This is the same family as the failure migration 019 exists to catch — a database whose
-- real shape differs from what the tree says — but worse, because 019 compares FILENAMES.
-- Every one of these migrations is correctly recorded as applied. The ledger is right and
-- the schema is still wrong.
--
-- ─── Why this is not cosmetic ─────────────────────────────────────────────────
--
-- Several of the missing constraints are the enforcement half of a documented invariant:
--
--   chk_recurring_fee_day        billing_day_of_month BETWEEN 1 AND 28 — 017 caps it at
--                                28 precisely so February and the 30-day months cannot
--                                silently skip a billing period. Absent, a 31 is storable
--                                and a client's invoice quietly does not get raised.
--   chk_commission_plan_top      developer + staff + company = 10000 bps. Absent, a plan
--                                can total 90% and the missing 10% belongs to nobody.
--   chk_project_signoff_status   (status = 'signed') = (signed_at IS NOT NULL). Absent, a
--                                sign-off can claim to be signed with no timestamp — and
--                                that timestamp starts the final-payment clock and the
--                                revision cutoff.
--   chk_outbound_message_failure a failed send must carry a reason. Absent, 023 rebuilds
--                                exactly the invisible-failure shape it was written to
--                                prevent.
--   chk_payment_intent_paid_at   status and paid_at must agree, on the table a payment
--                                dispute is argued from.
--
-- ─── Why a new migration rather than editing the old ones ─────────────────────
--
-- The historical migrations are already recorded as applied on prod, so editing them
-- changes nothing there — they will never run again. A NEW migration is the only
-- mechanism that reaches a database which has already been through 016–024.
--
-- ─── ALTER, not CREATE TABLE ──────────────────────────────────────────────────
--
-- Every statement below is `ALTER TABLE ... ADD CONSTRAINT`, wrapped in the guarded DO
-- block this repo already uses (010, 014, 021). That works whether the table was created
-- by drizzle push or by the migration, and re-running it is a no-op.
--
-- ─── If this migration FAILS, that is the point ───────────────────────────────
--
-- Adding a CHECK to a table containing rows that violate it raises
-- `check constraint ... is violated by some row`, and the transaction rolls back. That is
-- CORRECT and must not be worked around with NOT VALID. A failure here means real data
-- has been sitting outside a rule the code believed was enforced — which is exactly what
-- somebody needs to look at before the constraint goes on. Fix the rows, then re-run.

BEGIN;

-- ─── 016: project sign-off ────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE project_signoff ADD CONSTRAINT chk_project_signoff_payment
    CHECK (final_payment_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE project_signoff ADD CONSTRAINT chk_project_signoff_allowance
    CHECK (free_revision_total_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE project_signoff ADD CONSTRAINT chk_project_signoff_clock
    CHECK (payment_due_day_count > 0 AND revision_window_month_count > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The one that guards the final-payment clock and the revision cutoff.
DO $$ BEGIN
  ALTER TABLE project_signoff ADD CONSTRAINT chk_project_signoff_status
    CHECK ((status = 'signed') = (signed_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE project_signoff ADD CONSTRAINT chk_project_signoff_issued
    CHECK (signed_at IS NULL OR issued_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE signoff_revision ADD CONSTRAINT chk_signoff_revision_round
    CHECK (round_number > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 017: recurring fee ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE recurring_fee ADD CONSTRAINT chk_recurring_fee_amount
    CHECK (amount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE recurring_fee ADD CONSTRAINT chk_recurring_fee_grace
    CHECK (grace_day_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1..28 so no month can silently skip a billing period. See 017's header.
DO $$ BEGIN
  ALTER TABLE recurring_fee ADD CONSTRAINT chk_recurring_fee_day
    CHECK (billing_day_of_month BETWEEN 1 AND 28);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE recurring_fee ADD CONSTRAINT chk_recurring_fee_window
    CHECK (ends_on IS NULL OR ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 018: commission split ────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE commission_plan ADD CONSTRAINT chk_commission_plan_basis
    CHECK (basis_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The one that makes the split exhaustive: 60/25/15 must total 100%.
DO $$ BEGIN
  ALTER TABLE commission_plan ADD CONSTRAINT chk_commission_plan_top
    CHECK (developer_bps + staff_bps + company_bps = 10000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_plan ADD CONSTRAINT chk_commission_plan_staff
    CHECK (referral_bps + marketing_bps + accounting_bps + management_bps = 10000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_plan ADD CONSTRAINT chk_commission_plan_bps_sign
    CHECK (
      developer_bps >= 0 AND staff_bps >= 0 AND company_bps >= 0
      AND referral_bps >= 0 AND marketing_bps >= 0
      AND accounting_bps >= 0 AND management_bps >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_plan ADD CONSTRAINT chk_commission_plan_stamp
    CHECK ((status = 'finalized') = (finalized_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_share ADD CONSTRAINT chk_commission_share_weight
    CHECK (contribution_bps >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_share ADD CONSTRAINT chk_commission_share_amount
    CHECK (amount_cents IS NULL OR amount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The company reserve is a real share row with a NULL member, not a leftover. This is
-- what keeps SUM(share) = plan.basis exact with no residue hiding anywhere.
DO $$ BEGIN
  ALTER TABLE commission_share ADD CONSTRAINT chk_commission_share_member
    CHECK (
      (role = 'company' AND team_member_id IS NULL)
      OR (role <> 'company' AND team_member_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE commission_share ADD CONSTRAINT chk_commission_share_agreed
    CHECK (
      (is_agreed = false AND agreed_at IS NULL)
      OR (is_agreed = true AND agreed_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 020: soft bounce ─────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE email_soft_bounce ADD CONSTRAINT chk_email_soft_bounce_count
    CHECK (soft_bounce_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Addresses are stored lowercased so the counter cannot be split across casings — the
-- whole point of keying suppression on the address rather than the recipient row.
DO $$ BEGIN
  ALTER TABLE email_soft_bounce ADD CONSTRAINT chk_email_soft_bounce_email_lower
    CHECK (email = lower(email));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 022: payment ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE payment_intent ADD CONSTRAINT chk_payment_intent_amount
    CHECK (amount_cents > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- On the table a chargeback is argued from, status and timestamp must agree.
DO $$ BEGIN
  ALTER TABLE payment_intent ADD CONSTRAINT chk_payment_intent_paid_at
    CHECK (
      (status = 'paid' AND paid_at IS NOT NULL)
      OR (status <> 'paid' AND paid_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 023: message channels ────────────────────────────────────────────────────

-- Whose personal data this is must be unambiguous — the first question a DPA request asks.
DO $$ BEGIN
  ALTER TABLE contact_channel ADD CONSTRAINT chk_contact_channel_owner
    CHECK (
      (client_id IS NOT NULL AND lead_id IS NULL)
      OR (client_id IS NULL AND lead_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE contact_channel ADD CONSTRAINT chk_contact_channel_revoke
    CHECK (revoked_at IS NULL OR consent_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inbound_message ADD CONSTRAINT chk_inbound_message_actioned
    CHECK (
      (is_actioned = true AND actioned_at IS NOT NULL)
      OR (is_actioned = false AND actioned_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A failure with no reason is the exact shape of the 2026-08-29 mail outage.
DO $$ BEGIN
  ALTER TABLE outbound_message ADD CONSTRAINT chk_outbound_message_failure
    CHECK (status <> 'failed' OR failure_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE outbound_message ADD CONSTRAINT chk_outbound_message_sent_at
    CHECK (status <> 'sent' OR sent_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 024: time entry ──────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE time_entry ADD CONSTRAINT chk_time_entry_minute
    CHECK (minute_count > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 16 hours. Catches the two real data-entry errors: hours typed into a minutes field,
-- and a misplaced zero.
DO $$ BEGIN
  ALTER TABLE time_entry ADD CONSTRAINT chk_time_entry_maximum
    CHECK (minute_count <= 960);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('025_enforce_check_constraint.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
