/**
 * Time entry (024) and the three derived ops reads.
 *
 * No live API, no database. Every behavioural test drives the PURE exports —
 * `summarizeProjectTime`, `deriveCapacity`, `formatDuration` from time-entry.service.ts,
 * and `deriveProjectRisk`, `deriveRevisionBudget`, `deriveStaleness` from
 * ops-insight.service.ts — with an injected clock, so assertions are stable on any
 * machine in any timezone.
 *
 * These are dashboard numbers, which is why they get more scrutiny than most: a wrong
 * dashboard number is worse than no dashboard, because people make decisions on it.
 */
import { describe, it, expect } from "vitest";
import { readCode, readSource } from "./read-source.js";

import {
  MAX_MINUTE_PER_ENTRY,
  MINUTE_PER_WORKING_DAY,
  WORK_TIMEZONE,
  deriveCapacity,
  formatDuration,
  subtractDay,
  summarizeProjectTime,
  todayOn,
  type TimeEntryLike,
} from "../../../api/src/services/time-entry.service.js";
import {
  STALE_THRESHOLD_DAY,
  deriveProjectRisk,
  deriveRevisionBudget,
  deriveStaleness,
  type ProjectRiskInput,
} from "../../../api/src/services/ops-insight.service.js";


const entry = (over: Partial<TimeEntryLike> = {}): TimeEntryLike => ({
  projectId: 1,
  deliverableId: 10,
  teamMemberId: 100,
  workedOn: "2026-09-01",
  minuteCount: 120,
  ...over,
});

// ─── Calendar + formatting ───────────────────────────

describe("working calendar", () => {
  it("resolves today in Manila, not UTC", () => {
    expect(WORK_TIMEZONE).toBe("Asia/Manila");
    // 2026-09-01 16:30 UTC is already 2026-09-02 in Manila (UTC+8). A naive UTC date
    // would file that work under the wrong day.
    expect(todayOn(new Date("2026-09-01T16:30:00Z"))).toBe("2026-09-02");
    expect(todayOn(new Date("2026-09-01T15:30:00Z"))).toBe("2026-09-01");
  });

  it("subtracts days across a month and a year boundary", () => {
    expect(subtractDay("2026-09-01", 1)).toBe("2026-08-31");
    expect(subtractDay("2026-01-01", 1)).toBe("2025-12-31");
    expect(subtractDay("2026-03-01", 1)).toBe("2026-02-28");
    expect(subtractDay("2026-09-14", 13)).toBe("2026-09-01");
  });
});

