# Phase 7 — Money Inside the Project (Finance Tab)
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 6 complete (contract files exist to derive Total Value from Signed/Final)
**Blocks:** Phase 9 (shared finance components built here are reused on main Finance page)

---

## Goal

Replace the current Finance tab in `ProjectCommandCenter.tsx` (lines 951–986) with a full-featured money view. Two columns of invoice lists, four stat cards at the top, commission panel bottom-left, expenses panel bottom-right. All file uploads go through the existing upload endpoint. PDF totals are read automatically.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/api/migrations/031_invoice_file.sql` | new | `invoice_file` table |
| `apps/api/src/db/schema.ts` | after invoice block | Add `invoiceFile` table definition |
| `apps/api/src/routes/invoices.routes.ts` | new endpoints | Invoice file CRUD |
| `apps/api/package.json` | dependencies | Add `pdf-parse` (if not already added in Phase 5) |
| `apps/web/src/components/admin/shared/finance/FinanceStatCards.tsx` | new | 4-stat header row |
| `apps/web/src/components/admin/shared/finance/ProjectInvoicesPanel.tsx` | new | Left column: project invoice file list |
| `apps/web/src/components/admin/shared/finance/RecurringInvoicesPanel.tsx` | new | Right column: recurring invoice list |
| `apps/web/src/components/admin/shared/finance/CommissionPanel.tsx` | new | Bottom-left placeholder (wired in Phase 8) |
| `apps/web/src/components/admin/shared/finance/ExpensesPanel.tsx` | new | Bottom-right placeholder (wired in Phase 8) |
| `apps/web/src/components/admin/shared/FileViewerDialog.tsx` | existing (Phase 5) | Reuse as-is |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 951–986 (Finance tab) | Replace with new layout |

---

## Blast Radius

- The Finance tab in `ProjectCommandCenter.tsx` is replaced. The tab `value` string stays unchanged.
- The existing invoice rows in `AdminFinance.tsx` are NOT changed in this phase (Phase 9 handles that).
- The existing `invoice` table (schema.ts 320–353) is NOT changed. The new `invoice_file` table stores uploaded invoice PDFs alongside it (or as a replacement — see decision below).
- The existing `recurring_fee` table and `/api/recurring-fee` routes are reused as-is where possible.
- `pdf-parse` may already be installed from Phase 5. If so, skip re-adding it.

**Decision: invoice_file vs invoice table.** The existing `invoice` table tracks invoice metadata (status, amounts, client). The new flow is upload-first: the user uploads a PDF and we read the total from it. Rather than merging these two models, introduce `invoice_file` as a dedicated table for the uploaded PDF artifacts. The `invoice_file` table stores the file, the extracted total, and the phase/paid status. The old `invoice` table is left in place for backward compatibility. New UI uses `invoice_file` exclusively.

---

## New Database Objects

### Migration 031 — `invoice_file`

```
Table: invoice_file
  invoice_file_id   bigserial PRIMARY KEY
  project_id        integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE
  file_url          text NOT NULL
  file_name         text NOT NULL
    -- renamed on upload to standard format: "Invoice NNN - Mon YYYY" e.g. "Invoice 001 - Aug 2027"
  file_number       integer NOT NULL
    -- sequential per project, starting at 0 (000, 001, ...)
  billing_month     varchar(20)
    -- "Aug 2027" style, extracted from upload date or user input
  total_cents       integer
    -- extracted from PDF via pdf-parse; NULL if extraction fails
  phase_status      varchar(30) NOT NULL DEFAULT 'downpayment'
    -- downpayment | full
  paid_status       varchar(20) NOT NULL DEFAULT 'unpaid'
    -- unpaid | paid | overdue
  created_by        integer REFERENCES "user"(user_id) ON DELETE SET NULL
  created_at        timestamptz NOT NULL DEFAULT NOW()
  updated_at        timestamptz NOT NULL DEFAULT NOW()

  CONSTRAINT chk_invoice_file_phase CHECK (phase_status IN ('downpayment', 'full'))
  CONSTRAINT chk_invoice_file_paid CHECK (paid_status IN ('unpaid', 'paid', 'overdue'))
  CONSTRAINT chk_invoice_file_number CHECK (file_number >= 0)
