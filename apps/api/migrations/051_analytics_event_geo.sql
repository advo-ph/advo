-- Migration 051: visitor geo on analytics_event (country/region/city/lat/lon only; no
-- raw IP). No separate geo rollup table -- raw rows are retained indefinitely by default
-- as of this migration (see retention.service.ts), so the admin stats API reads geo
-- straight off this table for any date range.
--
-- geo_lat/geo_lon are CITY-CENTROID precision only (rounded to 2 decimals at write time
-- in routes/event.routes.ts), never an exact visitor location -- see geo.service.ts.
BEGIN;

ALTER TABLE analytics_event
  ADD COLUMN IF NOT EXISTS geo_country varchar(2),
  ADD COLUMN IF NOT EXISTS geo_region  varchar(100),
  ADD COLUMN IF NOT EXISTS geo_city    varchar(100),
  ADD COLUMN IF NOT EXISTS geo_lat     numeric(6, 2),
  ADD COLUMN IF NOT EXISTS geo_lon     numeric(6, 2);

-- Partial: most rows will have a geo once the lookup is live, but historical rows (and
-- anything looked up before the mmdb file existed) will not. Speeds "top countries in
-- range" without taxing every insert with a mandatory non-null index.
CREATE INDEX IF NOT EXISTS idx_analytics_event_geo_country
  ON analytics_event (geo_country, received_at)
  WHERE geo_country IS NOT NULL;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('051_analytics_event_geo.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
