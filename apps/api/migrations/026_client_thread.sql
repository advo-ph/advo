-- Migration 026: The client thread — a conversation that lives on the project, not in Messenger.
--
-- 023 gave the platform a way to RECEIVE what a client says on SMS / Viber / Messenger,
-- and was explicit that it modelled no conversation: an inbound_message points at a
-- project and stops. That was the right refusal for a webhook ledger. It is the wrong
-- shape for the Hub, where the client is already logged in and the question is not
-- "which channel did this arrive on" but "what did we say to each other about THIS
-- project, in order, and has anyone read it".
--
-- ─── Two tables ──────────────────────────────────────────────────────────────
--
--   project_message  One message on one project's thread. Either side can write; the
--                    author's role is SNAPSHOTTED from the session that wrote it, never
--                    from the request body, so a row that says 'team' was written by a
--                    team session. Read state is TWO booleans, one per side, because
--                    "unread" means different things to the two people looking at it:
--                    the team's unread count is what the ops inbox renders, the client's
--                    is the badge on their Hub. One flag would have to pick a side.
--
--   preview_link     Every "Show Client Now" link ever minted for a project. Until now
--                    POST /:id/preview-link returned a signed URL and forgot it; the
--                    client got a link in chat and nobody could later say when it was
--                    issued, by whom, or whether it was still live. Append-only: a link
--                    that expired is still the record that a preview was shown on that
--                    date, which is exactly what a "you never showed us" dispute needs.
--
-- ─── Deliberate non-decisions ─────────────────────────────────────────────────
--
--   * NO edit, NO delete on a message. What was said on a project thread is the paper
--     trail the change-order process (009) depends on. is_read_* are the only mutable
--     columns, the same discipline inbound_message.is_actioned set.
--   * NO attachments. A file on the thread belongs in project_asset, which already has
--     a type and a per-project scope; a second upload path would drift from it.
--   * NO threading within the thread. One flat list per project, oldest first.
--
-- Retention: both permanent. author_user_id is ON DELETE SET NULL so removing a user
-- account never erases what they wrote on a client's project.

BEGIN;

-- ─── project_message ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_message (
  project_message_id  bigserial PRIMARY KEY,
  project_id          integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,
  author_user_id      integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  -- Snapshotted from the session, never the body. See header.
  author_role         varchar(20) NOT NULL,
  body                text NOT NULL,
  is_read_by_team     boolean NOT NULL DEFAULT false,
  is_read_by_client   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

-- CHECKs go on by guarded ALTER, never inside CREATE TABLE IF NOT EXISTS: when
-- drizzle push has already created the table from schema.ts, the CREATE is a
-- no-op and every constraint declared inside it is silently skipped (the 025
-- defect). ALTER works whichever path built the table, and re-running is a no-op.
DO $$ BEGIN
  ALTER TABLE project_message ADD CONSTRAINT chk_project_message_author_role
    CHECK (author_role IN ('client', 'team', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An empty message is a misclick, not a message; 4000 is the Hub composer's limit
-- and the DB should refuse what the UI refuses.
DO $$ BEGIN
  ALTER TABLE project_message ADD CONSTRAINT chk_project_message_body
    CHECK (char_length(body) BETWEEN 1 AND 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE project_message IS
  'One message on a project''s client thread (migration 026). Append-only apart from the two read flags. The author''s role is snapshotted from the session that wrote it, never from the request.';

COMMENT ON COLUMN project_message.author_role IS
  'client | team | admin, from the JWT at write time. A client session cannot write a ''team'' row, which is what makes the thread trustworthy as a record of who said what.';

COMMENT ON COLUMN project_message.is_read_by_team IS
  'Set by POST /api/project-message/read from a team/admin session, and on the row itself when a team member is the author. The ops inbox counts the false ones.';

COMMENT ON COLUMN project_message.is_read_by_client IS
  'Set by POST /api/project-message/read from a client session, and on the row itself when the client is the author. The Hub badge counts the false ones.';

-- The thread read: one project, in order.
CREATE INDEX IF NOT EXISTS idx_project_message_project
  ON project_message (project_id, created_at);

-- The two unread counts. Partial, because read rows are the vast majority and are never
-- what either badge asks for.
CREATE INDEX IF NOT EXISTS idx_project_message_unread_team
  ON project_message (project_id) WHERE is_read_by_team = false;

CREATE INDEX IF NOT EXISTS idx_project_message_unread_client
  ON project_message (project_id) WHERE is_read_by_client = false;

-- ─── preview_link ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS preview_link (
  preview_link_id     bigserial PRIMARY KEY,
  project_id          integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,
  url                 varchar(1000) NOT NULL,
  issued_by_user_id   integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  issued_at           timestamptz NOT NULL DEFAULT NOW(),
  expires_at          timestamptz NOT NULL,
  note                varchar(500)
);

-- A link that expires before it was issued was never a link.
DO $$ BEGIN
  ALTER TABLE preview_link ADD CONSTRAINT chk_preview_link_expires
    CHECK (expires_at > issued_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE preview_link IS
  'Every signed "Show Client Now" link minted for a project (migration 026). Append-only history: an expired row is still the record that a preview was shown on that date, which is the evidence a "you never showed us" dispute is answered with.';

COMMENT ON COLUMN preview_link.url IS
  'The exact URL handed to the client, token included. The token expires on its own (preview.service.ts); the row does not.';

COMMENT ON COLUMN preview_link.expires_at IS
  'Copied from the signed token at mint time so history can say whether a link was live without re-verifying a JWT.';

-- The history read: one project, newest first.
CREATE INDEX IF NOT EXISTS idx_preview_link_project
  ON preview_link (project_id, issued_at DESC);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('026_client_thread.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
