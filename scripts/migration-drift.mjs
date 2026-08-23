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

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false, onnotice: () => {} });

let appliedRow = [];
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

const gap = unapplied.filter((entry) => entry.kind === "gap");
const tail = unapplied.filter((entry) => entry.kind === "tail");
const isDrifted = !hasLedger || unapplied.length > 0 || orphan.length > 0;

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
        },
        gap: gap.map((entry) => entry.filename),
        tail: tail.map((entry) => entry.filename),
        orphan,
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
  if (!isDrifted) console.log("\nclean — the target has seen every migration in the tree.");
}

if (isDrifted) process.exit(1);
process.exit(0);