```

Index on `(project_id, file_number)` unique.

---

## Step-by-Step Changes

### Step 1 — Write and apply migration 031
Write `apps/api/migrations/031_invoice_file.sql`.
Apply to dev database.

### Step 2 — Update schema.ts
Add `invoiceFile` table definition.

### Step 3 — Invoice file API endpoints in invoices.routes.ts

`GET /api/invoices/files?projectId=:id` (requireAdmin)
- Returns array ordered by file_number ASC.
- Response: `{ data: [{ invoiceFileId, fileUrl, fileName, fileNumber, billingMonth, totalCents, phaseStatus, paidStatus, createdAt }] }`

`POST /api/invoices/files/upload` (requireAdmin)
- Accepts multipart: `projectId`, `file` (PDF only).
- Validates MIME: `application/pdf` only.
- Uploads the file via existing file upload helper.
- Runs `pdf-parse` on the file buffer to extract total. The extraction looks for the largest currency-formatted number in the document (e.g. "₱ 25,000.00" or "PHP 25000"). Store as integer cents. If extraction fails: store `total_cents = NULL`.
- Determines `file_number`: SELECT MAX(file_number) + 1 FROM invoice_file WHERE project_id = :id. If no rows: 0.
- Constructs `file_name`: `Invoice NNN - Mon YYYY` where NNN is zero-padded to 3 digits and Mon YYYY is derived from the upload date (e.g. "Invoice 001 - Sep 2026").
- Creates the `invoice_file` row.
- Returns the created row.

`PATCH /api/invoices/files/:id` (requireAdmin)
- Body: one or more of `{ phaseStatus, paidStatus, fileName }`.
- Updates the specified columns.
- Returns updated row.

`DELETE /api/invoices/files/:id` (requireAdmin)
- Deletes the `invoice_file` row.
- Returns 204.

### Step 4 — FinanceStatCards component

Create `apps/web/src/components/admin/shared/finance/FinanceStatCards.tsx`.

Props:
```
projectId: number
contractFiles: ContractFile[]   -- from Phase 5; used to derive Total Value
invoiceFiles: InvoiceFile[]     -- from step 3
recurringFees: RecurringFee[]   -- from /api/recurring-fee?projectId=:id
```

Four cards, left to right:

**Total Value**: read `totalValueCents` from `project.totalValueCents`. Override with the `total_cents` from the Signed contract file if available (fall back to Final if no Signed file). Display as peso amount.

**Collected**: total collected from paid invoice files + total collected from paid recurring invoices.
- Two sub-lines below the main figure:
  - "From invoices: ₱ ..." — sum of `total_cents` WHERE `paid_status = 'paid'` in invoice_files.
  - "From recurring: ₱ ..." — sum of paid recurring fee amounts.

**Outstanding**: Total Value minus Collected.

**Recurring Fees**: Shows one of:
- "Billing Not Started" — when no recurring fee exists for this project.
- "Next Billing on [date]" — when a recurring fee is active and the next billing date is in the future.
- "Overdue Billing on [date]" — when the next billing date is in the past and the latest period is unpaid.

### Step 5 — ProjectInvoicesPanel component

Create `apps/web/src/components/admin/shared/finance/ProjectInvoicesPanel.tsx`.

Props: `projectId: number`.

Header: "Project Invoices" heading + "Upload Invoice" button.

On upload: file picker (PDF only). On select: calls `POST /api/invoices/files/upload`. Refreshes list.

List rows (each row, left to right):
- File name (e.g. "Invoice 001 - Sep 2026").
- Amount (formatted as peso, from `totalCents`; shows "—" if null).
- Phase status button: toggles between "Downpayment" and "Full". On click: `PATCH /api/invoices/files/:id` with `{ phaseStatus }`.
- Paid status button: cycles Unpaid → Paid → Overdue → Unpaid. On click: `PATCH /api/invoices/files/:id` with `{ paidStatus }`.
- "View file" button: opens `<FileViewerDialog>`.
- Delete icon: shows `<ConfirmDeleteDialog>` on click.

Empty state: "No invoices uploaded yet." with the upload button.

### Step 6 — RecurringInvoicesPanel component

Create `apps/web/src/components/admin/shared/finance/RecurringInvoicesPanel.tsx`.

Props: `projectId: number`.

States:

**State A — No recurring fee configured:**
One button "Start Billing Date". Clicking opens a popup:
- Calendar date picker (today selected by default). Use a date picker already in the project's dependency set; if none, use `<input type="date">` as a fallback.
- Frequency dropdown: Monthly | Yearly.
- Amount field: peso sign `₱` outside the input, to the left. No units inside the field. Integer only.
- "Confirm" button.
On Confirm: POST to `/api/recurring-fee` (existing endpoint) with `{ projectId, startDate, frequency, amountCents }`.

**State B — Recurring fee configured:**
- Status button: Active | Paused | Cancelled. On click: PATCH the recurring fee status.
- Upload button: appears next to the status button. File picker (PDF only). On upload: store as a file record linked to the recurring fee (use `invoice_file` table with a `recurring_fee_id` FK — add this FK to migration 031 as an optional column: `recurring_fee_id integer REFERENCES recurring_fee(recurring_fee_id) ON DELETE SET NULL`).
- List of uploaded recurring invoice files below. Each row: file name, amount, "View file" button, delete icon.
- Uploading a paid recurring invoice triggers an update to the Recurring Fees stat card (done by re-fetching the stat card data).

### Step 7 — CommissionPanel and ExpensesPanel placeholders

Create `apps/web/src/components/admin/shared/finance/CommissionPanel.tsx` and `ExpensesPanel.tsx` as placeholder components that render "Commission" and "Expenses" headings with empty states. These will be fully implemented in Phase 8. They accept a `projectId` prop.

### Step 8 — Replace Finance tab in ProjectCommandCenter.tsx

In lines 951–986 (Finance tab), replace with:

```
Layout:
  <FinanceStatCards projectId=... contractFiles=... invoiceFiles=... recurringFees=... />

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
    <ProjectInvoicesPanel projectId=... />
    <RecurringInvoicesPanel projectId=... />
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
    <CommissionPanel projectId=... />
    <ExpensesPanel projectId=... />
  </div>
