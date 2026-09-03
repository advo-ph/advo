# Phase 8 — Commission and Expenses Rework
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 7 complete (CommissionPanel and ExpensesPanel placeholders exist); Phase 2 complete (project_role_assignment is the source of truth for who appears here)
**Blocks:** Phase 9 (these panels are reused on the main Finance page)

---

## Goal

Update the commission percentage defaults (55/35/10, staff split reworked), update the UI to remove clutter, add Creatives Developer role, introduce tiered percentage dropdowns for assistant and creatives developers, wire the panels to Phase 2 assignment data, add an expense type system, and enforce visibility rules on the API so non-participants cannot see amounts.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/api/migrations/030_commission_defaults_and_roles.sql` | new | Default BPS changes; drop assistant_dev unique index |
| `apps/api/migrations/032_expense_remove_receipt_reimbursable.sql` | new | Add expense_type, expense_paid_status; remove receipt_url |
| `apps/api/migrations/033_project_tier_assignment.sql` | new | `project_tier_assignment` table |
| `apps/api/src/db/schema.ts` | commission_plan block | Update default BPS values |
| `apps/api/src/db/schema.ts` | expense block | Add expense_type, expense_paid_status; remove receiptUrl |
| `apps/api/src/services/commission.service.ts` | 79–87 (`DEFAULT_BPS`) | Update constants to match new defaults |
| `apps/api/src/services/commission.service.ts` | allocation logic | Preserve Hamilton apportionment; do not change the algorithm |
| `apps/api/src/routes/commission.routes.ts` | visibility guards | API-level role-based filtering |
| `apps/api/src/routes/expense.routes.ts` | new/updated endpoints | Add expense_type and expense_paid_status; remove receipt_url from write path |
| `apps/web/src/components/admin/shared/finance/CommissionPanel.tsx` | replace placeholder | Full commission UI |
| `apps/web/src/components/admin/shared/finance/ExpensesPanel.tsx` | replace placeholder | Full expenses UI |
| `apps/web/src/components/admin/AdminCommission.tsx` | full rework | Updated split UI matching new defaults |

---

## Blast Radius

- Migration 030: changes DEFAULT values on `commission_plan.*_bps` columns. Existing rows are NOT updated. Finalized plans are completely unaffected (their values are frozen). New plans get the new defaults.
- Migration 030: drops `idx_commission_share_assistant_dev` (the unique index enforcing one assistant developer per plan). This allows multiple assistant and creatives developers on one plan. The `idx_commission_share_main_dev` (one main developer) and `idx_commission_share_company` (one company row) are kept.
- Migration 032: removes `receipt_url` from the `expense` table. The derived `is_reimbursable` field (computed as `receipt_url IS NOT NULL`) becomes meaningless and is removed from the API response. Any existing code that reads `is_reimbursable` or `receipt_url` must be updated. Existing expense rows with `receipt_url` set will lose that data — this is acceptable per the decision to simplify.
- Migration 032: adds `expense_type` and `expense_paid_status` to `expense`. Existing rows get defaults: `expense_type = 'general_expenses'`, `expense_paid_status = 'unpaid'`.
- The "Creatives Developer" role is varchar in the database (no enum change) — just allowed in application code. Add it to the allowed list in the commission service validator.

---

## New Percentage Defaults

**Top level (replace commission_plan defaults):**
- developer_bps: 5500 (55%)
- staff_bps: 3500 (35%)
- company_bps: 1000 (10%)
- SUM = 10000. CHECK constraint satisfied.

**Staff split (rename roles, replace defaults):**
- "referral" becomes "lead_partnerships" in role name. Whether this is a rename or a new role: RENAME. The `commission_share.role` varchar is app-validated. The migration renames no existing rows (finalized plans keep "referral"). New plans and new UI use "lead_partnerships". The service validator adds "lead_partnerships" to the allowed list and keeps "referral" valid for reading historical rows.
- referral_bps column renamed to lead_partnerships_bps? NO — to avoid a column rename migration, keep the database column name `referral_bps` but display it as "Lead Partnerships" in the UI and use the `commission_share.role = 'lead_partnerships'` app string. The default values update:
  - referral_bps (Lead Partnerships): 2000 (20% of staff pool)
  - marketing_bps: 5000 (50%)
  - accounting_bps: 1000 (10%)
  - management_bps: 2000 (20%)
  - SUM = 10000. CHECK constraint satisfied.

**DEFAULT_BPS in commission.service.ts:79–87:**
```
developer: 5500
staff: 3500
company: 1000
referral (lead_partnerships): 2000
marketing: 5000
accounting: 1000
management: 2000
```

---

## New Database Objects

### Migration 030 — commission defaults and role indexes

```sql
BEGIN;
-- Drop the one-assistant-dev-per-plan constraint.
DROP INDEX IF EXISTS idx_commission_share_assistant_dev;

