/**
 * Project Sign-off — the CLIENT-FACING final-delivery document (migration 016).
 *
 * Stubbed and offline: the pure helpers (deriveWindow / addDay / addMonth) are
 * exercised directly, and the invariants that only exist as SQL or as a code shape
 * are asserted by reading the source. No live API call, no DB.
 *
 * The invariants under test:
 *   1. NEVER conflated with deliverable.verified_at (internal team QA)
 *   2. sign is atomic and single-shot — WHERE signed_at IS NULL guards the invoice
 *   3. the revision gate lives in the write path, not in the /hub query
 *   4. used/remaining are COUNTED from the ledger, never stored as a column
 *   5. frozen after signing
 *   6. money is integer cents end to end
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDay,
  addMonth,
  deriveWindow,
  SIGNOFF_METHOD,
  SIGNOFF_STATUS,
  toClientShape,
} from "../../../api/src/services/project-signoff.service";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

const migration = readSource("apps/api/migrations/016_project_signoff.sql");
const service = readSource("apps/api/src/services/project-signoff.service.ts");
const route = readSource("apps/api/src/routes/project-signoff.routes.ts");
const schema = readSource("apps/api/src/db/schema.ts");
const index = readSource("apps/api/src/index.ts");
const hubCard = readSource("apps/web/src/components/hub/SignoffCard.tsx");

/** A sign-off row shaped like the DB row, for the pure derivation. */
const row = (over: Partial<Parameters<typeof deriveWindow>[0]> = {}) => ({
  signedAt: null as Date | null,
  paymentDueDayCount: 7,
  revisionWindowMonthCount: 6,
  freeRevisionTotalCount: 5,
  ...over,
});

describe("Sign-off — clock arithmetic is derived, never stored", () => {
  it("stores no used/remaining/due-date column: the migration has only the allowance", () => {
    expect(migration).toContain("free_revision_total_count");
    expect(migration).not.toMatch(/free_revision_used_count|free_revision_remaining_count/);
    expect(migration).not.toMatch(/payment_due_at\s|revision_window_ends_at\s/);
  });

  it("returns null clocks while unsigned", () => {
    const d = deriveWindow(row(), 0);
    expect(d.paymentDueAt).toBeNull();
    expect(d.revisionWindowEndsAt).toBeNull();
    expect(d.isRevisionWindowOpen).toBe(false);
    expect(d.isPaymentOverdue).toBe(false);
  });

  it("starts the 7-day payment clock at the signature, not at midnight UTC", () => {
    // 09:00 Asia/Manila is 01:00 UTC. The due instant must keep that time of day.
    const signedAt = new Date("2026-08-19T01:00:00.000Z");
    const d = deriveWindow(row({ signedAt }), 0);
    expect(d.paymentDueAt).toBe("2026-08-26T01:00:00.000Z");
  });

  it("adds 6 REAL calendar months, never 180 days", () => {
    const signedAt = new Date("2026-08-19T01:00:00.000Z");
    const d = deriveWindow(row({ signedAt }), 0);
    expect(d.revisionWindowEndsAt).toBe("2027-02-19T01:00:00.000Z");
    // 180 days would land on 2027-02-15 — nearly a week short, and arguable with a
    // paying client.
    expect(d.revisionWindowEndsAt).not.toBe(addDay(signedAt, 180).toISOString());
  });

  it("clamps a month-add that overflows a short month", () => {
    // 31 Aug + 6 months has no 31 Feb.
    expect(addMonth(new Date("2026-08-31T01:00:00.000Z"), 6).toISOString()).toBe(
      "2027-02-28T01:00:00.000Z",
    );
  });

  it("derives used/remaining by COUNTING the ledger", () => {
    expect(deriveWindow(row(), 0).freeRevisionRemainingCount).toBe(5);
    expect(deriveWindow(row(), 3).freeRevisionRemainingCount).toBe(2);
    expect(deriveWindow(row(), 5).freeRevisionRemainingCount).toBe(0);
    // An over-count (a manual ledger insert) can never produce a negative allowance.
    expect(deriveWindow(row(), 9).freeRevisionRemainingCount).toBe(0);
  });
});

