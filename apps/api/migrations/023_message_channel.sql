-- Migration 023: Message channels — where the client conversation actually happens.
--
-- docs/ROADMAP.md opens by saying it "synthesizes signals from the Messenger archive
-- (Apr–Jun 2026)". Read that again: the roadmap for this platform was assembled by a
-- human reading Messenger, because the platform itself cannot see any of it. Every
-- signal that matters commercially — "we lowk shuldv specified pala sa contract ung
-- revisions", "the 12k isnt enough as a downpayment" — arrived on a channel this
-- codebase has no model for, and reached the system only when somebody retyped it.
--
-- That is the whole defect. The change-order process (009) and the revision cap the P0
-- tier is built on both depend on a PAPER TRAIL of what the client asked for and when.
-- The paper trail exists; it is in Messenger, on somebody's phone.
--
-- ─── Three tables, and what each is for ───────────────────────────────────────
--
--   contact_channel   How to reach a client or lead on a channel that is not email,
--                     and — the load-bearing part — WHETHER WE MAY. See consent, below.
--
--   inbound_message   A message that arrived. Append-only, deduplicated on
--                     (channel, provider_message_id). Triage state (is_actioned) is the
--                     only mutable thing on it: what a client said is a fact, and facts
--                     do not get edited.
--
--   outbound_message  A message we sent, and — the point — the ones we FAILED to send.
--                     email.service.ts swallowed its own send failures for months and a
--                     missing key in prod was invisible until 2026-08-29. Adding three
--                     more channels without a visible failure ledger would rebuild that
--                     outage three times over.
--
-- ─── Consent is a column, not a convention (RA 10173) ─────────────────────────
--
-- docs/ROADMAP.md already flags this for the ~5K scraped clinic leads: that list is
-- personal data under the Philippine Data Privacy Act, and it names consent basis and
-- retention as open obligations. A phone number is worse than an email — SMS reaches
-- someone at 2am and costs them nothing to ignore but everything to receive.
--
-- So `consent_at` is NOT NULL-able by accident. A channel row with a null consent_at is
-- storable (we may know a number without permission to use it) but the send path
-- REFUSES it, and 023 is written so the refusal is a schema fact rather than a code
-- convention someone can forget. `consent_source` records WHERE the permission came
-- from, because "we have consent" without provenance is not a defence.
--
-- ─── Deliberate non-decisions ─────────────────────────────────────────────────
--
--   * NO conversation threading. An inbound message points at a client/project/lead and
--     nothing else. Threading is a product decision and modelling it now would guess.
--   * NO auto-reply, anywhere. Nothing in this migration lets the platform answer a
--     client on its own.
--   * NO message body retention policy yet. Bodies are kept; the retention question is
--     real and belongs with the DPA work, not smuggled in here as a default.
--   * NO enum for channel or provider. varchar growable set, the
--     recurring_fee.billing_interval precedent — a new channel must not need a migration.
--
-- Retention: inbound_message is permanent (it is the paper trail the contract work
-- needs). outbound_message is permanent (it is delivery evidence). contact_channel is
-- mutable reference data, and revoking consent NULLs consent_at rather than deleting the
-- row — deleting it loses the record that consent was ever given or withdrawn.

BEGIN;

-- ─── contact_channel ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_channel (
  contact_channel_id  bigserial PRIMARY KEY,
  client_id           integer REFERENCES client (client_id) ON DELETE CASCADE,
  lead_id             integer REFERENCES lead (lead_id) ON DELETE CASCADE,
  channel             varchar(20) NOT NULL,
  -- E.164 for sms/viber, a page-scoped id for messenger. Normalized by the app.
  reference           varchar(255) NOT NULL,
  display_name        varchar(255),
  is_primary          boolean NOT NULL DEFAULT false,
  -- NULL = we know the address and MAY NOT use it. The send path refuses.
  consent_at          timestamptz,
  consent_source      varchar(100),
  revoked_at          timestamptz,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW(),

  -- A channel row belongs to exactly one of a client or a lead. Both, or neither, means
  -- nobody can say whose data this is -- which is the first question a DPA request asks.
  CONSTRAINT chk_contact_channel_owner CHECK (
    (client_id IS NOT NULL AND lead_id IS NULL)
    OR (client_id IS NULL AND lead_id IS NOT NULL)
  ),
  -- Consent that was never given cannot be revoked. A row claiming otherwise is a
  -- data-entry error hiding as a permission.
  CONSTRAINT chk_contact_channel_revoke CHECK (
    revoked_at IS NULL OR consent_at IS NOT NULL
  )
);