describe("formatDuration", () => {
  it("renders minutes as hours and minutes", () => {
    expect(formatDuration(930)).toBe("15h 30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
  });

  it("is the only place a division happens — storage stays integer minutes", () => {
    const code = readCode("apps/api/src/services/time-entry.service.ts");
    // Exactly ONE division by 60 in the whole service, inside formatDuration. Every
    // other consumer reads minutes, so a rounding error stays cosmetic rather than
    // compounding into a total somebody prices a proposal from.
    expect(code.match(/\/ 60/g) ?? []).toHaveLength(1);
    // No rate, no cost, anywhere in the executing code.
    expect(code).not.toMatch(/rateCents|hourlyRate|costCents/);
  });
});

// ─── Project time summary ────────────────────────────

describe("summarizeProjectTime", () => {
  it("totals minutes and converts to working-day equivalents", () => {
    const summary = summarizeProjectTime([
      entry({ minuteCount: 480 }),
      entry({ minuteCount: 240 }),
    ]);
    expect(summary.totalMinuteCount).toBe(720);
    expect(summary.workingDayEquivalent).toBe(1.5);
  });

  it("groups by member, largest first", () => {
    const summary = summarizeProjectTime([
      entry({ teamMemberId: 1, minuteCount: 60 }),
      entry({ teamMemberId: 2, minuteCount: 300 }),
      entry({ teamMemberId: 1, minuteCount: 120 }),
    ]);
    expect(summary.byMember).toEqual([
      { teamMemberId: 2, minuteCount: 300 },
      { teamMemberId: 1, minuteCount: 180 },
    ]);
  });

  it("surfaces UNATTRIBUTED time rather than hiding it", () => {
    // A high number here is not sloppiness — it is the calls and firefighting a
    // fixed-price quote never accounts for, which is what "the 12k isnt enough" was about.
    const summary = summarizeProjectTime([
      entry({ deliverableId: 10, minuteCount: 300 }),
      entry({ deliverableId: null, minuteCount: 180 }),
      entry({ deliverableId: null, minuteCount: 60 }),
    ]);
    expect(summary.unattributedMinuteCount).toBe(240);
    expect(summary.totalMinuteCount).toBe(540);
  });

  it("reports the first and last day worked", () => {
    const summary = summarizeProjectTime([
      entry({ workedOn: "2026-08-15" }),
      entry({ workedOn: "2026-09-01" }),
      entry({ workedOn: "2026-08-20" }),
    ]);
    expect(summary.firstWorkedOn).toBe("2026-08-15");
    expect(summary.lastWorkedOn).toBe("2026-09-01");
  });

  it("is deterministic — the same rows in a different order give the same output", () => {
    // A summary whose row order drifts cannot be diffed against last month.
    const row = [
      entry({ teamMemberId: 3, minuteCount: 100 }),
      entry({ teamMemberId: 1, minuteCount: 100 }),
      entry({ teamMemberId: 2, minuteCount: 100 }),
    ];
    const a = summarizeProjectTime(row);
    const b = summarizeProjectTime([...row].reverse());
    expect(a).toEqual(b);
    expect(a.byMember.map((m) => m.teamMemberId)).toEqual([1, 2, 3]);
  });

  it("handles an empty project without dividing by zero", () => {
    const summary = summarizeProjectTime([]);
    expect(summary).toMatchObject({
      totalMinuteCount: 0,
      workingDayEquivalent: 0,
      firstWorkedOn: null,
      lastWorkedOn: null,
      unattributedMinuteCount: 0,
    });
  });
});

// ─── Capacity ────────────────────────────────────────

describe("deriveCapacity", () => {
  it("counts distinct projects per person", () => {
    const capacity = deriveCapacity(
      [
        entry({ teamMemberId: 1, projectId: 10, minuteCount: 100 }),
        entry({ teamMemberId: 1, projectId: 11, minuteCount: 100 }),
        entry({ teamMemberId: 1, projectId: 10, minuteCount: 100 }),
      ],
      10,
    );
    expect(capacity[0].projectCount).toBe(2);
    expect(capacity[0].minuteCount).toBe(300);
  });

  it("computes a load ratio against WORKING days", () => {
    // 10 working days = 4800 minutes nominal. 4800 recorded = exactly 1.0.
    const capacity = deriveCapacity([entry({ minuteCount: 4800 })], 10);
    expect(capacity[0].loadRatio).toBe(1);
  });

  it("reports a ratio above 1 for someone genuinely over", () => {
    // The signal worth acting on: it cannot be produced by under-recording.
    const capacity = deriveCapacity([entry({ minuteCount: 7200 })], 10);
    expect(capacity[0].loadRatio).toBe(1.5);
  });

  it("never divides by zero on a zero-day window", () => {
    expect(() => deriveCapacity([entry()], 0)).not.toThrow();
    expect(deriveCapacity([entry({ minuteCount: 480 })], 0)[0].loadRatio).toBe(1);
  });

  it("returns an empty list rather than a row of zeroes when nobody logged anything", () => {
    expect(deriveCapacity([], 10)).toEqual([]);
  });

  it("uses an 8-hour nominal day", () => {
    expect(MINUTE_PER_WORKING_DAY).toBe(480);
    expect(MAX_MINUTE_PER_ENTRY).toBe(960);
  });
});

// ─── Money at risk ───────────────────────────────────

const risk = (over: Partial<ProjectRiskInput> = {}): ProjectRiskInput => ({
  projectId: 1,
  title: "Coffee Rush",
  clientId: 1,
  projectStatus: "development",
  totalValueCents: 6_000_000,
  hasSignedContract: true,
  invoicedCents: 6_000_000,
  overdueCents: 0,
  ...over,
});

describe("deriveProjectRisk", () => {
  it("flags an ACTIVE project with no signed contract — the Coffee Rush case", () => {
    const out = deriveProjectRisk([risk({ hasSignedContract: false })]);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toContain("unsigned_contract");
    // The WHOLE value is at risk: with no executed paper there is no revision cap, no
    // payment schedule and no sign-off trigger, so every peso of it is arguable.
    expect(out[0].exposureCents).toBe(6_000_000);
  });

  it("does NOT flag a shipped project with no contract — the work is done", () => {
    const out = deriveProjectRisk([risk({ projectStatus: "shipped", hasSignedContract: false })]);
    expect(out.map((o) => o.reason).flat()).not.toContain("unsigned_contract");
  });

  it("flags uninvoiced contract value", () => {
    const out = deriveProjectRisk([risk({ invoicedCents: 1_200_000 })]);
    expect(out[0].uninvoicedCents).toBe(4_800_000);
    expect(out[0].reason).toContain("uninvoiced_value");
  });

  it("never reports negative uninvoiced value when over-invoiced", () => {
    const out = deriveProjectRisk([risk({ invoicedCents: 9_000_000, overdueCents: 1 })]);
    expect(out[0].uninvoicedCents).toBe(0);
  });

  it("does NOT double-count an overdue invoice against uninvoiced value", () => {
    // An overdue invoice is already invoiced. Summing the two reports money twice, and a
    // dashboard that inflates exposure gets ignored as quickly as one that hides it.
    const out = deriveProjectRisk([
      risk({ invoicedCents: 3_000_000, overdueCents: 3_000_000 }),
    ]);
    expect(out[0].uninvoicedCents).toBe(3_000_000);
    expect(out[0].exposureCents).toBe(3_000_000);
  });

  it("flags an active project carrying no contract value at all", () => {
    const out = deriveProjectRisk([risk({ totalValueCents: 0, invoicedCents: 0 })]);
    expect(out[0].reason).toContain("no_contract_value");
  });

  it("omits a healthy project entirely rather than listing it as zero-risk", () => {
    expect(deriveProjectRisk([risk()])).toEqual([]);
  });

  it("sorts by exposure, largest first, deterministically", () => {
    const out = deriveProjectRisk([
      risk({ projectId: 1, overdueCents: 100 }),
      risk({ projectId: 2, overdueCents: 900 }),
      risk({ projectId: 3, overdueCents: 900 }),
    ]);
    expect(out.map((o) => o.projectId)).toEqual([2, 3, 1]);
  });
});

// ─── Revision burndown ───────────────────────────────

describe("deriveRevisionBudget", () => {
  const signoff = { projectSignoffId: 1, projectId: 1, freeRevisionTotalCount: 5 };

  it("counts used against the allowance", () => {
    const budget = deriveRevisionBudget(signoff, [
      { isPostSignoff: false, clientRespondedAt: new Date(), deemedApprovedAt: null },
      { isPostSignoff: false, clientRespondedAt: new Date(), deemedApprovedAt: null },
      { isPostSignoff: false, clientRespondedAt: null, deemedApprovedAt: null },
    ]);
    expect(budget).toMatchObject({ allowanceCount: 5, usedCount: 3, remainingCount: 2, isExhausted: false });
  });

  it("does NOT charge a post-sign-off round against the free five", () => {
    // The 6-month post-signature window is a separate entitlement in the contract.
    // Charging it against the pre-sign-off allowance quietly takes something paid for.
    const budget = deriveRevisionBudget(signoff, [
      { isPostSignoff: true, clientRespondedAt: null, deemedApprovedAt: null },
      { isPostSignoff: true, clientRespondedAt: null, deemedApprovedAt: null },
    ]);
    expect(budget.usedCount).toBe(0);
    expect(budget.remainingCount).toBe(5);
  });

  it("marks exhaustion at exactly the allowance, and never goes negative", () => {
    const six = Array.from({ length: 6 }, () => ({
      isPostSignoff: false,
      clientRespondedAt: new Date(),
      deemedApprovedAt: null,
    }));
    const budget = deriveRevisionBudget(signoff, six);
    expect(budget.usedCount).toBe(6);
    expect(budget.remainingCount).toBe(0);
    expect(budget.isExhausted).toBe(true);
  });

  it("counts rounds whose clock is still running", () => {
    const budget = deriveRevisionBudget(signoff, [
      { isPostSignoff: false, clientRespondedAt: null, deemedApprovedAt: null },
      { isPostSignoff: false, clientRespondedAt: new Date(), deemedApprovedAt: null },
      { isPostSignoff: false, clientRespondedAt: null, deemedApprovedAt: new Date() },
    ]);
    // Only the first is genuinely open — a deemed-approved round is closed.
    expect(budget.openCount).toBe(1);
  });

  it("handles a sign-off with no revisions yet", () => {
    expect(deriveRevisionBudget(signoff, [])).toMatchObject({
      usedCount: 0,
      remainingCount: 5,
      isExhausted: false,
      openCount: 0,
    });
  });
});

// ─── Client staleness ────────────────────────────────

describe("deriveStaleness", () => {
  const NOW = new Date("2026-09-02T00:00:00Z");

  it("counts whole days since the last contact", () => {
    const out = deriveStaleness(
      [{ clientId: 1, companyName: "Felici", lastContactAt: new Date("2026-08-19T00:00:00Z"), activeProjectCount: 1 }],
      STALE_THRESHOLD_DAY,
      NOW,
    );
    expect(out[0].dayCountSinceContact).toBe(14);
    expect(out[0].isStale).toBe(true);
  });

  it("is not stale just under the threshold", () => {
    const out = deriveStaleness(
      [{ clientId: 1, companyName: "Felici", lastContactAt: new Date("2026-08-20T00:00:00Z"), activeProjectCount: 1 }],
      STALE_THRESHOLD_DAY,
      NOW,
    );
    expect(out[0].dayCountSinceContact).toBe(13);
    expect(out[0].isStale).toBe(false);
  });

  it("reports NULL, not zero, when there has never been contact", () => {
    // Zero would read as "spoke to them today", which is the opposite of the truth.
    const out = deriveStaleness(
      [{ clientId: 1, companyName: "New", lastContactAt: null, activeProjectCount: 1 }],
      STALE_THRESHOLD_DAY,
      NOW,
    );
    expect(out[0].dayCountSinceContact).toBeNull();
    expect(out[0].isStale).toBe(true);
  });

  it("does not call a client with no active project stale", () => {
    const out = deriveStaleness(
      [{ clientId: 1, companyName: "Past", lastContactAt: null, activeProjectCount: 0 }],
      STALE_THRESHOLD_DAY,
      NOW,
    );
    expect(out[0].isStale).toBe(false);
  });

  it("sorts never-contacted FIRST — a null is the most alarming value, not the least", () => {
    const out = deriveStaleness(
      [
        { clientId: 1, companyName: "Old", lastContactAt: new Date("2026-01-01"), activeProjectCount: 1 },
        { clientId: 2, companyName: "Never", lastContactAt: null, activeProjectCount: 1 },
        { clientId: 3, companyName: "Recent", lastContactAt: new Date("2026-09-01"), activeProjectCount: 1 },
      ],
      STALE_THRESHOLD_DAY,
      NOW,
    );
    expect(out.map((o) => o.clientId)).toEqual([2, 1, 3]);
  });
});

// ─── Source-level invariants ─────────────────────────

describe("invariants, read from the source", () => {
  const timeSource = readSource("apps/api/src/services/time-entry.service.ts");
  const insightSource = readSource("apps/api/src/services/ops-insight.service.ts");
  const migration = readSource("apps/api/migrations/024_time_entry.sql");
  const route = readSource("apps/api/src/routes/insight.routes.ts");

  it("time is EFFORT, never cost — no rate column anywhere", () => {
    // The moment effort has a peso figure per person, a timesheet becomes a performance
    // review. ADVO bills fixed-price; an hourly model is one nobody agreed to.
    expect(readCode("apps/api/migrations/024_time_entry.sql")).not.toMatch(
      /rate_cents|hourly|cost_cents/,
    );
    expect(readCode("apps/api/src/services/time-entry.service.ts")).not.toMatch(
      /rateCents|hourlyRate|costCents/,
    );
    // The migration's prose must still SAY so — the absence is a decision, not an omission.
    expect(migration).toContain("NOT BILLING");
  });

  it("has no surveillance affordances", () => {
    expect(migration).toContain("NOT SURVEILLANCE");
    expect(readCode("apps/api/migrations/024_time_entry.sql")).not.toMatch(
      /is_billable|idle|screenshot/,
    );
  });

  it("the DB bounds an entry so a typo cannot become a 60x error", () => {
    expect(migration).toContain("chk_time_entry_minute");
    expect(migration).toContain("chk_time_entry_maximum");
    expect(migration).toMatch(/minute_count <= 960/);
  });

  it("a correction is an edit or a delete, never a negative anti-entry", () => {
    expect(migration).toMatch(/minute_count > 0/);
    expect(timeSource).toContain("never a negative entry");
  });

  it("refuses a deliverable that belongs to a different project", () => {
    // Silently accepting it attributes one client's effort to another's deliverable, and
    // every summary downstream is wrong in a way nobody can see.
    expect(timeSource).toContain("belongs to a different project");
  });

  it("refuses time logged against a future date", () => {
    expect(timeSource).toContain("Cannot log time against a future date");
  });

  it("024 self-registers in the schema ledger", () => {
    expect(migration).toMatch(/INSERT INTO schema_migration[\s\S]*024_time_entry\.sql/);
  });

  it("the risk read excludes recurring invoices from contract-value maths", () => {
    // 017 states the Total Fee "does not cover the ongoing costs". Counting a hosting
    // retainer against contract value makes every retained project look over-invoiced.
    expect(insightSource).toContain("i.recurring_fee_id IS NULL");
  });

  it("exposure is a MAX, not a SUM", () => {
    expect(insightSource).toContain("Deliberately a MAX, not a SUM");
  });

  it("emits no composite health score", () => {
    // A score compresses several facts into one number whose movement nobody can
    // explain, and the explanation is the useful part.
    expect(readCode("apps/api/src/services/ops-insight.service.ts")).not.toMatch(
      /healthScore|riskScore|grade/,
    );
    expect(insightSource).toContain("No scoring, no \"health grade\"");
  });

  it("the money-at-risk read is admin-only", () => {
    expect(route).toMatch(/get\("\/money-at-risk", requireAdmin/);
  });

  it("capacity is a measurement, and nothing enforces it", () => {
    expect(timeSource).toContain("MEASUREMENT, not a verdict");
    expect(timeSource).not.toMatch(/throw.*over ?capacity/i);
  });
});
