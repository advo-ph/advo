-- Migration 029: meeting_recording
-- Stores uploaded audio files for meeting transcription.
-- transcript is NULL until a background transcription job completes.
-- job_id links to the background_job that is running or ran the transcription.
--
-- Idempotent (2026-09-13): IF NOT EXISTS / ON CONFLICT, so a `db:push`-created table or a
-- re-run no longer stops `npm run db:local`.

CREATE TABLE IF NOT EXISTS meeting_recording (
  recording_id  bigserial PRIMARY KEY,
  meeting_id    integer REFERENCES meeting(meeting_id) ON DELETE CASCADE,
  file_url      text NOT NULL,
  file_name     text NOT NULL,
  mime_type     varchar(100) NOT NULL,
  transcript    text,
  job_id        bigint REFERENCES background_job(job_id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_recording_meeting ON meeting_recording(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recording_job ON meeting_recording(job_id);

INSERT INTO schema_migration (filename) VALUES ('036_meeting_recording.sql')
ON CONFLICT (filename) DO NOTHING;
