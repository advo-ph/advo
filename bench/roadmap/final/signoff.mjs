#!/usr/bin/env node
/**
 * Lane `signoff` — source-reading, idempotent scoring.
 * No clock, no random, no network. Same shape as bench/roadmap/final/campaign.mjs.
 *
 * Grades the PROJECT SIGN-OFF model — the client-facing final-delivery document the
 * live FourlinQ MOA (2026-08-11) names five times:
 *   - final payment is DUE on signing, with 7 days to comply
 *   - all complementary revisions must be used BEFORE it is signed
 *   - UNUSED rounds stay invocable for 6 MONTHS AFTER signing
 *   - it marks final delivery of a commissioned system
 *
 * Why each check exists rather than a code comment:
 *
 *   1. DOUBLE-SIGN / DOUBLE-INVOICE — signing mints a real receivable. Two clicks must
 *      not mint two. The guard has to be a conditional UPDATE inside the same
 *      transaction as the invoice insert, not application care.
 *   2. CONFLATION WITH deliverable.verified_at — that column is INTERNAL team QA
 *      (migration 007). Rendering it as a client sign-off is a regression, so the
 *      client path must not be able to reach it at all.
 *   3. REVISION-GATE BYPASS — if the allowance check lives only in the /hub query,
 *      anyone holding a sign-off id can POST past an exhausted allowance or a closed
 *      window. The gate must be in the write path, backed by a unique index.
 *   4. CLOCK ARITHMETIC — 6 months must be a real month-add, never 180 days, and the
 *      derivation must be shared so /hub and /admin cannot disagree with a paying
 *      client about when a window closed.
 *   5. MONEY DRIFT — the contract is written in pesos (₱22,500 / ₱35,000) and the
 *      column is cents. A ₱225.00 invoice on a Tier 1 sign-off is the failure mode.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};
const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const migration = read("apps/api/migrations/016_project_signoff.sql");
const service = read("apps/api/src/services/project-signoff.service.ts");
const route = read("apps/api/src/routes/project-signoff.routes.ts");
const schema = read("apps/api/src/db/schema.ts");
const index = read("apps/api/src/index.ts");
const hook = read("apps/web/src/hooks/useProjectSignoff.ts");
const hubCard = read("apps/web/src/components/hub/SignoffCard.tsx");
const adminPanel = read("apps/web/src/components/admin/AdminSignoff.tsx");
const hubDashboard = read("apps/web/src/components/hub/ProjectDashboard.tsx");
const commandCenter = read("apps/web/src/components/admin/ProjectCommandCenter.tsx");
const test = read("apps/web/src/test/signoff.test.ts");

/** The body of signSignoff(), so "inside the transaction" is asserted structurally. */
const signBody = (() => {
  const at = service.indexOf("export async function signSignoff");
  if (at === -1) return "";
  const end = service.indexOf("// ─── Revision ledger", at);
  return service.slice(at, end === -1 ? undefined : end);
})();

/** The body of recordRevision(), for the same reason. */
const revisionBody = (() => {
  const at = service.indexOf("export async function recordRevision");
  if (at === -1) return "";
  const end = service.indexOf("// ─── Void", at);
  return service.slice(at, end === -1 ? undefined : end);
})();

/** Just the project_signoff CREATE TABLE block. */
const signoffTable = (() => {
  const at = migration.indexOf("CREATE TABLE IF NOT EXISTS project_signoff");
  const end = migration.indexOf("CREATE TABLE IF NOT EXISTS signoff_revision");
  return at === -1 ? "" : migration.slice(at, end === -1 ? undefined : end);
})();