-- Update DEFAULT values on commission_plan (existing rows unaffected).
ALTER TABLE commission_plan
  ALTER COLUMN developer_bps SET DEFAULT 5500,
  ALTER COLUMN staff_bps SET DEFAULT 3500,
  ALTER COLUMN company_bps SET DEFAULT 1000,
  ALTER COLUMN referral_bps SET DEFAULT 2000,
  ALTER COLUMN marketing_bps SET DEFAULT 5000,
  ALTER COLUMN accounting_bps SET DEFAULT 1000,
  ALTER COLUMN management_bps SET DEFAULT 2000;
COMMIT;
```

Note: the CHECK constraints `developer_bps + staff_bps + company_bps = 10000` and `referral_bps + marketing_bps + accounting_bps + management_bps = 10000` still hold because 5500+3500+1000=10000 and 2000+5000+1000+2000=10000.

### Migration 032 — expense table changes

```sql
BEGIN;
ALTER TABLE expense
  DROP COLUMN IF EXISTS receipt_url,
  ADD COLUMN IF NOT EXISTS expense_type varchar(40) NOT NULL DEFAULT 'general_expenses',
  ADD COLUMN IF NOT EXISTS expense_paid_status varchar(20) NOT NULL DEFAULT 'unpaid';

ALTER TABLE expense
  ADD CONSTRAINT chk_expense_type CHECK (expense_type IN ('development_expenses', 'general_expenses')),
  ADD CONSTRAINT chk_expense_paid_status CHECK (expense_paid_status IN ('paid', 'unpaid'));
COMMIT;
```

### Migration 033 — project_tier_assignment

```
Table: project_tier_assignment
  tier_assignment_id       bigserial PRIMARY KEY
  commission_share_id      bigint NOT NULL REFERENCES commission_share(commission_share_id) ON DELETE CASCADE
  tier_label               varchar(200) NOT NULL
    -- exact one of three tier text strings (stored verbatim so it can be displayed later):
    -- "Tier 1 Contribution (5% Allocation): Routine and Assisted Execution. ..."
    -- "Tier 2 Contribution (10% Allocation): ..."
    -- "Tier 3 Contribution (15% Allocation): ..."
  allocation_bps           integer NOT NULL
    -- derived from tier: Tier 1 = 500, Tier 2 = 1000, Tier 3 = 1500
  created_at               timestamptz NOT NULL DEFAULT NOW()

UNIQUE on (commission_share_id)
  -- one tier pick per share row
