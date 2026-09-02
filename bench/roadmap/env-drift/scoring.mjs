#!/usr/bin/env node
/**
 * Env-drift gate — authored 2026-09-02.
 *
 * The 2026-08-29 mail outage was a configuration hole nothing compared against anything:
 * prod's .env had no transport, the schema said that was fine, and the example never
 * told anyone otherwise. This benchmark asserts that the comparison now EXISTS, is wired
 * where a human runs it and where CI runs it, and that the tree is currently clean.
 *
 * The last check runs scripts/env-drift.mjs for real rather than reading it, because a
 * gate that is present but red is the state that hides drift best.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const scriptPath = "scripts/env-drift.mjs";
const packageJson = read("package.json");
const ci = read(".github/workflows/ci.yml");

/** CI is one file with several jobs; only the Verify job counts. */
const verifyJob = (() => {
  const start = ci.indexOf("name: Verify");
  if (start === -1) return "";
  const next = ci.indexOf("\n  deploy-web:", start);
  return ci.slice(start, next === -1 ? undefined : next);
})();

const run = spawnSync(process.execPath, [join(repoRoot, scriptPath), "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
let report = null;
try {
  report = JSON.parse(run.stdout);
} catch {
  report = null;
}

const checks = [
  {
    id: "script-exists",
    title: "scripts/env-drift.mjs exists",
    passed: existsSync(join(repoRoot, scriptPath)),
    expected: "The comparison between env.ts and .env.example has to be a script, not a habit.",
  },
  {
    id: "npm-script-wired",
    title: "package.json exposes env:drift and bench:env",
    passed: /"env:drift":\s*"node scripts\/env-drift\.mjs/.test(packageJson) && /"bench:env":\s*"node bench\/roadmap\/env-drift\/scoring\.mjs"/.test(packageJson),
    expected: "A human runs `npm run env:drift`; this benchmark runs as `npm run bench:env`.",
  },
  {
    id: "ci-runs-gate",
    title: "The CI Verify job runs the drift script",
    passed: /node scripts\/env-drift\.mjs/.test(verifyJob),
    expected: "Drift between the schema and the example must fail a pull request, not wait for a bootstrapped box to go quiet.",
  },
  {
    id: "no-key-drift",
    title: "env.ts and .env.example currently agree",
    passed:
      run.status === 0 &&
      report !== null &&
      report.counts.missingFromExample === 0 &&
      report.counts.missingFromSchema === 0,
    expected:
      report === null
        ? `scripts/env-drift.mjs did not produce JSON (exit ${run.status}): ${run.stderr.trim()}`
        : `missing from example: ${report.missingFromExample.join(", ") || "none"}; missing from schema: ${report.missingFromSchema.join(", ") || "none"}.`,
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "env-drift",
  date: "2026-09-02",
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
