/**
 * Drives the AdminTeam screen in a headless browser and proves the two switches
 * are separate and readable:
 *
 *   "Show on website"  → team_member.is_active
 *   "Can log in"       → user.is_active
 *
 * Run: node scripts/shot-admin-team.mjs
 * Env: WEB_URL (default http://localhost:6448), ADMIN_EMAIL, ADMIN_PASSWORD
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = process.env.ADMIN_EMAIL || "prince.wagan@advo.ph";
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const OUT = "bench/admin-team-out";
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

try {
  // ── Sign in ────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  const toPassword = page.getByText("Sign in with password instead");
  if (await toPassword.isVisible().catch(() => false)) await toPassword.click();

  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  check("signed in as admin", true, page.url());

  // ── Open the Team section ──────────────────────────
  await page.getByRole("button", { name: "Team", exact: true }).first().click();
  await page.getByRole("heading", { name: "Team" }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);

  // The roster list, with the per-row login badges.
  await page.screenshot({ path: `${OUT}/01-team-list.png`, fullPage: true });

  const bodyText = await page.locator("body").innerText();
  check(
    'stat strip separates "On website" from "Can log in"',
    bodyText.includes("On website") && bodyText.includes("Can log in"),
    "both stat labels present",
  );
  check(
    'disabled member shows a "No access" badge in the row',
    bodyText.includes("No access"),
    "Au Cargason is disabled in advo_dev",
  );

  // ── Open the edit dialog for the disabled member ────
  const auRow = page.locator("div").filter({ hasText: /^Au Cargason/ }).last();
  await auRow.scrollIntoViewIfNeeded().catch(() => {});
  const rowContainer = page
    .locator('div[draggable="true"]')
    .filter({ hasText: "Au Cargason" })
    .first();
  await rowContainer.locator('button[aria-label="Edit member"]').click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-edit-dialog-both-toggles.png`, fullPage: true });

  // ── The two switches must be distinguishable ────────
  const website = dialog.locator('[data-testid="toggle-show-on-website"]');
  const login = dialog.locator('[data-testid="toggle-can-log-in"]');

  const websiteVisible = await website.isVisible();
  const loginVisible = await login.isVisible();
  check("both switches render in the dialog", websiteVisible && loginVisible);

  const websiteLabel = (await website.innerText()).trim();
  const loginLabel = (await login.innerText()).trim();
  check(
    "the two switches carry different labels",
    websiteLabel !== loginLabel,
    `website="${websiteLabel}" login="${loginLabel}"`,
  );

  const dialogText = await dialog.innerText();
  check(
    'dialog names both things in plain words',
    dialogText.includes("Show on website") && dialogText.includes("Can log in"),
    "headings present",
  );
  check(
    "the disabled member reads as blocked, and the website switch does not",
    loginLabel === "Blocked" && websiteLabel === "Shown",
    `Au is hidden from nobody but cannot sign in`,
  );

  // Crop of just the two switches, so the difference is obvious at a glance.
  const websiteBox = await website.boundingBox();
  const loginBox = await login.boundingBox();
  if (websiteBox && loginBox) {
    const top = Math.min(websiteBox.y, loginBox.y) - 60;
    const bottom = Math.max(websiteBox.y + websiteBox.height, loginBox.y + loginBox.height) + 20;
    await page.screenshot({
      path: `${OUT}/03-two-switches-closeup.png`,
      clip: { x: websiteBox.x - 470, y: top, width: 560, height: bottom - top },
    });
  }

  // ── Drive the login switch for real ────────────────
  // Click it on, confirm the UI follows, then click it back off so Au ends this run
  // disabled, which is the state the task asks for.
  await login.click();
  await page.waitForTimeout(1500);
  const afterEnable = (await login.innerText()).trim();
  check("clicking the login switch turns access on", afterEnable === "Allowed", `now "${afterEnable}"`);

  await login.click();
  await page.waitForTimeout(1500);
  const afterDisable = (await login.innerText()).trim();
  check("clicking it again turns access back off", afterDisable === "Blocked", `now "${afterDisable}"`);

  const websiteAfter = (await website.innerText()).trim();
  check(
    "the website switch never moved while the login switch was clicked twice",
    websiteAfter === "Shown",
    `still "${websiteAfter}"`,
  );

  await page.screenshot({ path: `${OUT}/04-after-toggling.png`, fullPage: true });

  check("no uncaught page errors", consoleErrors.length === 0, consoleErrors.join(" | ") || "clean");
} catch (err) {
  check("script completed", false, err.message);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}/`);
process.exit(failed.length === 0 ? 0 : 1);
