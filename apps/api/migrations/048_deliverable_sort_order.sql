-- ============================================================
-- 048_deliverable_sort_order.sql
-- Give the shared Tasks board a durable, per-status order.
-- ============================================================

BEGIN;

ALTER TABLE deliverable
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Existing rows keep their current relative order (newest first, matching the
-- old Tasks page's initial presentation) before users start dragging them.
WITH ordered AS (
  SELECT
    deliverable_id,
    (ROW_NUMBER() OVER (
      PARTITION BY status
      ORDER BY created_at DESC, deliverable_id DESC
    ) - 1)::integer AS next_sort_order
  FROM deliverable
)
UPDATE deliverable AS d
SET sort_order = ordered.next_sort_order
FROM ordered
WHERE d.deliverable_id = ordered.deliverable_id;

CREATE INDEX IF NOT EXISTS idx_deliverable_status_sort_order
  ON deliverable (status, sort_order, deliverable_id);

-- All creation paths (Tasks, meetings, revisions, and sign-off revisions) get
-- the same rule: a new item enters the top of its status list. A trigger keeps
-- that invariant at the database boundary, including for future writers.
CREATE OR REPLACE FUNCTION set_deliverable_sort_order_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sort_order IS NULL OR NEW.sort_order = 0 THEN
    SELECT COALESCE(MIN(sort_order), 0) - 1
    INTO NEW.sort_order
    FROM deliverable
    WHERE status = NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliverable_sort_order_on_insert ON deliverable;

CREATE TRIGGER deliverable_sort_order_on_insert
BEFORE INSERT ON deliverable
FOR EACH ROW
EXECUTE FUNCTION set_deliverable_sort_order_on_insert();

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('048_deliverable_sort_order.sql', true)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
