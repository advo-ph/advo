# Phase 9 — Main Finance Page
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 8 complete (all shared finance components fully implemented)
**Blocks:** Phase 10 only (plain-language pass)

---

## Goal

Replace the invoices area of `AdminFinance.tsx` with the same components built in Phase 7 and Phase 8, now showing all projects grouped together. The Finance page keeps its cross-project view. Commission and Expenses appear per project, not as a single global list.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/web/src/components/admin/AdminFinance.tsx` | invoices container 585–738 | Replace with grouped project panels |
| `apps/web/src/components/admin/AdminFinance.tsx` | create invoice form 72–131 | Remove (upload replaces creation form) |
| `apps/web/src/components/admin/AdminFinance.tsx` | expense form 135–251 | Remove (handled in per-project panel) |
| `apps/web/src/components/admin/AdminFinance.tsx` | recurring section 740–798 | Fold into per-project recurring panel |
| `apps/web/src/components/admin/AdminFinance.tsx` | expenses 806–886 | Remove cross-project expense table (per-project panels replace it) |
| `apps/web/src/components/admin/shared/finance/ProjectFinanceGroup.tsx` | new | Per-project accordion/section wrapper |

---

## Blast Radius

- `AdminFinance.tsx` is significantly restructured. The old `CreateInvoiceForm`, `CreateExpenseForm`, and `CreateRecurringFeeForm` components (lines 72–374) are removed from the page. Their underlying API endpoints still exist (backward compatible).
- The global expenses table (lines 806–886) is removed. Expenses are now per-project inside `ExpensesPanel`.
- No API changes needed. All shared components use the same endpoints built in Phases 7 and 8.
- No new migrations.

---

## Cross-Project Grouping Design

**How project grouping works on the main Finance page:**

The Finance page shows ALL projects, each in its own section/group. Each group is an expandable accordion (collapsed by default, except the most recently active project which starts open).

Each group contains the same four panels as the project Finance tab:
- `ProjectInvoicesPanel projectId={p.projectId}`
- `RecurringInvoicesPanel projectId={p.projectId}`
- `CommissionPanel projectId={p.projectId}`
- `ExpensesPanel projectId={p.projectId}`

Above the project groups: a global summary showing totals across all projects (total value of all projects, total collected, total outstanding). This is a read-only aggregate row using the `FinanceStatCards` component with `projectId={null}` — a new prop variant that fetches totals across all projects from a new summary endpoint.

The project list is fetched from `GET /api/projects` (already exists). Projects with no financial activity (no invoice files, no recurring fees, no commission plan, no expenses) still appear in the list but their accordion starts collapsed and shows "No financial data yet."

---

## Step-by-Step Changes

### Step 1 — Create ProjectFinanceGroup component
Create `apps/web/src/components/admin/shared/finance/ProjectFinanceGroup.tsx`.

Props: `project: { projectId, name, clientName }`.

Renders an expandable section:
- Header: project name (left), client name (small grey text, right), a chevron toggle.
- Body (when expanded): the four panels in the same two-column grid as the project Finance tab.

### Step 2 — New aggregate endpoint for global stat cards

Add `GET /api/finance/summary` (requireAdmin):
Returns:
```
{
  totalValueCents: number,    -- sum of project.totalValueCents across all projects
  collectedCents: number,     -- sum of paid invoice_file.totalCents + paid recurring fees
  outstandingCents: number    -- totalValueCents - collectedCents
}
```
This is a simple aggregate query across `invoice_file` and `recurring_fee` tables.

### Step 3 — Global stat cards variant in FinanceStatCards

Add an optional `summary` prop to `FinanceStatCards`:
```
summary?: { totalValueCents, collectedCents, outstandingCents }
```
When `summary` is provided (and `projectId` is not), render the global three-card view (Total Value, Collected, Outstanding) — no Recurring Fees card (that is project-specific).

### Step 4 — Rewrite AdminFinance.tsx

Replace the content of `AdminFinance.tsx` with:

```
<PageHeader title="Finance" />

<FinanceStatCards summary={summaryData} />

<div className="mt-6 space-y-4">
  {projects.map(p => (
    <ProjectFinanceGroup key={p.projectId} project={p} />
  ))}
</div>
```

Fetch `projects` from `GET /api/projects`.
Fetch `summaryData` from `GET /api/finance/summary`.

Remove from `AdminFinance.tsx`:
- `CreateInvoiceForm` (lines 72–131) and its rendering.
- `CreateExpenseForm` (lines 135–251) and its rendering.
- `CreateRecurringFeeForm` (lines 253–374) and its rendering at the top of the page.
- `RecurringFeeRow` (lines 376–479) — the per-row component; this is now inside `RecurringInvoicesPanel`.
- The invoices container (lines 585–738).
- The recurring section (lines 740–798).
- The expenses section (lines 806–886), including the header columns (Category, Purpose, Authorized 821, Location 822, Project, Amount, Receipt 825).

Keep any utility functions or hooks in the file that are still needed by the new components (check before deleting).

---

## Public Contracts

New endpoint:
- `GET /api/finance/summary` → `{ data: { totalValueCents, collectedCents, outstandingCents } }`

Existing endpoints used (all from Phases 7 and 8, unchanged):
- `GET /api/projects`
- `GET /api/invoices/files?projectId=:id`
- `GET /api/recurring-fee?projectId=:id`
- `GET /api/commission/:planId`
- `GET /api/expense?projectId=:id`

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Open the main Finance page. Confirm global stat cards show aggregate totals.
3. Confirm projects are listed, each in an accordion section.
4. Expand one project. Confirm all four panels render and data is correct (same data as the project Finance tab in Phase 7).
5. Confirm "Create Invoice", "Create Expense", and "Create Recurring Fee" forms are gone from the top of the Finance page.
6. Confirm the cross-project expense table is gone.
7. Confirm a newly created project (with no data) appears in the list with "No financial data yet."
8. Confirm the accordion collapse/expand toggles work and the most recently active project starts open.
9. Compare the project Finance tab (Phase 7) with the Finance page accordion for the same project: data must be identical.

---

## Rollback

Revert `AdminFinance.tsx` to pre-Phase-9 state. Delete `ProjectFinanceGroup.tsx`. Remove the summary endpoint from the routes file. No database changes.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-09_main-finance_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-10_plain-language_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
