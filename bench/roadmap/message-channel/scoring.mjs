#!/usr/bin/env node
/**
 * Message channels — the deploy-shaped half of migration 023.
 *
 * apps/web/src/test/message-channel.test.ts asserts the BEHAVIOUR: normalization, the
 * consent verdict, signature verification, the inbound parsers. None of that is repeated
 * here.
 *
 * This asserts the two classes of failure the unit tests structurally cannot see:
 *
 *   ENV DRIFT — the 2026-08-29 shape. A key the code reads that appears nowhere an
 *   operator would look is a key nobody sets, and prod ran with no mail transport for
 *   months for exactly that reason. Three more channels multiply the surface.
 *
 *   CONSENT REGRESSION — the gate is one `if` away from being bypassed, and the cost of
 *   bypassing it is a legal exposure under RA 10173 against ~5K scraped numbers, not a
 *   broken test. So the ordering of the gate relative to the provider call is checked
 *   structurally, in the deploy gate, not only in a unit test somebody can skip.
 *
 *   npm run bench:message
 *
 * No server, no database, no network — it reads the tree. A gate that needs prod
 * credentials to run is a gate nobody runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => {
  const full = join(repoRoot, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
};

const check = [];
const assert = (id, title, passed, detail, expected) =>
  check.push({ id, title, passed: !!passed, detail, expected });

const migration = read("apps/api/migrations/023_message_channel.sql");
const schema = read("apps/api/src/db/schema.ts");
const envSource = read("apps/api/src/utils/env.ts");
const envExample = read("apps/api/.env.example");
const indexSource = read("apps/api/src/index.ts");
const routeSource = read("apps/api/src/routes/message.routes.ts");
const channelSource = read("apps/api/src/services/message-channel.service.ts");
const messageSource = read("apps/api/src/services/message.service.ts");

// ─── Migration ───────────────────────────────────────

assert(
  "migration-present",
  "023 creates all three tables",
  ["contact_channel", "inbound_message", "outbound_message"].every((t) =>
    migration.includes(`CREATE TABLE IF NOT EXISTS ${t}`),
  ),
  "contact_channel + inbound_message + outbound_message",
  "Without the migration every webhook 500s on an undefined relation and the providers retry into a wall.",
);

assert(
  "migration-self-registers",
  "023 writes its own row into the schema ledger",
  /INSERT INTO schema_migration[\s\S]*023_message_channel\.sql/.test(migration),
  migration.includes("023_message_channel.sql") ? "ledger insert present" : "NO ledger insert",
  "019 exists because a migration that leaves no record produced a hole in prod's applied set that nothing could report.",
);

assert(
  "consent-is-nullable-by-design",
  "consent_at is nullable and the migration explains why",
  migration.includes("consent_at          timestamptz,") && migration.includes("RA 10173"),
  `nullable=${migration.includes("consent_at          timestamptz,")}, cites RA 10173=${migration.includes("RA 10173")}`,
  "A NOT NULL consent column would force every stored address to claim permission it does not have. The nullable column IS the safety property.",
);

assert(
  "consent-revoke-not-delete",
  "Revoking consent updates a timestamp rather than deleting the row",
  /revokeConsent[\s\S]{0,400}revokedAt: new Date\(\)/.test(messageSource) &&
    !/revokeConsent[\s\S]{0,400}\.delete\(/.test(messageSource),
  "revoke sets revoked_at",
  "The row is the evidence consent was given AND withdrawn. Deleting it is the one thing that makes a DPA complaint unanswerable.",
);

assert(
  "owner-is-exclusive",
  "A contact channel belongs to exactly one of a client or a lead",
  migration.includes("chk_contact_channel_owner"),
  migration.includes("chk_contact_channel_owner") ? "CHECK present" : "no CHECK",
  "Both or neither means nobody can say whose data this is — the first question a DPA request asks.",
);

assert(
  "failure-needs-a-reason",
  "The DB refuses an outbound failure with no reason",
  migration.includes("chk_outbound_message_failure"),
  migration.includes("chk_outbound_message_failure") ? "CHECK present" : "no CHECK",
  "A failure with no reason is exactly the shape of the mail outage this table exists to prevent.",
);

assert(
  "inbound-replay-guard",
  "Inbound dedupe is a UNIQUE INDEX, not application care",
  /CREATE UNIQUE INDEX[\s\S]*idx_inbound_message_provider[\s\S]*channel, provider_message_id/.test(
    migration,
  ),
  "unique (channel, provider_message_id)",
  "Messenger and Viber both redeliver until they get a 2xx, so a duplicate is guaranteed rather than hypothetical.",
);

// ─── Schema mirrors SQL ──────────────────────────────

assert(
  "schema-mirrors-migration",
  "The drizzle schema declares all three tables",
  ["contactChannel", "inboundMessage", "outboundMessage"].every((t) =>
    schema.includes(`export const ${t}`),
  ),
  "all three declared",
  "Drift between the SQL and the drizzle model compiles fine and fails only in prod — the 2026-08-29 failure shape.",
);

// ─── Wiring ──────────────────────────────────────────

assert(
  "route-mounted",
  "The message router is imported AND mounted",
  indexSource.includes("message.routes.js") && indexSource.includes('app.route("/api/message"'),
  `import=${indexSource.includes("message.routes.js")}, mount=${indexSource.includes('app.route("/api/message"')}`,
  "A router written but never mounted is a feature that exists only in the diff.",
);

assert(
  "webhook-before-auth",
  "The public webhooks are registered BEFORE the auth middleware",
  routeSource.indexOf('post("/webhook/:channel"') > -1 &&
    routeSource.indexOf('post("/webhook/:channel"') < routeSource.indexOf('use("*", requireAuth'),
  `webhookAt=${routeSource.indexOf('post("/webhook/:channel"')}, authAt=${routeSource.indexOf('use("*", requireAuth')}`,
  'hono use("*") applies to everything registered after it. Below the middleware a provider callback sits behind a bearer token it cannot have.',
);

assert(
  "raw-body-read",
  "The inbound webhook reads the RAW body",
  routeSource.includes("c.req.text()") && !routeSource.includes("c.req.json()"),
  `text()=${routeSource.includes("c.req.text()")}`,
  "JSON.stringify(JSON.parse(body)) reorders keys. Every HMAC would fail.",
);

assert(
  "messenger-handshake-returns-text",
  "The Messenger subscription handshake answers plain text",
  routeSource.includes("return c.text(challenge)"),
  routeSource.includes("c.text(challenge)") ? "text" : "NOT text",
  "Facebook rejects a JSON-wrapped hub.challenge and will never deliver a message to the endpoint.",
);

// ─── The consent gate, checked structurally ──────────

const consentAt = messageSource.indexOf("const verdict = judgeConsent(");
const providerAt = messageSource.indexOf("const provider = providerFor(");
assert(
  "consent-gate-precedes-provider",
  "The consent gate runs BEFORE any provider is resolved",
  consentAt > -1 && providerAt > consentAt,
  `consentAt=${consentAt}, providerAt=${providerAt}`,
  "Checked here and not only in a unit test because bypassing this is a legal exposure against ~5K scraped numbers, not a broken assertion.",
);

assert(
  "consent-defaults-absent",
  "Creating a contact channel WITHOUT a source grants no consent",
  messageSource.includes("consentAt: input.consentSource ? new Date() : null"),
  "default is no consent",
  "The easy path must be the one that does not assume permission.",
);

assert(
  "default-transport-refuses",
  "The default transport records and REFUSES rather than reporting success",
  /name: "log"[\s\S]{0,600}status: "refused"/.test(channelSource),
  "log provider refuses",
  "A transport that claims success without a transport is precisely how a live mail outage stayed invisible for months.",
);

assert(
  "throw-still-records",
  "A thrown provider error still writes a ledger row",
  /catch \(error\)[\s\S]{0,400}status: "failed"/.test(messageSource),
  "catch records",
  "This is the exact case email.service.ts swallowed: a network error into a catch and a log line nobody read.",
);

assert(
  "no-auto-reply",
  "Nothing in the message path replies to a client on its own",
  !/autoReply|auto_reply/.test(messageSource) && !/autoReply|auto_reply/.test(routeSource),
  "no auto-reply",
  "A platform that answers a client by itself can create scope commitments no human agreed to.",
);

assert(
  "messenger-response-only",
  "Messenger sends use RESPONSE messaging_type only",
  channelSource.includes('messaging_type: "RESPONSE"'),
  "RESPONSE only",
  "Unsolicited Messenger messaging outside the 24-hour window is a policy violation that gets a page restricted.",
);

assert(
  "viber-failure-read-from-body",
  "Viber failures are read from the body, not from res.ok",
  channelSource.includes("(json.status ?? 1) !== 0"),
  "body status checked",
  "Viber answers 200 with a non-zero status on rejection. A naive res.ok check records every rejected message as sent.",
);

// ─── Env drift ───────────────────────────────────────

const REQUIRED_ENV = [
  "SMS_PROVIDER",
  "SEMAPHORE_API_KEY",
  "MOVIDER_API_KEY",
  "MOVIDER_API_SECRET",
  "SMS_INBOUND_SECRET",
  "VIBER_AUTH_TOKEN",
  "MESSENGER_PAGE_TOKEN",
  "MESSENGER_APP_SECRET",
  "MESSENGER_VERIFY_TOKEN",
];

const missingFromEnvTs = REQUIRED_ENV.filter((key) => !envSource.includes(key));
assert(
  "env-declared",
  "Every message env key the adapters read is declared in env.ts",
  missingFromEnvTs.length === 0,
  missingFromEnvTs.length ? `missing: ${missingFromEnvTs.join(", ")}` : `all ${REQUIRED_ENV.length} declared`,
  "An undeclared key reads as undefined and surfaces as a silently unsent message.",
);

const missingFromExample = REQUIRED_ENV.filter((key) => !envExample.includes(key));
assert(
  "env-example-documented",
  "Every message env key appears in apps/api/.env.example",
  missingFromExample.length === 0,
  missingFromExample.length ? `missing: ${missingFromExample.join(", ")}` : `all ${REQUIRED_ENV.length} documented`,
  "Prod ran with no mail transport for months because nothing listed the key. This is that failure, three channels wide.",
);

assert(
  "default-is-log",
  "SMS_PROVIDER defaults to log",
  /SMS_PROVIDER[\s\S]{0,120}\.default\("log"\)/.test(envSource),
  "default is log",
  "A deploy that sets nothing must record the message and admit it did not send, never claim it did.",
);

assert(
  "env-example-states-the-consent-rule",
  ".env.example says a key does NOT bypass the consent gate",
  envExample.includes("Setting a key below does not bypass it"),
  envExample.includes("does not bypass it") ? "stated" : "NOT stated",
  "An operator setting an SMS key is exactly the person who might assume it unlocks the scraped list. It does not, and the file they are editing should say so.",
);

// ─── Report ──────────────────────────────────────────

const passedCount = check.filter((c) => c.passed).length;
const result = {
  benchmark: "message-channel",
  passed: passedCount === check.length,
  count: { passed: passedCount, failed: check.length - passedCount, total: check.length },
  check,
};

const runDir = join(repoRoot, "bench/roadmap/message-channel/runs");
if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify(result, null, 2));
console.log(
  result.passed
    ? `PASS — ${passedCount}/${check.length} message-channel check(s) green`
    : `FAIL — ${passedCount}/${check.length} message-channel check(s) green`,
);
process.exit(result.passed ? 0 : 1);
