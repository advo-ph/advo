-- Migration 010: proposal tracker + template-fill document
--
-- First-class proposal rows so outreach can be tracked past lead.status.
-- Status is a named enum (sent / opened / replied / signed) — a closed set.
-- body_html is a template-filled document (CONTRACTS.md clauses + lead fields).
-- AI generation is deferred; this migration only stores the filled template.

BEGIN;

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('sent', 'opened', 'replied', 'signed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS proposal (
  proposal_id    bigserial PRIMARY KEY,
  lead_id        integer      NOT NULL REFERENCES lead(lead_id) ON DELETE CASCADE,
  title          varchar(255) NOT NULL,
  body_html      text         NOT NULL,
  status         proposal_status NOT NULL DEFAULT 'sent',
  value_cents    integer      NOT NULL DEFAULT 0,
  clause         jsonb,
  sent_at        timestamptz,
  opened_at      timestamptz,
  replied_at     timestamptz,
  signed_at      timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT NOW(),
  updated_at     timestamptz  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE proposal IS
  'Outreach proposal per lead. status is sent/opened/replied/signed. body_html is a template-fill of CONTRACTS.md clauses + lead fields (AI generation deferred). clause jsonb is a snapshot of the drop-in clauses used at generate time. Retention: keep while the lead exists (ON DELETE CASCADE).';

CREATE INDEX IF NOT EXISTS idx_proposal_lead    ON proposal(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposal_status  ON proposal(status);
CREATE INDEX IF NOT EXISTS idx_proposal_created ON proposal(created_at DESC);

COMMIT;
