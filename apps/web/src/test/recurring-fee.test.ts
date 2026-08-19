/**
 * Recurring infrastructure fee — the FourlinQ PHP 3,000.00/month hosting retainer.
 *
 * No live API call, no database. Every behavioural test drives the PURE exports of
 * recurring-fee.service.ts (the billing calendar, the period resolver, the suspension
 * derivation) with an injected `now`, so the assertions are stable on any machine in any
 * timezone. The rest is source-reading, in the style of campaign.test.ts.
 *
 * Covers the six invariants the service exists to hold:
 *   1. no parallel billing system — the charge IS an invoice row
 *   2. idempotent generation      — DB partial unique index + onConflictDoNothing
 *   3. bounded catch-up           — MAX_CATCHUP_PERIOD
 *   4. Manila calendar, not UTC   — Intl only, no new dependency
 *   5. one guarded sweep UPDATE   — a just-paid invoice is never dragged back to overdue
 *   6. suspension derived, and human-invoked — 409 when unjustified, nothing automated
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BILLING_TIMEZONE,
  MAX_CATCHUP_PERIOD,
  addDay,
  addPeriod,
  dayBetween,
  deriveSuspension,
  duePeriodOf,
  instantOf,
  todayOn,
  type RecurringFeeRow,
} from "../../../api/src/services/recurring-fee.service.js";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

/** The live FourlinQ terms, as the contract states them. */
const FOURLINQ_MONTHLY_CENTS = 300_000;
const FOURLINQ_GRACE_DAY = 15;

const makeFee = (over: Partial<RecurringFeeRow> = {}): RecurringFeeRow =>
  ({
    recurringFeeId: 1,
    projectId: 1,
    label: "Monthly Infrastructure Fee",
    amountCents: FOURLINQ_MONTHLY_CENTS,
    billingInterval: "monthly",
    billingDayOfMonth: 1,
    graceDayCount: FOURLINQ_GRACE_DAY,
    status: "active",
    startsOn: "2026-09-01",
    endsOn: null,
    nextRunOn: "2026-09-01",
    lastGeneratedOn: null,
    isSuspensionEnabled: true,
    suspendedAt: null,
    note: null,
    createdAt: new Date("2026-08-19T00:00:00Z"),
    updatedAt: new Date("2026-08-19T00:00:00Z"),
    ...over,
  }) as RecurringFeeRow;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeInvoice = (over: Record<string, unknown>): any => ({
  invoiceId: 1,
  projectId: 1,
  recurringFeeId: 1,
  periodStartOn: "2026-09-01",
  amountCents: FOURLINQ_MONTHLY_CENTS,
  label: "Monthly Infrastructure Fee",
  status: "unpaid",
  dueDate: new Date("2026-09-01T00:00:00+08:00"),
  paidAt: null,
  ...over,
});

