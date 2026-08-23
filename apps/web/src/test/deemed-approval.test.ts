/**
 * Deemed approval — CONTRACTS.md Policy 3, migration 021.
 *
 * The mechanism that makes the 5-round revision allowance finite in practice. It is the
 * commercial defence against a client who simply never signs off, and it has one fragile
 * property that everything here is built around:
 *
 *     "The notice in step 2 is mandatory and must be issued formally and in writing.
 *      Deemed approval does not trigger without it — skipping the notice forfeits the
 *      whole mechanism."
 *
 * So the tests that matter most are not the happy path. They are:
 *   - the notice cannot be skipped (forfeiture), enforced in BOTH the service and the DB
 *   - a notice with no evidence is not a notice
 *   - a client who answered can never be deemed to have stayed silent
 *   - nothing derives deemed approval into existence; a human records it
 *   - the business-day maths errs EARLY, never late, and says so
 *
 * Stubbed and offline, matching signoff.test.ts: pure helpers exercised directly, and the
 * invariants that only exist as SQL or as a code shape asserted by reading the source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { addBusinessDay, deriveDeemed } from "../../../api/src/services/project-signoff.service";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) =>
  readFileSync(join(monorepoRoot, path), "utf-8").replace(/\r\n/g, "\n");

const migration = readSource("apps/api/migrations/021_deemed_approval.sql");
const service = readSource("apps/api/src/services/project-signoff.service.ts");
const route = readSource("apps/api/src/routes/project-signoff.routes.ts");

/** Window config as it sits on the sign-off row. 15 + 15 is the sent contract. */
const window = { feedbackWindowBusinessDayCount: 15, noticeWindowBusinessDayCount: 15 };

/** A revision round shaped like the DB row. */
const round = (over: Partial<Parameters<typeof deriveDeemed>[0]> = {}) => ({
  reviewDeliveredOn: null as string | null,
  clientRespondedAt: null as Date | null,
  noticeIssuedAt: null as Date | null,
  deemedApprovedAt: null as Date | null,
  ...over,
});

const at = (iso: string) => new Date(iso);

describe("business-day arithmetic", () => {
  it("counts weekdays and skips weekends", () => {
    // Fri 2026-08-21 + 1 business day = Mon 2026-08-24, not Sat the 22nd.
    expect(addBusinessDay(at("2026-08-21T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe(
      "2026-08-24",
    );
  });

  it("never lands on a Saturday or Sunday", () => {
    for (let n = 1; n <= 40; n++) {
      const day = addBusinessDay(at("2026-08-03T00:00:00Z"), n).getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    }
  });

  it("15 business days from a Monday is three weeks later", () => {
    // Mon 2026-08-03 + 15 business days = Mon 2026-08-24. Exactly three working weeks.
    expect(addBusinessDay(at("2026-08-03T00:00:00Z"), 15).toISOString().slice(0, 10)).toBe(
      "2026-08-24",
    );
  });

  it("treats zero and negative counts as no movement", () => {
    const from = at("2026-08-03T00:00:00Z");
    expect(addBusinessDay(from, 0).toISOString()).toBe(from.toISOString());
    expect(addBusinessDay(from, -5).toISOString()).toBe(from.toISOString());
  });

  it("documents that PH holidays are NOT subtracted, and that this errs early", () => {
    // The direction of the error is the safety property: an early date can only make ADVO
    // claim deemed approval too soon, which forfeits it. This must stay written down.
    expect(service).toMatch(/HOLIDAYS ARE NOT SUBTRACTED/i);
    expect(service).toMatch(/EARLIER than or equal to the true contractual deadline/i);
  });
});

describe("clock 1 — the feedback window", () => {
  it("does not run at all without a delivery date", () => {
    const d = deriveDeemed(round(), window, at("2027-01-01T00:00:00Z"));
    expect(d.stage).toBe("no_clock");
    expect(d.noticeEligibleOn).toBeNull();
    expect(d.isNoticeRequired).toBe(false);
  });

  it("is awaiting feedback while the window is open", () => {
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03" }),
      window,
      at("2026-08-10T00:00:00Z"),
    );
    expect(d.stage).toBe("awaiting_feedback");
    expect(d.isNoticeRequired).toBe(false);
  });

  it("turns the notice due once the window elapses", () => {
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03" }),
      window,
      at("2026-08-24T00:00:00Z"),
    );
    expect(d.stage).toBe("notice_due");
    expect(d.isNoticeRequired).toBe(true);
    expect(d.noticeEligibleOn?.slice(0, 10)).toBe("2026-08-24");
  });
});

describe("clock 2 — after the notice", () => {
  it("waits out the second window before anything is approvable", () => {
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03", noticeIssuedAt: at("2026-08-24T00:00:00Z") }),
      window,
      at("2026-09-01T00:00:00Z"),
    );
    expect(d.stage).toBe("awaiting_notice_response");
  });

  it("becomes approvable only after the second window elapses", () => {
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03", noticeIssuedAt: at("2026-08-24T00:00:00Z") }),
      window,
      at("2026-09-14T00:00:00Z"),
    );
    expect(d.stage).toBe("deemed_approvable");
    expect(d.deemedEligibleOn?.slice(0, 10)).toBe("2026-09-14");
  });

  it("honours per-signoff window counts rather than hard-coding 15", () => {
    // The sent contract has a known 10-vs-15 inconsistency; an older project must keep the
    // terms it was actually sold, so the counts are data.
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03" }),
      { feedbackWindowBusinessDayCount: 5, noticeWindowBusinessDayCount: 5 },
      at("2026-08-10T00:00:00Z"),
    );
    expect(d.stage).toBe("notice_due");
    expect(d.noticeEligibleOn?.slice(0, 10)).toBe("2026-08-10");
  });
});

