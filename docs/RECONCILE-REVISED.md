# Reconciling the `revised` branch into `main`

Prince's `revised` branch (11 commits, ~30k lines) merged into `main` on the
`reconcile/revised` branch (based on `feat/landing-merge`, so the landing is
already the best-of-both). This records how it was done and what is left.

## How clean it was
- **214 files auto-merged, 15 conflicts.**
- **`schema.ts` auto-merged** — the new tables each side added are disjoint
  (main: corpus/payment/message/timeEntry/…; revised: task*/meeting*/job/…).
- **Migrations were the only structural clash.** Both branches used 022–028.
  Revised's 022–037 were renumbered to **029–044**, after main's 022–028. The
  only shared table either set alters is `commission_plan` (main adds a CHECK,
  revised sets 55/35/10 defaults — which satisfy the CHECK).

## Verified
- API `tsc` clean, web `tsc` clean.
- All **44 migrations apply** to a fresh database; `migration-drift` clean
  (drift tool taught to ignore CHECKs on a table a later migration drops —
  042 drops `task`).
- The merged **API boots**; both route sets respond (main's `/api/corpus`,
  revised's `/api/jobs` and `/api/finance`).
- Web tests: commission, bookkeeping, and client-thread aligned to the
  reconciled behavior.

## Decisions worth knowing
- **Landing:** kept the `feat/landing-merge` version; revised's landing is
  superseded by that reconciliation.
- **AdminFinance + ProjectCommandCenter:** took revised's admin rework whole.
- **Commission staff split:** took revised's Lead Partnerships 20 / Management
  50 / Marketing 20 / Accounting 10. **Confirm against the signed agreement.**
- **Expense receipts:** revised's migration 039 removed receipt_url and the
  reimbursable flag; the bookkeeping sheet dropped those two columns to match.
- **Deliverable status:** revised unified task→deliverable; the done state is
  now `finished` (was `completed`).

## Follow-ups (not done, flagged)
1. **Re-wire main's PayMongo `InvoicePaymentLink` into revised's finance panels.**
   Taking revised's AdminFinance dropped the payment-link UI from the invoice
   row. The component and the `/api/payment` API are intact; they need placing
   into `ProjectInvoicesPanel`. The `admin-message-time` test marks this red.
2. **Re-add main's `ProjectThread` (client thread) to revised's Project Command
   Center.** Same shape: component + `/api/project-message` intact, needs a mount.
3. **`e2e-flow` team-member login** is a live-API test; confirm it against the
   merged server with a seeded team member (revised reworked sessions).
4. **Confirm the commission staff sub-weights** with Prince before any payout.
