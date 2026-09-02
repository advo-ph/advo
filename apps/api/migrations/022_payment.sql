-- Migration 022: Payment rail — the first way money can actually ARRIVE in this repo.
--
-- Everything upstream of this migration models money that is owed. `invoice` (001) says
-- how much, `recurring_fee` (017) says how often, `commission_plan` (018) says how it
-- splits once it lands. Nothing said how it LANDS. `invoices.routes.ts` is CRUD: an
-- admin types a number, and a human collects it out-of-band, over GCash, and remembers
-- to come back and flip the status by hand.
--
-- That gap is why the P0 tier reads the way it does. The FourlinQ downpayment "wasn't
-- enough" and the ₱3,000/month infrastructure fees for FourlinQ and Felici are
-- contracted but, in the platform's own words, "tracked nowhere". Three migrations model
-- the money and none of it can move.
--
-- ─── The shape, and what it deliberately is NOT ────────────────────────────────
--
-- NO PARALLEL MONEY STATE. `invoice.status` / `invoice.paid_at` remain the single answer
-- to "is this paid". A payment_intent is an ATTEMPT to collect an invoice through a
-- provider; settling it WRITES INTO the invoice. This is the same discipline 017 chose
-- when it refused to add a second billing table, and for the same reason: two tables
-- that both claim to know whether a client has paid will disagree, in production, about
-- a real client's real money.
--
-- TWO TABLES, ONE OF THEM APPEND-ONLY:
--
--   payment_intent — the collectable. One row per attempt. Carries the provider's
--     reference and the checkout URL a client actually opens. Amount is SNAPSHOTTED at
--     creation, because an admin may edit the invoice afterwards and a link that was
--     issued for ₱12,000 must not settle a ₱60,000 invoice.
--
--   payment_event  — the webhook ledger. Append-only, deduplicated on
--     (provider, provider_event_id). Every callback a provider sends is written here
--     BEFORE anything is decided, including the ones that fail signature verification.
--     A payment dispute is argued from this table.
--
-- ─── Five invariants, each asserted by apps/web/src/test/payment.test.ts ───────
--
--   1. SETTLEMENT IS IDEMPOTENT. Providers retry. PayMongo and Xendit both redeliver a
--      webhook until they get a 2xx, and a network blip between our COMMIT and our
--      response guarantees at least one duplicate. The unique index on
--      (provider, provider_event_id) makes a replay a no-op at the DB level rather than
--      a second settlement — the same choice 017 made for double-billing and 015 made
--      for campaign recipients.
--
--   2. AN UNVERIFIED WEBHOOK NEVER SETTLES ANYTHING. signature_verified is NOT NULL and
--      recorded per event. An unsigned or badly-signed callback is stored (so an attack
--      is visible) and then refused. Without this, "mark invoice paid" is an unauthed
--      public endpoint, and the URL is printed in the provider's dashboard.
--
--   3. THE AMOUNT MUST MATCH. Settlement compares the provider's reported amount against
--      the snapshot. A mismatch records the event, marks the intent failed, and leaves
--      the invoice alone for a human. Partial payment is a real thing in PH B2B and it
--      must not round up to "paid".
--
--   4. CENTS, INTEGER, ALWAYS. ₱3,000.00 is 300000. Never a float, never a string. Both
--      PayMongo and Xendit speak cents natively, so no conversion happens anywhere.
--
--   5. NOTHING IS AUTOMATED BEYOND THE LEDGER. Settling an invoice does not finalize a
--      commission plan, does not resume a suspended host, does not issue a receipt.
--      Those are decisions with legal or contractual weight (017: "justified != done").
--      This migration makes them POSSIBLE and leaves them to a person.
--
-- ─── Provider set ─────────────────────────────────────────────────────────────
--
-- varchar, not an enum, for the provider — the growable-set precedent from
-- recurring_fee.billing_interval and contract. Adding a rail must not need a migration.
-- Known today: manual | paymongo | xendit.
--
--   manual   — the honest default and what the business does TODAY. Records the
--              collectable with no checkout URL, so a bank/GCash transfer settled by
--              hand still leaves a row and an audit trail. Never returns a fake link.
--   paymongo — the intended primary. Cards + GCash + Maya + GrabPay, PH-domiciled.
--              Blocked on merchant review, which is what the /terms /privacy /refund
--              /dispute disclosure work exists to unblock.
--   xendit   — the second rail, so a merchant-review delay on one provider cannot hold
--              collection hostage. Same seam, same tables, one env var apart.
--
-- ─── Retention ────────────────────────────────────────────────────────────────
--
-- Permanent, both tables. This is financial history and dispute evidence. payment_event
-- carries a raw provider payload, which is exactly what a chargeback is argued from;
-- pruning it to save bytes trades a real legal position for nothing. The FK from event
-- to intent is ON DELETE SET NULL so removing an intent can never erase the callbacks
-- that proved a client paid.

BEGIN;

CREATE TYPE payment_intent_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled'
);

