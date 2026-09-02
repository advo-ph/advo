#!/usr/bin/env node
/**
 * Scroll position across navigation — verified in a real browser.
 *
 * Reported 2026-09-02: opening a page from halfway down a long one drops you into the
 * middle of the new page. `BrowserRouter` + `<Routes>` touches scroll not at all, and
 * nothing in this app did either.
 *
 * WHY A BROWSER AND NOT A UNIT TEST. Every property here is a real-DOM behaviour that
 * jsdom will happily agree with while the shipped page does the opposite:
 *
 *   * This app has TWO scroll containers and which one is live depends on the route —
 *     `#root` normally, the document on `.landing-page` routes. A fix written against
 *     one of them silently does nothing on half the routes, which is the same shape as
 *     the bug.
 *   * The landing sets `scroll-behavior: smooth`, so a naive reset ANIMATES the whole
 *     way to the top instead of arriving. Only a browser shows that.
 *   * Back/forward restoration and hash anchors both depend on real layout.
 *
 * The check that matters most is `navigating … lands at the top`: with `<ScrollReset />`
 * unmounted it reports ~1025px, which is the reported bug reproduced.
 *
 * Requires the web dev server. Start it first:
 *   npm run dev:web        (apps/web/vite.config.ts -> port 6447)
 *   npm run bench:scroll
 *
 * Vite silently moves to the next free port when 6447 is taken and prints the one it
 * chose, so pass it when that happens:
 *   BASE=http://127.0.0.1:6448 npm run bench:scroll
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Must track `server.port` in apps/web/vite.config.ts. */
const BASE = process.env.BASE || "http://127.0.0.1:6447";

const offset = (page) =>
  page.evaluate(() => ({
    root: document.getElementById("root")?.scrollTop ?? 0,
    doc: document.scrollingElement?.scrollTop ?? 0,
    live: Math.max(
      document.getElementById("root")?.scrollTop ?? 0,
      document.scrollingElement?.scrollTop ?? 0,
    ),
  }));

const check = [];
const assert = (title, passed, detail) => {
  check.push({ title, passed, detail });
  console.log(`${passed ? "ok  " : "FAIL"} ${title} — ${detail}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  // ── Landing: document scroll ──
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const el = document.scrollingElement;
    el.scrollTo({ top: 2500, behavior: "instant" });
  });
  await page.waitForTimeout(300);
  const before = await offset(page);
  assert("landing scrolls the document", before.doc > 1000, `doc=${before.doc}, root=${before.root}`);

  // Find an in-app link that leaves the landing.
  const href = await page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const a = [...document.querySelectorAll("a[href]")].find((el) => {
      const h = el.getAttribute("href");
      return h && h.startsWith("/") && !h.startsWith("//") && !h.includes("#") && h !== "/" && isVisible(el);
    });
    return a?.getAttribute("href") ?? null;
  });

  if (!href) {
    assert("found an internal link to navigate with", false, "none on the landing");
  } else {
    await page.locator(`a[href="${href}"]`).filter({ visible: true }).first().click();
    await page.waitForTimeout(700);
    const after = await offset(page);
    assert(
      `navigating to ${href} lands at the top`,
      after.live <= 5,
      `live=${after.live} (root=${after.root}, doc=${after.doc})`,
    );

    // ── Back should RESTORE, not jump to top ──
    await page.goBack();
    await page.waitForTimeout(700);
    const back = await offset(page);
    assert(
      "back restores the previous position",
      Math.abs(back.live - before.live) < 150,
      `restored=${back.live}, expected≈${before.live}`,
    );
  }

  // ── Hash anchor via SPA NAVIGATION, not a full load ──
  // page.goto() would be handled natively by the browser and prove nothing about the
  // router path. landing-footer.tsx links "/#work" from sub-routes, and React Router
  // does NOT honour a hash on navigation -- that is the case under test.
  await page.goto(`${BASE}/team`, { waitUntil: "networkidle" });
  const hashHref = await page.evaluate(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const a = [...document.querySelectorAll("a[href]")].find((el) => {
      const h = el.getAttribute("href");
      return h && h.startsWith("/#") && h.length > 2 && isVisible(el);
    });
    return a?.getAttribute("href") ?? null;
  });
  if (hashHref) {
    // .last() = the FOOTER link, deliberately. The first match is a landing-nav item
    // with a dropdown panel, and LandingNav.handlePanelNav is DESIGNED so the first
    // activation opens the panel and only the second follows the link — hover cannot
    // happen on touch. That is correct behaviour, not a bug; it is simply not a
    // single-click navigation, so it cannot exercise this check.
    await page.locator(`a[href="${hashHref}"]`).filter({ visible: true }).last().click();
    await page.waitForTimeout(900);
    const hashed = await offset(page);
    assert(
      `SPA nav to ${hashHref} reaches the section, not the top`,
      hashed.live > 100,
      `live=${hashed.live}`,
    );
  } else {
    assert("found an in-app /#hash link on a sub-route", false, "none visible");
  }

  // ── A #root-scrolling route resets too ──
  await page.goto(`${BASE}/terms`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const r = document.getElementById("root");
    r?.scrollTo({ top: 1200, behavior: "instant" });
    document.scrollingElement?.scrollTo({ top: 1200, behavior: "instant" });
  });
  await page.waitForTimeout(300);
  const legalBefore = await offset(page);
  const legalHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find((el) => {
      const h = el.getAttribute("href");
      return h && /^\/(privacy|refund|dispute|terms)$/.test(h) && h !== location.pathname;
    });
    return a?.getAttribute("href") ?? null;
  });
  if (legalHref && legalBefore.live > 100) {
    await page.locator(`a[href="${legalHref}"]`).filter({ visible: true }).first().click();
    await page.waitForTimeout(700);
    const legalAfter = await offset(page);
    assert(
      `legal ${legalHref} resets the #root container`,
      legalAfter.live <= 5,
      `live=${legalAfter.live} (was ${legalBefore.live})`,
    );
  } else {
    assert("legal page scrolled far enough to test", false, `live=${legalBefore.live}, link=${legalHref}`);
  }
} finally {
  await browser.close();
}

const passedCount = check.filter((c) => c.passed).length;
const result = {
  benchmark: "scroll-reset",
  baseUrl: BASE,
  passed: passedCount === check.length,
  count: { passed: passedCount, failed: check.length - passedCount, total: check.length },
  check,
};

const runDir = join(repoRoot, "bench/roadmap/scroll-reset/runs");
if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
// Rewritten on every invocation and gitignored, matching drawer-a11y: committing it
// would add a diff to every unrelated branch.
writeFileSync(join(runDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(
  result.passed
    ? `PASS — ${passedCount}/${check.length} scroll-reset check(s) green`
    : `FAIL — ${passedCount}/${check.length} scroll-reset check(s) green`,
);
process.exit(result.passed ? 0 : 1);
