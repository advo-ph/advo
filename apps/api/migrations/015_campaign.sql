-- Migration 015: email campaign sender (mass send) — v1 batch send + suppression
--
-- Closes the last gap in ROADMAP.md P1: leads are imported, targeted, and a
-- proposal can be generated, but nothing sends it.
--
-- Three tables:
--   campaign            — the send itself (subject, body, segment, throttle, counters)
--   campaign_recipient  — one row per lead materialized AT SEND TIME, carrying its own
--                         status so a restart resumes instead of re-sending
--   email_suppression   — permanent, campaign-independent. An address in here can never
--                         be sent to again by any campaign.
--
-- Retention: campaign + campaign_recipient are operational history, mutable status.
-- email_suppression is APPEND-ONLY in spirit — a row is never deleted, because deleting
-- it would silently re-enable sending to someone who asked to stop.

BEGIN;

CREATE TYPE campaign_status AS ENUM (
  'draft',
  'sending',
  'paused',
  'sent',
  'failed'
);

CREATE TYPE campaign_recipient_status AS ENUM (
  'queued',
  'sent',
  'failed',
  'bounced',
  'unsubscribed',
  'complained',
  'suppressed'
);

CREATE TYPE suppression_reason AS ENUM (
  'unsubscribe',
  'hard_bounce',
  'complaint',
  'soft_bounce_limit',
  'manual'
);

CREATE TABLE IF NOT EXISTS campaign (
  campaign_id      bigserial PRIMARY KEY,
  name             varchar(255) NOT NULL,
  subject          varchar(255) NOT NULL,
  body_html        text NOT NULL,
  segment          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           campaign_status NOT NULL DEFAULT 'draft',
  rate_per_hour    integer NOT NULL DEFAULT 60,
  recipient_count  integer NOT NULL DEFAULT 0,
  sent_count       integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campaign IS
  'Mass outreach send (ROADMAP.md P1). v1 is batch send + suppression; no sequence, no A/B, no click tracking.';

COMMENT ON COLUMN campaign.segment IS
  'The lead filter this campaign resolved against, stored so a send is reproducible and auditable.';

COMMENT ON COLUMN campaign.rate_per_hour IS
  'Throttle. The send never fans out unbounded — see campaign.service.ts. Guards both the ESP rate limit and the ENOBUFS socket exhaustion recorded in HANDOFF.md 2026-08-16.';

CREATE TABLE IF NOT EXISTS campaign_recipient (
  campaign_recipient_id  bigserial PRIMARY KEY,
  campaign_id            integer NOT NULL REFERENCES campaign (campaign_id) ON DELETE CASCADE,
  lead_id                integer NOT NULL REFERENCES lead (lead_id) ON DELETE CASCADE,
  email                  varchar(255) NOT NULL,
  status                 campaign_recipient_status NOT NULL DEFAULT 'queued',
  unsubscribe_token      varchar(64) NOT NULL,
  error                  text,
  sent_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campaign_recipient IS
  'One row per lead, materialized at send time. Status is the resume point: a restart re-sends only rows still queued.';

COMMENT ON COLUMN campaign_recipient.email IS
  'Snapshot of the address at materialize time, so a later lead edit cannot redirect an in-flight send.';

COMMENT ON COLUMN campaign_recipient.unsubscribe_token IS
  'Random per-recipient token. Does NOT encode the address — the address is never recoverable from the link.';

-- The double-send guard. One lead appears at most once per campaign, enforced by the DB
-- rather than by application care.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipient_unique
  ON campaign_recipient (campaign_id, lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipient_token
  ON campaign_recipient (unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_campaign_recipient_campaign_status
  ON campaign_recipient (campaign_id, status);

CREATE TABLE IF NOT EXISTS email_suppression (
  email_suppression_id  bigserial PRIMARY KEY,
  email                 varchar(255) NOT NULL,
  reason                suppression_reason NOT NULL,
  campaign_id           integer REFERENCES campaign (campaign_id) ON DELETE SET NULL,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_suppression IS
  'Permanent do-not-send list. Checked inside the send path itself, not only in the UI query, so a direct lead id cannot bypass it. Rows are never deleted.';

-- Lowercased uniqueness: suppression must not be defeated by casing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_email
  ON email_suppression (lower(email));

COMMIT;
