/**
 * Forces real write failures and proves the user is now told.
 *
 * Two shapes are exercised, because they used to fail differently and both
 * failed silently:
 *
 *   1. A mutation whose helper returns { data, error } and never throws. The
 *      old code rolled back and showed a generic toast, or nothing at all.
 *   2. A hand-rolled `if (res.data)` fetch with no else. A failure there did
 *      literally nothing: no toast, no state change, no log.
 *
 * The failure is injected at the network boundary with Playwright routing, so
 * it is a genuine failed request rather than a stubbed function.
 *
 * Run: node scripts/verify-failure-visible.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = process.env.ADMIN_EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const OUT = "bench/failure-visible-out";
mkdirSync(OUT, { recursive: true });

const INVOICE_LABEL = "ZZTEST verification invoice";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const toPassword = page.getByText("Sign in with password instead");
  if (await toPassword.isVisible().catch(() => false)) await toPassword.click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  check("signed in as admin", true, page.url());

  /* ── 1. Invoice status write, killed at the network ── */
  await page.getByRole("button", { name: "Finance", exact: true }).first().click();
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /VBE Eye Center Website/ }).first().click();
  await page.waitForTimeout(900);

  const row = page
    .locator("div.flex.items-center.gap-3")
    .filter({ hasText: INVOICE_LABEL })
    .first();
  const statusBefore = (await row.innerText()).replace(/\n/g, " ");
  check("invoice row visible before the failure", await row.isVisible(), statusBefore.slice(0, 90));

  // The server never sees this. This is the "stop the API mid-request" case.
  await page.route("**/api/invoices/**", (route) =>
    route.abort("connectionrefused"),
  );

  await row.locator('button[role="combobox"]').click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.waitForTimeout(2500);

  const bodyText = await page.locator("body").innerText();
  const sawFailureToast =
    bodyText.includes("Invoice not updated") || /not updated/i.test(bodyText);
  check(
    "a failed invoice write raises a visible error",
    sawFailureToast,
    sawFailureToast
      ? bodyText.split("\n").filter((l) => /not updated|Failed|failed/i.test(l)).join(" | ")
      : "NO TOAST FOUND",
  );
  await page.screenshot({ path: `${OUT}/01-invoice-write-failed.png`, fullPage: false });

  const statusAfter = (await row.innerText()).replace(/\n/g, " ");
  check(
    "the optimistic value rolled back rather than sticking",
    /Unpaid/.test(statusAfter),
    statusAfter.slice(0, 90),
  );

  await page.unroute("**/api/invoices/**");

  /* ── 2. Brand Scraper history row click, killed at the network ── */
  // This is the `if (res.data)` with no else. Before the fix, clicking a
  // history row while the endpoint was down did nothing whatsoever.
  // Brand Scraper sits under the "Tools" group, which starts collapsed.
  const toolsGroup = page.getByRole("button", { name: "Tools" }).first();
  if ((await toolsGroup.getAttribute("aria-expanded")) === "false") {
    await toolsGroup.click();
    await page.waitForTimeout(500);
  }
  await page.getByRole("button", { name: "Brand Scraper", exact: true }).first().click();
  await page.waitForTimeout(2500);

  const historyToggle = page.getByText(/saved scrapes$/).first();
  const hasHistory = await historyToggle.isVisible().catch(() => false);
  if (hasHistory) {
    await historyToggle.click();
    await page.waitForTimeout(600);

    await page.route("**/api/scrape/history/*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: "Storage backend unavailable" }),
      }),
    );

    const firstHistoryRow = page.locator('button[type="button"]').filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}/ }).first();
    await firstHistoryRow.click();
    await page.waitForTimeout(2000);

    const scraperText = await page.locator("body").innerText();
    const sawScraperToast = /Could not open that scrape|Storage backend unavailable/i.test(scraperText);
    check(
      "a failed history load now says so instead of doing nothing",
      sawScraperToast,
      sawScraperToast ? "toast shown with the server's reason" : "NO TOAST FOUND",
    );
    await page.screenshot({ path: `${OUT}/02-history-load-failed.png`, fullPage: false });
    await page.unroute("**/api/scrape/history/*");
  } else {
    check("brand scraper history present to test", false, "no saved scrapes in advo_dev, sub-test skipped");
  }
} catch (err) {
  check("script completed", false, err.message);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
