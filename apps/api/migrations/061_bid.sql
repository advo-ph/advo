-- Migration 061: government bids, read from PhilGEPS once a day.
--
-- `bid` holds every open PhilGEPS notice the daily sync has listed (about 12,000 at
-- any time), slim for most of them and in full for the ones that might fit ADVO.
-- `bid_update` is what changed, and is the feed members are notified from. `bid_sync`
-- is one row per run, so "when did we last look, and did the whole list come back"
-- has an answer. `bid_member` holds each member's last look at the feed and whether
-- they want the daily email.
--
-- win / kind / rated_by / status / update kind are app-validated short strings with a
-- CHECK, like availability_block, not pg enums: the sets are small and may grow.
BEGIN;

CREATE TABLE IF NOT EXISTS bid (
  bid_id bigserial PRIMARY KEY,
  ref varchar(20) NOT NULL UNIQUE,
  title text NOT NULL,
  buyer text NOT NULL,
  business_category text,
  area text,
  solicitation text,
  mode text,
  classification text,
  category text,
  abc numeric(16, 2),
  delivery_period text,
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_text text,
  supplement_count integer NOT NULL DEFAULT 0,
  published_on date,
  closing_at timestamptz,
  pre_bid_at timestamptz,
  pre_bid_time text,
  pre_bid_place text,
  pre_bid_from_text boolean NOT NULL DEFAULT false,
  description text,
  status varchar(12) NOT NULL DEFAULT 'open',
  missing_run_count integer NOT NULL DEFAULT 0,
  read_at timestamptz,
  topic varchar(20),
  is_candidate boolean NOT NULL DEFAULT false,
  is_fit boolean NOT NULL DEFAULT false,
  fit_reason text,
  fit_at timestamptz,
  win varchar(8),
  kind varchar(10),
  short_title text,
  short_buyer text,
  place text,
  join_note text,
  why_note text,
  note text,
  due_at timestamptz,
  due_time text,
  rated_by varchar(8),
  rated_hash varchar(64),
  content_hash varchar(64),
  is_hidden boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bid_status CHECK (status IN ('open', 'closed', 'withdrawn')),
  CONSTRAINT chk_bid_win CHECK (win IS NULL OR win IN ('good', 'fair', 'low')),
  CONSTRAINT chk_bid_kind CHECK (kind IS NULL OR kind IN ('product', 'software', 'hardware')),
  CONSTRAINT chk_bid_rated_by CHECK (rated_by IS NULL OR rated_by IN ('team', 'ai', 'rule'))
);

CREATE INDEX IF NOT EXISTS idx_bid_open_fit ON bid (status, is_fit);
CREATE INDEX IF NOT EXISTS idx_bid_closing ON bid (closing_at);

CREATE TABLE IF NOT EXISTS bid_update (
  bid_update_id bigserial PRIMARY KEY,
  bid_id bigint NOT NULL REFERENCES bid (bid_id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bid_update_kind CHECK (kind IN ('new', 'changed', 'pre_bid_soon', 'due_soon', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_bid_update_created ON bid_update (created_at);
CREATE INDEX IF NOT EXISTS idx_bid_update_bid ON bid_update (bid_id, kind);

CREATE TABLE IF NOT EXISTS bid_sync (
  bid_sync_id bigserial PRIMARY KEY,
  trigger varchar(10) NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  listed_count integer NOT NULL DEFAULT 0,
  page_count integer NOT NULL DEFAULT 0,
  failed_page_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  read_failed_count integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  rated_count integer NOT NULL DEFAULT 0,
  fit_count integer NOT NULL DEFAULT 0,
  update_count integer NOT NULL DEFAULT 0,
  emailed_count integer NOT NULL DEFAULT 0,
  error text,
  CONSTRAINT chk_bid_sync_status CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  CONSTRAINT chk_bid_sync_trigger CHECK (trigger IN ('schedule', 'manual', 'script'))
);

CREATE TABLE IF NOT EXISTS bid_member (
  user_id integer PRIMARY KEY REFERENCES "user" (user_id) ON DELETE CASCADE,
  seen_at timestamptz,
  is_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE bid IS
  'Open PhilGEPS notices from the daily sync (bid-sync.service.ts). Most rows are slim; ones that might fit ADVO are read in full and rated. win/why are a judgement (team, ai or rule), never a measured chance.';
COMMENT ON COLUMN bid.rated_by IS
  'team = a member set it (never overwritten by the sync); ai = the daily model rating; rule = keyword rules only, no rating.';
COMMENT ON COLUMN bid.pre_bid_from_text IS
  'True when the pre-bid was read from the notice text (the notice''s pre-bid table was empty). A later read with an empty table keeps it.';
COMMENT ON COLUMN bid.due_at IS
  'The real bid deadline when the notice text names one that differs from the PhilGEPS closing date (Bustos puts papers on the closing date and bids 12 days later). Null means closing_at is the deadline.';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('061_bid.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
