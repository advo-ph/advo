-- Migration 027 — contract_file
-- Stores uploaded contract files per project.
-- status is app-validated varchar (no enum, set can grow without migration).
-- ai_review_text is NULL until a review is run; ai_reviewed_at mirrors it (constrained together).
--
-- Idempotent (2026-09-13): the table is IF NOT EXISTS, and the CHECKs moved out of the
-- CREATE TABLE body into guarded ALTERs (025's form). On a fresh database `db:push` has
-- already created the table WITHOUT them, so an in-body CHECK was silently skipped — the
-- exact 025 defect. Where the constraints already exist, duplicate_object makes each
-- ALTER a no-op, so the end-state schema of a migrated database is unchanged.

CREATE TABLE IF NOT EXISTS contract_file (
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
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE contract_file ADD CONSTRAINT chk_contract_file_status
    CHECK (status IN ('draft', 'final', 'signed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE contract_file ADD CONSTRAINT chk_contract_file_reviewed
    CHECK ((ai_review_text IS NULL) = (ai_reviewed_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contract_file_project    ON contract_file(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_file_created_at ON contract_file(created_at);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('034_contract_files.sql', false)
ON CONFLICT (filename) DO NOTHING;
