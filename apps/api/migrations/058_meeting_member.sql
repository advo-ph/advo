-- Migration 058: meeting_member — who joined a meeting, picked by a team member.
--
-- Prince asked (2026-10-18) for a members picker in the meeting dialog to mark who
-- joined. meeting_attendee (041) cannot hold that: it is keyed by user_id (a NOT NULL
-- primary-key column), and four active team members (Keira, Andrei, Ardy, RL) have no
-- login account. This table is keyed by team_member instead.
--
-- meeting_attendee stays as it is (the self-serve Join route still writes it). Its
-- existing rows are copied in below so nothing marked earlier is lost; GET /api/meeting
-- reads both and de-duplicates (services/meeting.service.ts fetchAttendeeMap).
--
-- Additive and idempotent: IF NOT EXISTS everywhere, ON CONFLICT DO NOTHING on the copy.
BEGIN;

CREATE TABLE IF NOT EXISTS meeting_member (
  meeting_id     bigint  NOT NULL REFERENCES meeting(meeting_id) ON DELETE CASCADE,
  team_member_id bigint  NOT NULL REFERENCES team_member(team_member_id) ON DELETE CASCADE,
  marked_by      integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_member_team_member ON meeting_member (team_member_id);

COMMENT ON TABLE meeting_member IS
  'Team members marked as having joined a meeting (meeting dialog members picker). Keyed by team_member so members without a login can be marked.';

-- Carry over earlier self-serve joins for users who are on the team roster.
INSERT INTO meeting_member (meeting_id, team_member_id, created_at)
SELECT ma.meeting_id, tm.team_member_id, ma.joined_at
FROM meeting_attendee ma
JOIN team_member tm ON tm.user_id = ma.user_id
ON CONFLICT (meeting_id, team_member_id) DO NOTHING;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('058_meeting_member.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