COMMENT ON TABLE contact_channel IS
  'How to reach a client or lead on a non-email channel, and whether we MAY (migration 023). A row with consent_at IS NULL is a known address we are not permitted to use -- the send path refuses it. Storing the address is not permission to use it.';

COMMENT ON COLUMN contact_channel.consent_at IS
  'When permission to contact on this channel was given. NULL = NO PERMISSION, and outbound refuses. Under RA 10173 a scraped phone number is personal data with no consent basis attached; this column is what stops the ~5K scraped clinic list becoming an SMS blast.';

COMMENT ON COLUMN contact_channel.consent_source IS
  'WHERE the permission came from: contract | signup_form | client_reply | verbal_meeting_2026_05_26. "We have consent" without provenance is not a defence, so this is recorded next to the timestamp rather than assumed.';

COMMENT ON COLUMN contact_channel.revoked_at IS
  'When the person withdrew permission. Set INSTEAD of deleting the row -- deleting loses the evidence that consent was ever given, which is the record a DPA complaint is answered with.';

COMMENT ON COLUMN contact_channel.channel IS
  'App-validated growable set: sms | viber | messenger | whatsapp. varchar not an enum so a new channel needs no migration.';

CREATE INDEX IF NOT EXISTS idx_contact_channel_client ON contact_channel (client_id);
CREATE INDEX IF NOT EXISTS idx_contact_channel_lead ON contact_channel (lead_id);

-- One row per address per channel. The same number stored twice is two consent states
-- for one person, and there is no correct way to resolve that at send time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_channel_reference
  ON contact_channel (channel, reference);

-- ─── inbound_message ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_message (
  inbound_message_id   bigserial PRIMARY KEY,
  channel              varchar(20) NOT NULL,
  provider_message_id  varchar(255) NOT NULL,
  contact_channel_id   integer REFERENCES contact_channel (contact_channel_id) ON DELETE SET NULL,
  client_id            integer REFERENCES client (client_id) ON DELETE SET NULL,
  project_id           integer REFERENCES project (project_id) ON DELETE SET NULL,
  lead_id              integer REFERENCES lead (lead_id) ON DELETE SET NULL,
  -- Who sent it, in the channel's own vocabulary: E.164, or a page-scoped Messenger id.
  sender_reference     varchar(255) NOT NULL,
  sender_name          varchar(255),
  body                 text,
  attachment           jsonb,
  -- The provider's timestamp, not ours. When they disagree, theirs is the one a client
  -- will quote back, and a scope dispute turns on when something was said.
  sent_at              timestamptz,
  received_at          timestamptz NOT NULL DEFAULT NOW(),
  signature_verified   boolean NOT NULL,
  -- The ONLY mutable state here. What a client said is a fact.
  is_actioned          boolean NOT NULL DEFAULT false,
  actioned_at          timestamptz,
  actioned_by_user_id  integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  raw_payload          jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_inbound_message_actioned CHECK (
    (is_actioned = true AND actioned_at IS NOT NULL)
    OR (is_actioned = false AND actioned_at IS NULL)
  )
);

COMMENT ON TABLE inbound_message IS
  'A client or lead message that arrived on a non-email channel (migration 023). Append-only apart from triage state. This is the paper trail the change-order process (009) and the revision cap depend on -- it currently lives in Messenger on somebody phone, which is why the roadmap had to be assembled by hand from an export.';

