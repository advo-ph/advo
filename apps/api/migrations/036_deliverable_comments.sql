BEGIN;

INSERT INTO schema_migration (filename) VALUES ('036_deliverable_comments.sql')
  ON CONFLICT (filename) DO NOTHING;

-- ── New columns on deliverable ────────────────────────────────────────────────
ALTER TABLE deliverable
  ADD COLUMN IF NOT EXISTS attachment_url   varchar(500),
  ADD COLUMN IF NOT EXISTS comments_read_at timestamptz;

-- ── Comment thread per deliverable ───────────────────────────────────────────
-- An owner sends a deliverable back to "ongoing" and leaves a reason; the
-- assignee can read it. comments_read_at on the deliverable tracks when the
-- assignee last read the thread, enabling the hasUnreadComments flag.
CREATE TABLE IF NOT EXISTS deliverable_comment (
  comment_id      BIGSERIAL    PRIMARY KEY,
  deliverable_id  BIGINT       NOT NULL REFERENCES deliverable(deliverable_id) ON DELETE CASCADE,
  author_user_id  BIGINT       REFERENCES "user"(user_id) ON DELETE SET NULL,
  author_name     VARCHAR(255) NOT NULL,
  body            TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverable_comment_deliverable
  ON deliverable_comment (deliverable_id);

COMMIT;
