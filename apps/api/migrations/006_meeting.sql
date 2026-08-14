-- Migration 006: meeting MoM records
--
-- Minutes-of-meeting (MoM) transcripts per project, sourced from Plaud or
-- manual paste. project_id is required (ON DELETE CASCADE — MoMs die with the
-- project). plaud_share_key is optional Plaud share identifier. Team full CRUD;
-- clients GET list for their own projects only.

BEGIN;

CREATE TABLE IF NOT EXISTS meeting (
  meeting_id       bigserial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  title            varchar(255) NOT NULL,
  recorded_at      timestamptz NOT NULL,
  transcript       text NOT NULL,
  plaud_share_key  varchar(255),
  created_by       integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meeting IS
  'Meeting minutes (MoM) per project. transcript is full text; plaud_share_key optional Plaud share id. Team CRUD; clients list own-project meetings only.';

CREATE INDEX IF NOT EXISTS idx_meeting_project     ON meeting(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recorded_at ON meeting(recorded_at);
CREATE INDEX IF NOT EXISTS idx_meeting_created_by  ON meeting(created_by);

COMMIT;
