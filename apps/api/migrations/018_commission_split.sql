-- Migration 018: Commission split — the first model of how ADVO pays ITSELF.
--
-- Every prior money model in this repo points OUTWARD: invoice and recurring_fee bill a
-- client, expense records what left the account, project_signoff triggers a receivable.
-- Nothing modelled what happens to the money once it lands. This does.
--
-- The structure is Prince's, recorded 2026-06-19:
--
--     60% developer   — split between the people who built it, by contribution,
--                       mutually agreed ON PROJECT COMPLETION.
--                       Per project: exactly 1 main developer, at most 1 assistant.
--     25% staff       — sub-split 28% referral / 24% marketing / 24% accounting /
--                       24% management. Within a role held by several people, split by
--                       contribution, likewise mutually agreed on completion.
--     15% company     — reserve. Company expenses and investment ROI payback.
--
-- FOUR DECISIONS WORTH ARGUING WITH, RECORDED SO NOBODY ASSUMES THEM:
--
-- 1. EVERY PERCENTAGE IS BASIS POINTS (integer), never a numeric or a float. 60% = 6000,
--    28% = 2800. A percentage stored as 0.6 is a percentage that will one day pay someone
--    ₱0.01 too little and nobody will be able to say which rounding did it.
--
-- 2. THE PERCENTAGES ARE COLUMNS ON THE PLAN, NOT CONSTANTS IN CODE. They are snapshotted
--    per project at draft time. When Prince renegotiates the split next year, last year's
--    finalized plans must keep paying what they promised. A constant in a .ts file
--    silently rewrites history; a column cannot.
--
-- 3. THE COMPANY RESERVE IS A SHARE ROW WITH team_member_id NULL. It is not a leftover, a
--    remainder, or a derived field. This is what makes the model's one hard invariant
--    checkable: SUM(commission_share.amount_cents) = commission_plan.basis_cents, EXACTLY,
--    with no residue hiding anywhere. See constraint chk_commission_share_member below.
--
-- 4. amount_cents IS NULL WHILE THE PLAN IS DRAFT. Draft amounts are DERIVED on every read
--    from basis + weights (house precedent: expense.is_reimbursable, the sign-off derived
--    block), so an edit to a contribution can never leave a stale peso figure behind.
--    Finalizing FREEZES the derived numbers into the column. After that the row is what
--    was agreed, and a later percentage edit cannot reach back and change it.
--
-- ROUNDING — the rule this model lives or dies by:
--    Largest-remainder (Hamilton) apportionment, applied recursively at every level
--    (basis -> pool, staff pool -> role, role -> person). Each level floors the exact
--    share, then hands the leftover centavos out one at a time to the largest fractional
--    remainder, ties broken by ledger order so a recompute is byte-identical. The sum is
--    exact by construction at EVERY level, so no centavo is ever lost, invented, or
--    quietly absorbed into the company reserve. ₱1.00 across three equal devs is
--    34 + 33 + 33, never 33 + 33 + 33.
--
-- MUTUAL AGREEMENT IS A COLUMN, NOT A CONVENTION. "must be mutually agreed on by the devs
-- upon project completion" is enforced: is_agreed defaults false, and finalize refuses
-- while any person-held share is unagreed. The agreement is the gate, not a nicety.
--
-- NOT IN THIS MIGRATION, deliberately: no payout, no disbursement, no payment rail, no
-- notification_type enum member, no scheduler. A finalized plan says who is owed what.
-- Actually moving money is a separate model and a separate act by a human.
--
-- Retention: a finalized plan is a compensation record. Never hard-delete one; void an
-- unfinalized one instead.

BEGIN;