COMMENT ON COLUMN inbound_message.provider_message_id IS
  'The provider''s own message id. Half of the replay guard -- Messenger and Viber both redeliver a webhook until they get a 2xx, so a duplicate is guaranteed rather than hypothetical.';

COMMENT ON COLUMN inbound_message.signature_verified IS
  'Whether the webhook signature checked out. Unverified messages are RECORDED (an unsigned callback is evidence of a probe) and flagged, never silently trusted as client speech -- a forged message in this table would be a fabricated paper trail.';

COMMENT ON COLUMN inbound_message.sent_at IS
  'The PROVIDER''s timestamp. Kept separately from received_at because a scope dispute turns on when something was said, and the client will quote the provider''s clock.';

COMMENT ON COLUMN inbound_message.is_actioned IS
  'Human triage state -- the only mutable column. False means nobody has looked at it yet, which is the queue the admin inbox renders.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_message_provider
  ON inbound_message (channel, provider_message_id);

CREATE INDEX IF NOT EXISTS idx_inbound_message_client ON inbound_message (client_id);
CREATE INDEX IF NOT EXISTS idx_inbound_message_project ON inbound_message (project_id);

-- The admin inbox's only scan: what has nobody looked at yet.
CREATE INDEX IF NOT EXISTS idx_inbound_message_untriaged
  ON inbound_message (received_at) WHERE is_actioned = false;

-- ─── outbound_message ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_message (
  outbound_message_id  bigserial PRIMARY KEY,
  channel              varchar(20) NOT NULL,
  provider             varchar(30) NOT NULL,
  contact_channel_id   integer REFERENCES contact_channel (contact_channel_id) ON DELETE SET NULL,
  to_reference         varchar(255) NOT NULL,
  body                 text NOT NULL,
  -- WHY this was sent. Not decoration: it is how "did the sign-off notice actually go
  -- out?" gets answered without reading message bodies.
  purpose              varchar(50) NOT NULL,
  related_entity_type  varchar(50),
  related_entity_id    integer,
  status               varchar(20) NOT NULL DEFAULT 'queued',
  provider_reference   varchar(255),
  failure_reason       text,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT NOW(),

  -- A failure with no reason is the exact shape of the 2026-08-29 mail outage: the send
  -- path caught, logged nothing useful, and returned as if it had worked.
  CONSTRAINT chk_outbound_message_failure CHECK (
    status <> 'failed' OR failure_reason IS NOT NULL
  ),
  CONSTRAINT chk_outbound_message_sent_at CHECK (
    status <> 'sent' OR sent_at IS NOT NULL
  )
);

COMMENT ON TABLE outbound_message IS
  'Every non-email message ADVO sent -- and, the actual point, every one it FAILED to send (migration 023). email.service.ts swallowed its own failures and prod ran with no mail transport for months, invisibly. Adding three channels without a visible failure ledger would have rebuilt that outage three times.';

COMMENT ON COLUMN outbound_message.status IS
  'queued | sent | failed | refused. "refused" is ours, not a provider''s: it means the send path declined BEFORE reaching a provider -- no consent on the contact_channel, or no transport configured. A refusal is not a failure and must not read as one.';

COMMENT ON COLUMN outbound_message.purpose IS
  'App-validated growable set: signoff_deadline | invoice_due | payment_receipt | custom. Recorded so "did the deemed-approval notice actually go out?" is a query, not an archaeology exercise across message bodies.';

COMMENT ON COLUMN outbound_message.failure_reason IS
  'Required by CHECK whenever status = failed. A failure with no reason is precisely the shape of the outage this table exists to prevent.';

CREATE INDEX IF NOT EXISTS idx_outbound_message_entity
  ON outbound_message (related_entity_type, related_entity_id);

-- The ops view: what did not go out.
CREATE INDEX IF NOT EXISTS idx_outbound_message_failed
  ON outbound_message (created_at) WHERE status IN ('failed', 'refused');

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('023_message_channel.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
