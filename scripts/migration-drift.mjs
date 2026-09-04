#!/usr/bin/env node
/**
 * Migration drift detector.
 *
 * Compares apps/api/migrations/*.sql against the `schema_migration` ledger in a target
 * database and exits non-zero when the target has not seen every migration in the tree.
 *
 * It exists because prod was missing 005_expense.sql while 012-015 were on the box, and
 * nothing in this repo could say so. Comparing only the newest applied migration would
 * have reported that database as up to date. This compares the whole set, so a hole in
 * the middle is a first-class finding.
 *
 * Usage:
 *   npm run migration:drift                        # target: apps/api/.env DATABASE_URL
 *   npm run migration:drift -- --url postgres://…  # target: an explicit database
 *   npm run migration:drift -- --json              # machine-readable, for a deploy gate
 *
 * Exit codes: 0 clean · 1 drift found (or the ledger is absent) · 2 could not check.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(repoRoot, "apps/api/migrations");
const LEDGER_MIGRATION = "019_schema_ledger.sql";

const argument = process.argv.slice(2);
const isJson = argument.includes("--json");
const urlFlagIndex = argument.indexOf("--url");

/** Last assignment wins, matching how dotenv folds a repeated key. */
function urlFromEnvFile() {
  const envPath = join(repoRoot, "apps/api/.env");
  if (!existsSync(envPath)) return "";
  let found = "";
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (match) found = match[1].trim().replace(/^["']|["']$/g, "");
  }
  return found;
}

const databaseUrl =
  (urlFlagIndex !== -1 ? argument[urlFlagIndex + 1] : "") ||
  process.env.DATABASE_URL ||
  urlFromEnvFile();

function fail(message) {
  console.error(`migration-drift: ${message}`);
  process.exit(2);
}

if (!databaseUrl) {
  fail("no target database. Pass --url, or set DATABASE_URL, or fill apps/api/.env.");
}

const fileOnDisk = existsSync(migrationDir)
  ? readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
  : [];

if (fileOnDisk.length === 0) fail(`no migrations found in ${migrationDir}`);

/**
 * Every CHECK constraint the migration tree names. Matches both the in-table form
 * (`CONSTRAINT chk_x CHECK (...)`) and the ALTER form (`ADD CONSTRAINT chk_x`), so a
 * constraint counts as declared however it is written.
 */
function declaredConstraint() {
  // A constraint belongs to a table, and a later migration may DROP that table
  // (035/042 tasks-unification drops `task`, taking its chk_task_* with it). Track
  // the table each chk_ is declared on, and the tables that end up dropped, so a
  // constraint on a dropped table is not reported as "declared but absent".
  const tableOf = new Map(); // chk_name -> table it was declared on
  const dropped = new Set();
  for (const file of fileOnDisk) {
    const body = readFileSync(join(migrationDir, file), "utf8");
    for (const m of body.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi)) {
      dropped.add(m[1].toLowerCase());
    }
    // Walk statements, tracking the current table (CREATE/ALTER TABLE <t>), and
    // bind every CONSTRAINT chk_x to it.
    let currentTable = null;
    for (const line of body.split(/\n/)) {
      const t =
        /(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?)\s+"?([a-z0-9_]+)"?/i.exec(line);
      if (t) currentTable = t[1].toLowerCase();
      const c = /CONSTRAINT\s+(chk_[a-z0-9_]+)/i.exec(line);
      if (c) tableOf.set(c[1], currentTable);
    }
  }
  return [...tableOf.entries()]
    .filter(([, table]) => !table || !dropped.has(table))
    .map(([name]) => name)
    .sort();
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false, onnotice: () => {} });