-- ─── payment_intent ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_intent (
  payment_intent_id   bigserial PRIMARY KEY,
  invoice_id          integer NOT NULL REFERENCES invoice (invoice_id) ON DELETE CASCADE,
  provider            varchar(30) NOT NULL,
  provider_reference  varchar(255),
  checkout_url        text,
  amount_cents        integer NOT NULL,
  currency            char(3) NOT NULL DEFAULT 'PHP',
  status              payment_intent_status NOT NULL DEFAULT 'pending',
  method              varchar(30),
  paid_at             timestamptz,
  expires_at          timestamptz,
  failure_reason      text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW(),

  -- A zero-peso collectable is a data-entry error, not a free invoice.
  CONSTRAINT chk_payment_intent_amount CHECK (amount_cents > 0),
  -- paid_at and status must agree. A row that says 'paid' with no timestamp, or carries
  -- a timestamp while pending, is the exact ambiguity that makes a ledger unarguable.
  CONSTRAINT chk_payment_intent_paid_at CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid' AND paid_at IS NULL)
  )
);

COMMENT ON TABLE payment_intent IS
  'One attempt to collect an invoice through a payment provider (migration 022). NOT a second source of truth for whether a client has paid -- settling an intent writes invoice.paid_at, and invoice.status stays the single answer.';

COMMENT ON COLUMN payment_intent.provider IS
  'App-validated growable set: manual | paymongo | xendit. varchar not an enum so a new rail needs no migration (recurring_fee.billing_interval precedent). "manual" is the honest default -- it records the collectable and returns NO checkout URL rather than inventing one.';

COMMENT ON COLUMN payment_intent.amount_cents IS
  'Integer CENTS, SNAPSHOTTED at creation. Deliberately not read through to invoice.amount_cents: an admin may edit the invoice after a link is issued, and a link issued for PHP 12,000.00 must never settle a PHP 60,000.00 invoice.';

COMMENT ON COLUMN payment_intent.provider_reference IS
  'The provider''s own identifier for this collectable (PayMongo link id, Xendit invoice id). The join key when a webhook arrives carrying only the provider''s vocabulary. NULL for a manual intent, which no provider knows about.';

COMMENT ON COLUMN payment_intent.method IS
  'How the client actually paid, as REPORTED by the provider: gcash | maya | card | grab_pay | dob | bank_transfer | over_the_counter. Never assumed, never defaulted -- an unreported method stays NULL.';

COMMENT ON COLUMN payment_intent.failure_reason IS
  'Why this attempt did not settle, in the provider''s words, plus our own amount-mismatch refusal. Read by a human deciding whether to reissue.';

CREATE INDEX IF NOT EXISTS idx_payment_intent_invoice ON payment_intent (invoice_id);

-- The webhook's only lookup: resolve a provider reference back to our row. Partial
-- because a manual intent has no reference and would otherwise bloat the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intent_provider_reference
  ON payment_intent (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- The ops view: what is still outstanding.
CREATE INDEX IF NOT EXISTS idx_payment_intent_pending
  ON payment_intent (created_at) WHERE status = 'pending';

-- ─── payment_event ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_event (
  payment_event_id    bigserial PRIMARY KEY,
  provider            varchar(30) NOT NULL,
  provider_event_id   varchar(255) NOT NULL,
  payment_intent_id   integer REFERENCES payment_intent (payment_intent_id) ON DELETE SET NULL,
  event_type          varchar(100) NOT NULL,
  signature_verified  boolean NOT NULL,
  is_settled          boolean NOT NULL DEFAULT false,
  refusal_reason      text,
  payload             jsonb NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT NOW(),
  processed_at        timestamptz
);

COMMENT ON TABLE payment_event IS
  'Append-only ledger of every callback a payment provider sent us (migration 022), INCLUDING the ones that failed signature verification -- an unsigned callback is evidence of an attack and deleting it hides one. A chargeback is argued from this table.';

COMMENT ON COLUMN payment_event.provider_event_id IS
  'The provider''s own event id. Half of the replay guard: providers redeliver until they get a 2xx, so at-least-once delivery is guaranteed and a duplicate must be a no-op rather than a second settlement.';

COMMENT ON COLUMN payment_event.signature_verified IS
  'Whether the HMAC / callback token on this request checked out. FALSE rows are RECORDED and REFUSED -- never settled. Without this the settle path is an unauthenticated public endpoint whose URL is printed in the provider''s own dashboard.';

COMMENT ON COLUMN payment_event.is_settled IS
  'True only when this event actually moved an invoice to paid. A verified, deduplicated, amount-matching event that arrives for an already-paid invoice is legitimately false -- and that is the replay guard working, not a failure.';

COMMENT ON COLUMN payment_event.refusal_reason IS
  'Why this event changed nothing: bad_signature | unknown_reference | amount_mismatch | already_paid | unhandled_type. The first two are security findings; the third is a partial payment a human must look at.';

COMMENT ON COLUMN payment_event.payload IS
  'The raw provider body, verbatim. Kept permanently: this is the document a dispute is argued from, and reconstructing it later is impossible.';

-- THE replay guard, enforced by the DB rather than by application care.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_event_provider_event
  ON payment_event (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_event_intent ON payment_event (payment_intent_id);

-- The security view: everything that failed to verify, newest first.
CREATE INDEX IF NOT EXISTS idx_payment_event_unverified
  ON payment_event (received_at) WHERE signature_verified = false;

-- ─── invoice: one nullable column. Nothing existing changes. ──────────────────

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS settled_payment_intent_id integer
  REFERENCES payment_intent (payment_intent_id) ON DELETE SET NULL;

COMMENT ON COLUMN invoice.settled_payment_intent_id IS
  'Which collection attempt actually settled this invoice (migration 022). NULL means paid out-of-band or not paid at all -- both of which stay valid, because invoice.status remains the single source of truth and this column only records HOW.';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('022_payment.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
