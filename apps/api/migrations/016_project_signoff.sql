-- Migration 016: Project Sign-off — the CLIENT-FACING final-delivery document.
--
-- The FourlinQ MOA (2026-08-11) makes "Project Sign-off" load-bearing and names it
-- five times: final payment is due on signing (7 days to comply), all complementary
-- revisions must be used BEFORE it is signed, unused rounds stay invocable for
-- 6 MONTHS AFTER signing, and it marks final delivery of the commissioned system.
--
-- NOT deliverable.verified_at. That column is INTERNAL team QA (migration 007) and
-- stays team-only. Conflating the two would show a client an internal QA flag as if
-- it were their signature. deliverable_snapshot deliberately COPIES verified_at into
-- frozen jsonb rather than referencing it, so no read path can wire the two together.
--
-- Two tables:
--   project_signoff  — the document, its money, its clocks, its signature evidence
--   signoff_revision — one row per complementary revision round consumed against it.
--                      A LEDGER, not a counter: used/remaining are COUNTED from here,
--                      never stored, so the tally cannot drift from the paper trail.
--                      Only the ALLOWANCE (free_revision_total_count) is stored.
--
-- status is app-validated varchar (change_order / contract precedent), not a DB enum,
-- so the set can grow without a migration.
--
-- Retention: a signed row is a legal artifact. Never hard-delete one.

BEGIN;

CREATE TABLE IF NOT EXISTS project_signoff (
  project_signoff_id          bigserial PRIMARY KEY,
  project_id                  integer NOT NULL REFERENCES project (project_id) ON DELETE CASCADE,
  contract_id                 integer REFERENCES contract (contract_id) ON DELETE SET NULL,
  invoice_id                  integer REFERENCES invoice (invoice_id) ON DELETE SET NULL,
  title                       varchar(255) NOT NULL,
  scope_summary               text NOT NULL,
  status                      varchar(50) NOT NULL DEFAULT 'draft',
  final_payment_cents         integer NOT NULL DEFAULT 0,
  payment_due_day_count       integer NOT NULL DEFAULT 7,
  revision_window_month_count integer NOT NULL DEFAULT 6,
  free_revision_total_count   integer NOT NULL DEFAULT 5,
  deliverable_snapshot        jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_url                varchar(500),
  issued_at                   timestamptz,
  signed_at                   timestamptz,
  signed_by                   integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  signed_name                 varchar(255),
  signed_method               varchar(20) NOT NULL DEFAULT 'client',
  signed_ip                   varchar(45),
  signed_user_agent           text,
  note                        text,
  created_by                  integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT NOW(),
  updated_at                  timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_signoff_payment    CHECK (final_payment_cents >= 0),
  CONSTRAINT chk_project_signoff_allowance  CHECK (free_revision_total_count >= 0),
  CONSTRAINT chk_project_signoff_clock      CHECK (payment_due_day_count > 0 AND revision_window_month_count > 0),
  -- status and the stamp can never disagree.
  CONSTRAINT chk_project_signoff_status     CHECK ((status = 'signed') = (signed_at IS NOT NULL)),
  -- nothing is signed that was never issued.
  CONSTRAINT chk_project_signoff_issued     CHECK (signed_at IS NULL OR issued_at IS NOT NULL)
);

COMMENT ON TABLE project_signoff IS
  'Client-facing final-delivery sign-off (migration 016). NOT deliverable.verified_at, which is internal team QA. Signing starts the payment clock and opens the 6-month unused-revision window. Retention: legal artifact — never hard-delete a signed row.';

COMMENT ON COLUMN project_signoff.signed_at IS
  'THE stamp. NULL = unsigned. Every clock in this model (payment due, revision window) is derived from it at read time, never stored.';

COMMENT ON COLUMN project_signoff.free_revision_total_count IS
  'The ALLOWANCE only (contract: 5 rounds per deliverable). used/remaining are counted from signoff_revision, never stored here.';

COMMENT ON COLUMN project_signoff.deliverable_snapshot IS
  'Frozen [{deliverableId,title,status,verifiedAt}] captured at ISSUE time so a later deliverable edit cannot retroactively change what was signed for. Team evidence only — verifiedAt is internal QA and is never rendered as the client sign-off.';

COMMENT ON COLUMN project_signoff.final_payment_cents IS
  'Integer CENTS. FourlinQ Tier 1 final = 2250000 (₱22,500), Tier 2 = 3500000 (₱35,000). Never float, never string.';

COMMENT ON COLUMN project_signoff.signed_method IS
  'App-validated: client | deemed | offline. "deemed" records the contract non-response clause; it is entered by a human admin — nothing auto-fires.';

CREATE INDEX IF NOT EXISTS idx_project_signoff_project   ON project_signoff (project_id);
CREATE INDEX IF NOT EXISTS idx_project_signoff_contract  ON project_signoff (contract_id);
CREATE INDEX IF NOT EXISTS idx_project_signoff_invoice   ON project_signoff (invoice_id);
CREATE INDEX IF NOT EXISTS idx_project_signoff_status    ON project_signoff (status);
CREATE INDEX IF NOT EXISTS idx_project_signoff_signed_at ON project_signoff (signed_at DESC);

-- At most ONE sign-off awaiting signature per project: the client is never shown two
-- competing documents to sign.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_signoff_open
  ON project_signoff (project_id) WHERE status = 'issued';

-- The same commissioned system cannot be issued twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_signoff_title
  ON project_signoff (project_id, lower(title)) WHERE status <> 'void';

CREATE TABLE IF NOT EXISTS signoff_revision (
  signoff_revision_id  bigserial PRIMARY KEY,
  project_signoff_id   integer NOT NULL REFERENCES project_signoff (project_signoff_id) ON DELETE CASCADE,
  deliverable_id       integer REFERENCES deliverable (deliverable_id) ON DELETE SET NULL,
  round_number         integer NOT NULL,
  note                 text NOT NULL,
  is_post_signoff      boolean NOT NULL DEFAULT false,
  requested_by         integer REFERENCES "user" (user_id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_signoff_revision_round CHECK (round_number > 0)
);

COMMENT ON TABLE signoff_revision IS
  'Ledger of complementary revision rounds consumed against a sign-off. used/remaining are COUNTED from here, never stored as a column, so the tally cannot drift from the paper trail.';

COMMENT ON COLUMN signoff_revision.is_post_signoff IS
  'True when the round was invoked inside the 6-month post-signature window. This is the column that proves the contract clause was honoured.';

-- The double-spend guard: one round number is consumed at most once, enforced by the DB
-- rather than by application care.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signoff_revision_round
  ON signoff_revision (project_signoff_id, round_number);

CREATE INDEX IF NOT EXISTS idx_signoff_revision_signoff     ON signoff_revision (project_signoff_id);
CREATE INDEX IF NOT EXISTS idx_signoff_revision_deliverable ON signoff_revision (deliverable_id);

COMMIT;
