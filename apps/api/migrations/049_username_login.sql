-- 049: Move password and magic-link sign-in to canonical usernames.
-- Usernames are the email local part, lowercased with punctuation removed:
-- prince.wagan@advo.ph -> princewagan. The password reset is a separate,
-- explicitly confirmed operation in scripts/reset-existing-user-passwords.mjs.

BEGIN;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS username varchar(255);

UPDATE "user"
SET username = lower(
  regexp_replace(split_part(email, '@', 1) COLLATE "C", '[^A-Za-z0-9]', '', 'g')
)
WHERE username IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user"
    WHERE username IS NULL OR username = ''
  ) THEN
    RAISE EXCEPTION 'Cannot create usernames: an email local part normalizes to an empty username';
  END IF;

  IF EXISTS (
    SELECT username
    FROM "user"
    GROUP BY username
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create usernames: multiple accounts normalize to the same username';
  END IF;
END;
$$;

ALTER TABLE "user"
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username
  ON "user" (username);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('049_username_login.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
