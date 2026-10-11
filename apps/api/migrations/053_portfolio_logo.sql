-- Each portfolio item can show its logo in place of the text title.
-- Items that already have a logo in the landing marquee get that file.
BEGIN;

ALTER TABLE portfolio_project
  ADD COLUMN IF NOT EXISTS logo_url varchar(500);

WITH marks(pattern, url) AS (
  VALUES
    ('^fourlinq', '/landing/logo/fourlinq.png'),
    ('^vbeeye', '/landing/logo/vbe-eye-center.png'),
    ('^feliciartisan', '/landing/logo/felici.webp'),
    ('^feliciitalian', '/landing/logo/felici-italian-cafe.webp'),
    ('^campsph', '/landing/logo/camps-ph.png'),
    ('^floodpass', '/landing/logo/floodpass.webp'),
    ('^nokohi', '/landing/logo/nokoji.webp'),
    ('^pcedm', '/landing/logo/philippine-college-endocrinology.webp'),
    ('^tmcregistry', '/landing/logo/tmc-registry.png'),
    ('^coffeerush', '/landing/logo/coffee-rush.png')
)
UPDATE portfolio_project p
SET logo_url = marks.url
FROM marks
WHERE p.logo_url IS NULL
  AND lower(regexp_replace(p.title, '[^a-zA-Z]', '', 'g')) ~ marks.pattern;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('053_portfolio_logo.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
