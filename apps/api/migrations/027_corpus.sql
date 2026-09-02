-- Migration 027: The corpus — every fact ADVO has ever stated, with the line it rests on.
--
-- The business runs on documents that live in Drive and conversations that live in Plaud.
-- The repo quoted from them and drifted: on 2026-09-03 the roadmap still carried a
-- FourlinQ price the contract had replaced two weeks earlier, the code seeded a commission
-- split a signed agreement had superseded, and Felici was recorded at a third of its
-- contract value. Nothing could say "where did this number come from" because nothing
-- stored the source next to the claim.
--
-- This migration gives every claim a source and every source a place. A fact is one
-- checkable sentence, the verbatim passage it rests on, the timestamp or heading it sits
-- under, and a confidence that is HONEST about its basis: a transcript line is evidence,
-- an AI summary is a witness, a heuristic regex is a guess.
--
-- ─── Five tables ─────────────────────────────────────────────────────────────
--
--   corpus_source    One document, recording, or pasted text. Unique on (kind, external_id)
--                    so re-ingesting a Drive doc or a Plaud share replaces its facts rather
--                    than duplicating them. Links to project / client / lead are on the
--                    SOURCE as the default; a fact may override with its own project_id.
--
--   corpus_fact      One claim. `basis` says what it rests on (transcript, document,
--                    ai_note, heuristic, human). `search` is a generated tsvector so the
--                    fact-check endpoint ranks by relevance without an external index.
--                    `superseded_by_fact_id` is how a fact dies: never deleted, pointed at
--                    the newer one, so "what did we say before" stays answerable.
--
--   corpus_term      A named parameter of a document — revision rounds, deemed-approval
--                    days, the infra fee — as a typed value, so a template can be filled
--                    and a contract can be diffed against another without parsing prose.
--
--   corpus_action    Accountability. Who said they would do what, by when, on which
--                    recording, and whether it happened. status open | done | dropped.
--
--   corpus_template  A reusable skeleton distilled from a source (contract, proposal,
--                    sign-off, addendum, pitch deck, brand) with {{placeholders}}. The
--                    template remembers which source it came from, so when the source
--                    changes the template can be re-derived.
--
-- ─── Deliberate non-decisions ─────────────────────────────────────────────────
--
--   * NO embeddings. Postgres full-text is enough to find "₱3,000 infra fee" across a few
--     thousand claims; a vector index is a dependency this box does not need yet.
--   * NO delete on facts or sources. Supersede, or mark unverified. The corpus is a paper
--     trail first and a search index second.
--   * CHECKs by guarded ALTER, never inside CREATE TABLE IF NOT EXISTS (the 025 lesson).

BEGIN;

