#!/usr/bin/env node
/**
 * Deploy safety — authored 2026-08-23, RED at authoring.
 *
 * From the 2026-08-19 HANDOFF open-item, which is still true:
 *
 *   "deploy.sh should stop using rsync from Windows. Rewrite it around the
 *    git pull path above, and move the pm2 stop to *after* the sync so a
 *    transport failure cannot take prod down. Until then, do not run it from
 *    this box."
 *
 * What actually happened: rsync failed with `dup() in/out/err failed` (an
 * MSYS/Git-Bash file-descriptor bug), and because the script does `pm2 stop`
 * BEFORE the sync, that failure left prod down for ~2 minutes. The working
 * deploy was done by hand as `git fetch && git reset --hard origin/main` on the
 * box, because /opt/advo is a checkout of the same origin.
 *
 * The ordering check is the load-bearing one: a transport failure must never be
 * able to stop the API without bringing it back.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const script = read("deploy.sh");

/**
 * Comment lines are stripped before any ORDERING question is asked. The header
 * of deploy.sh documents "rsync apps/web/dist/ ..." on line 7, which a naive
 * scan reads as the sync step and places BEFORE the pm2 stop on line 62 —
 * turning the ordering check green while the real bug sits untouched. Order is
 * a property of executable lines only.
 */
const line = script
  .split("\n")
  .map((l) => (/^\s*#/.test(l) ? "" : l.replace(/\s#.*$/, "")));

/** First 0-based index of an EXECUTABLE line matching a pattern, or -1. */
const lineOf = (pattern) => line.findIndex((l) => pattern.test(l));

const stopIndex = lineOf(/pm2\s+stop/);
const syncIndex = lineOf(/rsync|git\s+(fetch|pull)|reset\s+--hard/);
const restartIndex = lineOf(/pm2\s+(restart|start)/);

const checks = [
  {
    id: "no-rsync-transport",
    title: "The API deploy no longer moves code with rsync",
    passed: script.length > 0 && !line.some((l) => /rsync/.test(l)),
    expected:
      "deploy.sh contains no rsync. The box is a git checkout of the same origin, so the API deploy is a fetch + reset, which does not depend on a working rsync on the operator's machine.",
  },
  {
    id: "git-pull-path",
    title: "The API deploy is a git fetch + reset on the box",
    passed: /git\s+fetch/.test(script) && /reset\s+--hard\s+origin\//.test(script),
    expected:
      "deploy.sh fetches and hard-resets /opt/advo to origin/<branch> — the path that actually worked on 2026-08-19.",
  },
  {
    id: "stop-after-sync",
    title: "The service is never stopped before the code has arrived",
    passed:
      stopIndex === -1 || (syncIndex !== -1 && stopIndex > syncIndex),
    expected:
      "Any `pm2 stop` occurs AFTER the sync step, or does not exist at all. Stopping first means a failed transport leaves prod down — that is the 2026-08-19 outage.",
  },
  {
    id: "restart-is-last",
    title: "A restart always follows the stop",
    passed:
      stopIndex === -1 || (restartIndex !== -1 && restartIndex > stopIndex),
    expected:
      "If the script stops the service it must restart it later in the file, so no exit path leaves the API down.",
  },
  {
    id: "fails-before-touching-prod",
    title: "The script aborts on any error rather than continuing half-deployed",
    passed: /set\s+-euo\s+pipefail|set\s+-e/.test(script),
    expected:
      "deploy.sh runs under `set -e` (ideally `set -euo pipefail`) so a failed step cannot fall through into a restart of stale code.",
  },
  {
    id: "env-preserved",
    title: "The reset cannot delete the box's .env",
    passed:
      /\.env/.test(script) &&
      /(backup|\.bak|cp\s+-f\s+\.env)/.test(script),
    expected:
      "The script backs up apps/api/.env before the reset. `git reset --hard` leaves untracked files alone, but the backup is what makes that safe to rely on.",
  },
  {
    id: "windows-warning-retired",
    title: "The do-not-run-from-Windows warning is gone because the cause is gone",
    passed:
      script.length > 0 &&
      !/do not run .* from this box|do not run it from this box/i.test(script) &&
      !/rsync/.test(script),
    expected:
      "Once rsync is out of the transport path the Windows caveat no longer applies and should not be left in the header.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "deploy-safety",
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
