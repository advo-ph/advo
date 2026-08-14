-- Migration 011: internal library item (admin Library MVP)
--
-- Team-wide reference store for website / prompt / module / asset / doc.
-- Drives /admin → Library. File blobs stay on disk; this table holds metadata.
-- Retention: mutable catalog, not append-only. Soft-delete not required for v1.

BEGIN;

CREATE TYPE library_item_type AS ENUM (
  'website',
  'prompt',
  'module',
  'asset',
  'doc'
);

CREATE TABLE IF NOT EXISTS library_item (
  library_item_id  bigserial PRIMARY KEY,
  item_type        library_item_type NOT NULL,
  title            varchar(255) NOT NULL,
  url              text,
  body             text,
  thumbnail_url    text,
  tag              text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE library_item IS
  'Internal Library catalog (FEATURES.md). item_type drives render. Team-wide, not client-facing.';

COMMENT ON COLUMN library_item.tag IS
  'Singular collection of free-text tags. Empty array when untagged.';

CREATE INDEX IF NOT EXISTS idx_library_item_type
  ON library_item (item_type);

CREATE INDEX IF NOT EXISTS idx_library_item_created
  ON library_item (created_at DESC);

COMMIT;
