-- Migration 062: Facebook page scrape store.
--
-- Until now a Facebook scrape lived only in `scrape_result.data` (one opaque jsonb blob per
-- run, cache semantics, no history). This stores the scrape as queryable rows so a page's
-- posts, comments and engagement can be compared run over run.
--
-- DECISIONS, RECORDED SO NOBODY ASSUMES THEM:
--
-- 1. ONE ROW PER PAGE / POST / COMMENT, UPSERTED. A re-scrape updates rows in place; it never
--    duplicates. The natural keys are (fb_page.page_code), (fb_post.fb_page_id, post_code) and
--    (fb_comment.fb_post_id, comment_code). A post seen under a numeric id in one run and a
--    pfbid in another is collapsed by the scraper ledger BEFORE it reaches this table.
--
-- 2. COUNTS ARE TIME SERIES, NOT OVERWRITES. fb_post.*_count holds the LATEST value; every run
--    also appends one fb_post_snapshot row, so growth (reach / engagement over time) is
--    computable without having kept the old blob.
--
-- 3. A RE-SCRAPE NEVER ERASES A KNOWN VALUE. Upserts COALESCE(new, old): a run that failed to
--    read a field (FB hid it, a layer was skipped) cannot null out what an earlier run captured.
--
-- 4. COMMENT COUNTS ARE ADVISORY. fb_post.comment_count is Facebook's own counter, which includes
--    comments Facebook refuses to render; fb_comment holds only what was actually captured. The
--    run's audit (fb_scrape_run.audit) records the coverage; no constraint equates the two.
--
-- 5. CLIENT DATA, PRIVATE DB. Page content is third-party. client_id (nullable, SET NULL) links a
--    page to the ADVO client it was scraped for; nothing here is ever committed to the repo.

CREATE TABLE IF NOT EXISTS fb_page (
  fb_page_id       bigserial PRIMARY KEY,
  -- Facebook's numeric page/profile id when known, else the URL slug. Stable natural key.
  page_code        varchar(120) NOT NULL UNIQUE,
  slug             varchar(120),
  name             varchar(255),
  category         varchar(255),
  description      text,
  bio              text,
  vision           text,
  mission          text,
  website          varchar(500),
  phone            varchar(60),
  email            varchar(255),
  address          text,
  hour             text,
  rating           varchar(60),
  creation_date    varchar(40),
  follower_count   integer,
  like_count       integer,
  following_count  integer,
  is_verified      boolean,
  profile_image    text,
  cover_image      text,
  client_id        integer REFERENCES client(client_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fb_page_client ON fb_page(client_id);

CREATE TABLE IF NOT EXISTS fb_scrape_run (
  fb_scrape_run_id bigserial PRIMARY KEY,
  fb_page_id       integer NOT NULL REFERENCES fb_page(fb_page_id) ON DELETE CASCADE,
  source_url       varchar(2000) NOT NULL,
  -- 'ok' = every audit check passed; 'partial' = captured but an audit check failed;
  -- 'logged_out' / 'rate_limited' = stopped before a usable capture. App-validated, growable.
  status           varchar(20) NOT NULL,
  stop_reason      varchar(40),
  is_audit_ok      boolean NOT NULL,
  post_count       integer NOT NULL,
  comment_count    integer NOT NULL,
  audit            jsonb NOT NULL,
  stat             jsonb NOT NULL,
  analysis         jsonb NOT NULL,
  scraped_by       integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fb_scrape_run_page ON fb_scrape_run(fb_page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_scrape_run_scraped_by ON fb_scrape_run(scraped_by);

CREATE TABLE IF NOT EXISTS fb_post (
  fb_post_id          bigserial PRIMARY KEY,
  fb_page_id          integer NOT NULL REFERENCES fb_page(fb_page_id) ON DELETE CASCADE,
  -- Numeric FB post id when known, else pfbid token, else a synthetic 'h:<hash>'.
  post_code           varchar(200) NOT NULL,
  alias               jsonb NOT NULL DEFAULT '[]',
  permalink           varchar(1000),
  kind                varchar(20) NOT NULL,
  caption             text NOT NULL DEFAULT '',
  posted_at           timestamptz,
  author_code         varchar(60),
  author_name         varchar(255),
  reaction_count      integer,
  reaction_breakdown  jsonb NOT NULL DEFAULT '{}',
  comment_count       integer,
  share_count         integer,
  view_count          integer,
  image_url           jsonb NOT NULL DEFAULT '[]',
  video_url           text,
  external_url        jsonb NOT NULL DEFAULT '[]',
  hashtag             jsonb NOT NULL DEFAULT '[]',
  mention             jsonb NOT NULL DEFAULT '[]',
  is_sponsored        boolean NOT NULL DEFAULT false,
  is_pinned           boolean NOT NULL DEFAULT false,
  source              jsonb NOT NULL DEFAULT '[]',
  last_fb_scrape_run_id integer REFERENCES fb_scrape_run(fb_scrape_run_id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fb_page_id, post_code)
);
CREATE INDEX IF NOT EXISTS idx_fb_post_page_posted ON fb_post(fb_page_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_post_last_run ON fb_post(last_fb_scrape_run_id);

CREATE TABLE IF NOT EXISTS fb_post_snapshot (
  fb_post_snapshot_id bigserial PRIMARY KEY,
  fb_post_id          integer NOT NULL REFERENCES fb_post(fb_post_id) ON DELETE CASCADE,
  fb_scrape_run_id    integer NOT NULL REFERENCES fb_scrape_run(fb_scrape_run_id) ON DELETE CASCADE,
  reaction_count      integer,
  comment_count       integer,
  share_count         integer,
  view_count          integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- One snapshot per post per run: re-running the import of the same run cannot double it.
  UNIQUE (fb_post_id, fb_scrape_run_id)
);
CREATE INDEX IF NOT EXISTS idx_fb_post_snapshot_run ON fb_post_snapshot(fb_scrape_run_id);

CREATE TABLE IF NOT EXISTS fb_comment (
  fb_comment_id       bigserial PRIMARY KEY,
  fb_post_id          integer NOT NULL REFERENCES fb_post(fb_post_id) ON DELETE CASCADE,
  comment_code        varchar(60) NOT NULL,
  parent_comment_code varchar(60),
  depth               integer NOT NULL DEFAULT 0,
  author_code         varchar(60),
  author_name         varchar(255),
  is_page_author      boolean NOT NULL DEFAULT false,
  body                text NOT NULL,
  commented_at        timestamptz,
  reaction_count      integer,
  reply_count         integer,
  permalink           varchar(1000),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fb_post_id, comment_code)
);

COMMENT ON TABLE fb_page IS 'Facebook page scraped by apps/api/src/scrapers/fb-page. Third-party content: private DB only. Latest known values; history is in fb_scrape_run / fb_post_snapshot.';
COMMENT ON TABLE fb_post_snapshot IS 'Per-run engagement counts for a post. Retain indefinitely: it is the only record of growth over time.';
COMMENT ON COLUMN fb_post.comment_count IS 'Facebook''s own counter (includes comments FB will not render). Captured comments are the fb_comment rows.';
