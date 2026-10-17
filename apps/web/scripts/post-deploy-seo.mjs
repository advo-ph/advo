#!/usr/bin/env node
/**
 * Run after advo.ph is live. Two jobs, and neither can fail a deploy:
 *
 * 1. Check that nginx serves each page its own HTML. scripts/prerender.mjs writes
 *    dist/<page>/index.html, but nginx only uses them when location / says
 *    `try_files $uri $uri/index.html /index.html;`. Without that, every path gets
 *    the home page's HTML and crawlers that skip JavaScript see one page.
 *
 * 2. Ping IndexNow with every URL in the sitemap. IndexNow feeds Bing, which in
 *    turn feeds ChatGPT search, Copilot, and DuckDuckGo, so a deploy is seen in
 *    minutes rather than days. Google does not use IndexNow; it reads sitemap.xml.
 *    The key is public by design: apps/web/public/indexnow-key.txt.
 *
 * Usage: node apps/web/scripts/post-deploy-seo.mjs <dist dir>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const SITE = "https://advo.ph";
const dist = process.argv[2] || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../dist");
const warn = (message) =>
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=search::${message}` : `[search] WARN ${message}`);

try {
  const about = await fetch(`${SITE}/about`, { signal: AbortSignal.timeout(15_000) }).then((res) => res.text());
  if (/<title>About ADVO Technologies<\/title>/.test(about)) {
    console.log("[search] nginx serves per-page HTML.");
  } else {
    warn("advo.ph/about came back with the home page's HTML. Add `$uri/index.html` to try_files in the advo-frontend nginx site.");
  }
} catch (error) {
  warn(`Could not check per-page HTML: ${error.message}`);
}

try {
  const key = (await readFile(path.join(dist, "indexnow-key.txt"), "utf8")).trim();
  const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "advo.ph", key, keyLocation: `${SITE}/indexnow-key.txt`, urlList }),
    signal: AbortSignal.timeout(20_000),
  });
  // 200 and 202 both mean accepted; 202 while the key is first being checked.
  if (res.status === 200 || res.status === 202) console.log(`[search] IndexNow accepted ${urlList.length} URLs (HTTP ${res.status}).`);
  else warn(`IndexNow answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
} catch (error) {
  warn(`IndexNow ping failed: ${error.message}`);
}
