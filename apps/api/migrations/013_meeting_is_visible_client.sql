-- Migration 013: publish toggle on meeting
--
-- Transcripts capture internal talk. A row is client-visible only when
-- explicitly published. Default false so import cannot leak.

BEGIN;

ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS is_visible_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN meeting.is_visible_client IS
  'When true the client hub may show this MoM. Import and paste default false.';

CREATE INDEX IF NOT EXISTS idx_meeting_visible_client
  ON meeting (project_id)
  WHERE is_visible_client = true;

COMMIT;
