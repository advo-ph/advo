#!/usr/bin/env node
/**
 * Source + optional live viewport check for the shipped LandingPage.
 * Does not treat the Stripe-only landing-stripe-audit bench as truth.
 *
 *   node bench/roadmap/roadmap-remain/viewport-site.mjs
 *
 * Live overflow probe (optional): set ADVO_LANDING_URL, or leave the
 * default http://127.0.0.1:6445/ if the site-lane preview is running.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const landingPagePath = join(repoRoot, "apps/web/src/components/landing/LandingPage.tsx");
const landingCssPath = join(repoRoot, "apps/web/src/components/landing/landing-page.css");
const landingPage = existsSync(landingPagePath) ? readFileSync(landingPagePath, "utf8") : "";
const landingCss = existsSync(landingCssPath) ? readFileSync(landingCssPath, "utf8") : "";
const baseUrl = process.env.ADVO_LANDING_URL || "http://127.0.0.1:6445/";

const check = [];
const add = (id, passed, expected) => {
  check.push({ id, passed: Boolean(passed), expected });
};

add("landing-page-source", landingPage.length > 0, "Shipped LandingPage.tsx exists.");
add(
  "hero-clarity",
  /Build together/.test(landingPage) && /clarity/i.test(landingPage),
  "Hero is the shipped 'Build together / clarity' headline.",
);
add("showcase", /landing-showcase/.test(landingPage) && /landing-app-shell/.test(landingPage), "Workspace showcase is present.");
add("fourlinq-proof", /fourlinq\.ph/i.test(landingPage), "Proof is Fourlinq, not invented testimonials.");
add(
  "no-why-digital",
  !/WhyDigital|Why Go Digital|We Digitalize It For You/i.test(landingPage),
  "Old Stripe WhyDigital copy is not the landing source.",
);
add(
  "no-stripe-rail",
  !/data-viewport-check="hero-system-rail"|data-viewport-check="footer-wordmark"|One system, not just a website/.test(
    landingPage,
  ),
  "Stripe-only viewport hooks are not the source of truth.",
);
add("reduce-motion", /useReducedMotion/.test(landingPage), "LandingPage honors reduced motion.");
add(
  "overflow-clip",
  /\.landing-page[\s\S]{0,240}overflow:\s*hidden/.test(landingCss),
  "Landing root clips overflow so viewports do not grow sideways.",
);
add(
  "viewport-breakpoint",
  /@media \(max-width: 680px\)/.test(landingCss) && /@media \(max-width: 900px\)/.test(landingCss),
  "CSS has tablet (900) and mobile (680) viewport breakpoints.",
);
add(
  "hero-type-clamp",
  /landing-hero h1[\s\S]{0,80}clamp\(/.test(landingCss),
  "Hero type uses clamp, not a fixed overflow size.",
);

const sourceFailed = check.filter((row) => !row.passed).length;

for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${row.id}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}

const liveViewport = [
  { width: 360, height: 780, name: "mobile-360" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 768, height: 900, name: "tablet-768" },
  { width: 1280, height: 900, name: "desktop-1280" },
  { width: 1440, height: 960, name: "desktop-1440" },
];

const isReachable = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
};

const runLive = async () => {
  const reachable = await isReachable(baseUrl);
  if (!reachable) {
    console.log(`\n[SKIP] live-viewport — ${baseUrl} not reachable (source check is the gate).`);
    return 0;
  }

  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.log("\n[SKIP] live-viewport — @playwright/test is not installed (source check is the gate).");
    return 0;
  }
  const browser = await chromium.launch({ headless: true });
  let liveFailed = 0;
  const slack = 8;

  try {
    for (const viewport of liveViewport) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForSelector(".landing-page", { timeout: 8000 });
      const metric = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const root = document.getElementById("root");
        return {
          scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth ?? 0, root?.scrollWidth ?? 0),
          hasHero: Boolean(document.querySelector(".landing-hero")),
          hasShowcase: Boolean(document.querySelector(".landing-showcase")),
        };
      });
      const overflowOk = metric.scrollWidth <= viewport.width + slack;
      const identityOk = metric.hasHero && metric.hasShowcase;
      if (!overflowOk) liveFailed += 1;
      if (!identityOk) liveFailed += 1;
      console.log(
        `[${overflowOk ? "PASS" : "FAIL"}] live-overflow ${viewport.name} (${metric.scrollWidth} <= ${viewport.width + slack})`,
      );
      console.log(`[${identityOk ? "PASS" : "FAIL"}] live-identity ${viewport.name}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return liveFailed;
};

const liveFailed = await runLive();
const failed = sourceFailed + liveFailed;
console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - sourceFailed}/${check.length} source check(s) green` +
    (liveFailed ? `; ${liveFailed} live fail(s)` : ""),
);
process.exit(failed === 0 ? 0 : 1);