describe("Recurring fee — the Manila billing calendar", () => {
  it("resolves 'today' in Asia/Manila, not UTC", () => {
    expect(BILLING_TIMEZONE).toBe("Asia/Manila");
    // 16:30 UTC on Nov 30 is already Dec 1 in Manila. A naive UTC tick would generate
    // the December invoice a day early and label it November.
    expect(todayOn(new Date("2026-11-30T16:30:00Z"))).toBe("2026-12-01");
    expect(todayOn(new Date("2026-11-30T15:30:00Z"))).toBe("2026-11-30");
  });

  it("anchors an invoice due date to Manila midnight", () => {
    expect(instantOf("2026-09-01").toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("rolls a monthly period across the year boundary", () => {
    expect(addPeriod("2026-12-01", "monthly", 1)).toBe("2027-01-01");
    expect(addPeriod("2026-11-01", "monthly", 1)).toBe("2026-12-01");
    expect(addPeriod("2026-11-01", "quarterly", 1)).toBe("2027-02-01");
    expect(addPeriod("2026-11-01", "annual", 1)).toBe("2027-11-01");
  });

  it("never skips a month, because the billing day is capped at 28", () => {
    // The whole point of the 1..28 CHECK: stepping through February must not lose it.
    let on = "2027-01-28";
    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      on = addPeriod(on, "monthly", 28);
      seen.push(on);
    }
    expect(seen).toEqual(["2027-02-28", "2027-03-28", "2027-04-28", "2027-05-28"]);
  });

  it("counts calendar days across a month boundary", () => {
    expect(dayBetween("2026-09-01", "2026-09-16")).toBe(15);
    expect(addDay("2026-09-01", 15)).toBe("2026-09-16");
    expect(dayBetween("2026-09-16", "2026-09-01")).toBe(-15);
  });
});

describe("Recurring fee — period resolution", () => {
  it("owes one period per elapsed month", () => {
    const fee = makeFee();
    expect(duePeriodOf(fee, "2026-12-15")).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
    ]);
  });

  it("owes nothing before the first billable period", () => {
    expect(duePeriodOf(makeFee(), "2026-08-31")).toEqual([]);
  });

  it("owes nothing while paused or cancelled", () => {
    expect(duePeriodOf(makeFee({ status: "paused" }), "2026-12-15")).toEqual([]);
    expect(duePeriodOf(makeFee({ status: "cancelled" }), "2026-12-15")).toEqual([]);
  });

  it("stops at ends_on when the client transfers hosting away", () => {
    const fee = makeFee({ endsOn: "2026-10-01" });
    expect(duePeriodOf(fee, "2026-12-15")).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("BOUNDS catch-up so a back-dated fee cannot mint years of real invoices", () => {
    const fee = makeFee({ startsOn: "2016-01-01", nextRunOn: "2016-01-01" });
    const period = duePeriodOf(fee, "2026-08-19");
    // Ten years of monthly periods is 128. The cap keeps one tick to 24.
    expect(period.length).toBe(MAX_CATCHUP_PERIOD);
    expect(MAX_CATCHUP_PERIOD).toBeLessThanOrEqual(24);
  });
});

describe("Recurring fee — suspension is DERIVED", () => {
  const fee = makeFee();

  it("is NOT justified on day 14 of the grace window", () => {
    const at = new Date("2026-09-15T04:00:00Z"); // 2026-09-15 in Manila = day 14
    const derived = deriveSuspension(fee, [makeInvoice({})], at);
    expect(derived.daySinceDue).toBe(14);
    expect(derived.graceDayRemaining).toBe(1);
    expect(derived.isSuspensionJustified).toBe(false);
  });

  it("is NOT justified on day 15 — the contract says 'within 15 days'", () => {
    const at = new Date("2026-09-16T04:00:00Z");
    const derived = deriveSuspension(fee, [makeInvoice({})], at);
    expect(derived.daySinceDue).toBe(15);
    expect(derived.isSuspensionJustified).toBe(false);
  });

  it("IS justified on day 16", () => {
    const at = new Date("2026-09-17T04:00:00Z");
    const derived = deriveSuspension(fee, [makeInvoice({})], at);
    expect(derived.daySinceDue).toBe(16);
    expect(derived.graceDayRemaining).toBe(-1);
    expect(derived.isSuspensionJustified).toBe(true);
  });

  it("a PAID invoice never justifies suspension, however late it settled", () => {
    const at = new Date("2027-06-01T04:00:00Z"); // nine months later
    const derived = deriveSuspension(
      fee,
      [makeInvoice({ status: "paid", paidAt: new Date("2027-05-01T00:00:00Z") })],
      at,
    );
    expect(derived.unsettledInvoiceCount).toBe(0);
    expect(derived.outstandingCents).toBe(0);
    expect(derived.daySinceDue).toBeNull();
    expect(derived.isSuspensionJustified).toBe(false);
  });

  it("respects a client contractually exempt from the suspension remedy", () => {
    const at = new Date("2026-10-17T04:00:00Z");
    const exempt = makeFee({ isSuspensionEnabled: false });
    expect(deriveSuspension(exempt, [makeInvoice({})], at).isSuspensionJustified).toBe(false);
  });

  it("never justifies suspension on a paused or cancelled schedule", () => {
    const at = new Date("2026-10-17T04:00:00Z");
    for (const status of ["paused", "cancelled"] as const) {
      const paused = makeFee({ status });
      expect(deriveSuspension(paused, [makeInvoice({})], at).isSuspensionJustified).toBe(false);
    }
  });

  it("sums outstanding money in integer CENTS and anchors to the OLDEST unpaid period", () => {
    const at = new Date("2026-11-17T04:00:00Z");
    const derived = deriveSuspension(
      fee,
      [
        makeInvoice({ invoiceId: 2, periodStartOn: "2026-10-01" }),
        makeInvoice({ invoiceId: 1, periodStartOn: "2026-09-01", status: "overdue" }),
      ],
      at,
    );
    expect(derived.outstandingCents).toBe(FOURLINQ_MONTHLY_CENTS * 2);
    expect(Number.isInteger(derived.outstandingCents)).toBe(true);
    expect(derived.daySinceDue).toBe(dayBetween("2026-09-01", "2026-11-17"));
  });

  it("reports suspension state separately from suspension justification", () => {
    const at = new Date("2026-09-15T04:00:00Z");
    const suspended = makeFee({ suspendedAt: new Date("2026-09-20T00:00:00Z") });
    const derived = deriveSuspension(suspended, [makeInvoice({})], at);
    // Justified != done, and done != justified. They are two independent facts.
    expect(derived.isSuspended).toBe(true);
    expect(derived.isSuspensionJustified).toBe(false);
  });
});

describe("Recurring fee — schema invariant", () => {
  const migration = readSource("apps/api/migrations/017_recurring_fee.sql");

  it("REUSES the invoice table instead of inventing a parallel billing system", () => {
    expect(migration).toMatch(/ALTER TABLE invoice ADD COLUMN IF NOT EXISTS recurring_fee_id/);
    expect(migration).toMatch(/ALTER TABLE invoice ADD COLUMN IF NOT EXISTS period_start_on/);
    // No second money table.
    expect(migration).not.toMatch(/CREATE TABLE[^;]*recurring_invoice/i);
  });

  it("adds NO new invoice_status value — suspension is not a payment state", () => {
    expect(migration).not.toMatch(/ALTER TYPE invoice_status/i);
    const schema = readSource("apps/api/src/db/schema.ts");
    const enumAt = schema.indexOf('pgEnum("invoice_status"');
    expect(schema.slice(enumAt, enumAt + 200)).not.toMatch(/suspend/i);
  });

  it("guards double-billing with a DB partial unique index, not application care", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[^;]*invoice \(recurring_fee_id, period_start_on\)[^;]*WHERE recurring_fee_id IS NOT NULL/,
    );
  });

  it("keeps every billing anchor a DATE, never a timestamptz", () => {
    for (const column of [
      "starts_on",
      "ends_on",
      "next_run_on",
      "last_generated_on",
      "period_start_on",
    ]) {
      expect(migration).toMatch(new RegExp(`${column}\\s+date`));
    }
  });

  it("CHECKs the billing day to 1..28 so no month silently skips a period", () => {
    expect(migration).toMatch(/billing_day_of_month BETWEEN 1 AND 28/);
  });

  it("keeps billing history when the schedule is deleted", () => {
    expect(migration).toMatch(
      /recurring_fee_id integer\s+REFERENCES recurring_fee \(recurring_fee_id\) ON DELETE SET NULL/,
    );
  });

  it("stores money as integer cents with a non-negative CHECK", () => {
    expect(migration).toMatch(/amount_cents\s+integer NOT NULL/);
    expect(migration).toMatch(/CHECK \(amount_cents >= 0\)/);
    // No column anywhere is declared with a floating or arbitrary-precision type.
    expect(migration).not.toMatch(/_cents\s+(numeric|decimal|money|real|double precision)/i);
    expect(migration).not.toMatch(/^\s+\w+\s+(numeric|decimal|money|real|double precision)\b/im);
  });
});

