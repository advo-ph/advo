/**
 * npx tsx src/scrapers/fb-page/cli.ts <page-url> --cdp http://127.0.0.1:6922 --out ./out/exquis
 * Runs the collector, writes post.json / page.json / audit.json / brand-debrief.md.
 * `--offline <html-or-json-file>` skips the browser (extractor + analysis only).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "./analyze.js";
import { collect, collectAbout, DEFAULT } from "./collect.js";
import { debrief } from "./debrief.js";
import { extractFromBlob, parseScriptBlob } from "./extract.js";
import { audit, PostLedger } from "./ledger.js";

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf("--" + n);
  return i > -1 ? process.argv[i + 1] : d;
};
const url = process.argv[2];
if (!url) {
  console.error("usage: cli.ts <page-url> [--cdp URL] [--out DIR] [--no-deep] [--offline FILE]");
  process.exit(2);
}
async function main() {
const out = arg("out", "./fb-page-out")!;
mkdirSync(out, { recursive: true });

const aboutOnly = process.argv.includes("--about-only");
let result;
if (aboutOnly) {
  const { chromium } = (await import("playwright-core")) as any;
  const browser = await chromium.connectOverCDP(arg("cdp", "http://127.0.0.1:6922")!);
  const tab = await browser.contexts()[0].newPage();
  const file = join(out, "page.json");
  const have = JSON.parse(readFileSync(file, "utf8"));
  const fresh = await collectAbout(tab, url, async () => { await new Promise((r) => setTimeout(r, 4000)); }, (e, d) => console.error(e, JSON.stringify(d ?? {})), {});
  writeFileSync(file, JSON.stringify({ ...have, ...fresh }, null, 1));
  await tab.close(); await browser.close();
  console.log(JSON.stringify(fresh, null, 1));
  return;
}
const offline = arg("offline");
if (offline) {
  const raw = readFileSync(offline, "utf8");
  const ledger = new PostLedger();
  const page = {};
  for (const b of raw.trim().startsWith("<") ? parseScriptBlob(raw) : [JSON.parse(raw)]) {
    const r = extractFromBlob(b, "ssr");
    r.post.forEach((p) => ledger.ingest(p));
    Object.assign(page, r.page);
  }
  const post = ledger.all();
  result = { page, post, stat: { stop: "offline" }, audit: audit(post, { follower_count: null, stop_reason: "offline", login_ok: false, rate_limited: false, round: 0 }) };
} else {
  result = await collect({
    ...DEFAULT, url, cdp: arg("cdp", "http://127.0.0.1:6922")!, out_dir: out,
    deep: !process.argv.includes("--no-deep"),
    skip_feed: process.argv.includes("--skip-feed"),
    max_round: Number(arg("max-round", String(DEFAULT.max_round))),
    log: (e, d) => console.error(new Date().toISOString().slice(11, 19), e, d ? JSON.stringify(d) : ""),
  });
}

const analysis = analyze(result.post, result.page);
writeFileSync(join(out, "post.json"), JSON.stringify(result.post, null, 1));
writeFileSync(join(out, "page.json"), JSON.stringify(result.page, null, 1));
writeFileSync(join(out, "audit.json"), JSON.stringify({ audit: result.audit, stat: result.stat }, null, 1));
writeFileSync(join(out, "analysis.json"), JSON.stringify(analysis, null, 1));
writeFileSync(join(out, "brand-debrief.md"), debrief(url, result.page, analysis, result.post, result.audit, result.stat));
console.log(JSON.stringify({ post: result.post.length, audit_ok: result.audit.ok, fail: result.audit.check.filter((c) => !c.ok).map((c) => c.name), stat: result.stat }, null, 1));
process.exit(result.audit.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
