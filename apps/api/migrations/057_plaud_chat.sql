-- Migration 057: the owner-only chat widget (Updates + Ask tabs).
--
-- chat_message carries every bot/owner turn across both channels. channel and
-- sender are app-validated growable string sets (varchar + comment), not pg
-- enums, matching this repo's convention for sets that may grow without a
-- migration. input_mode='buttons' rows carry their tap options in `options`;
-- answered_option_id locks a buttons row once tapped so it can never be
-- answered twice (also enforced with a 409 at the service layer). `context`
-- carries enough state for the server to know what a free-text or button
-- reply is answering, without a separate state table.
--
-- meeting.parent_meeting_id links a side-project excerpt copy back to the
-- primary meeting it was excerpted from (see plaud-chat.service.ts). Primary
-- meetings (the one importPlaudMeeting created/updated) always have
-- parent_meeting_id = NULL.
BEGIN;

CREATE TABLE IF NOT EXISTS chat_message (
  chat_message_id bigserial PRIMARY KEY,
  channel varchar(10) NOT NULL,
  sender varchar(10) NOT NULL,
  sent_by_user_id integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  body text NOT NULL,
  input_mode varchar(10) NOT NULL DEFAULT 'none',
  options jsonb,
  answered_option_id varchar(50),
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chat_message IS
  'Owner-only chat widget turns. channel: updates|ask. sender: bot|owner. input_mode: none|buttons|text.';

CREATE INDEX IF NOT EXISTS idx_chat_message_channel_created
  ON chat_message (channel, created_at DESC);

ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS parent_meeting_id integer
    REFERENCES meeting(meeting_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_meeting_parent
  ON meeting (parent_meeting_id);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('057_plaud_chat.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