describe("Sign-off — the revision window the contract describes", () => {
  const signedAt = new Date("2026-08-19T01:00:00.000Z");

  it("keeps free revisions open only while UNSIGNED", () => {
    expect(deriveWindow(row(), 2).isFreeRevisionOpen).toBe(true);
    expect(deriveWindow(row({ signedAt }), 2, new Date("2026-09-01T00:00:00Z")).isFreeRevisionOpen).toBe(
      false,
    );
  });

  it("keeps UNUSED rounds invocable inside the 6-month post-signature window", () => {
    const d = deriveWindow(row({ signedAt }), 2, new Date("2026-12-01T00:00:00Z"));
    expect(d.isRevisionWindowOpen).toBe(true);
  });

  it("closes the window once 6 months have passed", () => {
    const d = deriveWindow(row({ signedAt }), 2, new Date("2027-03-01T00:00:00Z"));
    expect(d.isRevisionWindowOpen).toBe(false);
  });

  it("closes the window when the allowance is exhausted, even inside 6 months", () => {
    const d = deriveWindow(row({ signedAt }), 5, new Date("2026-09-01T00:00:00Z"));
    expect(d.isRevisionWindowOpen).toBe(false);
  });

  it("flags overdue payment only when the linked invoice is unpaid", () => {
    const late = new Date("2026-09-30T00:00:00Z");
    expect(deriveWindow(row({ signedAt }), 0, late, false).isPaymentOverdue).toBe(true);
    expect(deriveWindow(row({ signedAt }), 0, late, true).isPaymentOverdue).toBe(false);
  });
});

describe("Sign-off — never conflated with deliverable.verified_at", () => {
  it("says so in the migration and the service", () => {
    expect(migration).toMatch(/NOT deliverable\.verified_at/i);
    expect(service).toMatch(/NEVER deliverable\.verified_at|internal team QA/i);
  });

  it("COPIES verifiedAt into frozen jsonb rather than referencing the deliverable", () => {
    expect(migration).toContain("deliverable_snapshot");
    // No FK from the sign-off itself to a deliverable — the snapshot is a COPY, so no
    // read path can wire the client card to internal QA state. (signoff_revision does
    // link one, which is why the assertion is scoped to the project_signoff block.)
    const block = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS project_signoff"),
      migration.indexOf("CREATE TABLE IF NOT EXISTS signoff_revision"),
    );
    expect(block).toContain("deliverable_snapshot");
    expect(block).not.toMatch(/deliverable_id\s+integer/);
  });

  it("strips the snapshot and the internal note from the client shape", () => {
    const client = toClientShape({
      projectSignoffId: 1,
      note: "internal",
      deliverableSnapshot: [{ verifiedAt: "2026-08-01T00:00:00Z" }],
      createdBy: 4,
      title: "Phase 1",
    } as never);
    expect(client).not.toHaveProperty("note");
    expect(client).not.toHaveProperty("deliverableSnapshot");
    expect(client).not.toHaveProperty("createdBy");
    expect(client).toHaveProperty("title", "Phase 1");
  });

  it("never renders verifiedAt on the /hub card", () => {
    // Strip comments first: the file NAMES the rule it obeys in its header.
    const code = hubCard.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/verifiedAt|verified_at/);
  });
});

describe("Sign-off — signing is atomic and single-shot", () => {
  it("guards the UPDATE on signed_at IS NULL inside the transaction", () => {
    expect(service).toMatch(/db\(\)\.transaction\(/);
    expect(service).toMatch(/isNull\(projectSignoff\.signedAt\)/);
    // The bail-out precedes the invoice insert, so a second click mints nothing.
    const guardAt = service.indexOf('message: "Already signed"');
    const invoiceAt = service.indexOf(".insert(invoice)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(invoiceAt).toBeGreaterThan(guardAt);
  });

  it("lets the DB refuse a status/stamp disagreement", () => {
    expect(migration).toMatch(/CHECK \(\(status = 'signed'\) = \(signed_at IS NOT NULL\)\)/);
    expect(migration).toMatch(/CHECK \(signed_at IS NULL OR issued_at IS NOT NULL\)/);
  });

  it("allows at most one sign-off awaiting signature per project", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?idx_project_signoff_open[\s\S]*?WHERE status = 'issued'/,
    );
  });

  it("requires a literal agreement checkbox, not just a typed name", () => {
    expect(route).toMatch(/isAgree: z\.literal\(true\)/);
  });
});

