-- 044: a team member's landing preview image.
ALTER TABLE team_member ADD COLUMN IF NOT EXISTS preview_image_url VARCHAR(500);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('044_team_preview_image.sql', false)
ON CONFLICT (filename) DO NOTHING;
