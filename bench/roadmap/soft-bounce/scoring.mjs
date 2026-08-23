#!/usr/bin/env node
/**
 * Soft-bounce escalation — authored 2026-08-23, RED at authoring.
 *
 * Two HANDOFF open-items from the 2026-08-18 campaign entry, both still true:
 *
 *   "Bounce/complaint arrives via POST /api/campaign/delivery-failure; no ESP
 *    webhook is wired to it yet, so suppression from bounces is manual until
 *    that is connected."
 *   "Soft-bounce escalation is modelled in the enum (soft_bounce_limit) but no
 *    counter increments it yet."
 *
 * Verified in the source: `soft_bounce_limit` appears only as an enum value in
 * schema.ts and a union member in campaign.service.ts. The route accepts only
 * `hard_bounce | complaint`. Nothing can ever produce a soft_bounce_limit
 * suppression, so that enum arm is dead.
 *
 * This matters before the first send, not after: repeated soft bounces against
 * a warming domain are exactly what gets a sender blocked, and the campaign
 * sender is otherwise complete and waiting on transport clearance.
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
  service: read("apps/api/src/services/campaign.service.ts"),
  route: read("apps/api/src/routes/campaign.routes.ts"),
  schema: read("apps/api/src/db/schema.ts"),
  migration: read("apps/api/migrations/020_soft_bounce.sql"),
  test: read("apps/web/src/test/campaign.test.ts"),
};

const checks = [
  {
    id: "soft-bounce-accepted",
    title: "The delivery-failure callback accepts a soft bounce",
    passed: /"soft_bounce"/.test(files.route),
    expected:
      'POST /api/campaign/delivery-failure accepts kind "soft_bounce" alongside hard_bounce and complaint. Today the zod enum rejects it, so an ESP reporting a soft bounce gets a 400.',
  },
  {
    id: "soft-bounce-counted",
    title: "A soft bounce increments a per-address counter",
    passed:
      /soft_bounce_count|softBounceCount/.test(files.schema) &&
      /soft_bounce_count|softBounceCount/.test(files.service),
    expected:
      "A per-address soft-bounce counter is persisted and incremented by the service. Counting per recipient row would reset every campaign, which is why the count belongs to the address.",
  },
  {
    id: "soft-bounce-migration",
    title: "The counter has its own migration at the assigned number",
    passed:
      files.migration.length > 0 &&
      /soft_bounce_count/i.test(files.migration),
    expected:
      "apps/api/migrations/020_soft_bounce.sql adds the counter. 020 is this lane's assigned number — do not take 019, the drift lane owns it.",
  },
  {
    id: "escalation-threshold-explicit",
    title: "The escalation threshold is a named constant, not a magic number",
    passed: /SOFT_BOUNCE_LIMIT|softBounceLimit/.test(files.service),
    expected:
      "The threshold is a named, single-source constant in campaign.service.ts so the policy is legible and testable.",
  },
  {
    id: "escalation-suppresses",
    title: "Crossing the threshold produces a soft_bounce_limit suppression",
    passed:
      // The literal already appears ONCE in the reason union of suppress()'s
      // own signature. Matching the literal — or `suppress(...)` spanning that
      // signature — reads the type declaration as a call site and goes green
      // against untouched code. A real call site is a SECOND occurrence.
      (files.service.match(/"soft_bounce_limit"/g) ?? []).length > 1,
    expected:
      'Reaching the limit calls suppress(email, "soft_bounce_limit", …). Today the literal occurs exactly once — in the reason union — so that enum arm is unreachable.',
  },
  {
    id: "escalation-is-idempotent",
    title: "A repeated soft bounce past the limit does not error or double-suppress",
    passed:
      /soft.?bounce/i.test(files.test) &&
      /(twice|again|second time|re-?suppress|idempotent)/i.test(files.test),
    expected:
      "A test drives the limit-crossing path twice and asserts the address stays suppressed without throwing. suppress() is documented idempotent, but an ESP retries and nothing currently proves the soft path relies on that.",
  },
  {
    id: "soft-bounce-tested",
    title: "The escalation is covered by a test, not by reasoning",
    passed:
      /soft.?bounce/i.test(files.test) &&
      /(limit|threshold|escalat)/i.test(files.test),
    expected:
      "campaign.test.ts covers: under the limit does not suppress, crossing it does, and crossing it twice stays suppressed without throwing.",
  },
  {
    id: "suppression-still-a-gate",
    title: "The existing pre-send suppression gate is untouched",
    passed:
      /suppressionSet/.test(files.service) &&
      /re-?checked|inside the send loop|immediately before/i.test(files.service),
    expected:
      "The v1 guarantee — suppression re-checked inside the send loop immediately before each send — must survive this change. Do not move the check out of the loop while adding the counter.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "soft-bounce",
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
