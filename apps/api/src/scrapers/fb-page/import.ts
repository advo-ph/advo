/**
 * Load a finished scrape directory into Postgres (migration 062).
 *   node --env-file=.env --import tsx src/scrapers/fb-page/import.ts <out-dir> <page-url> [--client <client_id>]
 * Needs DATABASE_URL (+ the usual JWT secrets that env() validates). Idempotent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeDb, initDb } from "../../db/connection.js";
import { loadEnv } from "../../utils/env.js";
import { persistRun } from "../../services/fb-page-store.service.js";

async function main() {
  const dir = process.argv[2];
  const url = process.argv[3];
  if (!dir || !url) {
    console.error("usage: import.ts <out-dir> <page-url> [--client <client_id>]");
    process.exit(2);
  }
  const ci = process.argv.indexOf("--client");
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const audit = read("audit.json");
  loadEnv();
  initDb();
  try {
    const r = await persistRun({
      url, page: read("page.json"), post: read("post.json"), analysis: read("analysis.json"),
      audit: audit.audit, stat: audit.stat, client_id: ci > -1 ? Number(process.argv[ci + 1]) : null,
    });
    console.log(JSON.stringify(r));
  } finally {
    await closeDb();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
