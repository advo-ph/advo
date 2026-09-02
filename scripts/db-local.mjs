#!/usr/bin/env node
/**
 * One-command local database.
 *
 * Bootstrapping used to be four steps in docs/SETUP.md, and step two (`db:push`) was
 * where migration 025's defect came from: drizzle creates every table WITHOUT its CHECK
 * constraints, the migrations' CREATE TABLE IF NOT EXISTS then no-op, and nothing said
 * so. This script does the whole sequence in the order that ends clean, and finishes by
 * asking scripts/migration-drift.mjs whether it did — so the last line printed is a
 * verdict, not a hope.
 *
 *   1. create the database if it does not exist
 *   2. `db:push` against it (schema.ts → tables)
 *   3. apply every apps/api/migrations/*.sql not yet in the schema_migration ledger, in
 *      filename order — 019 first when the ledger is missing, since 019 creates it
 *   4. run migration-drift and print its verdict
 *
 * Usage:
 *   npm run db:local                                  # postgresql://postgres@127.0.0.1:5432/advo
 *   npm run db:local -- --name advo_scratch
 *   npm run db:local -- --base postgresql://postgres:pw@localhost:5432
 *
 * psql is found on PATH or at the Windows installer's default location. Nothing here
 * touches a database other than the one named.
 *
 * Exit codes: 0 clean · 1 the final drift verdict is not clean · 2 could not run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(repoRoot, "apps/api/migrations");
const LEDGER_MIGRATION = "019_schema_ledger.sql";

const argument = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argument.indexOf(name);
  return index !== -1 && argument[index + 1] ? argument[index + 1] : fallback;
};
const databaseName = flag("--name", "advo");
const baseUrl = flag("--base", "postgresql://postgres@127.0.0.1:5432").replace(/\/+$/, "");
const databaseUrl = `${baseUrl}/${databaseName}`;

function fail(message) {
  console.error(`db-local: ${message}`);
  process.exit(2);
}

if (!/^[a-z_][a-z0-9_]*$/i.test(databaseName)) fail(`refusing database name "${databaseName}"`);

/** PATH first; the Windows installer's default second, newest major first. */
function findPsql() {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["psql"], { encoding: "utf8" });
  if (probe.status === 0) {
    const found = probe.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (found) return found;
  }
  if (process.platform === "win32") {
    const root = "C:/Program Files/PostgreSQL";
    if (existsSync(root)) {
      const version = readdirSync(root)
        .filter((name) => /^\d+$/.test(name))
        .sort((a, b) => Number(b) - Number(a));
      for (const major of version) {
        const candidate = join(root, major, "bin/psql.exe");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

const psqlPath = findPsql();
if (!psqlPath) fail("psql not found on PATH or under C:/Program Files/PostgreSQL/<major>/bin");

/** ON_ERROR_STOP so a failing statement fails the run, rather than psql shrugging past it. */
function psql(url, sqlOrFile, { isFile = false, isTuplesOnly = false } = {}) {
  const arg = ["--set", "ON_ERROR_STOP=1", "--quiet", "--no-psqlrc"];
  if (isTuplesOnly) arg.push("--tuples-only", "--no-align");
  arg.push(isFile ? "--file" : "--command", sqlOrFile, url);
  const result = spawnSync(psqlPath, arg, { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } });
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
}

/** Index of the `)` that closes the `(` just before `from`, honouring nesting. */
function closingParen(text, from) {
  let depth = 1;
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/**
 * Every `CONSTRAINT chk_* CHECK (…)` written inside a CREATE TABLE body anywhere in the
 * migration tree, with the table it belongs to. Comments are stripped first so a
 * parenthesis in prose cannot unbalance the scan.
 */
function declaredCheckInCreateTable() {
  const found = [];
  for (const file of fileOnDisk) {
    const text = readFileSync(join(migrationDir, file), "utf8").replace(/--[^\n]*/g, "");
    const createTable = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
    let tableMatch;
    while ((tableMatch = createTable.exec(text))) {
      const bodyEnd = closingParen(text, createTable.lastIndex);
      if (bodyEnd === -1) break;
      const body = text.slice(createTable.lastIndex, bodyEnd);
      const constraint = /CONSTRAINT\s+(chk_[a-z0-9_]+)\s+CHECK\s*\(/gi;
      let constraintMatch;
      while ((constraintMatch = constraint.exec(body))) {
        const expressionEnd = closingParen(body, constraint.lastIndex);
        if (expressionEnd === -1) break;
        found.push({
          file,
          table: tableMatch[1],
          name: constraintMatch[1],
          expression: body.slice(constraint.lastIndex, expressionEnd).trim(),
        });
        constraint.lastIndex = expressionEnd;
      }
      createTable.lastIndex = bodyEnd;
    }
  }
  return found;
}

function presentCheckName() {
  const row = psql(databaseUrl, "SELECT conname FROM pg_constraint WHERE contype = 'c'", { isTuplesOnly: true });
  if (row.status !== 0) fail(`could not read pg_constraint — ${row.stderr}`);
  return new Set(row.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

console.log(`db-local: ${databaseUrl}`);
console.log(`psql      ${psqlPath}`);

// ── 1. create if missing ─────────────────────────────
const exist = psql(`${baseUrl}/postgres`, `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`, { isTuplesOnly: true });
if (exist.status !== 0) fail(`could not reach ${baseUrl}/postgres — ${exist.stderr}`);
if (exist.stdout === "1") {
  console.log(`database  ${databaseName} exists`);
} else {
  const created = psql(`${baseUrl}/postgres`, `CREATE DATABASE "${databaseName}"`);
  if (created.status !== 0) fail(`CREATE DATABASE failed — ${created.stderr}`);
  console.log(`database  ${databaseName} created`);
}

// ── 2. db:push — on a database that has never been migrated ──
// Once the ledger has rows, the schema moves by migration only: drizzle-kit's
// introspection crashes on the migrated shape (verified 2026-09-02, "Cannot read
// properties of undefined (reading 'value')"), and even when it did not, pushing over
// migrated tables is how a CHECK or a column default quietly disappears.
// Two queries, not one CASE: Postgres resolves every relation in a statement at parse
// time, so `SELECT count(*) FROM schema_migration` errors even in an untaken branch.
const hasLedger = psql(databaseUrl, "SELECT to_regclass('public.schema_migration') IS NOT NULL", { isTuplesOnly: true });
if (hasLedger.status !== 0) fail(`could not query ${databaseName} — ${hasLedger.stderr}`);
const ledgerRowCount =
  hasLedger.stdout === "t"
    ? psql(databaseUrl, "SELECT count(*) FROM schema_migration", { isTuplesOnly: true })
    : { status: 0, stdout: "0", stderr: "" };
if (ledgerRowCount.status !== 0) fail(`could not read the ledger — ${ledgerRowCount.stderr}`);

if (Number(ledgerRowCount.stdout) > 0) {
  console.log(`db:push   skipped — ${ledgerRowCount.stdout} migration(s) already recorded; the schema moves by migration from here`);
} else {
  // drizzle-kit push prompts on anything ambiguous (renames, drops). --force answers
  // "yes" so it can run unattended; on a fresh database there is nothing to ask about.
  const push = spawnSync("npm", ["--workspace", "apps/api", "run", "db:push", "--", "--force"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (push.status !== 0) {
    console.error(push.stdout);
    console.error(push.stderr);
    fail("db:push failed");
  }
  console.log("db:push   ok");
}

// ── 3. migrations not yet in the ledger ──────────────
const fileOnDisk = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const ledger = psql(databaseUrl, "SELECT to_regclass('public.schema_migration') IS NOT NULL", { isTuplesOnly: true });
if (ledger.status !== 0) fail(`could not query ${databaseName} — ${ledger.stderr}`);
if (ledger.stdout !== "t") {
  const seeded = psql(databaseUrl, join(migrationDir, LEDGER_MIGRATION), { isFile: true });
  if (seeded.status !== 0) fail(`${LEDGER_MIGRATION} failed — ${seeded.stderr}`);
  console.log(`ledger    created by ${LEDGER_MIGRATION}`);
}

const applied = psql(databaseUrl, "SELECT filename FROM schema_migration ORDER BY filename", { isTuplesOnly: true });
if (applied.status !== 0) fail(`could not read the ledger — ${applied.stderr}`);
const appliedName = new Set(applied.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));

let appliedCount = 0;
for (const file of fileOnDisk) {
  if (appliedName.has(file)) continue;
  const result = psql(databaseUrl, join(migrationDir, file), { isFile: true });
  if (result.status !== 0) fail(`${file} failed — ${result.stderr}`);
  // 020+ write their own ledger row; older files were backfilled by 019 where their
  // sentinel object exists. Anything left unrecorded is recorded here so the ledger
  // matches what actually ran, and the unique index makes a repeat a no-op.
  const recorded = psql(
    databaseUrl,
    `INSERT INTO schema_migration (filename) VALUES ('${file}') ON CONFLICT (filename) DO NOTHING`,
  );
  if (recorded.status !== 0) fail(`could not record ${file} — ${recorded.stderr}`);
  appliedCount += 1;
  console.log(`applied   ${file}`);
}
if (appliedCount === 0) console.log("migrate   nothing to apply");

// ── 3b. CHECK constraints the migrations declared but db:push pre-empted ──
//
// Migration 025's defect, handled generically: a CHECK written INSIDE a
// `CREATE TABLE IF NOT EXISTS` body is silently skipped when db:push already created
// the table from schema.ts. Every such constraint in the tree is compared against
// pg_constraint and added where missing. Each addition is printed with the migration
// that declared it — because the same migration will leave the same hole on every box
// bootstrapped this way, prod included, until it is rewritten in 025's ALTER form.
const missingCheck = declaredCheckInCreateTable().filter((check) => !presentCheckName().has(check.name));
for (const check of missingCheck) {
  const added = psql(
    databaseUrl,
    `ALTER TABLE "${check.table}" ADD CONSTRAINT ${check.name} CHECK (${check.expression})`,
  );
  if (added.status !== 0) fail(`could not add ${check.name} on ${check.table} — ${added.stderr}`);
  console.log(`check     ${check.name} added — ${check.file} declares it inside CREATE TABLE IF NOT EXISTS, which db:push turned into a no-op`);
}

// ── 4. verdict ───────────────────────────────────────
console.log("");
const drift = spawnSync(process.execPath, [join(repoRoot, "scripts/migration-drift.mjs"), "--url", databaseUrl], {
  cwd: repoRoot,
  encoding: "utf8",
});
process.stdout.write(drift.stdout);
process.stderr.write(drift.stderr);
process.exit(drift.status === 0 ? 0 : 1);
