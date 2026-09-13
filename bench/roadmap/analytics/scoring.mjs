#!/usr/bin/env node
/**
 * Roadmap benchmark — analytics tier.
 *
 * CANDIDATE TIER: expected-RED until built. Quarantined from `npm test`
 * (`apps/web/vitest.config.ts` includes only `src/**`). Reachable only via
 * `npm run bench:analytics`. Promote each check as its roadmap row ships.
 *
 * Deterministic + idempotent: reads committed source only. No clock, no random,
 * no network.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => (existsSync(join(repoRoot, p)) ? readFileSync(join(repoRoot, p), "utf8") : "");
const has = (p) => existsSync(join(repoRoot, p));
const migration = has("apps/api/migrations")
  ? readdirSync(join(repoRoot, "apps/api/migrations")).join("\n")
  : "";

const schema = read("apps/api/src/db/schema.ts");
const consent = read("apps/web/src/components/ConsentGate.tsx");
// Main keeps the four PayMongo disclosures under pages/legal/; the Mac branch had a
// standalone pages/Privacy.tsx. The consent controls were merged into the legal page.
const privacyPage = read("apps/web/src/pages/legal/Privacy.tsx");
const app = read("apps/web/src/App.tsx");
const track = read("apps/web/src/lib/track.ts");
const eventRoute = read("apps/api/src/routes/event.routes.ts");
const engagementPanel = read("apps/web/src/components/admin/AdminEngagement.tsx");
const retention = read("apps/api/src/services/retention.service.ts");
const monitoringPolicy = read("docs/MONITORING-POLICY.md");
const lia = read("docs/LEGITIMATE-INTEREST-ASSESSMENT.md");

const check = [];
const add = (id, label, pass, note) => check.push({ id, label, pass, note });

// ── P0 — lawful basis, before any collection ──────────────────────────
add("A1-privacy-notice", "a public privacy notice route exists",
  /path="\/privacy"/.test(app) && privacyPage.length > 0,
  "No privacy page, no /privacy route. Nothing today tells a visitor what is collected.");

add("A2-consent-gate", "non-essential tracking is gated behind an explicit choice",
  /ConsentGate/.test(app) && /granted|denied/.test(consent) && /localStorage|cookie/.test(consent),
  "No consent surface anywhere in the repo.");

add("A3-consent-honored", "the tracker refuses to send when consent is absent",
  /hasConsent|isConsentGranted/.test(track) && /return\b/.test(track),
  "track.ts does not exist; nothing can honour a consent decision yet.");

add("A4-monitoring-policy", "a written staff-monitoring policy exists",
  /what is monitored/i.test(monitoringPolicy) && /data right/i.test(monitoringPolicy),
  "NPC AO 2018-084 struck down keystroke/screen-capture monitoring as excessive. Notice + policy is the lawful path.");

add("A5-legitimate-interest", "the three-part legitimate-interest test is recorded",
  /purpose/i.test(lia) && /necessity/i.test(lia) && /balanc/i.test(lia),
  "NPC AO 2024-003 requires purpose, necessity, and a balancing of rights.");

// ── P0 — the event spine ──────────────────────────────────────────────
add("A6-event-table", "an analytics_event table exists",
  /pgTable\(\s*["']analytics_event/.test(schema) && /analytics/.test(migration),
  "activity_log holds 24 audit rows; there is no event store.");

add("A7-ingest-endpoint", "a batched ingest endpoint accepts events",
  /event/.test(eventRoute) && /(batch|z\.array)/.test(eventRoute),
  "No ingest route. One request per hover event would not survive a single session.");

add("A8-retention", "raw events have a bounded retention window and a rollup",
  /RETENTION_DAY|retentionDay/.test(retention) && /rollup|aggregate/i.test(retention),
  "Unbounded hover events on a 10 MB VPS database is the failure mode; retention is not optional.");

// ── P1 — the surfaces ─────────────────────────────────────────────────
add("A9-public-funnel", "the public site reports section attention and funnel step",
  /section_view|scroll_depth/.test(track),
  "No instrumentation on the landing page.");

add("A10-visitor-identity", "visitor identity degrades when fingerprinting is blocked",
  /fingerprint/i.test(track) && /(fallback|degrad|anonymousId)/i.test(track),
  "Fingerprinting is ~90% on Chrome but noised on Safari/Firefox-strict and blocked on Brave. A single-key design loses those visitors silently.");

add("A11-hub-engagement", "client hub engagement is queryable per client",
  // The endpoint must aggregate per CLIENT (not per visitor), the panel must mount it,
  // and the events must be able to carry an identity at all — an engagement join on
  // user_id is dead unless the tracker sends the session token.
  /engagement/.test(eventRoute) &&
    /client/.test(eventRoute) &&
    /staleDay|lastSeenAt/.test(eventRoute) &&
    /useEngagement/.test(engagementPanel) &&
    /Authorization/.test(track),
  "Nothing records whether a client opened a deliverable, contract, or preview.");

add("A12-team-delivery-view", "an admin view ranks the team on delivery outcome",
  has("apps/web/src/components/admin/AdminAccountability.tsx"),
  "on-time rate, verifiedAt sign-off count and overdue load are all derivable today and surfaced nowhere.");

add("A13-team-behavior", "staff behavioural telemetry is gated on the monitoring policy",
  /isStaffMonitoringEnabled|STAFF_MONITORING/.test(track) && monitoringPolicy.length > 0,
  "Chosen 2026-08-21. Must not collect before A4 notice has gone out — that ordering is the whole lawful basis.");

const pass = check.filter((c) => c.pass).length;
console.log(`bench:analytics — ${pass}/${check.length} check green  (candidate tier: expected red until built)\n`);
for (const c of check) {
  console.log(`  ${c.pass ? "PASS" : "RED "}  ${c.id}  ${c.label}`);
  if (!c.pass) console.log(`         ↳ ${c.note}`);
}
console.log(`\n${check.length - pass} outstanding.`);
process.exit(pass === check.length ? 0 : 1);
