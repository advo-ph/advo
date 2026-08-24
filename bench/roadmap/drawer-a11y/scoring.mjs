#!/usr/bin/env node
/**
 * Landing drawer accessibility — the three behaviours the nav rewrite dropped.
 *
 * docs/ROADMAP.md "Open test-coverage gaps" carried this row for months:
 *
 *   "🟢 Mobile drawer interactions (escape close, scroll lock, route-change close)
 *    — A11y-critical but currently only verified by hand."
 *
 * The row understated it. Checked 2026-08-24, none of the three were implemented on the
 * landing page at all. `FloatingNav` — which still carries all three — was replaced on `/`
 * by `offer-truth`'s rewrite at 780485c, and the replacement kept none of them. So this was
 * never "verified by hand"; there was nothing to verify. A keyboard user could open the
 * drawer with no way to dismiss it, and the page scrolled underneath the overlay on touch.
 *
 * WHY A BROWSER AND NOT A UNIT TEST. Every one of these is a real-DOM behaviour: a global
 * keydown listener, a computed style on document.body, and a client-side route change
 * unmounting nothing. jsdom can be made to agree with an implementation that does not work
 * in a browser — scroll lock in particular is invisible to it. Driving the real page is the
 * only honest check, which is also why the roadmap row estimated playwright.
 *
 * Requires the web dev server. Start it first:
 *   npm run dev:web        (or set ADVO_LANDING_URL)
 *   npm run bench:drawer
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const baseUrl = process.env.ADVO_LANDING_URL || "http://127.0.0.1:6100/";

/** Narrow enough that the drawer toggle is the only nav affordance. */
const MOBILE = { width: 375, height: 812 };

const TOGGLE = '[aria-controls="mobile-navigation-drawer"]';
const DRAWER = "#mobile-navigation-drawer";

const check = [];
const record = (id, title, passed, detail, expected) =>
  check.push({ id, title, passed, detail, expected });

async function bodyOverflow(page) {
  return page.evaluate(() => getComputedStyle(document.body).overflow);
}

