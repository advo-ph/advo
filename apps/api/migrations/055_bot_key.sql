-- Migration 055: bot_key — one MCP bearer credential per team member.
--
-- Prince's grokbot (xAI, remote MCP over HTTPS) needs its own auth path, separate from the
-- JWT session: a long-lived bearer token, hashed at rest, one per team_member, never deleted
-- (only revoked — revoked_at makes a key permanently dead without losing its audit trail).
--
-- Exactly one LIVE key per member: enforced by a partial unique index on team_member_id WHERE
-- revoked_at IS NULL, not an app-only check, so a race between two "create key" clicks cannot
-- produce two live keys for the same person.
BEGIN;

CREATE TABLE IF NOT EXISTS bot_key (
  bot_key_id    bigserial PRIMARY KEY,
  team_member_id integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE CASCADE,
  key_hash      varchar(64) NOT NULL,   -- sha256 hex digest of the raw bearer token
  key_prefix    varchar(16) NOT NULL,   -- first ~12 chars of the raw token, shown in the UI
  created_by    integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_key_hash ON bot_key(key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_key_one_live_per_member
  ON bot_key(team_member_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE bot_key IS
  'One live MCP bearer credential per team_member. revoked_at makes a key permanently dead; a new key cannot be created while one is live (revoke first).';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('055_bot_key.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
