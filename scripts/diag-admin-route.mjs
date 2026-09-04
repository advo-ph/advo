/**
 * Answers one question: after logging in as an admin, where does the browser
 * actually end up, and does /admin render the console or bounce to /hub?
 *
 * Run:  node scripts/diag-admin-route.mjs
 */
import { chromium } from "@playwright/test";

const WEB = process.env.WEB_URL || "http://localhost:6447";
const EMAIL = process.env.EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.PASSWORD || "changeme";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE ${m.text().slice(0, 200)}`);
});

await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
const pwToggle = page.locator('button:has-text("password")').first();
if (await pwToggle.count()) {
  await pwToggle.click();
  await page.waitForTimeout(300);
}
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);

const loginResp = page.waitForResponse((r) => r.url().includes("/api/auth/login"));
await page.click('button[type="submit"]');
const resp = await loginResp;
const body = await resp.json().catch(() => null);
console.log("login status:", resp.status());
console.log("login user payload:", JSON.stringify(body?.data?.user ?? body, null, 2));

await page.waitForTimeout(2500);
console.log("URL right after login:", page.url());

await page.goto(`${WEB}/admin/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("URL after goto /admin/projects:", page.url());

const probe = await page.evaluate(() => {
  const text = document.body.innerText || "";
  return {
    hasAdminSidebarWord: /Content Studio|Brand Scraper|FB Scraper/.test(text),
    hasHubWord: /YOUR PROJECTS|Change order|Request a preview/i.test(text),
    hasViewProject: /View project/.test(text),
    hasViewSite: /View site/.test(text),
    firstChars: text.trim().slice(0, 300),
  };
});
console.log("page probe:", JSON.stringify(probe, null, 2));
console.log("errors:", errors.length ? errors.slice(0, 10) : "none");

await page.screenshot({ path: "/tmp/advo-shots/diag-admin.png" });
await browser.close();
