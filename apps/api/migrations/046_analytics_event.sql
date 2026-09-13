-- Migration 046: Analytics event — the first table in this schema designed for VOLUME.
--
-- PORTED 2026-09-13 from the rescued Mac branch `mac/org-compat-t0` (a4c4395), where it
-- was numbered 020. Main had since used 020–045, so it follows 045 here. The body is
-- unchanged except that the enum is created idempotently and the ledger insert is added,
-- so re-running this file is harmless.
--
-- Everything modelled so far is a HUMAN-SIZED record: 24 rows of activity_log, a few
-- hundred deliverables, one commission plan per project. This table is a different animal.
-- A single visitor browsing advo.ph writes more rows in ten minutes than activity_log has
-- accumulated in its lifetime. The production database is ~10 MB on a Contabo VPS; left
-- unbounded, analytics_event dwarfs every other table on this box inside a month. Every
-- decision below follows from that one fact.
--
-- WHY NOT activity_log. It was the obvious shortcut and it is the wrong one. activity_log
-- is a 24-row AUDIT trail — "who changed what, and can we prove it later". Its value is
-- that it is small enough to read end-to-end and complete enough to trust. Pouring page
-- views into it destroys BOTH properties: the audit becomes unreadable, and the retention
-- sweep this migration installs would start deleting audit rows. Audit is kept forever and
-- is never sampled; telemetry is bounded and disposable. They cannot share a table.
--
-- SIX DECISIONS, RECORDED SO NOBODY ASSUMES THEM:
--
-- 1. THE ID IS bigserial, NOT uuid AND NOT integer.
--    Not integer: 2.1 billion is a reachable ceiling for a firehose table, and the day it
--    is reached is the day inserts start failing in production with no warning.
--    Not uuid: a uuid is 16 bytes against bigint's 8, and — worse — it is RANDOM. Random
--    keys scatter inserts across the whole B-tree, so the hot leaf pages stop fitting in
--    the small amount of RAM this VPS has. A monotonic bigserial appends to one right-hand
--    leaf page and keeps the index hot region tiny. The id is never exposed to a client and
--    never guessed against, so uuid's only real advantage does not apply here.
--
-- 2. occurred_at IS THE CLIENT'S TIME; received_at IS OURS. Both are stored. A batched
--    beacon can arrive minutes after the event (backgrounded tab, offline queue, a flushed
--    sendBeacon on unload), and a clock-skewed or forged occurred_at must never be able to
--    hide a row from the retention sweep or from an ordered read. Sweeps and rollups run on
--    received_at, which the server writes and a caller cannot influence; occurred_at is
--    kept because sequencing WITHIN a session is what session replay actually needs.
--
-- 3. session_id AND visitor_id ARE OPAQUE CLIENT STRINGS, NOT FOREIGN KEYS. The public
--    site has no auth session, so there is nothing to reference. They are varchar(64)
--    rather than text so a hostile caller cannot post a megabyte where a nanoid belongs.
--    visitor_id is nullable on purpose: a first-touch visit, or a visitor who declined
--    persistent storage, still produces a usable session-scoped row.
--
-- 4. user_id IS A NULLABLE FK, SET NULL ON DELETE — and it is written by the SERVER from
--    the verified session, never from the request body. The 2026-06-20 wiring audit closed
--    the S1/S2/S3 cross-tenant class on exactly the mistake of trusting a body-supplied
--    actor id (docs/WIRING-AUDIT.md). ON DELETE SET NULL, not CASCADE, because deleting a
--    user must not silently rewrite last quarter's traffic totals.
--
-- 5. THE INDEXES ARE THE QUERIES, AND THERE ARE ONLY THREE. On a firehose table every
--    index is a tax paid on EVERY insert, so each one has to name the read that justifies
--    it. This table is queried by PERIOD and by SESSION — never by entity — so there is
--    deliberately no index on path or user_id; those are filters applied after a time
--    range has already cut the set to something small.
--      idx_analytics_event_occurred    — the dashboard's "last 7 days" and the rollup's
--                                        period scan. DESC because every read is recent-first.
--      idx_analytics_event_session     — reconstructing one visit in order. The composite
--                                        (session_id, occurred_at) returns the session
--                                        already sorted, so no sort node is needed.
--      idx_analytics_event_kind_time   — "conversions this month". kind leads because it is
--                                        the equality predicate; occurred_at follows as the
--                                        range. The reverse order would scan the whole window.
--    The retention sweep needs no index of its own: it deletes an old prefix of the same
--    time ordering idx_analytics_event_occurred already provides.
--
-- 6. detail IS jsonb WITH A DEFAULT OF '{}', NOT NULL. Per-kind payloads (scroll depth, a
--    form field, a referrer) differ by event and change faster than a migration cycle;
--    columns for each would be a mostly-null table. NOT NULL with a default means read code
--    never branches on null. jsonb (not json) so a later query can index into it if the
--    need appears. It is telemetry, not a record of truth — nothing bills off this column.