async function isDrawerOpen(page) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return Boolean(node && node.className.includes("is-open"));
  }, DRAWER);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: MOBILE });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // ── the toggle is wired to the drawer it controls ──
    const toggle = page.locator(TOGGLE).first();
    const toggleCount = await page.locator(TOGGLE).count();
    record(
      "toggle-wired",
      "The menu button names the drawer it controls",
      toggleCount > 0 && (await page.locator(DRAWER).count()) > 0,
      `${toggleCount} toggle, ${await page.locator(DRAWER).count()} drawer`,
      "aria-controls on the button resolves to a real element id. Without it a screen reader is told a control expanded, but not what it expanded.",
    );

    if (toggleCount === 0) {
      record("escape-close", "Escape closes the drawer", false, "no toggle found", "");
      record("scroll-lock", "The page does not scroll behind the drawer", false, "no toggle found", "");
      record("route-change-close", "Navigating closes the drawer", false, "no toggle found", "");
      record("aria-expanded-tracks", "aria-expanded tracks the drawer state", false, "no toggle found", "");
      return;
    }

    const overflowClosed = await bodyOverflow(page);

    // ── open it ──
    await toggle.click();
    await page.waitForTimeout(150);
    const openedState = await isDrawerOpen(page);
    const overflowOpen = await bodyOverflow(page);
    const expandedOpen = await toggle.getAttribute("aria-expanded");

    record(
      "aria-expanded-tracks",
      "aria-expanded tracks the drawer state",
      expandedOpen === "true",
      `aria-expanded=${expandedOpen} while open`,
      'The button reports its own state. A drawer that opens while the button still says aria-expanded="false" is worse than no attribute.',
    );

    // ── 2. scroll lock, checked while open ──
    record(
      "scroll-lock",
      "The page does not scroll behind the drawer",
      overflowOpen === "hidden" && overflowClosed !== "hidden",
      `body overflow: "${overflowClosed}" closed -> "${overflowOpen}" open`,
      "body overflow is hidden while the drawer is open and restored when it closes. Without it a touch drag scrolls the page underneath the overlay, which is the single most reported mobile-nav bug.",
    );

    // ── 1. escape closes it ──
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const closedByEscape = !(await isDrawerOpen(page));
    const overflowAfterEscape = await bodyOverflow(page);

    record(
      "escape-close",
      "Escape closes the drawer",
      openedState && closedByEscape,
      `opened=${openedState}, closed by Escape=${closedByEscape}`,
      "A keyboard user can dismiss the drawer without finding the toggle again. This is the a11y-critical half of the row.",
    );

    record(
      "scroll-lock-released",
      "The scroll lock is released when the drawer closes",
      overflowAfterEscape !== "hidden",
      `body overflow after Escape: "${overflowAfterEscape}"`,
      "A lock that is never released leaves the whole page unscrollable — a worse bug than the one the lock fixes.",
    );

    // ── 3. navigating closes it ──
    await toggle.click();
    await page.waitForTimeout(150);
    const reopened = await isDrawerOpen(page);

    // A real client-side route change, not a reload: the drawer survives a reload trivially
    // (fresh mount, closed state) so a reload would prove nothing.
    //
    // The link is taken from the whole page, NOT from inside the drawer. The drawer's own
    // items are in-page anchors (#services, #work) which never change the pathname and are
    // already closed by their own onClick; the real route links (Team / Log in / Start a
    // project) sit in the nav action bar and stay tappable while the drawer is open. That
    // tap is the actual scenario this behaviour exists for.
    //
    // history.pushState is deliberately NOT used as a fallback: React Router listens for
    // popstate, so a raw pushState changes the URL without ever updating useLocation. It
    // would fail against a correct implementation, which makes it a broken probe rather
    // than a lenient one.
    // `:visible` matters at 375px — the first /-link in the DOM is the wide-only "Team"
    // button, which is display:none here. Clicking a hidden element would hang the probe
    // rather than test anything.
    const routeLink = page.locator('a[href^="/"]:visible').first();
    const hasRouteLink = (await page.locator('a[href^="/"]:visible').count()) > 0;

    if (hasRouteLink) {
      await routeLink.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    const closedByRoute = !(await isDrawerOpen(page));
    record(
      "route-change-close",
      "Navigating closes the drawer",
      reopened && hasRouteLink && closedByRoute,
      `reopened=${reopened}, closed on navigation=${closedByRoute} (${
        hasRouteLink ? "followed a real route link" : "NO ROUTE LINK ON PAGE"
      })`,
      "The landing nav mixes in-page anchors with real routes, so without this the drawer stays open covering the page it just navigated to.",
    );

    record(
      "scroll-lock-released-after-route",
      "The scroll lock is released after navigating",
      (await bodyOverflow(page)) !== "hidden",
      `body overflow after navigation: "${await bodyOverflow(page)}"`,
      "The route-change close must run the same cleanup as any other close, or navigation leaves the next page unscrollable.",
    );
  } finally {
    await browser.close();
  }
}

await run();

const passedCount = check.filter((c) => c.passed).length;
const result = {
  benchmark: "drawer-a11y",
  baseUrl,
  passed: passedCount === check.length,
  count: { passed: passedCount, failed: check.length - passedCount, total: check.length },
  check,
};

const runDir = join(repoRoot, "bench/roadmap/drawer-a11y/runs");
if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
// Written for the operator to read after a local run, and gitignored: unlike the dated
// landing runs -- deliberate records of a redesign -- this one rewrites on every
// invocation, so committing it would add a diff to every unrelated branch.
writeFileSync(join(runDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify(result, null, 2));
console.log(
  result.passed
    ? `PASS — ${passedCount}/${check.length} drawer-a11y check(s) green`
    : `FAIL — ${passedCount}/${check.length} drawer-a11y check(s) green`,
);
process.exit(result.passed ? 0 : 1);
