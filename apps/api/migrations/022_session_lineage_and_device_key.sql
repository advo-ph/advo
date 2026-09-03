-- Migration 022: Session lineage and device keys — so an internal tool stops logging
-- its own staff out.
--
-- Two separate bugs share one table, so they share one migration.
--
-- BUG 1: ROTATION HAD NO GRACE, SO CONCURRENCY WAS A LOGOUT.
--
-- rotateRefreshToken() deleted the presented row and inserted a replacement. One-time use,
-- no window, no record of what replaced what. That is correct only if exactly one request
-- ever presents a given refresh token. In this app five do: useAdminData fires five queries
-- through Promise.all, and when the 15-minute access token has expired all five come back
-- 401 and all five post the same refresh token. One won and deleted the row. The other four
-- got 401 and the client called clearTokens(), erasing the token the winner had just
-- written. Two browser tabs did the same thing to each other, permanently.
--
-- The fix is a lineage. Every login opens a family; every rotation within that login carries
-- the same family_id and marks its predecessor rotated_at rather than deleting it. A token
-- presented after it was already rotated is no longer an error — inside the grace window the
-- server answers with the family's current live token, so all five racers converge on the
-- same credential and nobody is signed out.
--
-- rotated_at IS NULL is the definition of "live". There is exactly one live row per family,
-- enforced by the partial unique index below rather than trusted to the service, because the
-- whole point of this migration is that concurrent writers reach this table.
--
-- BUG 2: THERE WAS NO WAY TO OFFER "LOG IN AS PRINCE" AFTER A LOGOUT.
--
-- Signing out revokes the refresh token, which is what signing out means. But the product
-- wants the account to stay on the login screen as a one-tap target afterwards, with no
-- password typed. A rotating refresh token cannot do that: logout destroys it.
--
-- So a device key is a second, non-rotating credential scoped to one browser. It is not
-- consumed when used, it survives logout, and it can do exactly one thing — mint a fresh
-- session for the user it belongs to. is_device_key partitions the table: every existing
-- query means the rotating kind, and every existing query keeps working because the column
-- defaults to false.
--
-- This is deliberately weaker than a refresh token, and deliberately so. ADVO's own staff
-- are the only users; the instruction was that convenience wins here and that no security
-- friction be added that was not asked for. A device key is a long-lived bearer credential
-- in localStorage. That is the trade being made, written down so it is not mistaken for an
-- oversight. Revoking one is a single DELETE, exposed as "Forget this account".
--
-- Retention: rotated rows are garbage after the grace window and cleanExpiredSessions
-- deletes them. Device keys live until their owner forgets the account or they expire.

BEGIN;

-- ─── Lineage ───

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS family_id     varchar(64),
  ADD COLUMN IF NOT EXISTS rotated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS is_device_key boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_used_at  timestamptz;

COMMENT ON COLUMN session.family_id IS
  'One login lineage. Every rotation of the same login shares it. Resolving a stale token means finding the live row (rotated_at IS NULL) in its family.';

COMMENT ON COLUMN session.rotated_at IS
  'When this token was superseded. NULL means live. A rotated token presented inside the grace window is answered with its family''s live token instead of a 401.';

COMMENT ON COLUMN session.is_device_key IS
  'true = non-rotating per-browser credential behind one-tap login. Not consumed on use, survives logout, only mints sessions. false = ordinary rotating refresh token.';

COMMENT ON COLUMN session.last_used_at IS
  'Last time this row was presented. Drives the ordering of saved accounts and lets an idle device key be spotted.';

-- Every pre-existing row is its own lineage of one. gen_random_uuid is core in PG 13+.
UPDATE session SET family_id = gen_random_uuid()::text WHERE family_id IS NULL;

-- The default is not for the application, which always supplies a family_id. It is so that
-- an INSERT written before this migration existed still works: during a rolling deploy, and
-- for the whole of any rollback, old code is issuing refresh tokens against this table and a
-- bare NOT NULL with no default would turn every one of those into a failed login.
ALTER TABLE session ALTER COLUMN family_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE session ALTER COLUMN family_id SET NOT NULL;

-- One live row per family. The service uses an atomic claim on rotated_at to elect a single
-- rotator, and this index is what makes that election checkable rather than assumed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_family_live
  ON session (family_id)
  WHERE rotated_at IS NULL AND is_device_key = false;

-- The grace-window lookup: given any token in a family, find that family's live row.
CREATE INDEX IF NOT EXISTS idx_session_family
  ON session (family_id);

-- "Which device keys does this user have" — read on every login and every forget.
CREATE INDEX IF NOT EXISTS idx_session_device_key
  ON session (user_id)
  WHERE is_device_key = true;

-- A device key never rotates, so a rotated device key is a contradiction rather than a state.
DO $$ BEGIN
  ALTER TABLE session
    ADD CONSTRAINT chk_session_device_key_never_rotates
    CHECK (is_device_key = false OR rotated_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('022_session_lineage_and_device_key.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