let appliedRow = [];
/** Every chk_* CHECK constraint the target actually has. Half of the shape-drift check. */
let constraintRow = [];
let hasLedger = false;
try {
  const ledgerPresent = await sql`SELECT to_regclass('public.schema_migration') AS relation`;
  hasLedger = ledgerPresent[0]?.relation !== null;
  if (hasLedger) {
    appliedRow = await sql`
      SELECT filename, applied_at, is_backfilled
      FROM schema_migration
      ORDER BY filename
    `;
  }
  // Queried regardless of the ledger: a database with no ledger still has a shape, and
  // the two failures are independent.
  // `chk%`, not `chk\_%`. The escaped-underscore form needs a backslash that survives
  // both the JS string and the SQL parser, and getting that wrong makes the pattern
  // match NOTHING while still returning cleanly — which is how this check silently
  // reported "clean" the first time it was written. The prefix alone is specific
  // enough: every constraint this repo declares is named chk_<table>_<rule>.
  constraintRow = await sql`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND conname LIKE 'chk%'
  `;
} catch (error) {
  await sql.end({ timeout: 5 }).catch(() => {});
  fail(`could not query the target database — ${error.message}`);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

const appliedName = new Set(appliedRow.map((row) => row.filename));

/**
 * A migration is a GAP when something later than it has been applied: the database moved
 * past it without running it. It is a TAIL when nothing later is applied either — an
 * ordinary not-yet-deployed migration. Both are drift; only one is alarming.
 */
const unapplied = fileOnDisk
  .filter((name) => !appliedName.has(name))
  .map((name) => {
    const later = fileOnDisk.slice(fileOnDisk.indexOf(name) + 1);
    return { filename: name, kind: later.some((n) => appliedName.has(n)) ? "gap" : "tail" };
  });

/** Recorded as applied but no longer in the tree — a deleted or renamed migration. */
const orphan = appliedRow
  .filter((row) => !fileOnDisk.includes(row.filename))
  .map((row) => row.filename);

/**
 * SHAPE DRIFT: declared in the tree, absent from the database.
 *
 * Only meaningful once every migration is applied — a constraint from an UNAPPLIED
 * migration is legitimately missing, and reporting it would make an ordinary
 * not-yet-deployed migration look like corruption.
 */
const presentConstraint = new Set(constraintRow.map((row) => row.conname));
const missingConstraint =
  unapplied.length === 0
    ? declaredConstraint().filter((name) => !presentConstraint.has(name))
    : [];

const gap = unapplied.filter((entry) => entry.kind === "gap");
const tail = unapplied.filter((entry) => entry.kind === "tail");
const isDrifted =
  !hasLedger || unapplied.length > 0 || orphan.length > 0 || missingConstraint.length > 0;

if (isJson) {
  console.log(
    JSON.stringify(
      {
        target: databaseUrl.replace(/\/\/[^@]*@/, "//<credential>@"),
        hasLedger,
        drifted: isDrifted,
        counts: {
          onDisk: fileOnDisk.length,
          applied: appliedRow.length,
          gap: gap.length,
          tail: tail.length,
          orphan: orphan.length,
          missingConstraint: missingConstraint.length,
        },
        gap: gap.map((entry) => entry.filename),
        tail: tail.map((entry) => entry.filename),
        orphan,
        missingConstraint,
      },
      null,
      2,
    ),
  );
} else if (!hasLedger) {
  console.error("DRIFT — the target has no schema_migration ledger.");
  console.error(`  Apply apps/api/migrations/${LEDGER_MIGRATION} first. It backfills what`);
  console.error("  the database already has, so this is safe on an existing box.");
} else {
  console.log(`target      ${databaseUrl.replace(/\/\/[^@]*@/, "//<credential>@")}`);
  console.log(`on disk     ${fileOnDisk.length} migrations`);
  console.log(`applied     ${appliedRow.length} recorded`);
  if (gap.length > 0) {
    console.error(`\nGAP — applied set has a hole; later migrations ran without these:`);
    for (const entry of gap) console.error(`  ${entry.filename}`);
  }
  if (tail.length > 0) {
    console.error(`\nUNAPPLIED — not deployed yet:`);
    for (const entry of tail) console.error(`  ${entry.filename}`);
  }
  if (orphan.length > 0) {
    console.error(`\nORPHAN — recorded applied but missing from the tree:`);
    for (const name of orphan) console.error(`  ${name}`);
  }
  if (missingConstraint.length > 0) {
    console.error("\nSHAPE DRIFT — declared in the tree, ABSENT from the database:");
    for (const name of missingConstraint) console.error(`  ${name}`);
    console.error("\n  The ledger is clean and the schema is still wrong. This is what happens");
    console.error("  when db:push creates a table from schema.ts (which cannot express a CHECK)");
    console.error("  and the migration's CREATE TABLE IF NOT EXISTS then becomes a no-op —");
    console.error("  silently skipping every constraint it declared.");
    console.error("\n  Apply apps/api/migrations/025_enforce_check_constraint.sql, which adds");
    console.error("  them idempotently. If it FAILS, that is the point: real rows are sitting");
    console.error("  outside a rule the code believed was enforced.");
  }
  if (!isDrifted) {
    console.log("\nclean — every migration applied, and every declared CHECK is present.");
  }
}

if (isDrifted) process.exit(1);
process.exit(0);
