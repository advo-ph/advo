-- Migration 003: ADVO calendar — manual events table
--
-- Backs the all-around ADVO calendar (Phase 1). Stores manually-created events
-- (meetings, MOAs, BIR deadlines, content/social posting, cold-email cadence,
-- custom). Derived events — deliverable due dates, invoice due/paid, project
-- kickoffs — are computed at read time in GET /api/calendar and are NOT stored
-- here. Low volume; safe, additive, instant.

BEGIN;

CREATE TABLE IF NOT EXISTS calendar_event (
  calendar_event_id  bigserial PRIMARY KEY,
  project_id         integer REFERENCES project(project_id) ON DELETE SET NULL,
  title              varchar(255) NOT NULL,
  category           varchar(50)  NOT NULL DEFAULT 'event',
  description        text,
  location           varchar(255),
  starts_at          timestamptz  NOT NULL,
  ends_at            timestamptz,
  is_all_day         boolean      NOT NULL DEFAULT false,
  created_at         timestamptz  NOT NULL DEFAULT NOW(),
  updated_at         timestamptz  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE calendar_event IS
  'Manually-created ADVO calendar events (meetings, MOAs, BIR deadlines, content/social posts, cold-email cadence, custom). `category` is varchar (validated app-side) rather than an enum because the category set is expected to grow. Derived events (deliverable due dates, invoice due/paid, project kickoffs) are computed at read time in GET /api/calendar, not stored here.';

CREATE INDEX IF NOT EXISTS idx_calendar_event_starts  ON calendar_event(starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_event_project ON calendar_event(project_id);

COMMIT;