```

Remove the text "No invoices for this project yet. Create them in the Finance section." (line 961).

---

## Public Contracts

New endpoints:
- `GET /api/invoices/files?projectId=:id` → `{ data: [...] }`
- `POST /api/invoices/files/upload` → `{ data: { invoiceFileId, ... } }`
- `PATCH /api/invoices/files/:id` → `{ data: { invoiceFileId, ... } }`
- `DELETE /api/invoices/files/:id` → 204

Existing endpoints used (unchanged):
- `GET /api/recurring-fee?projectId=:id`
- `POST /api/recurring-fee`
- `PATCH /api/recurring-fee/:id`

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Apply migration 031.
3. Open a project Finance tab. Confirm two-column layout with stat cards at the top.
4. Upload a PDF invoice. Confirm the file appears in the list, the file name follows "Invoice 001 - Sep 2026" format, and the extracted amount shows (or "—" if extraction fails gracefully without an error).
5. Toggle phase status between "Downpayment" and "Full". Confirm it persists on refresh.
6. Toggle paid status. Confirm the "Collected" stat card updates.
7. Click "View file". Confirm FileViewerDialog opens.
8. Delete an invoice file. Confirm ConfirmDeleteDialog appears and the row disappears on confirm.
9. Click "Start Billing Date". Fill in date, frequency, amount. Confirm. Confirm the Recurring Fees card updates from "Billing Not Started" to "Next Billing on [date]".
10. Upload a recurring invoice PDF. Confirm it appears in the recurring list.
11. Confirm "Collected" card shows separate sub-lines for invoice total and recurring total.
12. Commission and Expenses panels show placeholder content (to be filled in Phase 8).

---

## Rollback

- Revert `ProjectCommandCenter.tsx` (Finance tab).
- Delete the five new shared finance components.
- Drop table: `DROP TABLE invoice_file;`
- Remove `pdf-parse` from API if it was added here (skip if Phase 5 added it).

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-07_finance-tab_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-08_commission-expenses_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
