-- Migration 056: member_webhook + webhook_delivery — push alerts on every activity_log row.
--
-- One webhook per team_member (mirrors bot_key's one-per-member shape). secret_encrypted must
-- be DECRYPTABLE (unlike bot_key.key_hash, one-way) because the poller signs each delivery
-- with it — see apps/api/src/utils/crypto.ts.
BEGIN;

CREATE TABLE IF NOT EXISTS member_webhook (
  member_webhook_id   bigserial PRIMARY KEY,
  team_member_id       integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE CASCADE,
  url                  text NOT NULL,
  secret_encrypted     text NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_delivery_at     timestamptz,
  last_status          varchar(20),      -- 'ok' | 'failing' | null (never delivered)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_webhook_one_per_member
  ON member_webhook(team_member_id);

CREATE TABLE IF NOT EXISTS webhook_delivery (
  webhook_delivery_id bigserial PRIMARY KEY,
  member_webhook_id    integer NOT NULL REFERENCES member_webhook(member_webhook_id) ON DELETE CASCADE,
  activity_id           integer REFERENCES activity_log(activity_id) ON DELETE SET NULL,
  payload                jsonb NOT NULL,
  status                 varchar(20) NOT NULL DEFAULT 'queued', -- queued|delivered|failed|abandoned
  attempt_count          integer NOT NULL DEFAULT 0,
  next_attempt_at        timestamptz NOT NULL DEFAULT now(),
  last_error             text,
  delivered_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_poll
  ON webhook_delivery(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_webhook
  ON webhook_delivery(member_webhook_id);

COMMENT ON TABLE webhook_delivery IS
  'Queue + audit trail for push alerts. One row per (webhook, activity) pair; status/attempt_count/next_attempt_at drive services/webhook-delivery.service.ts.';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('056_change_webhooks.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
