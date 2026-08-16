-- Migration 012: Plaud import fields on meeting
--
-- Stores the Plaud file id (idempotent re-import), the AI summary, and
-- lengthens plaud_share_key so a full `pub_…::…` share URL fits.
-- Existing paste-in rows stay valid: new columns nullable.

BEGIN;

ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS plaud_file_id varchar(64);

ALTER TABLE meeting
  ALTER COLUMN plaud_share_key TYPE varchar(500);

COMMENT ON COLUMN meeting.summary IS
  'Plaud AI note (markdown). Null on paste-in MoMs with no summary.';
COMMENT ON COLUMN meeting.plaud_file_id IS
  'Upstream Plaud file id. Unique so re-import updates the same row.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_plaud_file
  ON meeting (plaud_file_id)
  WHERE plaud_file_id IS NOT NULL;

COMMIT;
