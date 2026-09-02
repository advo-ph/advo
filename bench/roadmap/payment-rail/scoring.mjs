#!/usr/bin/env node
/**
 * Payment rail — the deploy-shaped half of migration 022.
 *
 * apps/web/src/test/payment.test.ts already asserts the BEHAVIOUR: the money
 * conversions, the signature verification, the refusal branches, the five settlement
 * invariants. None of that is repeated here.
 *
 * What this bench asserts is the class of failure the unit tests structurally cannot
 * see — the one that took prod down twice on 2026-08-29. Both outages were env-shaped:
 * a key missing from the box that nothing could detect, and a duplicate key in env.ts
 * that no bench read. A payment rail has strictly worse versions of both:
 *
 *   * a webhook secret missing in prod means EVERY provider callback is refused, and the
 *     symptom is invoices that silently never settle — indistinguishable from clients
 *     who simply have not paid yet.
 *   * a migration that never ran means the webhook 500s on an undefined relation, and
 *     the provider retries into a wall.
 *
 * So this checks the WIRING: the migration exists and self-registers in the ledger, the
 * route is mounted, every env key the adapters read is declared and documented, and the
 * credential story in .env.example matches what the code actually requires.
 *
 *   npm run bench:payment
 *
 * No server, no database, no network — it reads the tree. That is deliberate: a gate
 * that needs prod credentials to run is a gate nobody runs.
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

const migration = read("apps/api/migrations/022_payment.sql");
const schema = read("apps/api/src/db/schema.ts");
const envSource = read("apps/api/src/utils/env.ts");
const indexSource = read("apps/api/src/index.ts");
const routeSource = read("apps/api/src/routes/payment.routes.ts");
const providerSource = read("apps/api/src/services/payment-provider.service.ts");
const serviceSource = read("apps/api/src/services/payment.service.ts");
const envExample = read("apps/api/.env.example");
const credentialDoc = read("docs/CREDENTIALS.md");

// ─── Migration ───────────────────────────────────────

assert(
  "migration-present",
  "022_payment.sql exists and creates both tables",
  migration.includes("CREATE TABLE IF NOT EXISTS payment_intent") &&
    migration.includes("CREATE TABLE IF NOT EXISTS payment_event"),
  `payment_intent=${migration.includes("payment_intent")}, payment_event=${migration.includes("payment_event")}`,
  "Without the migration the webhook 500s on an undefined relation and the provider retries into a wall.",
);

assert(
  "migration-self-registers",
  "022 writes its own row into the schema ledger",
  /INSERT INTO schema_migration[\s\S]*022_payment\.sql/.test(migration),
  migration.includes("022_payment.sql") ? "ledger insert present" : "NO ledger insert",
  "019 exists because a migration that leaves no record produced a hole in prod's applied set that nothing could report. Every migration from 020 on writes its own row.",
);

assert(
  "replay-guard-is-a-db-index",
  "The replay guard is a UNIQUE INDEX, not application care",
  /CREATE UNIQUE INDEX[\s\S]*idx_payment_event_provider_event[\s\S]*provider, provider_event_id/.test(
    migration,
  ),
  "unique (provider, provider_event_id)",
  "Providers redeliver until they get a 2xx, so a duplicate is guaranteed. Trusting application code to notice is how an invoice gets settled twice.",
);

assert(
  "paid-at-agrees-with-status",
  "A CHECK forbids a 'paid' row with no paid_at (and vice versa)",
  migration.includes("chk_payment_intent_paid_at"),
  migration.includes("chk_payment_intent_paid_at") ? "CHECK present" : "no CHECK",
  "A ledger where status and timestamp can disagree is a ledger you cannot argue a dispute from.",
);

assert(
  "amount-is-positive",
  "A CHECK forbids a zero or negative collectable",
  migration.includes("chk_payment_intent_amount"),
  migration.includes("chk_payment_intent_amount") ? "CHECK present" : "no CHECK",
  "A zero-peso collectable is a data-entry error, not a free invoice.",
);

// ─── Drizzle mirrors the SQL ─────────────────────────

assert(
  "schema-mirrors-migration",
  "The drizzle schema declares both tables and the invoice back-reference",
  schema.includes("export const paymentIntent") &&
    schema.includes("export const paymentEvent") &&
    schema.includes("settledPaymentIntentId"),
  `paymentIntent=${schema.includes("export const paymentIntent")}, paymentEvent=${schema.includes("export const paymentEvent")}, settledPaymentIntentId=${schema.includes("settledPaymentIntentId")}`,
  "Drift between the SQL and the drizzle model is the 2026-08-29 failure shape: the code compiles, and the query fails only in prod.",
);

// ─── Wiring ──────────────────────────────────────────

assert(
  "route-mounted",
  "The payment router is imported AND mounted in index.ts",
  indexSource.includes("payment.routes.js") && indexSource.includes('app.route("/api/payment"'),
  `import=${indexSource.includes("payment.routes.js")}, mount=${indexSource.includes('app.route("/api/payment"')}`,
  "A router that is written but never mounted is the shape of a feature that exists only in the diff.",
);

assert(
  "webhook-before-auth",
  "The public webhook is registered BEFORE the auth middleware",
  routeSource.indexOf('post("/webhook/:provider"') > -1 &&
    routeSource.indexOf('post("/webhook/:provider"') <
      routeSource.indexOf('use("*", requireAuth)'),
  `webhookAt=${routeSource.indexOf('post("/webhook/:provider"')}, authAt=${routeSource.indexOf('use("*", requireAuth)')}`,
  "hono's use(\"*\") applies to everything registered after it. Below the middleware, a provider callback is behind a bearer token it cannot have.",
);

assert(
  "raw-body-read",
  "The webhook reads the RAW body, never a re-serialized one",
  routeSource.includes("c.req.text()") && !routeSource.includes("c.req.json()"),
  `text()=${routeSource.includes("c.req.text()")}, json()=${routeSource.includes("c.req.json()")}`,
  "JSON.stringify(JSON.parse(body)) reorders keys and drops whitespace. The HMAC is over the original bytes, so every signature would fail.",
);

// ─── Env keys the adapters actually read ─────────────

const REQUIRED_ENV = [
  "PAYMENT_PROVIDER",
  "PAYMONGO_SECRET_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "XENDIT_SECRET_KEY",
  "XENDIT_CALLBACK_TOKEN",
];

const missingFromEnvTs = REQUIRED_ENV.filter((key) => !envSource.includes(key));
assert(
  "env-declared",
  "Every payment env key the adapters read is declared in env.ts",
  missingFromEnvTs.length === 0,
  missingFromEnvTs.length ? `missing: ${missingFromEnvTs.join(", ")}` : "all five declared",
  "An undeclared key is read as undefined and the failure surfaces as a silently refused webhook.",
);

// A key read by the code but absent from .env.example is a key nobody will ever set on
// the box — which is precisely how prod ran for months with no mail transport.
const missingFromExample = REQUIRED_ENV.filter((key) => !envExample.includes(key));
assert(
  "env-example-documented",
  "Every payment env key appears in apps/api/.env.example",
  missingFromExample.length === 0,
  missingFromExample.length ? `missing: ${missingFromExample.join(", ")}` : "all five documented",
  "Prod ran with no mail transport for months because nothing listed the key. The same omission on a payment secret means every callback is refused and invoices silently never settle.",
);

assert(
  "default-is-manual",
  "PAYMENT_PROVIDER defaults to manual",
  /PAYMENT_PROVIDER[\s\S]{0,120}\.default\("manual"\)/.test(envSource),
  "default is manual",
  "A deploy that sets nothing must behave exactly as the business does today: record the collectable, collect out-of-band. Never a hard failure, never a fabricated link.",
);

// ─── Safety properties ───────────────────────────────

assert(
  "unverified-never-settles",
  "The unverified branch returns before any settle path",
  serviceSource.indexOf("if (!isVerified)") > -1 &&
    serviceSource.indexOf("if (!isVerified)") < serviceSource.indexOf("await settle("),
  `unverifiedAt=${serviceSource.indexOf("if (!isVerified)")}, settleAt=${serviceSource.indexOf("await settle(")}`,
  "The webhook URL is printed in the provider's own dashboard. Without verification, 'mark this invoice paid' is an unauthenticated public endpoint.",
);

assert(
  "unverified-still-recorded",
  "A bad-signature callback is still written to the event ledger",
  /if \(!isVerified\)[\s\S]{0,400}recordEvent\(/.test(serviceSource),
  "recordEvent called in the refusal branch",
  "Dropping a bad-signature callback deletes the only evidence that someone probed the endpoint.",
);

assert(
  "guarded-settle-update",
  "The invoice settle is one guarded UPDATE, never read-then-write",
  serviceSource.includes("IN ('unpaid', 'overdue')"),
  serviceSource.includes("IN ('unpaid', 'overdue')") ? "guard present" : "UNGUARDED",
  "An invoice an admin marked paid a millisecond earlier must not be dragged back and re-settled by a concurrent callback. Same discipline as the 017 sweep.",
);

assert(
  "no-silent-rounding",
  "The Xendit conversion refuses a fractional peso rather than rounding",
  providerSource.includes("Refusing to round a client's invoice"),
  providerSource.includes("Refusing to round") ? "refuses" : "ROUNDS",
  "Xendit bills PHP in whole pesos. Rounding changes what a client is charged, which is not a decision a conversion function makes on its own.",
);

assert(
  "no-refund-path",
  "Nothing in the settlement service can move money outward",
  !serviceSource.toLowerCase().includes("refund("),
  "no refund path",
  "A refund is real money leaving. A webhook handler must not be able to trigger one.",
);

assert(
  "credentials-documented",
  "docs/CREDENTIALS.md tells an operator how to obtain the payment keys",
  credentialDoc.includes("PAYMONGO_SECRET_KEY") && credentialDoc.includes("XENDIT"),
  `paymongo=${credentialDoc.includes("PAYMONGO_SECRET_KEY")}, xendit=${credentialDoc.includes("XENDIT")}`,
  "CREDENTIALS.md exists precisely so a missing key is a documented task rather than a silent outage.",
);

// ─── Report ──────────────────────────────────────────

const passedCount = check.filter((c) => c.passed).length;
const result = {
  benchmark: "payment-rail",
  passed: passedCount === check.length,
  count: { passed: passedCount, failed: check.length - passedCount, total: check.length },
  check,
};

const runDir = join(repoRoot, "bench/roadmap/payment-rail/runs");
if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify(result, null, 2));
console.log(
  result.passed
    ? `PASS — ${passedCount}/${check.length} payment-rail check(s) green`
    : `FAIL — ${passedCount}/${check.length} payment-rail check(s) green`,
);
process.exit(result.passed ? 0 : 1);
