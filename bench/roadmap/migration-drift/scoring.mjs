#!/usr/bin/env node
/**
 * Migration drift — authored 2026-08-23, RED at authoring.
 *
 * Why this exists, discovered 2026-08-23 rather than reported by anything:
 * prod's own health payload carries `relation "expense" does not exist`, dated
 * 2026-08-19. `/api/expense` is mounted and 401-gates correctly, so every probe
 * short of an authenticated call looks fine — but migration `005_expense.sql`
 * was never applied to prod. Meanwhile `012`–`015` are on the box. The applied
 * set has a HOLE in the middle of it, and nothing in this repo could have told
 * anyone that.
 *
 * There is no migration ledger at all: `apps/api/migrations/*.sql` is applied by
 * hand, so "which migration has this database seen?" is unanswerable. That is
 * the actual defect. A deploy that cannot answer it will keep shipping code
 * whose tables are absent.
 *
 * This bench does NOT require a live database. It asserts the mechanism exists
 * and is honest; pointing it at prod is the operator's step.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const migrationDir = join(repoRoot, "apps/api/migrations");
const migrationFile = existsSync(migrationDir)
  ? readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort()
  : [];

const detector = read("scripts/migration-drift.mjs");
const ledger = read("apps/api/migrations/019_schema_ledger.sql");

const checks = [
  {
    id: "ledger-migration-exists",
    title: "A schema ledger migration exists",
    passed: ledger.length > 0 && /create\s+table/i.test(ledger),
    expected:
      "apps/api/migrations/019_schema_ledger.sql creates the table that records which migration a database has applied. 019 is this lane's assigned number — do not take 020.",
  },
  {
    id: "ledger-records-identity-and-time",
    title: "The ledger records which migration, and when",
    passed:
      /filename|migration_name|migration_id/i.test(ledger) &&
      /applied_at|timestamp/i.test(ledger),
    expected:
      "The ledger stores the migration filename and an applied-at timestamp, so a hole in the middle of the sequence is visible rather than inferred from the highest number.",
  },
  {
    id: "ledger-is-backfillable",
    title: "The ledger can be seeded from a database that predates it",
    passed: /insert\s+into/i.test(ledger) || /backfill/i.test(ledger),
    expected:
      "Prod already has 17 migrations applied and no record of them. The migration must seed known-applied rows (or the detector must accept a documented backfill) — otherwise every existing database reports total drift on day one.",
  },
  {
    id: "detector-exists",
    title: "A drift detector exists and is runnable",
    passed: detector.length > 0 && has("scripts/migration-drift.mjs"),
    expected:
      "scripts/migration-drift.mjs compares apps/api/migrations/*.sql against the ledger in a target database.",
  },
  {
    id: "detector-reads-both-side",
    title: "The detector compares the directory against the database",
    passed:
      /migrations/.test(detector) &&
      /readdir|readdirSync/.test(detector) &&
      /(pg|postgres|DATABASE_URL|psql)/i.test(detector),
    expected:
      "It enumerates the migration directory AND queries the target database. A checker that reads only one side cannot find a hole.",
  },
  {
    id: "detector-finds-a-hole-not-just-a-tail",
    title: "The detector reports gaps in the middle, not only the highest applied",
    passed: /gap|missing|hole|unapplied/i.test(detector) && !/max\(|highest/i.test(detector),
    expected:
      "005 missing while 015 is present is the real failure. Comparing only the newest applied migration would have reported prod as up to date.",
  },
  {
    id: "detector-exits-nonzero-on-drift",
    title: "Drift fails the command rather than printing a warning",
    passed: /process\.exit\(\s*1\s*\)|exitCode\s*=\s*1/.test(detector),
    expected:
      "The detector exits non-zero when the target is missing any migration, so it can gate a deploy instead of scrolling past in a log.",
  },
  {
    id: "detector-is-registered",
    title: "The detector is a named script, not a file someone has to remember",
    passed: /migration-drift|migration:drift/.test(read("package.json")),
    expected:
      "package.json exposes it (e.g. `npm run migration:drift`) so the deploy path and a human can both reach it the same way.",
  },
  {
    id: "no-migration-number-collision",
    title: "Migration numbering has no duplicate prefix",
    passed: (() => {
      const prefix = migrationFile.map((f) => f.slice(0, 3));
      return new Set(prefix).size === prefix.length;
    })(),
    expected:
      "Two lanes each adding a migration is a numbering collision by construction. drift owns 019, bounce owns 020. This check catches it if either takes the other's.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "migration-drift",
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
