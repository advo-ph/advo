-- Migration 020: Soft-bounce escalation — the counter that makes `soft_bounce_limit` reachable.
--
-- Migration 015 shipped the suppression list with five reasons. Four of them can happen:
-- an unsubscribe click writes `unsubscribe`, the delivery-failure callback writes
-- `hard_bounce` or `complaint`, an operator writes `manual`. The fifth, `soft_bounce_limit`,
-- has never been writable by anything. It was modelled and then left unreachable — the enum
-- arm named a policy that no code implemented.
--
-- HANDOFF.md, 2026-08-18, recorded both halves of the gap:
--
--     "Bounce/complaint arrives via POST /api/campaign/delivery-failure; no ESP webhook is
--      wired to it yet, so suppression from bounces is manual until that is connected."
--     "Soft-bounce escalation is modelled in the enum (soft_bounce_limit) but no counter
--      increments it yet."
--
-- This migration adds the counter. The route change that lets an ESP report a soft bounce
-- at all ships with it.
--
-- WHY THIS MATTERS BEFORE THE FIRST SEND, NOT AFTER. A hard bounce is self-announcing: one
-- report, one suppression, done. A soft bounce is the dangerous one precisely because it is
-- individually forgivable — a full mailbox, a greylist, a temporary reject. Retrying them
-- forever against a warming domain is the single most reliable way to get a sender blocked,
-- and the campaign sender is otherwise complete and waiting only on transport clearance.
-- The counter has to exist before the first campaign goes out, because after it goes out
-- the reputation damage is already priced in.
--
-- THREE DECISIONS WORTH ARGUING WITH, RECORDED SO NOBODY ASSUMES THEM:
--
-- 1. THE COUNT BELONGS TO THE ADDRESS, NOT THE RECIPIENT ROW. campaign_recipient already
--    has a per-campaign row per address and would have been the cheaper place to put an
--    integer. It would also have been wrong: the count would reset at every campaign
--    boundary, so an address that soft-bounces twice in each of five campaigns would sit
--    at 2 forever and never escalate. That address is exactly the one that must escalate.
--    Hence a table keyed on the address, spanning campaigns, mirroring email_suppression's
--    own choice to key on the address rather than on a campaign.
--
-- 2. THE COUNT IS CUMULATIVE, NOT CONSECUTIVE. A consecutive-failure counter is the
--    stricter model and the one a mature ESP uses — it resets on a successful delivery.
--    We cannot implement it honestly yet: nothing in this repo receives a DELIVERY event.
--    campaign_recipient.status = 'sent' means "handed to the transport", which is not
--    delivery, and resetting on it would silently zero the counter for every address that
--    accepts-then-defers. So the count only ever rises. That is the conservative direction:
--    it suppresses sooner than a consecutive counter would, never later. When a delivery
--    webhook lands, reset belongs there — see the note in campaign.service.ts.
--
-- 3. NO FOREIGN KEY TO campaign. A soft bounce is a fact about an address, not about the
--    campaign that happened to surface it, and the whole point of decision 1 is that the
--    row outlives any one campaign. last_campaign_id is deliberately absent rather than
--    nullable-and-stale; the campaign that triggered the escalation is recorded once, on
--    the email_suppression row, where it is actually read.
--
-- The threshold itself is NOT stored here. It is a named constant in campaign.service.ts
-- (SOFT_BOUNCE_LIMIT), because unlike the commission percentages in migration 018 there is
-- nothing to snapshot: no historical row's meaning changes when the policy is retuned. A
-- suppression already written stays written whatever the limit becomes.

CREATE TABLE IF NOT EXISTS email_soft_bounce (
    email_soft_bounce_id  BIGSERIAL PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL,
    soft_bounce_count     INTEGER      NOT NULL DEFAULT 0,
    last_soft_bounce_at   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- A count can only ever rise from zero. Guards a bad UPDATE, not a bad INSERT.
    CONSTRAINT chk_email_soft_bounce_count CHECK (soft_bounce_count >= 0),

    -- Migration 015 made email_suppression case-insensitive with a lower(email) EXPRESSION
    -- index, and normalization stayed a convention the application was trusted to follow.
    -- This table needs the opposite arrangement, for a concrete reason: the increment is an
    -- upsert, and ON CONFLICT can only infer a plain-column index through the query builder.
    -- So the uniqueness moves to the bare column and the normalization becomes a CHECK the
    -- database enforces. Same guarantee as 015, arrived at from the other side — and a
    -- non-normalized write is now rejected rather than merely deduplicated.
    CONSTRAINT chk_email_soft_bounce_email_lower CHECK (email = lower(email))
);

-- What makes the increment safe: the upsert in bumpSoftBounceCount() conflicts on this
-- index, so two ESP webhooks arriving for the same address at the same moment increment
-- once each instead of racing to write two rows that each count to one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_soft_bounce_email
    ON email_soft_bounce (email);
