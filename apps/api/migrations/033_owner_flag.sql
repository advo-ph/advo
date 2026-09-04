-- Migration 026 — user.is_owner
--
-- Adds a boolean flag identifying the owner, Prince Wagan.
-- The owner sees and can edit everything by virtue of this flag — no permission-editing UI
-- is built. Phase 8 money visibility reads this flag to decide what amounts to expose.
--
-- Both of Prince's login rows are flagged. He signs in day to day as
-- prince.wagan@advo.ph; admin@advo.ph is the seeded bootstrap account for the same
-- person. Flagging only the seed row locked the owner out of his own money figures.
--
-- All other users default to false.

ALTER TABLE "user" ADD COLUMN is_owner boolean NOT NULL DEFAULT false;

UPDATE "user" SET is_owner = true
WHERE email IN ('admin@advo.ph', 'prince.wagan@advo.ph');

INSERT INTO schema_migration (filename) VALUES ('033_owner_flag.sql');
