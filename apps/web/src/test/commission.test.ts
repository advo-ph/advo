/**
 * Commission split — 55% developer / 35% staff / 10% company (the signed Internal
 * Commission and Operations Agreement, 2026-07-31; supersedes the 60/25/15 message).
 *
 * No live API call, no database. Every behavioural test drives the PURE exports of
 * commission.service.ts — the allocator, the recursive split, the finalize gate — so the
 * assertions are stable on any machine. The rest is source-reading, in the style of
 * campaign.test.ts and recurring-fee.test.ts.
 *
 * Covers the seven invariants the service exists to hold:
 *   1. exact to the centavo      — sum(allocate(t, w)) === t, always
 *   2. one rounding site         — allocate(), applied recursively, exact at every level
 *   3. no residue anywhere       — unallocatedCents is reported, not absorbed
 *   4. integer cents + bps       — no float, percentages read off the PLAN ROW
 *   5. draft derived, final frozen
 *   6. finalize atomic + single-shot — conditional UPDATE, 409 on the second click
 *   7. mutual agreement is a gate
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMISSION_ROLE,
  DEFAULT_BPS,
  allocate,
  computeSplit,
  finalizeBlocker,
  type PlanRow,
  type ShareRow,
} from "../../../api/src/services/commission.service.js";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/**
 * Source assertions below match multi-line snippets written with `\n`. This repo
 * has no `.gitattributes` and `core.autocrlf` is true, so on Windows every
 * checked-out source file has CRLF and those assertions fail on the line ending
 * rather than on the thing they are testing. Normalize on read: the assertions
 * are about what the source declares, never about how its lines terminate.
 */
const readSource = (path: string) =>
  readFileSync(join(monorepoRoot, path), "utf-8").replace(/\r\n/g, "\n");

/* ─── Fixtures ────────────────────────────────────────────── */

