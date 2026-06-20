-- Migration 004: contracts / MOAs table
--
-- Phase 2 of the ADVO records calendar: a first-class home for contracts,
-- MOAs, SOWs, NDAs and retainers (today they're just a `contract_url` string
-- on `project`). Signed/expiry dates derive into GET /api/calendar at read
-- time (like invoices), so renewals and executions show up on the calendar.
-- `contract_type` and `status` are varchar (validated app-side) rather than
-- enums because both sets are expected to grow. Low volume; additive; instant.

BEGIN;

CREATE TABLE IF NOT EXISTS contract (
  contract_id    bigserial PRIMARY KEY,
  client_id      integer NOT NULL REFERENCES client(client_id) ON DELETE CASCADE,
  project_id     integer REFERENCES project(project_id) ON DELETE SET NULL,
  title          varchar(255) NOT NULL,
  contract_type  varchar(50)  NOT NULL DEFAULT 'contract',
  status         varchar(50)  NOT NULL DEFAULT 'draft',
  value_cents    integer      NOT NULL DEFAULT 0,
  signed_at      timestamptz,
  expires_at     timestamptz,
  document_url   varchar(500),
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT NOW(),
  updated_at     timestamptz  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contract IS
  'Contracts / MOAs / SOWs / NDAs / retainers per client (optionally tied to a project). `contract_type` and `status` are varchar (validated app-side) because both sets are expected to grow. `value_cents` is an integer-cents amount, matching project.total_value_cents. signed_at / expires_at derive into GET /api/calendar at read time (contract_signed / contract_expires events) — not stored in calendar_event.';

CREATE INDEX IF NOT EXISTS idx_contract_client   ON contract(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_project  ON contract(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_expires  ON contract(expires_at);

COMMIT;