const check = [
  {
    id: "migration-016-present",
    passed:
      has("apps/api/migrations/016_project_signoff.sql") &&
      /BEGIN;/.test(migration) &&
      /COMMIT;/.test(migration) &&
      /CREATE TABLE IF NOT EXISTS project_signoff/.test(migration) &&
      /CREATE TABLE IF NOT EXISTS signoff_revision/.test(migration),
    expected:
      "016_project_signoff.sql exists with both tables inside one BEGIN/COMMIT, matching the 015_campaign.sql shape.",
  },
  {
    id: "second-sign-cannot-mint-a-second-invoice",
    passed:
      /db\(\)\.transaction\(/.test(signBody) &&
      /isNull\(projectSignoff\.signedAt\)/.test(signBody) &&
      signBody.indexOf('message: "Already signed"') > -1 &&
      signBody.indexOf(".insert(invoice)") > signBody.indexOf('message: "Already signed"'),
    expected:
      "signSignoff() guards with UPDATE ... WHERE signed_at IS NULL RETURNING inside the same transaction as the invoice insert, and bails to 409 BEFORE minting anything. Two clicks cannot make two receivables.",
  },
  {
    id: "status-and-stamp-cannot-disagree",
    passed:
      /CHECK \(\(status = 'signed'\) = \(signed_at IS NOT NULL\)\)/.test(migration) &&
      /CHECK \(signed_at IS NULL OR issued_at IS NOT NULL\)/.test(migration),
    expected:
      "The DB refuses a row whose status and signed_at disagree, and refuses a signature on a document that was never issued.",
  },
  {
    id: "one-open-signoff-per-project",
    passed:
      /idx_project_signoff_open[\s\S]{0,120}WHERE status = 'issued'/.test(migration) &&
      /idx_project_signoff_title[\s\S]{0,120}WHERE status <> 'void'/.test(migration),
    expected:
      "Partial unique indexes allow at most one sign-off awaiting signature per project, and refuse issuing the same commissioned system twice.",
  },
  {
    id: "sixth-revision-is-refused",
    passed:
      /Free revisions are exhausted/.test(revisionBody) &&
      /freeRevisionTotalCount - used/.test(revisionBody) &&
      /remaining <= 0/.test(revisionBody),
    expected:
      "recordRevision() refuses a round once the stored allowance is consumed, naming the reason rather than silently succeeding.",
  },
  {
    id: "post-window-revision-is-refused",
    passed:
      /revision window closed on/.test(revisionBody) &&
      /addMonth\(new Date\(row\.signedAt/.test(revisionBody),
    expected:
      "A revision requested after the 6-month post-signature window is refused with the closing date and the change-order / maintenance alternative spelled out.",
  },
  {
    id: "pre-signoff-revision-is-allowed",
    passed:
      /const isPostSignoff = row\.signedAt != null;/.test(revisionBody) &&
      /is_post_signoff/.test(migration) &&
      /isPostSignoff,/.test(revisionBody),
    expected:
      "An unsigned sign-off still accepts free rounds, and each ledger row records whether it was consumed before or after the signature — the column that proves the contract clause was honoured.",
  },
  {
    id: "revision-gate-is-in-the-write-path",
    passed:
      /\.for\("update"\)/.test(revisionBody) &&
      revisionBody.indexOf('.for("update")') < revisionBody.indexOf(".insert(signoffRevision)") &&
      /idx_signoff_revision_round[\s\S]{0,120}\(project_signoff_id, round_number\)/.test(migration),
    expected:
      "The allowance/window gate sits inside recordRevision() under SELECT ... FOR UPDATE, with a unique (project_signoff_id, round_number) index as the last line of defence. A caller holding a sign-off id cannot bypass it.",
  },
  {
    id: "used-and-remaining-are-counted-never-stored",
    passed:
      /free_revision_total_count/.test(migration) &&
      !/free_revision_used_count|free_revision_remaining_count/.test(migration) &&
      /count\(\*\)::int/.test(service),
    expected:
      "Only the allowance is a column. used/remaining are COUNTED from signoff_revision on every read, so the tally cannot drift from the paper trail.",
  },
  {
    id: "clocks-derived-by-one-shared-helper",
    passed:
      /export function deriveWindow/.test(service) &&
      /export function addMonth/.test(service) &&
      /setUTCMonth/.test(service) &&
      !/addDay\([^)]*,\s*180\)/.test(service) &&
      !/monthCount \* 30|\* 180/.test(service) &&
      !/paymentDueAt:/.test(migration),
    expected:
      "paymentDueAt and revisionWindowEndsAt come from one shared deriveWindow() helper using a real calendar month-add, never 180 days, and are never stored as columns.",
  },
  {
    id: "frozen-after-signing",
    passed:
      /MUTABLE_AFTER_SIGNING = new Set\(\["note", "documentUrl"\]\)/.test(service) &&
      /A signed sign-off is frozen/.test(service) &&
      /A signed sign-off is never voided/.test(service),
    expected:
      "Once signed, PATCH rejects every field except note and documentUrl, and void is restricted to unsigned rows so a real receivable is never orphaned.",
  },
  {
    id: "never-conflated-with-verified-at",
    passed:
      /NOT deliverable\.verified_at/i.test(migration) &&
      /deliverable_snapshot/.test(signoffTable) &&
      !/deliverable_id\s+integer/.test(signoffTable) &&
      /export function toClientShape/.test(service) &&
      /deliverableSnapshot: _snapshot/.test(service) &&
      !/verifiedAt|verified_at/.test(
        hubCard.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
      ),
    expected:
      "deliverable.verified_at is internal team QA. The sign-off COPIES it into frozen jsonb, the client shape strips that snapshot, and the /hub card never renders it.",
  },
  {
    id: "money-stays-integer-cents",
    passed:
      /final_payment_cents\s+integer NOT NULL DEFAULT 0/.test(migration) &&
      /CHECK \(final_payment_cents >= 0\)/.test(migration) &&
      /finalPaymentCents: integer\("final_payment_cents"\)/.test(schema) &&
      /finalPaymentCents: z\.number\(\)\.int\(\)\.min\(0\)/.test(route) &&
      /Math\.round\(peso \* 100\)/.test(adminPanel) &&
      (adminPanel.match(/\* 100/g) ?? []).length === 1,
    expected:
      "final_payment_cents is integer cents in the DB, the drizzle mirror, and the zod body; the admin form multiplies pesos by 100 exactly once. (Tier 1 = 2250000, Tier 2 = 3500000.)",
  },
  {
    id: "drizzle-mirror-appended",
    passed:
      /export const projectSignoff = pgTable\(/.test(schema) &&
      /export const signoffRevision = pgTable\(/.test(schema) &&
      /uniqueIndex\("idx_signoff_revision_round"\)/.test(schema) &&
      !/pgEnum\("project_signoff/.test(schema),
    expected:
      "Both tables are mirrored into schema.ts in the existing pgTable style, with no new DB enum (status stays app-validated varchar, per the change_order/contract precedent).",
  },
  {
    id: "auth-shape-matches-the-house",
    passed:
      /projectSignoffRoutes\.use\("\*", requireAuth\)/.test(route) &&
      /post\("\/", requireTeam/.test(route) &&
      /patch\("\/:id", requireTeam/.test(route) &&
      /"\/:id\/void",\s*requireAdmin/.test(route) &&
      /assertClientOwnsProject/.test(service) &&
      /innerJoin\(client, eq\(project\.clientId, client\.clientId\)\)/.test(service),
    expected:
      "requireAuth on every route, requireTeam on the drafting paths, requireAdmin on void, and the join-through-client.user_id ownership check from change-order.routes.ts on the client paths.",
  },
  {
    id: "envelope-on-every-response",
    passed:
      (route.match(/c\.json\(/g) ?? []).length > 0 &&
      (route.match(/c\.json\(\{ data: /g) ?? []).length ===
        (route.match(/c\.json\(/g) ?? []).length,
    expected: "Every handler returns the { data, error } envelope.",
  },
  {
    id: "surface-is-reachable",
    passed:
      /app\.route\("\/api\/project-signoff", projectSignoffRoutes\);/.test(index) &&
      (index.match(/projectSignoffRoutes/g) ?? []).length === 2 &&
      /<SignoffCard projectId={project\.project_id} \/>/.test(hubDashboard) &&
      /<AdminSignoff projectId={project\.project_id} \/>/.test(commandCenter) &&
      /value: "signoff"/.test(commandCenter) &&
      /useProjectSignoff/.test(hook + hubCard + adminPanel),
    expected:
      "A client can sign from /hub -> project -> Project Sign-off card, and the team can draft/issue/void at /admin -> Projects -> project -> Sign-off. index.ts gains exactly one import and one app.route line. A benchmark measures the deliverable; it is never the deliverable.",
  },
  {
    id: "no-scheduler-shipped",
    passed:
      !/setInterval|node-cron|cron\.schedule/.test(service) &&
      /deemed/.test(service) &&
      /signed_method/.test(migration),
    expected:
      "Deemed approval is recorded by a human admin via signedMethod='deemed'. No cron, worker, or scheduled job ships in this model — that is a separate spec.",
  },
  {
    id: "signoff-test-stubbed",
    passed:
      has("apps/web/src/test/signoff.test.ts") &&
      /deriveWindow/.test(test) &&
      /addMonth/.test(test) &&
      !/fetch\(/.test(test) &&
      !/DATABASE_URL/.test(test),
    expected:
      "signoff.test.ts exercises the pure derivation and reads the source for the SQL-only invariants — no live API call, no DB.",
  },
];

let failed = 0;
for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  if (!row.passed) failed += 1;
  console.log(`[${mark}] ${row.id}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}
console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - failed}/${check.length} sign-off check(s) green`,
);
process.exit(failed === 0 ? 0 : 1);