const makePlan = (over: Partial<PlanRow> = {}): PlanRow =>
  ({
    commissionPlanId: 1,
    projectId: 1,
    basisCents: 10_000_000, // ₱100,000.00
    basisNote: null,
    developerBps: DEFAULT_BPS.developer,
    staffBps: DEFAULT_BPS.staff,
    companyBps: DEFAULT_BPS.company,
    referralBps: DEFAULT_BPS.referral,
    marketingBps: DEFAULT_BPS.marketing,
    accountingBps: DEFAULT_BPS.accounting,
    managementBps: DEFAULT_BPS.management,
    status: "draft",
    finalizedAt: null,
    finalizedBy: null,
    note: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as PlanRow;

let nextShareId = 0;
const makeShare = (over: Partial<ShareRow> = {}): ShareRow =>
  ({
    commissionShareId: (nextShareId += 1),
    commissionPlanId: 1,
    teamMemberId: 1,
    role: "main_developer",
    contributionBps: 5000,
    isAgreed: true,
    agreedAt: new Date(),
    amountCents: null,
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as ShareRow;

/** A complete, agreed, finalizable ledger: 2 devs, 4 staff roles, company reserve. */
const fullLedger = () => [
  makeShare({ role: "main_developer", teamMemberId: 1, contributionBps: 6000 }),
  makeShare({ role: "assistant_developer", teamMemberId: 2, contributionBps: 4000 }),
  makeShare({ role: "referral", teamMemberId: 3, contributionBps: 10000 }),
  makeShare({ role: "marketing", teamMemberId: 4, contributionBps: 10000 }),
  makeShare({ role: "accounting", teamMemberId: 5, contributionBps: 10000 }),
  makeShare({ role: "management", teamMemberId: 6, contributionBps: 10000 }),
  makeShare({ role: "company", teamMemberId: null, contributionBps: 0 }),
];

/* ─── 1. The allocator is exact ───────────────────────────── */

describe("Commission — largest-remainder allocation is exact to the centavo", () => {
  it("never loses or invents a centavo, across a wide sweep of awkward numbers", () => {
    const weightCase = [
      [5500, 3500, 1000],
      [2000, 2000, 1000, 5000],
      [1, 1, 1],
      [7, 11, 13, 17],
      [1, 0, 0],
      [0, 0, 0, 0],
      [9999, 1],
      [5000, 5000],
    ];

    for (const weight of weightCase) {
      for (let totalCents = 0; totalCents < 400; totalCents += 1) {
        const part = allocate(totalCents, weight);
        expect(part).toHaveLength(weight.length);
        expect(part.reduce((a, b) => a + b, 0)).toBe(totalCents);
        expect(part.every(Number.isInteger)).toBe(true);
        expect(part.every((n) => n >= 0)).toBe(true);
      }
      // And on a realistic project value, not just the small cases.
      expect(allocate(12_345_678, weight).reduce((a, b) => a + b, 0)).toBe(12_345_678);
    }
  });

  it("splits ₱1.00 across three equal developers as 34/33/33, not 33/33/33", () => {
    // The naive floor loses a centavo here. This is THE case the rule exists for.
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("is deterministic — the same input allocates identically every time", () => {
    const once = allocate(1_000_001, [3333, 3333, 3334]);
    const twice = allocate(1_000_001, [3333, 3333, 3334]);
    expect(once).toEqual(twice);
    // Ties break by slot order, so the first slot never loses to a later equal one.
    expect(allocate(10, [1, 1, 1, 1])).toEqual([3, 3, 2, 2]);
  });

  it("treats an all-zero weight vector as an even split, not as everyone getting zero", () => {
    const part = allocate(1000, [0, 0, 0, 0]);
    expect(part.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(part).toEqual([250, 250, 250, 250]);
  });

  it("reads weights as RELATIVE — 60/40 and 6000/4000 allocate identically", () => {
    expect(allocate(999_999, [60, 40])).toEqual(allocate(999_999, [6000, 4000]));
  });
});

/* ─── 2. The recursive split matches Prince's structure ───── */

describe("Commission — the 55/35/10 structure", () => {
  it("splits the basis 55% developer / 35% staff / 10% company", () => {
    const { derived } = computeSplit(makePlan(), fullLedger());
    expect(derived.developerPoolCents).toBe(5_500_000);
    expect(derived.staffPoolCents).toBe(3_500_000);
    expect(derived.companyCents).toBe(1_000_000);
  });

  it("sub-splits the staff pool 20/20/10/50 OF THE STAFF POOL, not of the basis", () => {
    const { derived } = computeSplit(makePlan(), fullLedger());
    // 50% of ₱35,000 = ₱17,500 — which is 17.5% of the project, not 50% of it.
    expect(derived.staffRolePoolCents.referral).toBe(700_000);
    expect(derived.staffRolePoolCents.marketing).toBe(700_000);
    expect(derived.staffRolePoolCents.accounting).toBe(350_000);
    expect(derived.staffRolePoolCents.management).toBe(1_750_000);

    const staffSum = Object.values(derived.staffRolePoolCents).reduce((a, b) => a + b, 0);
    expect(staffSum).toBe(derived.staffPoolCents);
  });

  it("shares the ONE developer pool between main and assistant by contribution", () => {
    const share = fullLedger();
    const { amountByShareId } = computeSplit(makePlan(), share);
    // 60/40 of the ₱55,000 developer pool.
    expect(amountByShareId.get(share[0].commissionShareId)).toBe(3_300_000);
    expect(amountByShareId.get(share[1].commissionShareId)).toBe(2_200_000);
  });

  it("sums the whole ledger to the basis EXACTLY, on ugly amounts too", () => {
    for (const basisCents of [1, 3, 7, 99, 100_001, 1_234_567, 22_500_000, 35_000_000]) {
      const { derived } = computeSplit(makePlan({ basisCents }), fullLedger());
      expect(derived.unallocatedCents).toBe(0);
      expect(derived.allocatedCents).toBe(basisCents);
    }
  });

  it("reports cents belonging to an empty role as UNALLOCATED, never absorbing them", () => {
    // Nobody in marketing. That ₱7,000 must not quietly land in the company reserve.
    const share = fullLedger().filter((s) => s.role !== "marketing");
    const { derived, amountByShareId } = computeSplit(makePlan(), share);

    expect(derived.unallocatedCents).toBe(700_000);
    expect(derived.allocatedCents).toBe(10_000_000 - 700_000);
    // The company reserve is still exactly 10% — it did not swell.
    const company = share.find((s) => s.role === "company")!;
    expect(amountByShareId.get(company.commissionShareId)).toBe(1_000_000);
  });

  it("reads the percentages off the PLAN ROW, so a renegotiation cannot rewrite history", () => {
    // A plan snapshotted under a different structure must allocate by ITS OWN numbers.
    const renegotiated = makePlan({ developerBps: 7000, staffBps: 2000, companyBps: 1000 });
    const { derived } = computeSplit(renegotiated, fullLedger());
    expect(derived.developerPoolCents).toBe(7_000_000);
    expect(derived.companyCents).toBe(1_000_000);
    // ...while the defaults are untouched.
    expect(DEFAULT_BPS.developer).toBe(5500);
  });

  it("keeps the company reserve as a real share row, not a leftover", () => {
    const share = fullLedger();
    const company = share.find((s) => s.role === "company")!;
    expect(company.teamMemberId).toBeNull();
    const { amountByShareId } = computeSplit(makePlan(), share);
    expect(amountByShareId.has(company.commissionShareId)).toBe(true);
  });

  it("names exactly the seven roles Prince specified", () => {
    expect([...COMMISSION_ROLE]).toEqual([
      "main_developer",
      "assistant_developer",
      "referral",
      "marketing",
      "accounting",
      "management",
      "company",
    ]);
  });
});

/* ─── 3. The finalize gate ────────────────────────────────── */

describe("Commission — the finalize gate", () => {
  const gate = (plan: PlanRow, share: ShareRow[], projectStatus: string) =>
    finalizeBlocker(plan, share, projectStatus, computeSplit(plan, share).derived);

  it("passes when the project shipped, every role is held and every share is agreed", () => {
    expect(gate(makePlan(), fullLedger(), "shipped")).toEqual([]);
  });

  it("refuses while the project is not shipped — the split is agreed on completion", () => {
    const blocker = gate(makePlan(), fullLedger(), "development");
    expect(blocker.join(" ")).toMatch(/not shipped/i);
  });

  it("refuses while any person-held share is unagreed", () => {
    const share = fullLedger();
    share[1] = { ...share[1], isAgreed: false, agreedAt: null };
    expect(gate(makePlan(), share, "shipped").join(" ")).toMatch(/mutually agreed/i);
  });

  it("refuses while any centavo has no name attached to it", () => {
    const share = fullLedger().filter((s) => s.role !== "accounting");
    expect(gate(makePlan(), share, "shipped").join(" ")).toMatch(/nobody in it/i);
  });

  it("refuses without a main developer", () => {
    const share = fullLedger().filter((s) => s.role !== "main_developer");
    expect(gate(makePlan(), share, "shipped").join(" ")).toMatch(/main developer/i);
  });

  it("refuses a zero basis and an already-finalized plan", () => {
    expect(gate(makePlan({ basisCents: 0 }), fullLedger(), "shipped").join(" ")).toMatch(
      /nothing to split/i,
    );
    expect(
      gate(makePlan({ status: "finalized", finalizedAt: new Date() }), fullLedger(), "shipped")
        .join(" "),
    ).toMatch(/already finalized/i);
  });

  it("does NOT require the company reserve to be 'agreed' by a person", () => {
    // There is nobody to agree with. A memberless row must never block finalize.
    const share = fullLedger();
    expect(share.find((s) => s.role === "company")!.teamMemberId).toBeNull();
    expect(computeSplit(makePlan(), share).derived.isAgreedComplete).toBe(true);
  });
});

/* ─── 4. Source-reading: the promises the code makes ──────── */

describe("Commission — invariants held in source", () => {
  const migration = readSource("apps/api/migrations/018_commission_split.sql");
  const service = readSource("apps/api/src/services/commission.service.ts");
  const route = readSource("apps/api/src/routes/commission.routes.ts");
  const schema = readSource("apps/api/src/db/schema.ts");
  const index = readSource("apps/api/src/index.ts");
  const hook = readSource("apps/web/src/hooks/useCommission.ts");

  it("ships migration 018 with both tables and the exactness constraints", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS commission_plan");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS commission_share");
    // The two sums that make the model provable.
    expect(migration).toContain("developer_bps + staff_bps + company_bps = 10000");
    expect(migration).toContain(
      "referral_bps + marketing_bps + accounting_bps + management_bps = 10000",
    );
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });

  it("enforces Prince's cardinality in the DATABASE, not in application care", () => {
    // "per project is 1 main developer, and 1 assistant dev"
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*?WHERE role = 'main_developer'/);
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*?WHERE role = 'assistant_developer'/);
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*?WHERE role = 'company'/);
    // At most one live plan per project.
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*?WHERE status <> 'void'/);
  });

  it("keeps money and percentages integral — no numeric, no float, no decimal column", () => {
    expect(migration).toMatch(/basis_cents\s+integer/);
    expect(migration).toMatch(/amount_cents\s+integer/);
    expect(migration).toMatch(/contribution_bps\s+integer/);
    // No inexact type in any column DECLARATION. Scoped to `<name> <type>` lines,
    // because the prose above legitimately says "a real ledger row".
    expect(migration).not.toMatch(/^\s+\w+\s+(numeric|decimal|real|double precision|money)\b/im);
    // And on the wire.
    expect(route).toContain("z.number().int()");
    expect(route).not.toMatch(/z\.coerce\.number|parseFloat/);
  });

  it("mirrors both tables into drizzle without disturbing another model's block", () => {
    expect(schema).toContain('pgTable(\n  "commission_plan"');
    expect(schema).toContain('pgTable(\n  "commission_share"');
    expect(schema).toContain("export const commissionPlan");
    expect(schema).toContain("export const commissionShare");
  });

  it("mounts the router, team-only, with no client-facing path", () => {
    expect(index).toContain('app.route("/api/commission", commissionRoutes)');
    expect(route).toContain('commissionRoutes.use("*", requireAuth, requireTeam)');
    // Compensation is not client-facing: no /hub ownership helper anywhere here.
    expect(route).not.toContain("assertClientOwnsProject");
  });

  it("finalizes with a conditional UPDATE so a double-click cannot freeze twice", () => {
    expect(service).toContain("isNull(commissionPlan.finalizedAt)");
    expect(service).toContain("already finalized");
    expect(service).toContain("db().transaction");
  });

  it("resets agreement when a contribution weight changes", () => {
    // Nobody stays signed off on a figure they never saw.
    expect(service).toContain("isWeightChanged");
    expect(service).toMatch(/isWeightChanged \? \(input\.isAgreed \?\? false\)/);
  });

  it("ships no scheduler, no cron and no payout rail", () => {
    for (const source of [service, route]) {
      expect(source).not.toMatch(/setInterval|setTimeout|node-cron|schedule\(/);
    }
    // Finalizing states who is owed what; it does not move money. No invoice is minted,
    // no payment rail is reached, nothing is fetched.
    expect(service).not.toContain("insert(invoice)");
    expect(service).not.toMatch(/paymongo|stripe|xendit|gcash/i);
    expect(service).not.toContain("fetch(");
  });

  it("never recomputes a split in the browser", () => {
    expect(hook).toContain("computedAmountCents");
    // No allocation arithmetic in the browser at all — not even a rounding call, which
    // is where a second implementation would start.
    expect(hook).not.toContain("computeSplit");
    expect(hook).not.toMatch(/Math\.floor|Math\.round|Math\.ceil/);
    // And the percentages are typed as plan fields, never redeclared as constants.
    expect(hook).toContain("developerBps: number");
    expect(hook).not.toMatch(/=\s*6000|=\s*2500|=\s*1500/);
  });

  it("reaches a real admin surface: /admin -> Finance -> Commission", () => {
    const finance = readSource("apps/web/src/components/admin/AdminFinance.tsx");
    expect(finance).toContain("AdminCommission");
    expect(finance).toContain('import AdminCommission from "@/components/admin/AdminCommission"');

    const panel = readSource("apps/web/src/components/admin/AdminCommission.tsx");
    expect(panel).toContain("useCommission");
    expect(panel).toContain("derived.blocker");
    // The button is a mirror of the server gate, never its own judgement.
    expect(panel).toContain("d.isFinalizeReady");
  });
});
