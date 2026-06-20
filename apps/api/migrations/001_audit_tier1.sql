-- Migration 001: Database audit Tier 1 — FK indexes, missing created_at, scrape retention comment
--
-- Why: database-conventions audit (2026-06-20) flagged three missing FK indexes
-- (cascading deletes do seq scans), two site_config-shaped tables with no creation
-- timestamp (only updated_at), and zero table COMMENTs on the schema. This migration
-- addresses the safest subset of those findings:
--   1. The 3 FK indexes (additive, zero risk)
--   2. created_at on site_config + site_content (additive, defaults to NOW())
--   3. COMMENT on scrape_result documenting retention intent
--
-- Deferred to Tier 2 (riskier — needs per-FK decisions): the 8 FKs that currently
-- default to NO ACTION (schema.ts declares cascade for some; DB drifted because
-- drizzle-kit push doesn't alter existing FK actions). Each needs a CASCADE / SET
-- NULL / RESTRICT call per the relationship.
--
-- Rollback: DROP INDEX ...; ALTER TABLE ... DROP COLUMN created_at; COMMENT ON TABLE
-- scrape_result IS NULL;

BEGIN;

-- 1) FK indexes — cover cascading-delete + join paths
CREATE INDEX IF NOT EXISTS idx_lead_assigned_to
  ON lead(assigned_to);

CREATE INDEX IF NOT EXISTS idx_scrape_result_scraped_by
  ON scrape_result(scraped_by);

CREATE INDEX IF NOT EXISTS idx_notification_project_id
  ON notification(project_id);

-- 2) created_at on site_config + site_content. Existing rows get NOW() at
-- migration time, which is fine — these are config tables, the original
-- creation moment isn't recoverable anyway.
ALTER TABLE site_config
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE site_content
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3) Retention intent on scrape_result. Table is 4.7 MB today with 0 live rows
-- (heap bloat from past scrapes that were hard-deleted). Without a documented
-- retention policy this is the table most likely to balloon as scrape volume
-- grows. Pattern per rule 20 in database-conventions skill.
COMMENT ON TABLE scrape_result IS
  'Brand + FB scrape results, keyed by URL. Append-only from the admin scraper UIs. Storage retention: keep latest 90 days, delete older. Retention script: TODO scripts/scrape-result-retention.ts (not yet written). Track via apps/web/src/components/admin/AdminBrandScraper.tsx + AdminFacebookScraper.tsx.';

COMMIT;
