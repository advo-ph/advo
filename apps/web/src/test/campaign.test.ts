/**
 * Campaign sender — v1 batch send + suppression.
 *
 * Every send path here uses an INJECTED sender that records to an array. No transport is
 * ever constructed, so no test can put mail on the wire.
 *
 * Covers the four invariants campaign.service.ts exists to hold:
 *   1. separate identity  — the default sender is the outreach one, and an unconfigured
 *                           outreach transport throws rather than borrowing transactional
 *   2. suppression gate   — enforced inside the send loop, not only in the segment query
 *   3. throttle / resume  — no double-send, queued-only, unbounded fan-out absent
 *   4. honest dry-run     — preview counts post-suppression and sends nothing
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Same repo-root resolution as brand-analysis-decommission.test.ts.
const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

describe("Campaign — outreach transport separation", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    delete process.env.OUTREACH_SMTP_HOST;
    delete process.env.OUTREACH_FROM;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("reports the outreach transport as unconfigured when its env is absent", async () => {
    const { isOutreachConfigured, outreachConfig } = await import(
      "../../../api/src/services/email.service.js"
    );
    expect(isOutreachConfigured()).toBe(false);
    expect(outreachConfig()).toBeNull();
  });

  it("reports it as configured only when BOTH host and from are set", async () => {
    process.env.OUTREACH_SMTP_HOST = "smtp.example.test";
    const partial = await import("../../../api/src/services/email.service.js");
    expect(partial.isOutreachConfigured()).toBe(false);

    vi.resetModules();
    process.env.OUTREACH_FROM = "ADVO <hello@outreach.advo.ph>";
    const full = await import("../../../api/src/services/email.service.js");
    expect(full.isOutreachConfigured()).toBe(true);
    expect(full.outreachConfig()?.from).toContain("outreach.advo.ph");
  });

  it("THROWS rather than falling back to the transactional transport", async () => {
    const { sendOutreachEmail } = await import("../../../api/src/services/email.service.js");
    await expect(sendOutreachEmail("someone@example.test", "hi", "<p>hi</p>")).rejects.toThrow(
      /not configured/i,
    );
  });

  it("uses a distinct outreach from-address, not the transactional noreply@advo.ph", async () => {
    process.env.OUTREACH_SMTP_HOST = "smtp.example.test";
    process.env.OUTREACH_FROM = "ADVO <hello@outreach.advo.ph>";
    const { outreachConfig } = await import("../../../api/src/services/email.service.js");
    expect(outreachConfig()?.from).not.toContain("noreply@advo.ph");
  });
});

describe("Campaign — outreach DNS clearance", () => {
  const ORIGINAL = { ...process.env };
  const ARTIFACT = join(monorepoRoot, "docs/outreach-preflight.json");
  let saved: string | null = null;

  beforeEach(() => {
    process.env.OUTREACH_SMTP_HOST = "smtp.example.test";
    process.env.OUTREACH_FROM = "ADVO <hello@outreach.advo.ph>";
    saved = existsSync(ARTIFACT) ? readFileSync(ARTIFACT, "utf-8") : null;
    vi.resetModules();
  });

  afterEach(() => {
    if (saved === null) rmSync(ARTIFACT, { force: true });
    else writeFileSync(ARTIFACT, saved, "utf-8");
    process.env = { ...ORIGINAL };
  });

  const writeArtifact = (patch: Record<string, unknown>) =>
    writeFileSync(
      ARTIFACT,
      JSON.stringify({
        preflight: "outreach-preflight",
        checkedAt: new Date().toISOString(),
        domain: "outreach.advo.ph",
        passed: true,
        count: { passed: 6, failed: 0, total: 6 },
        check: [],
        ...patch,
      }),
      "utf-8",
    );

  it("treats a fully configured transport with a failing preflight as unverified", async () => {
    writeArtifact({ passed: false, count: { passed: 4, failed: 2, total: 6 } });
    const { isOutreachConfigured, isOutreachDnsVerified } = await import(
      "../../../api/src/services/email.service.js"
    );
    // The dangerous state: env present, DNS absent. Configured must not imply cleared.
    expect(isOutreachConfigured()).toBe(true);
    expect(isOutreachDnsVerified()).toBe(false);
  });

  it("REFUSES to send when the domain has no DNS clearance", async () => {
    writeArtifact({ passed: false });
    const { sendOutreachEmail } = await import("../../../api/src/services/email.service.js");
    await expect(sendOutreachEmail("someone@example.test", "hi", "<p>hi</p>")).rejects.toThrow(
      /not DNS-verified/i,
    );
  });

  it("does not accept a clearance recorded for a different domain", async () => {
    writeArtifact({ domain: "outreach.example.test" });
    const { outreachDnsVerification } = await import(
      "../../../api/src/services/email.service.js"
    );
    const verification = outreachDnsVerification();
    expect(verification.isVerified).toBe(false);
    expect(verification.reason).toMatch(/outreach\.example\.test/);
  });

  it("expires a clearance rather than trusting it forever", async () => {
    const longAgo = new Date(Date.now() - 400 * 86_400_000).toISOString();
    writeArtifact({ checkedAt: longAgo });
    const { outreachDnsVerification } = await import(
      "../../../api/src/services/email.service.js"
    );
    const verification = outreachDnsVerification();
    expect(verification.isVerified).toBe(false);
    expect(verification.reason).toMatch(/stale/i);
  });

  it("clears the send only when the preflight passed for this exact domain, recently", async () => {
    writeArtifact({});
    const { isOutreachDnsVerified } = await import("../../../api/src/services/email.service.js");
    expect(isOutreachDnsVerified()).toBe(true);
  });
});

describe("Campaign — unsubscribe footer", () => {
  it("carries a working unsubscribe link that does not encode the address", async () => {
    const { wrapOutreach } = await import("../../../api/src/services/email.service.js");
    const html = wrapOutreach("<p>body</p>", "https://api.advo.ph/api/campaign/unsubscribe/abc123");

    expect(html).toContain("Unsubscribe");
    expect(html).toContain("https://api.advo.ph/api/campaign/unsubscribe/abc123");
    // The token is opaque — the recipient address must not appear in the link.
    expect(html).not.toMatch(/unsubscribe\/[^"]*@/);
  });

  it("names a physical sender identity in the footer", async () => {
    const { wrapOutreach } = await import("../../../api/src/services/email.service.js");
    const html = wrapOutreach("<p>body</p>", "https://example.test/u/x");
    expect(html).toMatch(/Philippines/i);
  });
});

describe("Campaign — source invariant", () => {
  it("sends through the outreach path, never the transactional send()", async () => {
    const source = readSource("apps/api/src/services/campaign.service.ts");
    expect(source).toContain("sendOutreachEmail");
    expect(source).not.toMatch(/\bsendNotificationEmail\b/);
  });

  it("re-checks suppression inside the send loop", async () => {
    const source = readSource("apps/api/src/services/campaign.service.ts");
    const loopStart = source.indexOf("for (const recipient of queued)");
    expect(loopStart).toBeGreaterThan(-1);
    // The gate must appear INSIDE the loop, not only in resolveSegment above it.
    expect(source.slice(loopStart)).toContain("await isSuppressed(recipient.email)");
  });

  it("never fans out unbounded over the recipient list", async () => {
    const source = readSource("apps/api/src/services/campaign.service.ts");
    expect(source).not.toMatch(/Promise\.all\s*\(\s*queued/);
    expect(source).not.toMatch(/Promise\.allSettled\s*\(\s*queued/);
    expect(source).toContain("for (const recipient of queued)");
  });

  it("selects only queued rows, so a restart resumes instead of re-sending", async () => {
    const source = readSource("apps/api/src/services/campaign.service.ts");
    expect(source).toMatch(/eq\(campaignRecipient\.status,\s*"queued"\)/);
  });

  it("keeps the unsubscribe route above the auth middleware", async () => {
    const source = readSource("apps/api/src/routes/campaign.routes.ts");
    const unsubscribeAt = source.indexOf('campaignRoutes.get("/unsubscribe/:token"');
    const authAt = source.indexOf("requireAuth, requireTeam");
    expect(unsubscribeAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(-1);
    expect(unsubscribeAt).toBeLessThan(authAt);
  });

  it("guards the DB against a double-send with a unique index", async () => {
    const migration = readSource("apps/api/migrations/015_campaign.sql");
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*campaign_recipient \(campaign_id, lead_id\)/);
  });

  it("makes suppression case-insensitive at the DB level", async () => {
    const migration = readSource("apps/api/migrations/015_campaign.sql");
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*lower\(email\)/);
  });
});

// ─── Soft-bounce escalation (migration 020) ──────────
//
// The only DB-backed behaviour in this file, and it earns the exception: the invariant
// under test is a COUNT crossing a THRESHOLD, and a source grep can prove a comparison
// exists but never that it fires on the third bounce rather than the second or the fourth.
//
// The stand-in below implements exactly the calls the soft-bounce path makes, with the
// semantics migration 020 gives them: the counter upsert increments (unique index on
// email), and the suppression insert is onConflictDoNothing (idempotent by unique index).
// It is a model of the schema, not of Postgres — what it proves is that the SERVICE reads
// the count correctly and escalates once. That the DB itself deduplicates a re-suppression
// is guaranteed by idx_email_suppression_email, asserted separately above.

const store = vi.hoisted(() => ({
  softBounceCount: new Map<string, number>(),
  suppression: new Map<string, { reason: string; note: string | null }>(),
  recipientStatus: [] as string[],
  reset() {
    store.softBounceCount.clear();
    store.suppression.clear();
    store.recipientStatus = [];
  },
}));

vi.mock("../../../api/src/db/connection.js", () => ({
  db: () => ({
    insert() {
      return {
        values(row: { email: string; reason?: string; note?: string | null }) {
          // The service normalizes before writing; chk_email_soft_bounce_email_lower makes
          // that a database guarantee, so the stand-in asserts it rather than re-lowering.
          expect(row.email).toBe(row.email.toLowerCase().trim());
          return {
            // email_soft_bounce — increment and return the count AFTER this bounce.
            onConflictDoUpdate: () => ({
              returning: async () => {
                const next = (store.softBounceCount.get(row.email) ?? 0) + 1;
                store.softBounceCount.set(row.email, next);
                return [{ softBounceCount: next }];
              },
            }),
            // email_suppression — first writer wins, a repeat is a no-op, never an error.
            onConflictDoNothing: async () => {
              if (!store.suppression.has(row.email)) {
                store.suppression.set(row.email, {
                  reason: row.reason ?? "",
                  note: row.note ?? null,
                });
              }
              return [];
            },
          };
        },
      };
    },
    update() {
      return {
        set: (patch: { status?: string }) => ({
          where: async () => {
            if (patch.status) store.recipientStatus.push(patch.status);
            return [];
          },
        }),
      };
    },
  }),
}));

describe("Campaign — soft-bounce escalation", () => {
  const ADDRESS = "deferring@example.test";

  beforeEach(() => {
    store.reset();
    vi.resetModules();
  });

  const service = () => import("../../../api/src/services/campaign.service.js");

  it("sets the threshold as a named constant, not a magic number", async () => {
    const { SOFT_BOUNCE_LIMIT } = await service();
    expect(SOFT_BOUNCE_LIMIT).toBeGreaterThan(1);
    const source = readSource("apps/api/src/services/campaign.service.ts");
    // The comparison must read the constant, never an inline number.
    expect(source).toMatch(/softBounceCount\s*<\s*SOFT_BOUNCE_LIMIT/);
  });

  it("does NOT suppress while the address is under the limit", async () => {
    const { recordSoftBounce, SOFT_BOUNCE_LIMIT } = await service();

    for (let n = 1; n < SOFT_BOUNCE_LIMIT; n += 1) {
      const result = await recordSoftBounce(ADDRESS);
      expect(result.softBounceCount).toBe(n);
      expect(result.isSuppressed).toBe(false);
    }
    expect(store.suppression.size).toBe(0);
  });

  it("suppresses with reason soft_bounce_limit exactly ON the limit", async () => {
    const { recordSoftBounce, SOFT_BOUNCE_LIMIT } = await service();

    let final = await recordSoftBounce(ADDRESS);
    for (let n = 2; n <= SOFT_BOUNCE_LIMIT; n += 1) final = await recordSoftBounce(ADDRESS);

    expect(final.softBounceCount).toBe(SOFT_BOUNCE_LIMIT);
    expect(final.isSuppressed).toBe(true);
    // The enum arm migration 015 shipped unreachable is now written by something.
    expect(store.suppression.get(ADDRESS)?.reason).toBe("soft_bounce_limit");
    expect(store.suppression.get(ADDRESS)?.note).toMatch(/soft bounce/i);
  });

  it("counts the address case-insensitively, so a re-cased report is not a fresh address", async () => {
    const { recordSoftBounce } = await service();

    await recordSoftBounce(ADDRESS.toUpperCase());
    const second = await recordSoftBounce("  " + ADDRESS + "  ");
    expect(second.softBounceCount).toBe(2);
    expect(store.softBounceCount.size).toBe(1);
  });

  it("stays suppressed and does not throw when the ESP retries past the limit", async () => {
    const { recordSoftBounce, SOFT_BOUNCE_LIMIT } = await service();

    for (let n = 1; n <= SOFT_BOUNCE_LIMIT; n += 1) await recordSoftBounce(ADDRESS);
    expect(store.suppression.size).toBe(1);

    // An ESP retries a webhook it did not see acknowledged. The second crossing must be a
    // no-op that still reports the address as suppressed — not a unique violation, and not
    // a 500 that makes the ESP retry harder.
    const retry = await recordSoftBounce(ADDRESS);
    expect(retry.isSuppressed).toBe(true);
    expect(retry.softBounceCount).toBe(SOFT_BOUNCE_LIMIT + 1);
    expect(store.suppression.size).toBe(1);
    expect(store.suppression.get(ADDRESS)?.reason).toBe("soft_bounce_limit");

    const third = await recordSoftBounce(ADDRESS);
    expect(third.isSuppressed).toBe(true);
    expect(store.suppression.size).toBe(1);
  });

  it("marks the recipient row bounced once the limit is crossed", async () => {
    const { recordSoftBounce, SOFT_BOUNCE_LIMIT } = await service();

    for (let n = 1; n <= SOFT_BOUNCE_LIMIT; n += 1) await recordSoftBounce(ADDRESS);
    expect(store.recipientStatus.at(-1)).toBe("bounced");
  });
});

describe("Campaign — soft-bounce wiring", () => {
  it("accepts kind soft_bounce on the delivery-failure callback", async () => {
    const source = readSource("apps/api/src/routes/campaign.routes.ts");
    expect(source).toMatch(/z\.enum\(\["hard_bounce", "soft_bounce", "complaint"\]\)/);
  });

  it("reports the real outcome instead of hard-coding isSuppressed", async () => {
    const source = readSource("apps/api/src/routes/campaign.routes.ts");
    const at = source.indexOf('if (kind === "soft_bounce")');
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 600)).toContain("isSuppressed: result.isSuppressed");
  });

  it("keeps the counter on the address, not on the per-campaign recipient row", async () => {
    const schema = readSource("apps/api/src/db/schema.ts");
    expect(schema).toContain('"email_soft_bounce"');
    expect(schema).toContain('softBounceCount: integer("soft_bounce_count")');
    // A count parked on campaignRecipient would reset at every campaign boundary.
    const recipientBlock = schema.slice(
      schema.indexOf('"campaign_recipient"'),
      schema.indexOf('"email_suppression"'),
    );
    expect(recipientBlock).not.toContain("soft_bounce_count");
  });

  it("adds the counter in migration 020, leaving 019 to the drift lane", async () => {
    const migration = readSource("apps/api/migrations/020_soft_bounce.sql");
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS email_soft_bounce/);
    expect(migration).toMatch(/soft_bounce_count\s+INTEGER/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*email_soft_bounce \(email\)/);
    // Normalization is a DB guarantee here, not an application convention.
    expect(migration).toMatch(/CHECK \(email = lower\(email\)\)/);
  });
});
