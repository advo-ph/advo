-- Migration 009: change_order
--
-- Client-filed change orders (CONTRACTS.md policy 3). New scope — not a
-- revision of existing work — needs a written paper trail before work starts.
-- Client files scope + reason from /hub; team lists and quotes via the API.

BEGIN;

CREATE TABLE IF NOT EXISTS change_order (
  change_order_id  bigserial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  scope            text NOT NULL,
  reason           text NOT NULL,
  status           varchar(50) NOT NULL DEFAULT 'filed',
  price_cents      integer,
  timeline_note    text,
  created_by       integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE change_order IS
  'Client-filed change order (CONTRACTS.md policy 3). scope + reason from /hub; status filed|quoted|signed|declined. Team quotes price_cents + timeline_note. Work must not start until signed.';

COMMENT ON COLUMN change_order.scope IS
  'What is being added or substantively changed (new page, feature, or competitor-inspired request).';

COMMENT ON COLUMN change_order.reason IS
  'Why the client wants it — e.g. saw it on another site. Distinguishes new scope from a revision.';

COMMENT ON COLUMN change_order.status IS
  'App-validated varchar: filed (client submitted) | quoted (team set price/timeline) | signed (client confirmed) | declined. Not a DB enum so the set can grow.';

CREATE INDEX IF NOT EXISTS idx_change_order_project    ON change_order(project_id);
CREATE INDEX IF NOT EXISTS idx_change_order_created_by ON change_order(created_by);
CREATE INDEX IF NOT EXISTS idx_change_order_created_at ON change_order(created_at DESC);

COMMIT;