```

---

## Step-by-Step Changes

### Step 1 — Apply migrations 030, 032, 033
Apply all three to dev database in order.

### Step 2 — Update schema.ts
Update `commission_plan` default BPS values.
Remove `receiptUrl` from `expense` definition; add `expenseType` and `expensePaidStatus`.
Add `projectTierAssignment` table definition.

### Step 3 — Update commission.service.ts DEFAULT_BPS and allowed roles
At lines 79–87: update the constants.
Add `'creatives_developer'` and `'lead_partnerships'` to the allowed role validation list.
Keep `'referral'` in the allowed list (for historical reads).

### Step 4 — Visibility guards on commission.routes.ts

For any endpoint that returns commission share amounts:
- If the caller is the owner (isOwner = true): return all rows with all fields.
- If the caller is admin (but not owner): return all rows with all fields.
- If the caller is a team member assigned to this project:
  - They can see: all member names and their roles (always).
  - They can see amounts ONLY for rows that share their own `role`. Example: a member with role `project_manager` sees amounts for all `project_manager` rows and no others.
  - They cannot see amounts for other roles.
- If the caller has no project assignment for this project: return only names and roles, no amounts, no agreed status.

Implementation: in the route handler, after fetching rows, apply a filter function that zeroes out `amount_cents`, `contribution_bps`, and `is_agreed` for rows the caller is not allowed to see.

Development Expenses total: visible only to users whose role is `main_developer`, `assistant_developer`, or `creatives_developer` on this project (or owner/admin).
General Expenses total: visible only to users whose role is NOT a developer role (or owner/admin).

### Step 5 — Full CommissionPanel implementation

Replace the placeholder in `apps/web/src/components/admin/shared/finance/CommissionPanel.tsx`.

**Split container layout:**
Three top-level containers (Developers, Staff, Company) in a row. Below each: a second row of sub-containers, same width as the parent.

Developers (55%):
  Sub-containers: "Main Developer (75–80%)", "Assistant Developer (5–10%)", "Creatives Developer (15%)".

Staff (35%):
  Sub-containers: "Lead Partnerships (20%)", "Management (50%)", "Marketing (20%)", "Accounting (10%)".

Company (10%):
  Sub-containers: "Company Revenue and Investment ROI", "Development Expenses", "General Expenses".

Below the full container row, add this line of text:
"Development Expenses are taken from the Total Developer Pool. General Expenses are taken from the Company Revenue."

**Share rows list:** Below the containers, a table of commission share rows.
Columns: Name | Role | Percentage | Agreed.
- Name: `team_member.name`.
- Role: the `project_role_assignment.project_role` label (plain English: "Main Developer", "Lead Partnerships", etc.).
- Percentage: for assistant_developer and creatives_developer roles, a DROPDOWN instead of an input. The dropdown shows exactly three options (verbatim tier labels from migration 033). The selected tier's `allocation_bps` sets the `contribution_bps` for that share row. For all other roles: a numeric input, no percent symbol inside the field, percent symbol `%` outside the field to the right. Min 0, max 100 (displayed as percent; stored as basis points of the pool — convert on save).
- Agreed: checkbox. Cannot be checked by the member themselves while the plan is draft.

**Add Member button:** below the list. Opens a popup: team member picker (filtered to members assigned to this project via Phase 2 data), role picker (dropdown of allowed roles), Confirm. On Confirm: POST to the commission share endpoint.

**Remove from plan:** a delete icon on each row. ConfirmDeleteDialog.

**Company Revenue row:** no team_member — renders "ADVO Revenue and Investment ROI" as the name, no percentage input (the company share is derived), no agreed checkbox.

**Strings to remove entirely:**
- Line 411–412 of `AdminCommission.tsx`: delete the "60% developer · 25% staff..." explanatory string.
- Lines 309–312: delete the "Staff pool — referral … · marketing …" strings.

**Strings to update:**
- "ADVO — expenses & investment ROI" → "ADVO Revenue and Investment ROI".
- "company reserve" (wherever it appears as a role label) → "Company Revenue".
- "Weight" column → "Percentage".
- "Basis ₱" input (224–259): remove entirely.
- "Allocated" container (277–305): remove the pool grid. Keep only the parts that remain meaningful after the container redesign above.

### Step 6 — Full ExpensesPanel implementation

Replace the placeholder in `apps/web/src/components/admin/shared/finance/ExpensesPanel.tsx`.

**Add Expense button** opens a popup:
- Member picker: shows all project members from Phase 2 assignments.
- Type: auto-filled based on the selected member's role. Developer roles (main_developer, assistant_developer, creatives_developer) → "Development Expenses". All other roles → "General Expenses". The type can be switched via a toggle/dropdown between "Development Expenses" and "General Expenses".
- Paid/Unpaid selector: two buttons, defaults to Unpaid.
- "What is this for?" text field (plain label, replaces "Purpose").
- Amount: peso sign `₱` outside the field, to the left.
- Confirm.

**List columns:** Category | Person | Purpose | Amount.
- Category: "Development" or "General" (short form of expense_type).
- Person: `team_member.name`.
- Purpose: the "What is this for?" text.
- Amount: formatted as peso.
- Delete icon on each row (ConfirmDeleteDialog).

**Removed columns:** Authorized, Location, Receipt, Project. These no longer appear in the expense list or form.

**is_reimbursable handling:** This was `receipt_url IS NOT NULL`. After removing `receipt_url` in migration 032, `is_reimbursable` no longer has meaning. Remove all references to `isReimbursable` and `receipt_url` from:
- The expense API route response serialization.
- Any UI that displayed a "Reimbursable" badge.
The `expense_paid_status` column (Paid / Unpaid) replaces the reimbursable distinction.

**Expense rows in Commission list:** When an expense exists, the commission panel shows additional rows below the regular shares:
- For Development Expenses: one row per distinct project with a developer expense. Name = "Development Expenses", Person = "Name — Purpose" (concatenated), Percentage = fixed per plan (derived), Agreed = blank. If no development expenses: this row does not appear.
- For General Expenses: same pattern but under the Company column.

### Step 7 — Sync AdminCommission.tsx
Apply all the above UI changes to `AdminCommission.tsx` as well (it is the standalone Commission admin page). The component is the same data, same UI; it just receives a `projectId` from the URL rather than from a tab parent.

---

## Public Contracts

Changed endpoints (updated response shape):
- `GET /api/commission/:planId` — apply visibility filter per Step 4.
- `GET /api/expense?projectId=:id` — remove `receiptUrl` and `isReimbursable` from response; add `expenseType`, `expensePaidStatus`.
- `POST /api/expense` — remove `receiptUrl` from accepted body; add `expenseType`, `expensePaidStatus`.
- `PATCH /api/expense/:id` — remove `receiptUrl`; add `expenseType`, `expensePaidStatus`.

New endpoint:
- `POST /api/commission/share/:shareId/tier` → `{ data: { tierAssignmentId, tierLabel, allocationBps } }`
- `PATCH /api/commission/share/:shareId/tier` → same shape.

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Apply migrations 030, 032, 033.
3. Create a new commission plan via the UI. Confirm the default BPS show 55/35/10 (not 60/25/15).
4. Confirm an existing finalized plan still shows its original BPS values (not the new defaults).
5. Add two assistant developers to a plan. Confirm no unique index error (migration 030 dropped that constraint).
6. Pick a tier from the assistant developer dropdown. Confirm the `project_tier_assignment` row is created.
7. Log in as a team member with `project_manager` role on a project. Confirm they see amounts only for project_manager rows, not developer rows.
8. Log in as a member with no project assignment. Confirm they see names and roles but no amounts.
9. Add an expense for a developer. Confirm it auto-selects "Development Expenses". Confirm it appears under the Developer column in the Commission panel.
10. Confirm no "Receipt", "Location", "Authorized" columns visible anywhere in the expense list or form.
11. Confirm the "Basis ₱" input is gone from AdminCommission.tsx.
12. Confirm the "Weight" column header now says "Percentage" with `%` outside the input.
13. Confirm the two removed explanation strings (lines 411–412 and 309–312) are gone.
14. Confirm "ADVO Revenue and Investment ROI" appears in the company row (not "ADVO — expenses & investment ROI").

---

## Rollback

- Revert `AdminCommission.tsx`, `CommissionPanel.tsx`, `ExpensesPanel.tsx`, `commission.service.ts`, `commission.routes.ts`, `expense.routes.ts`, `schema.ts`.
- Reverse migrations: restore `receipt_url` to `expense`, drop `project_tier_assignment`, restore commission_plan defaults, recreate `idx_commission_share_assistant_dev`.
  - Note: restoring `receipt_url` to a live database that already has rows with NULL receipt_url requires `ALTER TABLE expense ADD COLUMN receipt_url text;` — the existing data will have NULL which was its previous state for most rows.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-08_commission-expenses_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-09_main-finance_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
