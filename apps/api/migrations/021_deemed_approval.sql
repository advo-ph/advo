-- Migration 021: Deemed approval — the notice that makes the revision allowance finite.
--
-- CONTRACTS.md Policy 3 defines the only mechanism by which a silent client stops being
-- able to hold a project open forever:
--
--     1. Client has 15 business days to give feedback on a review delivery.
--     2. On expiry, ADVO issues a formal Notice of Pending Deemed Approval.
--     3. If no response within 15 further business days, the revision is deemed approved.
--
-- and then, in the same policy, the sentence this migration exists for:
--
--     "The notice in step 2 is mandatory and must be issued formally and in writing.
--      Deemed approval does not trigger without it — skipping the notice forfeits the
--      whole mechanism."
--
-- Until now `signoff_revision` recorded that a round was consumed and nothing else. There
-- was no delivery date, so clock 1 could not start; no notice record, so step 2 could not
-- be evidenced; and no place to record the outcome. The contract's central commercial
-- defence was unmodelled, which in practice means unusable: ADVO cannot claim deemed
-- approval it has no record of having earned.
--
-- FOUR DECISIONS, RECORDED SO NOBODY HAS TO GUESS WHY:
--
-- 1. THE NOTICE IS EVIDENCE, NOT A FLAG. `notice_issued_at` alone would let someone tick a
--    box and call the mechanism satisfied. `notice_reference` is NOT NULL whenever the
--    notice exists (CHECK below) precisely so the row cannot claim a notice it cannot
--    point at — a message-id, a file path, a sent-mail link. "Formally and in writing"
--    means there is something to produce at dispute time.
--
-- 2. DEEMED APPROVAL IS RECORDED BY A HUMAN, NEVER DERIVED INTO EXISTENCE. There is no job
--    that flips these rows. CONTRACTS.md is explicit that non-response is recorded by a
--    person; the deadline columns are inputs to a judgement, not a trigger. This is also
--    why `deemed_approved_by` is here: the mechanism's value at dispute time is that a
--    named person asserted it on a date.
--
-- 3. THE DEADLINES ARE NOT STORED. Everything derivable is derived in
--    project-signoff.service.ts on every read, matching how payment_due and
--    revision_window already work. A stored deadline is a deadline that can silently
--    disagree with the policy after someone edits the day counts.
--
-- 4. THE DAY COUNTS LIVE ON THE SIGNOFF, NOT HERE. 15 + 15 is the current contract, not a
--    law of nature, and the sent contract already contains a known inconsistency (the
--    payment table says 10 calendar days, the Revisions clause says 15 business days --
--    see CONTRACTS.md Policy 3). Making them columns means the next contract revision is a
--    data change, and means an older project keeps the terms it was actually sold.
--
-- Retention: permanent, with the signoff. This is the paper trail the clause depends on.

BEGIN;

-- ─── Configurable windows, defaulted to the sent contract ───

ALTER TABLE project_signoff
  ADD COLUMN IF NOT EXISTS feedback_window_business_day_count integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS notice_window_business_day_count   integer NOT NULL DEFAULT 15;

COMMENT ON COLUMN project_signoff.feedback_window_business_day_count IS
  'Business days a client has to respond to a review delivery before a Notice of Pending Deemed Approval may be issued. CONTRACTS.md Policy 3 step 1; 15 in the contract sent 2026-08-11.';

COMMENT ON COLUMN project_signoff.notice_window_business_day_count IS
  'Business days after the Notice is issued before the revision may be treated as deemed approved. CONTRACTS.md Policy 3 step 3; 15 in the contract sent 2026-08-11.';

-- ─── The clock, the notice, and the outcome ───

ALTER TABLE signoff_revision
  ADD COLUMN IF NOT EXISTS review_delivered_on  date,
  ADD COLUMN IF NOT EXISTS client_responded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS notice_issued_at     timestamptz,
  ADD COLUMN IF NOT EXISTS notice_reference     text,
  ADD COLUMN IF NOT EXISTS deemed_approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS deemed_approved_by   integer;

COMMENT ON COLUMN signoff_revision.review_delivered_on IS
  'The date the review was delivered to the client. Starts clock 1. NULL means the round was logged but no delivery date was captured, so no deemed-approval clock runs for it.';

COMMENT ON COLUMN signoff_revision.client_responded_at IS
  'First client response after delivery. Stops both clocks; a responded round can never become deemed approved.';

COMMENT ON COLUMN signoff_revision.notice_issued_at IS
  'When the formal Notice of Pending Deemed Approval was issued. Starts clock 2. Without this, deemed approval is forfeit no matter how long the silence ran.';

COMMENT ON COLUMN signoff_revision.notice_reference IS
  'Where the issued notice can be produced from — message-id, sent-mail link, file path. Required whenever notice_issued_at is set.';

COMMENT ON COLUMN signoff_revision.deemed_approved_at IS
  'When a human recorded the revision as deemed approved. Never written by a scheduled job — see the header.';

DO $$ BEGIN
  ALTER TABLE signoff_revision
    ADD CONSTRAINT signoff_revision_deemed_approved_by_user_fk
    FOREIGN KEY (deemed_approved_by) REFERENCES "user" (user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A notice that cannot be produced is not a notice. Both halves or neither.
DO $$ BEGIN
  ALTER TABLE signoff_revision
    ADD CONSTRAINT chk_signoff_revision_notice_evidenced
    CHECK (
      (notice_issued_at IS NULL AND notice_reference IS NULL)
      OR (notice_issued_at IS NOT NULL AND notice_reference IS NOT NULL AND length(btrim(notice_reference)) > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The forfeiture rule, enforced by the database rather than trusted to a service:
-- deemed approval cannot exist without the notice that earns it.
DO $$ BEGIN
  ALTER TABLE signoff_revision
    ADD CONSTRAINT chk_signoff_revision_deemed_requires_notice
    CHECK (deemed_approved_at IS NULL OR notice_issued_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A round the client answered cannot also be deemed approved. Catching this in the schema
-- matters because the two writes arrive from different routes and could race.
DO $$ BEGIN
  ALTER TABLE signoff_revision
    ADD CONSTRAINT chk_signoff_revision_deemed_excludes_response
    CHECK (deemed_approved_at IS NULL OR client_responded_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ordering: a notice issued before the review was delivered is a data-entry error, not a
-- fast clock.
DO $$ BEGIN
  ALTER TABLE signoff_revision
    ADD CONSTRAINT chk_signoff_revision_notice_after_delivery
    CHECK (
      notice_issued_at IS NULL
      OR review_delivered_on IS NULL
      OR notice_issued_at >= review_delivered_on::timestamptz
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The admin view is "which rounds are silent and how close are they" — an index on the
-- open ones keeps that cheap as the revision ledger grows.
CREATE INDEX IF NOT EXISTS idx_signoff_revision_awaiting
  ON signoff_revision (review_delivered_on)
  WHERE client_responded_at IS NULL AND deemed_approved_at IS NULL;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('021_deemed_approval.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
