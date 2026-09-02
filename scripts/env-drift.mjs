#!/usr/bin/env node
/**
 * Env-drift gate.
 *
 * The zod schema in apps/api/src/utils/env.ts is what the API believes its configuration
 * is; apps/api/.env.example is what a human is told to fill in. The two drift silently —
 * a key added to one and not the other is invisible until a box is bootstrapped from the
 * example and something is quietly unset. The 2026-08-29 mail outage was that shape:
 * nothing compared what prod HAD against what the code NEEDED.
 *
 * Two comparisons, both static:
 *   schema → example   a key the API reads that the example never mentions
 *   example → schema   a key the example documents that the schema never validates
 *
 * And one optional live probe: `--url <api base>` fetches /api/health and reports when
 * the transport or the database is unconfigured on THAT box — the runtime half of the
 * same question.
 *
 * Usage:
 *   node scripts/env-drift.mjs
 *   node scripts/env-drift.mjs --url http://127.0.0.1:6407
 *   node scripts/env-drift.mjs --json
 *
 * Exit codes: 0 clean · 1 drift found · 2 could not check.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(repoRoot, "apps/api/src/utils/env.ts");
const examplePath = join(repoRoot, "apps/api/.env.example");

const argument = process.argv.slice(2);
const isJson = argument.includes("--json");
const urlFlagIndex = argument.indexOf("--url");
const apiUrl = urlFlagIndex !== -1 ? (argument[urlFlagIndex + 1] ?? "") : "";

function fail(message) {
  console.error(`env-drift: ${message}`);
  process.exit(2);
}

if (!existsSync(schemaPath)) fail(`schema not found at ${schemaPath}`);
if (!existsSync(examplePath)) fail(`example not found at ${examplePath}`);

/** Every `KEY: z.…` line inside the zod object — the only place the API declares a key. */
export function schemaKey(source) {
  const key = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*):\s*z\./.exec(line);
    if (match) key.add(match[1]);
  }
  return [...key].sort();
}

/**
 * Every `KEY=` in the example, live or commented out. A commented `# KEY=` is still the
 * example documenting that key — most optional keys in this repo are written that way.
 */
export function exampleKey(source) {
  const key = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match) key.add(match[1]);
  }
  return [...key].sort();
}

const declared = schemaKey(readFileSync(schemaPath, "utf8"));
const documented = exampleKey(readFileSync(examplePath, "utf8"));

const documentedSet = new Set(documented);
const declaredSet = new Set(declared);
const missingFromExample = declared.filter((name) => !documentedSet.has(name));
const missingFromSchema = documented.filter((name) => !declaredSet.has(name));

/** The live half. Null when no --url was given; a string reason when the probe failed. */
let live = null;
if (apiUrl) {
  const base = apiUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    live = {
      url: `${base}/api/health`,
      status: response.status,
      isDbOk: body?.db === true,
      isEmailTransportConfigured: body?.config?.isEmailTransportConfigured === true,
    };
  } catch (error) {
    fail(`could not reach ${base}/api/health — ${error.message}`);
  }
}

const liveProblem = [];
if (live && !live.isDbOk) liveProblem.push("health reports db: false");
if (live && !live.isEmailTransportConfigured) {
  liveProblem.push("health reports config.isEmailTransportConfigured: false — mail is being DROPPED on this box");
}

const isDrifted = missingFromExample.length > 0 || missingFromSchema.length > 0 || liveProblem.length > 0;

if (isJson) {
  console.log(
    JSON.stringify(
      {
        drifted: isDrifted,
        counts: {
          declared: declared.length,
          documented: documented.length,
          missingFromExample: missingFromExample.length,
          missingFromSchema: missingFromSchema.length,
        },
        missingFromExample,
        missingFromSchema,
        live,
        liveProblem,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`schema      ${declared.length} keys in apps/api/src/utils/env.ts`);
  console.log(`example     ${documented.length} keys in apps/api/.env.example`);
  if (missingFromExample.length > 0) {
    console.error("\nMISSING FROM .env.example — the API reads these and nobody is told to set them:");
    for (const name of missingFromExample) console.error(`  ${name}`);
  }
  if (missingFromSchema.length > 0) {
    console.error("\nMISSING FROM env.ts — documented, but the schema never validates them:");
    for (const name of missingFromSchema) console.error(`  ${name}`);
  }
  if (live) {
    console.log(`\nlive        ${live.url} → ${live.status}`);
    for (const problem of liveProblem) console.error(`  ${problem}`);
  }
  if (!isDrifted) console.log("\nclean — schema and example agree" + (live ? ", and the live box is configured." : "."));
}

process.exit(isDrifted ? 1 : 0);
