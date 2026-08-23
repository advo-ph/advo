#!/usr/bin/env node
/**
 * Prod ship — authored 2026-08-23, RED at authoring.
 *
 * Three features are merged to main and return 404 on prod, and a fourth is
 * mounted over a table that does not exist there. Probed live 2026-08-23:
 *
 *   /api/project-signoff  404   migration 016 — never deployed
 *   /api/recurring-fee    404   migration 017 — never deployed
 *   /api/commission       404   migration 018 — never deployed
 *   /api/expense          401   mounted, but prod logs
 *                               `relation "expense" does not exist` (2026-08-19)
 *                               — migration 005 was never applied
 *
 * Note what that last one means: prod's applied-migration set has a HOLE. 005 is
 * absent while 015 is present. This lane deploys against that history knowingly
 * — the operator chose to run it without waiting for the drift detector — so it
 * must SNAPSHOT what prod actually has before changing anything, and the
 * snapshot is a graded check, not a courtesy.
 *
 * This bench probes the LIVE API. It is not a source check and it cannot pass
 * from a local tree alone.
 *
 *   ADVO_API_URL=https://api.advo.ph node bench/roadmap/prod-ship/scoring.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const apiUrl = (process.env.ADVO_API_URL ?? "https://api.advo.ph").replace(/\/$/, "");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const has = (relativePath) => existsSync(join(repoRoot, relativePath));

/** Probe a route; a network failure is a failed check, never a pass. */
async function status(path) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

async function health() {
  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      signal: AbortSignal.timeout(15000),
    });
    return await response.json();
  } catch {
    return null;
  }
}

const snapshot = read("docs/deploy/2026-08-23-pre-ship-snapshot.md");
const live = await health();

/** A mounted, auth-gated route answers 401 — not 404, and not 500. */
const MOUNTED = new Set([401, 403]);

const signoff = await status("/api/project-signoff");
const recurring = await status("/api/recurring-fee");
const commission = await status("/api/commission");

const checks = [
  {
    id: "pre-ship-snapshot",
    title: "Prod's state was recorded before anything was changed",
    passed:
      snapshot.length > 0 &&
      /migration/i.test(snapshot) &&
      /(pg_dump|backup)/i.test(snapshot) &&
      /\b005\b/.test(snapshot),
    expected:
      "docs/deploy/2026-08-23-pre-ship-snapshot.md records the applied-migration list read off prod, the pg_dump path, and what the 005 hole actually looked like. Written BEFORE the first change. Without this there is no way back and no record of what the history really was.",
  },
  {
    id: "signoff-mounted",
    title: "GET /api/project-signoff is live and auth-gated",
    passed: MOUNTED.has(signoff),
    expected: `Migration 016 applied and the API restarted; the route answers 401 rather than 404. Observed: ${signoff || "unreachable"}.`,
  },
  {
    id: "recurring-fee-mounted",
    title: "GET /api/recurring-fee is live and auth-gated",
    passed: MOUNTED.has(recurring),
    expected: `Migration 017 applied and the API restarted. Observed: ${recurring || "unreachable"}.`,
  },
  {
    id: "commission-mounted",
    title: "GET /api/commission is live and auth-gated",
    passed: MOUNTED.has(commission),
    expected: `Migration 018 applied and the API restarted. Observed: ${commission || "unreachable"}.`,
  },
  {
    id: "expense-table-exists",
    title: "Migration 005 is applied and the expense relation was verified on prod",
    passed:
      // `health.error.recent` is a ROLLING buffer. The relation error was in it
      // on 2026-08-23 and will age out on its own, so "no recent error mentions
      // expense" goes green while the table is still missing — it measures
      // buffer age, not schema. The route is auth-gated, so an unauthenticated
      // probe cannot reach the query either. Positive evidence is the only
      // honest answer: the operator records the verification in the snapshot.
      /\b005\b/.test(snapshot) &&
      /expense/i.test(snapshot) &&
      /(verified|applied|select .* from expense|\\dt)/i.test(snapshot) &&
      live !== null &&
      !JSON.stringify(live.error ?? {}).includes('relation "expense" does not exist'),
    expected:
      "The snapshot records that 005 was applied and that the expense relation was then read back on prod (a \\dt or a SELECT), AND health shows no expense relation error. Both halves — the health buffer alone proves nothing once the error ages out.",
  },
  {
    id: "health-reachable",
    title: "The API is up after the deploy",
    passed: live !== null && live.status === "ok" && live.db === true,
    expected:
      "GET /api/health returns status ok with db true. A deploy that ends with the API down is not a deploy.",
  },
  {
    id: "no-new-degradation",
    title: "The deploy introduced no new degraded subsystem",
    passed:
      live !== null &&
      (live.degradedReason ?? []).every((r) => /plaud/i.test(r)),
    expected:
      "The only permitted degraded reason is the pre-existing Plaud one — no token is on the box and that is expected. Anything else means this deploy broke something.",
  },
  {
    id: "ownership-transferred",
    title: "New objects are readable by the app role, not just postgres",
    passed:
      snapshot.length > 0 &&
      /owner\s+to\s+advo/i.test(snapshot),
    expected:
      "Migrations run as postgres reproduce the known ownership bug — the app role cannot read the new objects. The snapshot records the ALTER ... OWNER TO advo statements that were run and verified. This bit prod on 2026-08-19 with the campaign tables.",
  },
  {
    id: "rollback-path-recorded",
    title: "A rollback path exists and is written down",
    passed:
      snapshot.length > 0 &&
      /(rollback|restore|dist\.prev|\.dump)/i.test(snapshot),
    expected:
      "The snapshot names the dump file and the exact restore command. An irreversible deploy with no written way back is the thing that turns a bad migration into an outage.",
  },
  {
    id: "deploy-runbook-committed",
    title: "What was actually done is committed, not just done",
    passed: has("docs/deploy/2026-08-23-pre-ship-snapshot.md"),
    expected:
      "The snapshot and runbook live in the repo so the next deploy starts from a record rather than from someone's terminal scrollback.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "prod-ship",
  date: "2026-08-23",
  target: apiUrl,
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