CREATE TABLE IF NOT EXISTS commission_plan (
  commission_plan_id     bigserial PRIMARY KEY,
  project_id             integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,

  -- Snapshot of the money being split, taken at draft time from project.total_value_cents
  -- and then editable, because the split basis is not always the headline contract value
  -- (a project may split net of a passthrough cost). Integer CENTS, always.
  basis_cents            integer NOT NULL DEFAULT 0,
  basis_note             text,

  -- Top-level split, in basis points. Frozen per plan. 6000 / 2500 / 1500.
  developer_bps          integer NOT NULL DEFAULT 6000,
  staff_bps              integer NOT NULL DEFAULT 2500,
  company_bps            integer NOT NULL DEFAULT 1500,

  -- The 25% staff pool's internal split, in basis points OF THE STAFF POOL.
  -- 2800 / 2400 / 2400 / 2400.
  referral_bps           integer NOT NULL DEFAULT 2800,
  marketing_bps          integer NOT NULL DEFAULT 2400,
  accounting_bps         integer NOT NULL DEFAULT 2400,
  management_bps         integer NOT NULL DEFAULT 2400,

  -- draft | finalized | void. App-validated growable set, varchar not a DB enum, matching
  -- the contract / change_order precedent rather than 017's enum.
  status                 varchar(20) NOT NULL DEFAULT 'draft',

  -- THE stamp. NULL = still editable. Everything about immutability keys off this one
  -- column, exactly as project_signoff.signed_at does.
  finalized_at           timestamptz,
  finalized_by           integer REFERENCES "user" (user_id) ON DELETE SET NULL,

  note                   text,
  created_by             integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_commission_plan_basis CHECK (basis_cents >= 0),

  -- The two sums that make the whole model exact. If either could drift, the ledger could
  -- not add up to the basis and the rounding rule would be unprovable.
  CONSTRAINT chk_commission_plan_top CHECK (developer_bps + staff_bps + company_bps = 10000),
  CONSTRAINT chk_commission_plan_staff
    CHECK (referral_bps + marketing_bps + accounting_bps + management_bps = 10000),

  CONSTRAINT chk_commission_plan_bps_sign CHECK (
    developer_bps >= 0 AND staff_bps >= 0 AND company_bps >= 0
    AND referral_bps >= 0 AND marketing_bps >= 0
    AND accounting_bps >= 0 AND management_bps >= 0
  ),

  -- Status and the stamp can never disagree (project_signoff precedent).
  CONSTRAINT chk_commission_plan_stamp CHECK ((status = 'finalized') = (finalized_at IS NOT NULL))
);

COMMENT ON TABLE commission_plan IS
  'How ONE project''s value is split among the people who earned it (migration 018). 60% developer / 25% staff / 15% company, per Prince 2026-06-19. Percentages are snapshotted per plan so renegotiating the split never rewrites a finalized one. Retention: compensation record — void, never delete.';

COMMENT ON COLUMN commission_plan.basis_cents IS
  'Integer CENTS being split. Seeded from project.total_value_cents at draft time and then independently editable — the split basis is not always the headline contract value. Never float, never string.';

COMMENT ON COLUMN commission_plan.finalized_at IS
  'THE stamp. NULL = draft, every share amount derived on read and every weight editable. Non-NULL = frozen: share.amount_cents is written, and no weight, basis or percentage may change again. Set by ONE conditional UPDATE ... WHERE finalized_at IS NULL, so a double-click cannot finalize twice.';

COMMENT ON COLUMN commission_plan.developer_bps IS
  'Basis points, not a percent and never a float. 6000 = 60%. Snapshotted per plan: the code must read THIS column, never a constant, or a future renegotiation retroactively repays last year.';

COMMENT ON COLUMN commission_plan.referral_bps IS
  'Basis points OF THE STAFF POOL, not of the basis. 2800 = 28% of the 25% staff share = 7% of the project. The four staff role columns CHECK-sum to 10000.';

CREATE INDEX IF NOT EXISTS idx_commission_plan_project ON commission_plan (project_id);
CREATE INDEX IF NOT EXISTS idx_commission_plan_status ON commission_plan (status);
CREATE INDEX IF NOT EXISTS idx_commission_plan_finalized ON commission_plan (finalized_at DESC);

-- At most ONE live plan per project. A project cannot have two competing answers to
-- "who gets paid what" open at the same time. Voided plans are exempt so a bad draft can
-- be voided and redrafted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_plan_live
  ON commission_plan (project_id) WHERE status <> 'void';

-- ─── The ledger: one row per person per role, plus the company reserve ───

