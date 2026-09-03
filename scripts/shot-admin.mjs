/**
 * Takes screenshots of the screens changed by the admin-simplify work so the
 * owner can see the real UI instead of trusting a report.
 *
 * Run:  node scripts/shot-admin.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const WEB = process.env.WEB_URL || "http://localhost:6447";
const EMAIL = "prince.wagan@advo.ph";
const PASSWORD = "changeme";
const OUT = "/tmp/advo-shots";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
const pwToggle = page.locator('button:has-text("password")').first();
if (await pwToggle.count()) {
  await pwToggle.click();
  await page.waitForTimeout(300);
}
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin/, { timeout: 20000 });
await page.waitForLoadState("networkidle");

await page.goto(`${WEB}/admin/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-projects-list.png` });
console.log("shot: 01-projects-list.png");

// Open the first project so the detail page and its tabs can be seen.
const viewBtn = page.locator('button:has-text("View project")').first();
if (await viewBtn.count()) {
  await viewBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/02-project-overview.png` });
  console.log("shot: 02-project-overview.png");

  for (const tab of ["Deliverables", "Website", "Contracts", "Finance"]) {
    const t = page.locator(`button[role="tab"]:has-text("${tab}")`).first();
    if (await t.count()) {
      await t.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/03-tab-${tab.toLowerCase()}.png` });
      console.log(`shot: 03-tab-${tab.toLowerCase()}.png`);
    } else {
      console.log(`MISSING TAB: ${tab}`);
    }
  }
} else {
  console.log("MISSING: no 'View project' button found on the projects list");
}

await browser.close();
