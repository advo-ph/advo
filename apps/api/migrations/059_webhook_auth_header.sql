-- Migration 059: optional custom auth header on member_webhook.
--
-- Some receivers (a Cursor/Grok automation webhook, for example) reject a POST that
-- has no Authorization header. The value is encrypted with the same AES-256-GCM
-- helper as secret_encrypted (utils/crypto.ts encryptSecret/decryptSecret) and is
-- never selected into a list response. A null value means "send no extra header".
-- The name defaults to Authorization; the Settings field only collects the value.
BEGIN;

ALTER TABLE member_webhook
  ADD COLUMN IF NOT EXISTS auth_header_name varchar(100) NOT NULL DEFAULT 'Authorization',
  ADD COLUMN IF NOT EXISTS auth_header_value_encrypted text;

COMMENT ON COLUMN member_webhook.auth_header_name IS
  'Name of the optional outbound header. Defaults to Authorization. Ignored when auth_header_value_encrypted is null.';

COMMENT ON COLUMN member_webhook.auth_header_value_encrypted IS
  'Optional outbound header value (typically "Bearer …"), AES-256-GCM via encryptSecret. Null = unset. Never returned by any route.';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('059_webhook_auth_header.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