-- CREATE TYPE has no IF NOT EXISTS; guard it so a re-run (or a db:push that already
-- created the type from schema.ts) does not fail the file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analytics_event_kind') THEN
    CREATE TYPE analytics_event_kind AS ENUM (
      'page_view',
      'click',
      'form_start',
      'form_submit',
      'scroll_depth',
      'outbound_click',
      'session_start',
      'session_end',
      'error'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS analytics_event (
  -- Decision 1: monotonic 8-byte key, never exposed to a client.
  analytics_event_id  bigserial PRIMARY KEY,
  kind                analytics_event_kind NOT NULL,
  -- Decision 2: client clock. Ordering within a session.
  occurred_at         timestamptz NOT NULL,
  -- Decision 2: server clock. Retention and rollup run on THIS one.
  received_at         timestamptz NOT NULL DEFAULT now(),
  -- Decision 3: opaque, bounded, not a foreign key.
  session_id          varchar(64) NOT NULL,
  visitor_id          varchar(64),
  -- Decision 4: written from the verified session; NEVER from the request body.
  user_id             integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  path                varchar(512) NOT NULL DEFAULT '/',
  -- Decision 6.
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb
  -- No updated_at. An analytics event is immutable — nothing in this codebase updates one.
);

-- Decision 5, index 1: period reads and the rollup scan.
CREATE INDEX IF NOT EXISTS idx_analytics_event_occurred
  ON analytics_event (occurred_at DESC);

-- Decision 5, index 2: one session, already in order.
CREATE INDEX IF NOT EXISTS idx_analytics_event_session
  ON analytics_event (session_id, occurred_at);

-- Decision 5, index 3: equality on kind, then range on time.
CREATE INDEX IF NOT EXISTS idx_analytics_event_kind_time
  ON analytics_event (kind, occurred_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_event_rollup — what SURVIVES the retention sweep.
--
-- RETENTION_DAY (retention.service.ts) deletes raw rows past its window. Without this
-- table that deletion would be amnesia: the traffic history disappears along with the
-- rows. The rollup is the point of the retention policy, not an optimisation on top of it
-- — raw rows are only safe to delete BECAUSE the aggregate has already been written.
--
-- ONE ROW PER (period, kind, path). Daily grain, stored as a date for the same reason
-- recognition.period is (migration 019): a timestamp invites an argument about which day a
-- row belongs to; a date cannot. path is included because "which page" is the one breakdown
-- worth keeping forever; anything finer (session, visitor identity, detail) is deliberately
-- NOT preserved — a permanent per-visitor record is a privacy liability, and the whole
-- point of a bounded window is that individual behaviour ages out.
--
-- session_count AND visitor_count ARE COMPUTED AT ROLLUP TIME AND CANNOT BE RECOMPUTED
-- LATER. distinct-session is not summable — two days of 10 sessions each are not 20 unique
-- sessions across the pair. The number is therefore exact only at the daily grain it was
-- written at, and cross-day totals are a SUM of daily uniques, which is an upper bound.
-- That is stated here so no dashboard later presents it as a true unique count.
--
-- The unique index is what makes the rollup IDEMPOTENT: re-running any day upserts the same
-- rows rather than doubling them. A rollup that cannot be safely re-run is a rollup nobody
-- dares run after a crash.
CREATE TABLE IF NOT EXISTS analytics_event_rollup (
  analytics_event_rollup_id  bigserial PRIMARY KEY,
  period                     date NOT NULL,
  kind                       analytics_event_kind NOT NULL,
  path                       varchar(512) NOT NULL,
  event_count                integer NOT NULL DEFAULT 0,
  -- Exact at this day's grain only. Summing across days over-counts. See note above.
  session_count              integer NOT NULL DEFAULT 0,
  visitor_count              integer NOT NULL DEFAULT 0,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Idempotency, enforced by the database rather than by the service.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_event_rollup_period_kind_path
  ON analytics_event_rollup (period, kind, path);

-- Dashboard reads walk the rollup by period, recent-first, exactly like the raw table.
CREATE INDEX IF NOT EXISTS idx_analytics_event_rollup_period
  ON analytics_event_rollup (period DESC);

-- ── Added after review ───────────────────────────────────────────────────────
-- The header argued this table is "queried by period and by session, never by
-- entity", so no index on user_id. The engagement read this build actually ships
-- (GET /api/event/engagement) filters `user_id IS NOT NULL` over the full 90-day
-- window and groups by user_id — i.e. by entity. And the retention sweep and
-- rollup both filter exclusively on received_at, which had no index at all.
-- Retention IS a privacy control here: an unindexed sweep degrades to a seq scan,
-- hits its batch cap, and raw per-visitor rows then survive past the published
-- window for operational rather than policy reasons. Both indexes are the shipped
-- queries' actual access path, so the header's rationale is superseded.

CREATE INDEX IF NOT EXISTS idx_analytics_event_received
  ON analytics_event (received_at);

-- Partial: only rows with a user are ever read by the engagement panel, and those
-- are a small minority of the firehose.
CREATE INDEX IF NOT EXISTS idx_analytics_event_user
  ON analytics_event (user_id, occurred_at)
  WHERE user_id IS NOT NULL;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('046_analytics_event.sql', false)
ON CONFLICT (filename) DO NOTHING;
