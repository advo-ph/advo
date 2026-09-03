BEGIN;

INSERT INTO schema_migration (filename) VALUES ('034_meeting_scheduling_and_attendees.sql')
  ON CONFLICT (filename) DO NOTHING;

-- Extend meeting table for scheduled meetings
ALTER TABLE meeting
  ADD COLUMN IF NOT EXISTS starts_at   timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at     timestamptz,
  ADD COLUMN IF NOT EXISTS location    varchar(255),
  ADD COLUMN IF NOT EXISTS description text;

-- Make transcript optional (keep NOT NULL, add empty-string default)
ALTER TABLE meeting
  ALTER COLUMN transcript SET DEFAULT '';

-- Make project_id nullable (existing rows all have a project; backfill not needed)
ALTER TABLE meeting
  ALTER COLUMN project_id DROP NOT NULL;

-- Index on starts_at for calendar range queries
CREATE INDEX IF NOT EXISTS idx_meeting_starts_at ON meeting (starts_at)
  WHERE starts_at IS NOT NULL;

-- Attendee join table
CREATE TABLE IF NOT EXISTS meeting_attendee (
  meeting_id  bigint  NOT NULL REFERENCES meeting(meeting_id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendee_user ON meeting_attendee (user_id);

COMMENT ON TABLE meeting_attendee IS
  'Self-serve attendance: any authenticated user may join or leave a meeting. Composite PK prevents duplicate joins.';
COMMENT ON COLUMN meeting.starts_at IS
  'Scheduled start time for future meetings. NULL on Plaud-imported / paste-in past records. Used as calendar event start.';
COMMENT ON COLUMN meeting.ends_at IS
  'Optional end time for scheduled meetings. NULL when open-ended.';
COMMENT ON COLUMN meeting.transcript IS
  'Full meeting transcript. Empty string (not NULL) for scheduled meetings with no transcript yet.';

COMMIT;
