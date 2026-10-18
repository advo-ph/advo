/**
 * Screenshots the real, running admin "Web Statistics" page so the owner can see the
 * actual UI rather than trusting a report (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md §5.3).
 *
 * Run:  node scripts/shot-admin-visitors.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:6447";
const USERNAME = "princewagan";
const PASSWORD = "changeme";
const OUT = process.env.SHOT_OUT || join(homedir(), "Downloads", "web-statistics-screenshots-2026-10-09");

mkdirSync(OUT, { recursive: true });

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  // Default mode is already "password" (Login.tsx), but a returning browser may show
  // the saved-accounts list instead of the form -- handle both.
  const anotherAccount = page.locator('button:has-text("Log in to another account")').first();
  if (await anotherAccount.count()) await anotherAccount.click();

  await page.fill("#username", USERNAME);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

const browser = await chromium.launch();

// ── Desktop (1440x900) ──────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);

  await page.goto(`${WEB}/admin/web-stats`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/01-desktop-overview.png`, fullPage: true });
  console.log("shot: 01-desktop-overview.png");

  const map = page.locator("svg[aria-label*='World map']").first();
  if (await map.count()) {
    await map.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/02-desktop-map.png` });
    console.log("shot: 02-desktop-map.png");

    // Reduced motion freezes the pulse/arc animation (both the plan's own requirement
    // and what makes the marker a stable Playwright hover target instead of a moving one).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(200);

    // Manila has the most markers stacked close together; aim for an isolated one
    // (Sydney/London/etc.) so the tooltip is unambiguous about which city it names.
    const marker = page
      .locator(`.visitor-map-marker[aria-label*="Sydney"], .visitor-map-marker[aria-label*="London"], .visitor-map-marker[aria-label*="Los Angeles"]`)
      .first();
    const target = (await marker.count()) ? marker : page.locator(".visitor-map-marker").first();
    await target.hover({ force: true, timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/03-desktop-map-hover.png` });
    console.log("shot: 03-desktop-map-hover.png");
  } else {
    console.log("MISSING: world map svg not found on desktop");
  }

  await ctx.close();
}

// ── Mobile (390x844) ────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page);

  await page.goto(`${WEB}/admin/web-stats`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/04-mobile-overview.png`, fullPage: true });
  console.log("shot: 04-mobile-overview.png");

  const map = page.locator("svg[aria-label*='World map']").first();
  if (await map.count()) {
    await map.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/05-mobile-map.png` });
    console.log("shot: 05-mobile-map.png");
  } else {
    console.log("MISSING: world map svg not found on mobile");
  }

  await ctx.close();
}

// ── Empty state (desktop, far-future date range with no seeded data) ───
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);

  // Route the API calls through a stub that always returns empty data, so the empty
  // state can be shot without deleting the real seed data first.
  await page.route("**/api/visitor-stats/**", (route) => {
    const url = route.request().url();
    if (url.includes("/summary")) {
      return route.fulfill({
        json: { data: { from: "", to: "", uniqueVisitorCount: 0, sessionCount: 0, pageViewCount: 0, byDay: [] }, error: null },
      });
    }
    if (url.includes("/geo")) {
      return route.fulfill({ json: { data: { countries: [], cities: [] }, error: null } });
    }
    return route.fulfill({ json: { data: [], error: null } });
  });

  await page.goto(`${WEB}/admin/web-stats`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/06-empty-state.png`, fullPage: true });
  console.log("shot: 06-empty-state.png");

  await ctx.close();
}

await browser.close();
console.log(`Done. Screenshots saved to ${OUT}`);
