-- Migration 014: record how a proposal's body copy was written
--
-- Migration 010 shipped template-fill only and deferred AI generation. The
-- generator now writes body copy from the lead's own scraped signals (digital
-- / design / performance score, industry, budget) when ANTHROPIC_API_KEY is
-- set, and still falls back to the unchanged template fill when it is not.
--
-- Rows created before this migration were all template fills, so the default
-- backfills them correctly.

BEGIN;

DO $$ BEGIN
  CREATE TYPE proposal_method AS ENUM ('template', 'ai');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE proposal
  ADD COLUMN IF NOT EXISTS method proposal_method NOT NULL DEFAULT 'template';

COMMENT ON COLUMN proposal.method IS
  'How body_html was written: template = CONTRACTS.md clauses + lead fields (always available); ai = Claude wrote the narrative sections from the lead scraped signal, with the same clauses appended verbatim.';

COMMIT;
