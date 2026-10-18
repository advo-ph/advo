-- Portfolio items are visible by default. Rows created under the previous false
-- default start shown unless an admin hides them again.
BEGIN;

ALTER TABLE portfolio_project
  ALTER COLUMN is_featured SET DEFAULT true;

UPDATE portfolio_project
SET is_featured = true
WHERE is_featured = false;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('050_portfolio_visibility.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
