-- Migration 054: meeting.audio_url — where the recording's audio lives (a Drive link).
--
-- Prince asked (2026-10-18) for one table of every meeting with its date, client, the
-- Drive link to the audio and the Plaud link to the transcript. The Plaud link is
-- derived from plaud_share_key / plaud_file_id; the Drive link had nowhere to go.
-- meeting_recording.file_url is for files uploaded into ADVO, not a pointer to Drive.
--
-- Nullable text: most Plaud-imported meetings have no separate audio file, and a URL
-- has no useful length cap. Idempotent so a re-run on prod is harmless.

ALTER TABLE meeting ADD COLUMN IF NOT EXISTS audio_url text;