CREATE TABLE IF NOT EXISTS corpus_source (
  corpus_source_id   bigserial PRIMARY KEY,
  kind               varchar(30) NOT NULL,
  external_id        varchar(255) NOT NULL,
  url                varchar(1000),
  title              varchar(500) NOT NULL,
  document_kind      varchar(30),
  occurred_at        timestamptz,
  duration_second    integer,
  language           varchar(10),
  summary            text,
  project_id         integer REFERENCES project (project_id) ON DELETE SET NULL,
  client_id          integer REFERENCES client (client_id) ON DELETE SET NULL,
  lead_id            integer REFERENCES lead (lead_id) ON DELETE SET NULL,
  lead_name          varchar(255),
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_by        integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  ingested_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corpus_source_external ON corpus_source (kind, external_id);
CREATE INDEX IF NOT EXISTS idx_corpus_source_project ON corpus_source (project_id);
CREATE INDEX IF NOT EXISTS idx_corpus_source_occurred ON corpus_source (occurred_at DESC);

DO $$ BEGIN
  ALTER TABLE corpus_source ADD CONSTRAINT chk_corpus_source_kind
    CHECK (kind IN ('plaud', 'drive_doc', 'local_file', 'web', 'text'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS corpus_fact (
  corpus_fact_id         bigserial PRIMARY KEY,
  corpus_source_id       integer NOT NULL REFERENCES corpus_source (corpus_source_id) ON DELETE CASCADE,
  claim                  text NOT NULL,
  category               varchar(30) NOT NULL,
  quote                  text,
  locator                varchar(120),
  speaker                varchar(120),
  basis                  varchar(20) NOT NULL,
  confidence             numeric(3,2) NOT NULL DEFAULT 0.5,
  occurred_at            timestamptz,
  project_id             integer REFERENCES project (project_id) ON DELETE SET NULL,
  is_verified            boolean NOT NULL DEFAULT false,
  verified_by            integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  verified_at            timestamptz,
  superseded_by_fact_id  integer REFERENCES corpus_fact (corpus_fact_id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT NOW()
);
-- The search vector is added by ALTER, not declared in the table or in schema.ts: drizzle
-- push cannot express a STORED generated column, so declaring it there would create a
-- plain tsvector nobody fills. Added here, it is generated whichever path built the table.
ALTER TABLE corpus_fact ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(claim, '') || ' ' || coalesce(quote, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_corpus_fact_source ON corpus_fact (corpus_source_id);
CREATE INDEX IF NOT EXISTS idx_corpus_fact_project ON corpus_fact (project_id);
CREATE INDEX IF NOT EXISTS idx_corpus_fact_category ON corpus_fact (category);
CREATE INDEX IF NOT EXISTS idx_corpus_fact_search ON corpus_fact USING GIN (search);

DO $$ BEGIN
  ALTER TABLE corpus_fact ADD CONSTRAINT chk_corpus_fact_basis
    CHECK (basis IN ('transcript', 'document', 'ai_note', 'heuristic', 'human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE corpus_fact ADD CONSTRAINT chk_corpus_fact_confidence
    CHECK (confidence >= 0 AND confidence <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A claim a heuristic guessed, or a summary invented, is never marked verified by default.
DO $$ BEGIN
  ALTER TABLE corpus_fact ADD CONSTRAINT chk_corpus_fact_verified
    CHECK ((is_verified = false) OR (verified_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS corpus_term (
  corpus_term_id     bigserial PRIMARY KEY,
  corpus_source_id   integer NOT NULL REFERENCES corpus_source (corpus_source_id) ON DELETE CASCADE,
  name               varchar(80) NOT NULL,
  value              varchar(255) NOT NULL,
  unit               varchar(20),
  quote              text,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corpus_term_name ON corpus_term (name);
CREATE INDEX IF NOT EXISTS idx_corpus_term_source ON corpus_term (corpus_source_id);

CREATE TABLE IF NOT EXISTS corpus_action (
  corpus_action_id     bigserial PRIMARY KEY,
  corpus_source_id     integer NOT NULL REFERENCES corpus_source (corpus_source_id) ON DELETE CASCADE,
  corpus_fact_id       integer REFERENCES corpus_fact (corpus_fact_id) ON DELETE SET NULL,
  description          text NOT NULL,
  owner_name           varchar(120),
  owner_team_member_id integer REFERENCES team_member (team_member_id) ON DELETE SET NULL,
  project_id           integer REFERENCES project (project_id) ON DELETE SET NULL,
  due_at               timestamptz,
  locator              varchar(120),
  basis                varchar(20) NOT NULL DEFAULT 'transcript',
  status               varchar(20) NOT NULL DEFAULT 'open',
  resolved_at          timestamptz,
  resolution_note      text,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corpus_action_status ON corpus_action (status, due_at);
CREATE INDEX IF NOT EXISTS idx_corpus_action_project ON corpus_action (project_id);
CREATE INDEX IF NOT EXISTS idx_corpus_action_source ON corpus_action (corpus_source_id);

DO $$ BEGIN
  ALTER TABLE corpus_action ADD CONSTRAINT chk_corpus_action_status
    CHECK (status IN ('open', 'done', 'dropped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- An action closed without a timestamp cannot be reported on.
DO $$ BEGIN
  ALTER TABLE corpus_action ADD CONSTRAINT chk_corpus_action_resolved
    CHECK ((status = 'open') = (resolved_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS corpus_template (
  corpus_template_id   bigserial PRIMARY KEY,
  kind                 varchar(30) NOT NULL,
  name                 varchar(255) NOT NULL,
  body                 text NOT NULL,
  placeholder          jsonb NOT NULL DEFAULT '[]'::jsonb,
  corpus_source_id     integer REFERENCES corpus_source (corpus_source_id) ON DELETE SET NULL,
  version              integer NOT NULL DEFAULT 1,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corpus_template_kind_name_version ON corpus_template (kind, name, version);

DO $$ BEGIN
  ALTER TABLE corpus_template ADD CONSTRAINT chk_corpus_template_kind
    CHECK (kind IN ('contract', 'proposal', 'signoff', 'addendum', 'pitch_deck', 'campaign', 'brand', 'invoice', 'minutes', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('027_corpus.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
