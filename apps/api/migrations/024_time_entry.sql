-- Migration 024: Time entry — the first ACTUALS this repo has ever held.
--
-- Two quotes drive the whole P0 revenue tier, and neither can be answered today:
--
--   David, on FourlinQ: "the 12k isnt enough as a downpayment"
--   Prince, May 6:      "we need a proper workflow or system na we'd be able to manage
--                        or handle multiple clients at once -- specifically the workload
--                        on the developer side"
--
-- Both are claims about how much work something took. The platform has never recorded
-- that. `availability_block` (migration 002) tracks PLANNED time -- school, work, break,
-- unavailable -- and `deliverable` tracks whether a thing is done. Nothing anywhere
-- records how long anything actually took, so "the downpayment floor should be X" stays
-- an anecdote, and "who is overloaded" stays a guess made by looking at a calendar of
-- intentions.
--
-- ─── The shape ────────────────────────────────────────────────────────────────
--
-- One table. A time_entry is minutes attributed to a project, optionally narrowed to a
-- deliverable, by one team member, on one date.
--
--   * MINUTES, INTEGER. Never hours-as-float. 1.5h stored as a float and summed across a
--     year does not equal the same number twice, and this feeds an invoice-floor
--     argument. The same discipline every money column in this repo already follows.
--
--   * A DATE, NOT A TIMESTAMP RANGE. This is deliberately NOT a start/stop timer. Nobody
--     on this team is going to run a stopwatch, and a timer model that people fill in
--     retroactively is a timer model that lies with extra steps. "3 hours on Tuesday" is
--     what a person can honestly report, so that is what the schema accepts. The date is
--     resolved in Asia/Manila, matching 017's billing anchors.
--
--   * ATTRIBUTION IS TO A PROJECT FIRST. deliverable_id is nullable because real work
--     ("a call with the client", "fixing the deploy") frequently belongs to a project and
--     to no deliverable, and forcing a deliverable would push that time into whichever
--     row was nearest -- which is worse than recording it unattributed.
--
-- ─── What this is NOT, and each is a decision ─────────────────────────────────
--
--   * NOT BILLING. There is no rate column, no cost, no link to invoice. ADVO bills
--     fixed-price per the contract, not hourly, and adding a rate here would invent a
--     billing model nobody agreed to. Time informs the PRICE OF THE NEXT PROPOSAL; it
--     does not generate a charge.
--   * NOT SURVEILLANCE. No idle detection, no screenshots, no per-keystroke anything.
--     is_billable is absent for the same reason -- it is a category that turns a record
--     of effort into a judgement about a person.
--   * NOT APPROVAL WORKFLOW. No submitted/approved state. A team member records what
--     they did; nobody countersigns it. Adding approval would be modelling a
--     relationship this company does not have.
--   * NO AUTOMATIC CAPACITY ENFORCEMENT. Nothing here blocks assigning work to somebody
--     already over. The capacity view DERIVES the overload and shows it; acting on it is
--     a conversation between people.
--
-- Retention: permanent. This is the evidence base for what a project actually costs, and
-- its value is entirely in comparing this year against last.

BEGIN;

CREATE TABLE IF NOT EXISTS time_entry (
  time_entry_id    bigserial PRIMARY KEY,
  project_id       integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,
  deliverable_id   integer REFERENCES deliverable (deliverable_id) ON DELETE SET NULL,
  team_member_id   integer NOT NULL REFERENCES team_member (team_member_id) ON DELETE CASCADE,
  -- The working day, in Asia/Manila. Not a timestamp range -- see the header.
  worked_on        date NOT NULL,
  minute_count     integer NOT NULL,
  note             text,
  -- Who typed it in. Usually the same person as team_member_id, but an admin backfilling
  -- somebody else's week is a real thing and the two must stay distinguishable.
  created_by       integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),

  -- Zero minutes is not an entry, and negative minutes is a correction someone should
  -- make by editing the original row rather than by filing an anti-entry.
  CONSTRAINT chk_time_entry_minute CHECK (minute_count > 0),
  -- 16 hours. Not a productivity opinion -- an upper bound that catches the two real
  -- data-entry errors: hours typed into a minutes field (8 -> 480 vs 8), and a
  -- misplaced zero. A genuine 17-hour day gets split into two rows, which is also the
  -- more honest record.
  CONSTRAINT chk_time_entry_maximum CHECK (minute_count <= 960)
);

COMMENT ON TABLE time_entry IS
  'Minutes actually worked, per project per person per day (migration 024). The first ACTUALS in this repo: availability_block holds PLANNED time and deliverable holds done/not-done, but nothing recorded how long anything took -- which is why "the 12k isnt enough as a downpayment" could never be answered with a number.';

COMMENT ON COLUMN time_entry.minute_count IS
  'Integer MINUTES. Never hours-as-float: 1.5h summed as a float across a year does not equal the same number twice, and this feeds a pricing argument. Same discipline as every money column here.';

COMMENT ON COLUMN time_entry.worked_on IS
  'The working DAY in Asia/Manila, not a start/stop range. Deliberately not a stopwatch model: a timer people fill in retroactively lies with extra steps, whereas "3 hours on Tuesday" is what a person can honestly report.';

COMMENT ON COLUMN time_entry.deliverable_id IS
  'Nullable on purpose. Real work -- a client call, fixing the deploy -- belongs to a project and to no deliverable, and forcing one pushes that time onto whichever row was nearest.';

COMMENT ON COLUMN time_entry.created_by IS
  'Who typed the row in, which is not always who did the work. An admin backfilling somebody''s week must stay distinguishable from that person reporting it themselves.';

CREATE INDEX IF NOT EXISTS idx_time_entry_project ON time_entry (project_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_member ON time_entry (team_member_id, worked_on);
CREATE INDEX IF NOT EXISTS idx_time_entry_deliverable ON time_entry (deliverable_id);

-- The capacity view's only scan: everything in a date window.
CREATE INDEX IF NOT EXISTS idx_time_entry_worked_on ON time_entry (worked_on);

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('024_time_entry.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
