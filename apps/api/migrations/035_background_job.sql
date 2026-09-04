-- Migration 028: background_job table
-- Persistent queue for long-running server-side work (AI draft generation, etc.)
-- The runner reads this table on a 2-second poll loop started from index.ts.
-- Crash recovery at boot re-queues any row stuck in 'running'.

CREATE TABLE background_job (
  job_id            bigserial PRIMARY KEY,
  job_type          varchar(60) NOT NULL,
  project_id        integer REFERENCES project(project_id) ON DELETE SET NULL,
  status            varchar(20) NOT NULL DEFAULT 'queued',
  title             text NOT NULL,
  steps             jsonb NOT NULL DEFAULT '[]',
  result            jsonb,
  error             text,
  created_by        integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  started_at        timestamptz,
  finished_at       timestamptz,

  CONSTRAINT chk_background_job_status CHECK (
    status IN ('queued', 'running', 'done', 'failed')
  ),
  CONSTRAINT chk_background_job_stamp CHECK (
    (status IN ('done', 'failed')) = (finished_at IS NOT NULL)
  )
);

CREATE INDEX idx_background_job_status ON background_job(status);
CREATE INDEX idx_background_job_created_by_status ON background_job(created_by, status);

INSERT INTO schema_migration (filename) VALUES ('035_background_job.sql');