CREATE TABLE IF NOT EXISTS commission_share (
  commission_share_id    bigserial PRIMARY KEY,
  commission_plan_id     integer NOT NULL
    REFERENCES commission_plan (commission_plan_id) ON DELETE CASCADE,

  -- NULL for exactly one row: the company reserve. See chk_commission_share_member.
  -- ON DELETE RESTRICT, not CASCADE: removing a team member must not silently erase what
  -- they were agreed to be owed. Deactivate the member instead (team_member.is_active).
  team_member_id         integer REFERENCES team_member (team_member_id) ON DELETE RESTRICT,

  -- main_developer | assistant_developer | referral | marketing | accounting |
  -- management | company. varchar, app-validated, deliberately growable: the role list is
  -- the part of this structure most likely to change (design, sales, QA...), and growing
  -- it must not need a migration.
  role                   varchar(30) NOT NULL,

  -- Contribution weight WITHIN this role's pool. Relative, not absolute: two devs at
  -- 60/40 and at 6000/4000 allocate identically. Absolute percentages here would be a
  -- second place for rounding to happen, and rounding happens in exactly one place.
  contribution_bps       integer NOT NULL DEFAULT 0,

  -- "mutually agreed on by the devs upon project completion" — enforced, not assumed.
  -- Finalize refuses while any person-held share is still false.
  is_agreed              boolean NOT NULL DEFAULT false,
  agreed_at              timestamptz,

  -- NULL while the plan is draft (the amount is derived on every read). Written once, at
  -- finalize, and immutable after. See the file header, decision 4.
  amount_cents           integer,

  note                   text,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_commission_share_weight CHECK (contribution_bps >= 0),
  CONSTRAINT chk_commission_share_amount CHECK (amount_cents IS NULL OR amount_cents >= 0),

  -- The company reserve is the ONLY memberless share, and a person can never hold it.
  -- This is what keeps SUM(amount_cents) = basis_cents provable rather than hopeful.
  CONSTRAINT chk_commission_share_member CHECK (
    (role = 'company' AND team_member_id IS NULL)
    OR (role <> 'company' AND team_member_id IS NOT NULL)
  ),

  CONSTRAINT chk_commission_share_agreed CHECK (
    (is_agreed = false AND agreed_at IS NULL) OR (is_agreed = true AND agreed_at IS NOT NULL)
  )
);

COMMENT ON TABLE commission_share IS
  'Ledger of who is owed what out of one commission_plan (migration 018). One row per person per role, plus exactly one memberless company-reserve row so the ledger sums to the basis with no residue. amount_cents is NULL while draft (derived) and frozen at finalize.';

COMMENT ON COLUMN commission_share.contribution_bps IS
  'Relative weight WITHIN this role''s pool, not a share of the project. Two developers at 6000/4000 and at 60/40 allocate identically — only the ratio is read. Rounding happens in exactly one place (the largest-remainder allocator), never here.';

COMMENT ON COLUMN commission_share.amount_cents IS
  'Integer CENTS. NULL while the plan is draft — the amount is derived on every read from basis + weights, so editing a contribution can never leave a stale peso figure behind. Written once at finalize and immutable after.';

COMMENT ON COLUMN commission_share.is_agreed IS
  'Prince: the contribution split "must be mutually agreed on by the devs upon project completion". This column is that agreement. Finalize refuses while any person-held share is false, so an unagreed split can never become payable.';

COMMENT ON COLUMN commission_share.team_member_id IS
  'NULL only for the company-reserve row. ON DELETE RESTRICT, unlike the house CASCADE default, because deleting a team member must not erase a compensation record they agreed to. Deactivate via team_member.is_active instead.';

-- One person cannot hold the same role twice on one plan. They CAN hold two roles (the
-- referrer who also built it), which is deliberate — that is how ADVO actually works.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_share_role_member
  ON commission_share (commission_plan_id, role, team_member_id)
  WHERE team_member_id IS NOT NULL;

-- Prince: "per project is 1 main developer, and 1 assistant dev". The cardinality is
-- enforced by the DB, not by application care.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_share_main_dev
  ON commission_share (commission_plan_id) WHERE role = 'main_developer';

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_share_assistant_dev
  ON commission_share (commission_plan_id) WHERE role = 'assistant_developer';

-- Exactly one company reserve row per plan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_share_company
  ON commission_share (commission_plan_id) WHERE role = 'company';

CREATE INDEX IF NOT EXISTS idx_commission_share_plan ON commission_share (commission_plan_id);
CREATE INDEX IF NOT EXISTS idx_commission_share_member ON commission_share (team_member_id);

COMMIT;
