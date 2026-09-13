-- Migration 047: corpus_source.body — the full text of every source, stored and readable.
--
-- Until now the corpus kept what a document SAID (facts, terms, actions) and threw the
-- document away. `POST /api/corpus/ingest/text` extracted from the pasted text and
-- discarded it; `POST /api/corpus/ingest/json` had no field for it, so recent ingests put
-- the full markdown in `meta.body` as a stopgap. A fact whose quote cannot be read in
-- context is harder to verify than it needs to be, and a stopgap in jsonb is invisible to
-- every reader that does not already know to look for it.
--
-- THREE DECISIONS:
--
-- 1. body IS NULLABLE text. A Drive document ingested from a curated bundle before this
--    column existed has no body, and inventing one is worse than saying there is none.
--    text rather than varchar(n): the API caps a body at 2,000,000 characters, and
--    Postgres TOASTs anything this size out of line, so the row stays small on disk for
--    every read that does not ask for the column.
--
-- 2. THE BACKFILL MOVES, IT DOES NOT COPY. For rows where body is null and meta carries a
--    string body, body takes meta->>'body' and the key is removed from meta; the rest of
--    meta is kept as it was. Leaving a second copy in meta would double the storage and
--    leave two places a later edit could disagree. The WHERE clause is the idempotence:
--    a re-run finds no row with a null body and a meta body, so it touches nothing.
--    A row that somehow has BOTH a body and a meta body keeps both untouched — the column
--    wins and nothing is overwritten on a guess.
--
-- 3. NO SEARCH INDEX YET. `GET /api/corpus/source?q=` is ILIKE over title, summary and
--    body. At tens of sources that is a sequential scan of a few megabytes and costs
--    nothing. A trigram index would need `CREATE EXTENSION pg_trgm`, which needs a role
--    prod migrations are not guaranteed to run as; it is not worth that risk at this size.

ALTER TABLE corpus_source ADD COLUMN IF NOT EXISTS body text;

UPDATE corpus_source
SET body = meta->>'body',
    meta = meta - 'body',
    updated_at = now()
WHERE body IS NULL
  AND jsonb_typeof(meta->'body') = 'string';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('047_corpus_source_body.sql', false)
ON CONFLICT (filename) DO NOTHING;