describe("the forfeiture rule — silence is not enough", () => {
  it("never reaches deemed_approvable without a notice, however long the silence", () => {
    // Two years of silence. Still not approvable, because no notice was issued.
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03" }),
      window,
      at("2028-08-03T00:00:00Z"),
    );
    expect(d.stage).toBe("notice_due");
    expect(d.stage).not.toBe("deemed_approvable");
  });

  it("refuses in the service with the reason, not just a constraint name", () => {
    expect(service).toMatch(/No Notice of Pending Deemed Approval was issued/);
    expect(service).toMatch(/forfeit/i);
  });

  it("is enforced by the database too, not only by the service", () => {
    expect(migration).toMatch(/chk_signoff_revision_deemed_requires_notice/);
    expect(migration).toMatch(
      /CHECK\s*\(deemed_approved_at IS NULL OR notice_issued_at IS NOT NULL\)/,
    );
  });
});

describe("a notice must be producible", () => {
  it("requires evidence alongside the timestamp, in the DB", () => {
    expect(migration).toMatch(/chk_signoff_revision_notice_evidenced/);
    // Both halves or neither — a timestamp with no reference is a tick-box, not a notice.
    expect(migration).toMatch(/notice_issued_at IS NOT NULL AND notice_reference IS NOT NULL/);
  });

  it("rejects a blank reference rather than storing whitespace", () => {
    expect(migration).toMatch(/length\(btrim\(notice_reference\)\)\s*>\s*0/);
    expect(route).toMatch(/A reference is required/);
  });
});

describe("a client who answered", () => {
  it("stops the clock permanently", () => {
    const d = deriveDeemed(
      round({
        reviewDeliveredOn: "2026-08-03",
        noticeIssuedAt: at("2026-08-24T00:00:00Z"),
        clientRespondedAt: at("2026-08-25T00:00:00Z"),
      }),
      window,
      at("2027-01-01T00:00:00Z"),
    );
    expect(d.stage).toBe("responded");
    expect(d.isNoticeRequired).toBe(false);
  });

  it("cannot also be deemed approved — enforced in the DB", () => {
    expect(migration).toMatch(/chk_signoff_revision_deemed_excludes_response/);
  });

  it("outranks a running clock in the derivation", () => {
    // Ordering matters: response is checked before the elapsed-window maths, so a late
    // read can never reclassify an answered round as approvable.
    const d = deriveDeemed(
      round({
        reviewDeliveredOn: "2026-08-03",
        noticeIssuedAt: at("2026-08-24T00:00:00Z"),
        clientRespondedAt: at("2026-08-25T00:00:00Z"),
      }),
      window,
      at("2030-01-01T00:00:00Z"),
    );
    expect(d.stage).toBe("responded");
  });
});

describe("recorded, never triggered", () => {
  it("reports a recorded approval as terminal", () => {
    const d = deriveDeemed(
      round({
        reviewDeliveredOn: "2026-08-03",
        noticeIssuedAt: at("2026-08-24T00:00:00Z"),
        deemedApprovedAt: at("2026-09-14T00:00:00Z"),
      }),
      window,
      at("2026-09-20T00:00:00Z"),
    );
    expect(d.stage).toBe("deemed_approved");
  });

  it("names the human who asserted it", () => {
    expect(migration).toMatch(/deemed_approved_by/);
    expect(service).toMatch(/deemedApprovedBy: userId/);
  });

  it("has no scheduler, cron, or job writing these rows", () => {
    // The derivation is advisory. If anything ever automates this, the mechanism becomes
    // legally worthless and this test is the tripwire.
    expect(service).toMatch(/never by a job|A HUMAN act|never derives/i);
    expect(service).not.toMatch(/setInterval\([^)]*deemed/i);
  });

  it("marks every derived date as the earliest, not the authoritative one", () => {
    const d = deriveDeemed(
      round({ reviewDeliveredOn: "2026-08-03" }),
      window,
      at("2026-08-24T00:00:00Z"),
    );
    expect(d.isEarliest).toBe(true);
  });
});

describe("route surface", () => {
  it("keeps all four acts on the team side, and deemed approval on admin", () => {
    expect(route).toMatch(/revision\/:revisionId\/delivery/);
    expect(route).toMatch(/revision\/:revisionId\/response/);
    expect(route).toMatch(/revision\/:revisionId\/notice/);
    expect(route).toMatch(/revision\/:revisionId\/deemed/);
    // The one that asserts a position against a client is admin-gated.
    expect(route).toMatch(/revision\/:revisionId\/deemed",\s*requireAdmin/);
  });

  it("takes a date, not an instant, for the delivery", () => {
    expect(route).toMatch(/deliveredOn must be YYYY-MM-DD/);
  });
});

describe("nothing derived is stored", () => {
  it("adds no deadline columns to the schema", () => {
    // Deadlines are recomputed on every read; a stored one can silently disagree with the
    // policy after someone edits the window counts.
    expect(migration).not.toMatch(/notice_eligible_on|deemed_eligible_on/);
  });

  it("keeps the window counts on the sign-off, where they are auditable", () => {
    expect(migration).toMatch(/feedback_window_business_day_count/);
    expect(migration).toMatch(/notice_window_business_day_count/);
  });
});
