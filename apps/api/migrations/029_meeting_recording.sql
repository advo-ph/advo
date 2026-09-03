-- Migration 029: meeting_recording
-- Stores uploaded audio files for meeting transcription.
-- transcript is NULL until a background transcription job completes.
-- job_id links to the background_job that is running or ran the transcription.

CREATE TABLE meeting_recording (
  recording_id  bigserial PRIMARY KEY,
  meeting_id    integer REFERENCES meeting(meeting_id) ON DELETE CASCADE,
  file_url      text NOT NULL,
  file_name     text NOT NULL,
  mime_type     varchar(100) NOT NULL,
  transcript    text,
  job_id        bigint REFERENCES background_job(job_id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_recording_meeting ON meeting_recording(meeting_id);
CREATE INDEX idx_meeting_recording_job ON meeting_recording(job_id);

INSERT INTO schema_migration (filename) VALUES ('029_meeting_recording.sql');