describe("Sign-off — the revision gate is in the write path", () => {
  it("reads the parent FOR UPDATE and counts the ledger before inserting", () => {
    expect(service).toMatch(/\.for\("update"\)/);
    const forUpdateAt = service.indexOf('.for("update")');
    const insertAt = service.indexOf(".insert(signoffRevision)");
    expect(forUpdateAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(forUpdateAt);
  });

  it("refuses an exhausted allowance and a closed window with a named reason", () => {
    expect(service).toMatch(/Free revisions are exhausted/);
    expect(service).toMatch(/revision window closed on/);
  });

  it("backs the gate with a DB double-spend guard on (signoff, round_number)", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?idx_signoff_revision_round[\s\S]*?\(project_signoff_id, round_number\)/,
    );
    expect(schema).toMatch(/uniqueIndex\("idx_signoff_revision_round"\)/);
  });

  it("marks a post-signature round so the contract clause is provable", () => {
    expect(migration).toContain("is_post_signoff");
    expect(service).toMatch(/isPostSignoff/);
  });
});

describe("Sign-off — frozen after signing", () => {
  it("permits only note and documentUrl once signed", () => {
    expect(service).toMatch(/MUTABLE_AFTER_SIGNING = new Set\(\["note", "documentUrl"\]\)/);
    expect(service).toMatch(/A signed sign-off is frozen/);
  });

  it("never voids a signed row — it owns a real receivable", () => {
    expect(service).toMatch(/A signed sign-off is never voided/);
  });
});

describe("Sign-off — money is integer cents end to end", () => {
  it("declares cents in the migration and the drizzle mirror", () => {
    expect(migration).toMatch(/final_payment_cents\s+integer NOT NULL DEFAULT 0/);
    expect(migration).toMatch(/CHECK \(final_payment_cents >= 0\)/);
    expect(schema).toMatch(/finalPaymentCents: integer\("final_payment_cents"\)/);
  });

  it("validates the request body as an integer, so a peso float cannot land", () => {
    expect(route).toMatch(/finalPaymentCents: z\.number\(\)\.int\(\)\.min\(0\)/);
  });

  it("multiplies pesos by 100 exactly once, in the admin form", () => {
    const adminPanel = readSource("apps/web/src/components/admin/AdminSignoff.tsx");
    const occurrence = adminPanel.match(/\* 100/g) ?? [];
    expect(occurrence).toHaveLength(1);
    expect(adminPanel).toMatch(/Math\.round\(peso \* 100\)/);
  });

  it("keeps the FourlinQ tiers representable as whole cents", () => {
    // Tier 1 final ₱22,500 and Tier 2 final ₱35,000.
    expect(Math.round(22500 * 100)).toBe(2250000);
    expect(Math.round(35000 * 100)).toBe(3500000);
    expect(Number.isInteger(Math.round(22500 * 100))).toBe(true);
  });
});

describe("Sign-off — reachable surface", () => {
  it("is mounted at /api/project-signoff", () => {
    expect(index).toMatch(/app\.route\("\/api\/project-signoff", projectSignoffRoutes\)/);
  });

  it("exposes the whole lifecycle", () => {
    for (const path of ["/:id/issue", "/:id/sign", "/:id/revision", "/:id/void"]) {
      expect(route).toContain(path);
    }
  });

  it("uses requireAuth everywhere and requireTeam / requireAdmin on the team paths", () => {
    expect(route).toMatch(/projectSignoffRoutes\.use\("\*", requireAuth\)/);
    expect(route).toMatch(/post\("\/", requireTeam/);
    expect(route).toMatch(/patch\("\/:id", requireTeam/);
    expect(route).toMatch(/"\/:id\/void",\s*requireAdmin/);
  });

  it("gates client reads through the join-through-client ownership check", () => {
    expect(service).toMatch(/assertClientOwnsProject/);
    expect(service).toMatch(/innerJoin\(client, eq\(project\.clientId, client\.clientId\)\)/);
  });

  it("returns the { data, error } envelope on every handler", () => {
    const jsonCall = route.match(/c\.json\(/g) ?? [];
    const enveloped = route.match(/c\.json\(\{ data: /g) ?? [];
    expect(enveloped.length).toBe(jsonCall.length);
  });

  it("keeps status and method app-validated, not DB enums", () => {
    expect(SIGNOFF_STATUS).toEqual(["draft", "issued", "signed", "void"]);
    expect(SIGNOFF_METHOD).toEqual(["client", "deemed", "offline"]);
    expect(migration).toMatch(/status\s+varchar\(50\) NOT NULL DEFAULT 'draft'/);
    expect(migration).not.toMatch(/CREATE TYPE\s+(project_)?signoff/);
  });

  it("ships no scheduler — deemed approval is recorded by a human", () => {
    expect(service).not.toMatch(/setInterval|cron|node-cron/);
    expect(service).toMatch(/deemed/);
  });
});
