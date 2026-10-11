-- Each portfolio item shows on a laptop or a phone frame. Laptop is the default.
-- Display order becomes a clean 0..n-1 sequence so each position has one item.
BEGIN;

ALTER TABLE portfolio_project
  ADD COLUMN IF NOT EXISTS device_type varchar(10) NOT NULL DEFAULT 'laptop';

UPDATE portfolio_project
SET device_type = 'phone'
WHERE lower(regexp_replace(title, '[^a-zA-Z]', '', 'g')) ~ '^(nokohi|pcedm|floodpass)';

WITH ranked AS (
  SELECT portfolio_project_id,
         row_number() OVER (ORDER BY display_order NULLS LAST, portfolio_project_id) - 1 AS pos
  FROM portfolio_project
)
UPDATE portfolio_project p
SET display_order = ranked.pos
FROM ranked
WHERE ranked.portfolio_project_id = p.portfolio_project_id;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('052_portfolio_device_type.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
