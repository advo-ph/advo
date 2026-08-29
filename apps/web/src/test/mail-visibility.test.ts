/**
 * Transactional mail must fail loudly.
 *
 * WHAT THIS PROTECTS. On 2026-08-29 prod was found with no mail transport configured at
 * all — neither RESEND_API_KEY nor SMTP_HOST. `email.service.ts` handled that by logging
 * at INFO and returning, so callers saw success and every magic link, team invite and lead
 * notification was silently dropped. `GET /api/health` reported `status: ok` throughout.
 * 37 "no transport" lines sat in the log. It was found by reading the prod .env for an
 * unrelated reason, which is not a detection strategy.
 *
 * The fix was visibility, not propagation: `send()` still must not throw, because a lead
 * POST failing over a bounced notification turns a delivery problem into a data-loss
 * problem. So these tests assert the two properties that make the failure findable —
 * every outcome is RECORDED, and an unconfigured transport is REPORTED by health without
 * waiting for a send to fail.
 *
 * Source-level assertions, in the shape of campaign.test.ts: the invariants live in one
 * file each and a regression is a rewrite of those lines, not a subtle runtime state.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

const emailService = readSource("apps/api/src/services/email.service.ts");
const healthRoute = readSource("apps/api/src/routes/health.routes.ts");

describe("Mail — a dropped email is recorded, not shrugged off", () => {
  it("does not log the no-transport case at info", () => {
    // The original line was `log.info(..., "Email (no transport, logged only)")`, which
    // reads as routine housekeeping. A dropped email is not housekeeping.
    expect(emailService).not.toMatch(/log\.info\([^)]*no transport/i);
  });

  it("logs the no-transport case as an error naming it as a drop", () => {
    expect(emailService).toMatch(/log\.error\([^)]*\)\s*,?\s*$|Email DROPPED/);
    expect(emailService).toContain("Email DROPPED");
  });

  it("records a failure when there is no transport, rather than returning silently", () => {
    const noTransportBlock = emailService.slice(
      emailService.indexOf("if (!t) {"),
      emailService.indexOf("try {", emailService.indexOf("if (!t) {")),
    );
    expect(noTransportBlock).toContain("recordFailure");
  });

  it("records a failure when sendMail throws", () => {
    // An unverified sending domain 403s here rather than at transport construction, so a
    // valid key on an unverified domain is indistinguishable from a working one until a
    // send is attempted. That path has to count.
    const catchBlock = emailService.slice(emailService.lastIndexOf("} catch (err) {"));
    expect(catchBlock).toContain("recordFailure");
  });

  it("clears the consecutive-failure counter only on an actual success", () => {
    expect(emailService).toMatch(/mailState\.consecutiveFailure = 0/);
    expect(emailService).toMatch(/mailState\.sentCount \+= 1/);
  });

  it("still does not throw out of send(), so a delivery problem cannot become data loss", () => {
    const sendBody = emailService.slice(
      emailService.indexOf("async function send("),
      emailService.indexOf("// ─── Templates"),
    );
    expect(sendBody).not.toMatch(/\bthrow\b/);
  });

  it("exposes presence and counts only — never a recipient or a key", () => {
    const healthFn = emailService.slice(
      emailService.indexOf("export function mailHealth()"),
      emailService.indexOf("function recordFailure"),
    );
    expect(healthFn).toContain("isTransportConfigured");
    expect(healthFn).not.toMatch(/RESEND_API_KEY|SMTP_PASS|\bto\b\s*:/);
  });
});

describe("Health — the outage would have been visible", () => {
  it("reports mail state on the health payload", () => {
    expect(healthRoute).toContain("mailHealth");
    expect(healthRoute).toMatch(/\bmail,/);
  });

  it("degrades on an unconfigured transport WITHOUT waiting for a send to fail", () => {
    // The whole point: prod sent nothing for an unknown period precisely because no send
    // was ever attempted successfully enough to fail loudly.
    expect(healthRoute).toContain("!mail.isTransportConfigured");
    expect(healthRoute).toMatch(/degradedReason\.push\(\s*"mail: no transport configured/);
  });

  it("degrades on consecutive send failures", () => {
    expect(healthRoute).toMatch(/mail\.consecutiveFailure > 0/);
  });

  it("keeps `status` as the API's own liveness, not mail's", () => {
    // A mail outage must not page the uptime monitor at 3am; it rides in isDegraded.
    expect(healthRoute).toMatch(/status:\s*isDbOk \? "ok" : "degraded"/);
  });

  it("carries the transport flag in the config block beside the other presence booleans", () => {
    expect(healthRoute).toContain("isEmailTransportConfigured");
  });
});