describe("Recurring fee — service invariant", () => {
  const source = readSource("apps/api/src/services/recurring-fee.service.ts");

  it("lets the DB enforce the double-bill guard", () => {
    expect(source).toContain("onConflictDoNothing()");
  });

  it("sweeps unpaid -> overdue in ONE guarded UPDATE, never read-then-write", () => {
    const sweepAt = source.indexOf("export async function sweepOverdueInvoice");
    expect(sweepAt).toBeGreaterThan(-1);
    const sweep = source.slice(sweepAt, source.indexOf("export", sweepAt + 10));
    // The status re-check must be in the WHERE clause of the update itself, so a
    // concurrently-paid invoice is invisible to the statement.
    expect(sweep).toMatch(/eq\(invoice\.status,\s*"unpaid"\)/);
    expect(sweep).not.toMatch(/\.select\(/);
  });

  it("adds NO new dependency for date maths", () => {
    expect(source).toContain("Intl.DateTimeFormat");
    expect(source).not.toMatch(/from "(date-fns|luxon|dayjs|moment)/);
  });

  it("starts no scheduler — generation is an endpoint a human or a later job calls", () => {
    expect(source).not.toMatch(/setInterval|setTimeout|node-cron/);
  });

  it("never auto-suspends: the remedy only records a timestamp", () => {
    const suspendAt = source.indexOf("export async function suspendFee");
    expect(suspendAt).toBeGreaterThan(-1);
    const suspend = source.slice(suspendAt);
    expect(suspend).toContain("isSuspensionJustified");
    expect(suspend).toMatch(/HTTPException\(409/);
    // Nothing operational is reachable from here.
    expect(suspend).not.toMatch(/exec|spawn|fetch\(|ssh|deploy/i);
  });

  it("never rewinds the generation anchor through the update API", () => {
    const updateAt = source.indexOf("export type UpdateInput");
    const update = source.slice(updateAt, source.indexOf("export async function delete"));
    expect(update).not.toMatch(/nextRunOn\??:/);
    expect(update).not.toMatch(/startsOn\??:/);
  });
});

describe("Recurring fee — reachable surface", () => {
  it("mounts /api/recurring-fee on the app", () => {
    const index = readSource("apps/api/src/index.ts");
    expect(index).toContain('app.route("/api/recurring-fee", recurringFeeRoutes)');
    // Scope discipline: the route is the surface. No tick is started at boot.
    expect(index).not.toMatch(/startRecurringFeeTick/);
  });

  it("gates the router behind requireAuth + requireTeam, mutations behind requireAdmin", () => {
    const routes = readSource("apps/api/src/routes/recurring-fee.routes.ts");
    expect(routes).toContain('recurringFeeRoutes.use("*", requireAuth, requireTeam)');
    for (const path of ['post("/"', 'patch("/:id"', 'delete("/:id"', 'post("/run"']) {
      const at = routes.indexOf(path);
      expect(at).toBeGreaterThan(-1);
      expect(routes.slice(at, at + 120)).toContain("requireAdmin");
    }
  });

  it("returns every response in the { data, error } envelope", () => {
    const routes = readSource("apps/api/src/routes/recurring-fee.routes.ts");
    const jsonCall = routes.match(/c\.json\(/g) ?? [];
    const envelope = routes.match(/error: null/g) ?? [];
    expect(jsonCall.length).toBeGreaterThan(0);
    expect(envelope.length).toBe(jsonCall.length);
  });

  it("refuses to delete a generated invoice, so a billed period cannot be orphaned", () => {
    const invoices = readSource("apps/api/src/routes/invoices.routes.ts");
    const deleteAt = invoices.indexOf('invoices.delete("/:id"');
    const del = invoices.slice(deleteAt);
    expect(del).toMatch(/recurringFeeId != null/);
    expect(del).toMatch(/HTTPException\(409/);
  });

  it("reaches the admin Finance surface and keeps recurring rows out of project scope", () => {
    const finance = readSource("apps/web/src/components/admin/AdminFinance.tsx");
    expect(finance).toContain("useRecurringFee");
    expect(finance).toContain("Recurring fees");
    expect(finance).toContain("Run billing");
    // The dilution / value-pollution guard: generated invoices are split out of the
    // project-grouped list rather than inflating it.
    expect(finance).toContain("recurringInvoiceByProject");
    expect(finance).toMatch(/recurring_fee_id == null/);
  });

  it("renders cents through one divide-by-100 at the edge, never a float in the model", () => {
    const hook = readSource("apps/web/src/hooks/useRecurringFee.ts");
    expect(hook).toContain("amountCents");
    expect(hook).not.toMatch(/amount(?!Cents)\s*[:?]/);
  });
});
