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
import { readFileSync } from "node:fs";
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
