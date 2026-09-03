-- 028: a discount is a fact about a price, not a new price.
--
-- A project row carried one value (what the client pays) and one paid amount. A
-- discounted engagement had to choose between recording the list price and looking
-- underpaid forever, or recording the charged price and losing the list price. Now
-- it carries both: total_value_cents stays the charged figure every existing screen
-- reads; list_value_cents and discount_cents explain it. list − discount = total
-- when a list price is given; the API refuses anything else.

BEGIN;

ALTER TABLE project ADD COLUMN IF NOT EXISTS list_value_cents integer;
ALTER TABLE project ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE project ADD COLUMN IF NOT EXISTS discount_reason varchar(120);

DO $$ BEGIN
  ALTER TABLE project ADD CONSTRAINT project_discount_nonneg CHECK (discount_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE project ADD CONSTRAINT project_discount_arithmetic
    CHECK (list_value_cents IS NULL OR list_value_cents - discount_cents = total_value_cents);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('028_project_discount.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
