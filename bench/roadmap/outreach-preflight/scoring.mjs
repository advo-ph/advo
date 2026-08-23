#!/usr/bin/env node
/**
 * Outreach preflight — authored 2026-08-23, RED at authoring.
 *
 * The campaign sender is complete (17/17 bench) and has never sent anything.
 * From the 2026-08-18 HANDOFF: "No outreach transport is configured anywhere,
 * including prod. The lane shipped the mechanism, not the clearance."
 *
 * The clearance is DNS: an outreach subdomain with its own SPF, DKIM and DMARC.
 * Sending before those resolve is how a domain gets blocked on its first
 * campaign, and the domain at stake is the one advo.ph sends client mail from.
 *
 * `isOutreachConfigured()` today only checks that SMTP env vars are present. A
 * host and a password prove nothing about whether the receiving world will
 * accept the mail. This lane makes the preflight answer the real question, and
 * makes a failed preflight refuse the send.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const files = {
  preflight: read("scripts/outreach-preflight.mjs"),
  email: read("apps/api/src/services/email.service.ts"),
  pkg: read("package.json"),
};

const checks = [
  {
    id: "preflight-exists",
    title: "A preflight script exists and is registered",
    passed:
      files.preflight.length > 0 && /outreach:preflight|outreach-preflight/.test(files.pkg),
    expected:
      "scripts/outreach-preflight.mjs, reachable as an npm script, so it can gate a send and a human can run it the same way.",
  },
  {
    id: "checks-spf",
    title: "Preflight resolves SPF for the outreach domain",
    passed: /\bspf\b/i.test(files.preflight) && /resolveTxt|dns/i.test(files.preflight),
    expected:
      "It performs a real TXT lookup for v=spf1 on the outreach domain — not a config-presence check.",
  },
  {
    id: "checks-dkim",
    title: "Preflight resolves DKIM for the configured selector",
    passed: /dkim/i.test(files.preflight) && /selector/i.test(files.preflight),
    expected:
      "DKIM is selector-scoped, so the check needs the selector the ESP issued; a bare domain lookup cannot find the key.",
  },
  {
    id: "checks-dmarc",
    title: "Preflight resolves DMARC and reads its policy",
    passed: /_dmarc/i.test(files.preflight) && /p=(none|quarantine|reject)|policy/i.test(files.preflight),
    expected:
      "_dmarc.<domain> TXT is fetched and its p= policy surfaced. p=none publishes but enforces nothing — the operator should see which they have.",
  },
  {
    id: "separate-from-transactional",
    title: "Preflight refuses an outreach domain that equals the transactional one",
    passed: /transactional|same domain|MAIL_FROM|distinct/i.test(files.preflight),
    expected:
      "Outreach must not borrow the domain that carries client magic-links. If the two resolve to the same domain the preflight fails loudly — a blocked outreach domain would take login mail down with it.",
  },
  {
    id: "exits-nonzero-on-failure",
    title: "A failed preflight fails the command",
    passed: /process\.exit\(\s*1\s*\)|exitCode\s*=\s*1/.test(files.preflight),
    expected: "Non-zero exit on any missing or malformed record, so it can gate rather than inform.",
  },
  {
    id: "send-is-gated-on-preflight",
    title: "The sender refuses to send when the domain is not cleared",
    passed:
      /preflight|isOutreachDnsVerified|dnsVerified/i.test(files.email),
    expected:
      "isOutreachConfigured() (or its caller) consults the DNS verification, not just the presence of SMTP env vars. Env vars present + DNS absent is exactly the state that burns a domain.",
  },
  {
    id: "result-is-recorded",
    title: "The preflight result is written down, not just printed",
    passed: /writeFile|docs\/|\.json/i.test(files.preflight),
    expected:
      "It records the verified records and the timestamp to a committed artifact, so 'is the domain cleared?' has an answer after the terminal closes.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "outreach-preflight",
  date: "2026-08-23",
  passed,
  counts: {
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    total: checks.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(passed ? 0 : 1);
