-- Migration 060: availability_block drops to 3 block types — school, meeting,
-- unavailable. `work` and `break` are gone.
--
-- Free Time / Free Members (AdminAvailability.tsx) never needed four types. `work`
-- only ever meant "the base window before busy time is subtracted" — the search logic
-- itself now treats 7am–midnight as that base, so a `work` row is not an input to
-- anything and the type is deleted, not converted. `break` was always meant to be a
-- flavour of `unavailable` ("busy, for a reason too mundane to need its own bucket")
-- and is converted rather than deleted, even though zero rows currently use it, in
-- case a yet-unsynced environment still has some.
--
-- One `unavailable` -> `meeting` reclassification is included: it is a RULE
-- (label ILIKE '%meeting%'), not a block_id list, because the same migration runs
-- against every environment and the id-approved rows differ per environment (local
-- has zero matches today; production has three — "San Juan City Hall meeting" x2 and
-- "ECEAS meeting" — approved by the user on 19-10-26). The rule is what makes the one
-- file correct everywhere instead of needing a per-environment id list.
--
-- Statement order (approved 19-10-26): delete work, then break -> unavailable, then
-- unavailable -> meeting. Running the meeting rule last means a former `break` row
-- labelled "... meeting" is reclassified too. All three run BEFORE the CHECK is
-- replaced, so no `work`/`break` row is ever evaluated against the new constraint.
-- Drop the old CHECK first: it rejects the new meeting value during reclassification.
-- The transaction keeps the constraint replacement atomic.

BEGIN;

ALTER TABLE availability_block DROP CONSTRAINT IF EXISTS chk_availability_block_type;

-- work rows are deleted outright — nothing in the new 3-type model means the same thing.
DELETE FROM availability_block WHERE block_type = 'work';

-- break -> unavailable. Zero rows match in every environment checked so far; kept for
-- safety in case a future or unsynced environment has some.
UPDATE availability_block
  SET block_type = 'unavailable', updated_at = now()
  WHERE block_type = 'break';

-- unavailable -> meeting, by label rule (not an id list — see note above).
UPDATE availability_block
  SET block_type = 'meeting', updated_at = now()
  WHERE block_type = 'unavailable' AND label ILIKE '%meeting%';

-- Install the CHECK for the new 3 types.
ALTER TABLE availability_block
  ADD CONSTRAINT chk_availability_block_type
  CHECK (block_type IN ('school', 'meeting', 'unavailable'));

ALTER TABLE availability_block ALTER COLUMN block_type SET DEFAULT 'unavailable';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('060_availability_block_meeting_type.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
