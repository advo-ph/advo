-- Migration 023: The internal task tracker. Three lists, one button, nothing a client sees.
--
-- The ask was small and specific: "What's pending, what to do, what's ongoing, and then what's
-- finished. There will only be three lists." A card advances by button, only by the person it
-- is assigned to, and everyone can see every card and who owns it.
--
-- WHY THIS IS A NEW TABLE AND NOT `deliverable`, which already has a status and an assignee:
--
-- 1. `deliverable` IS CLIENT-FACING. useClientData.ts fetches /api/deliverables and
--    ProjectDashboard.tsx renders those rows straight into the client hub. An internal task
--    written into that table is an internal task shown to a paying client. There is no column
--    that fixes this, only a separate table.
--
-- 2. `deliverable.project_id` IS NOT NULL. "Redo the onboarding doc" belongs to no project.
--    A tracker that cannot hold a standalone task is not the tracker that was asked for, so
--    `project_id` here is NULLABLE by design. That is the point of the column being different.
--
-- 3. THE STATUS VOCABULARIES DISAGREE, AND BOTH ARE RIGHT. `deliverable_status` has five
--    values and AdminSchedule.tsx actively writes `review` and `blocked`. This model has
--    exactly three and the advance button depends on there being exactly three: `todo` has one
--    next state, `ongoing` has one next state, `finished` has none. Sharing an enum would mean
--    either breaking the deliverables UI or teaching this one to render states it has no button
--    for. A separate enum keeps both honest.
--
-- 4. `signoff_revision.deliverable_id` FKs INTO IT and projects.routes.ts feeds deliverable
--    lists into Claude prompts. Internal chores would land in the contract paper trail and in
--    model context. Neither belongs there.
--
-- ON THE TIMESTAMPS: `started_at` and `finished_at` exist so "how long did this sit in Ongoing"
-- is answerable later without an event log. They are maintained by task.routes.ts on every
-- write path (create, edit, advance), and the CHECK constraints below hold that service to its
-- promise rather than trusting it. A finished task that was never started is a bug, so the
-- database refuses it.
--
-- Retention: ordinary operational data. Deleting a member or a project empties the reference
-- (SET NULL) and keeps the task, because the work outlives the assignment.

BEGIN;

-- ─── Exactly three states. The button depends on it. ───

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'ongoing', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS task (
  task_id     bigserial PRIMARY KEY,
  title       varchar(255) NOT NULL,
  description text,
  status      task_status NOT NULL DEFAULT 'todo',
  assigned_to integer,
  created_by  integer,
  project_id  integer,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Written as ADD COLUMN IF NOT EXISTS as well as in the CREATE, so the file is re-runnable
-- against a database that already has an earlier shape of the table.
ALTER TABLE task
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS assigned_to integer,
  ADD COLUMN IF NOT EXISTS created_by  integer,
  ADD COLUMN IF NOT EXISTS project_id  integer,
  ADD COLUMN IF NOT EXISTS started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

COMMENT ON TABLE task IS
  'Internal team task tracker: todo -> ongoing -> finished. Never shown to clients. That is what `deliverable` is for. See the header of 023_task.sql.';

COMMENT ON COLUMN task.assigned_to IS
  'The one person who may advance this task. NULL means unassigned, which means nobody can advance it until it is assigned. Enforced in task.routes.ts, not by a role check, because every roster member is an admin and a role check would let everyone through.';

COMMENT ON COLUMN task.project_id IS
  'NULLABLE on purpose. A standalone internal task belongs to no project; this is the column `deliverable` could not offer.';

COMMENT ON COLUMN task.started_at IS
  'Stamped when the task first enters `ongoing`. With finished_at, makes time-in-column derivable without an event log.';

COMMENT ON COLUMN task.finished_at IS
  'Stamped when the task enters `finished`. Cleared if the task is ever moved back out of it.';

-- ─── References. SET NULL: the work outlives the assignment. ───

DO $$ BEGIN
  ALTER TABLE task
    ADD CONSTRAINT task_assigned_to_team_member_fk
    FOREIGN KEY (assigned_to) REFERENCES team_member (team_member_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task
    ADD CONSTRAINT task_created_by_team_member_fk
    FOREIGN KEY (created_by) REFERENCES team_member (team_member_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task
    ADD CONSTRAINT task_project_fk
    FOREIGN KEY (project_id) REFERENCES project (project_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── The timestamp promises, kept by the database ───

-- A task cannot finish without having started. Every write path in task.routes.ts backfills
-- started_at when a task jumps straight to finished, so this only ever catches a mistake.
DO $$ BEGIN
  ALTER TABLE task
    ADD CONSTRAINT chk_task_finished_requires_started
    CHECK (finished_at IS NULL OR started_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Finishing before starting is a data-entry error, not fast work.
DO $$ BEGIN
  ALTER TABLE task
    ADD CONSTRAINT chk_task_finished_after_started
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes for the two questions the UI actually asks ───

-- "Which of these are mine". The assignee drives whether the button is live on every card.
CREATE INDEX IF NOT EXISTS idx_task_assigned ON task (assigned_to);

-- "Which list does this go in". The board reads by status on every load.
CREATE INDEX IF NOT EXISTS idx_task_status ON task (status);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('023_task.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
