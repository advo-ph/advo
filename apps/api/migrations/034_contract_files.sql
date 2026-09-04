-- Migration 027 — contract_file
-- Stores uploaded contract files per project.
-- status is app-validated varchar (no enum, set can grow without migration).
-- ai_review_text is NULL until a review is run; ai_reviewed_at mirrors it (constrained together).

CREATE TABLE contract_file (
  contract_file_id bigserial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  file_url         text NOT NULL,
  file_name        text NOT NULL,
  mime_type        varchar(100) NOT NULL,
  status           varchar(20) NOT NULL DEFAULT 'draft',
  ai_review_text   text,
  ai_reviewed_at   timestamptz,
  created_by       integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_contract_file_status   CHECK (status IN ('draft', 'final', 'signed')),
  CONSTRAINT chk_contract_file_reviewed CHECK (
    (ai_review_text IS NULL) = (ai_reviewed_at IS NULL)
  )
);

CREATE INDEX idx_contract_file_project    ON contract_file(project_id);
CREATE INDEX idx_contract_file_created_at ON contract_file(created_at);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('034_contract_files.sql', false)
ON CONFLICT (filename) DO NOTHING;
