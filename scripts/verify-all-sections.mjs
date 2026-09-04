/**
 * Opens every admin section, on desktop and on a phone, and reports whether it
 * renders. The user asked for every button to work and said not to trust an
 * audit, so this drives the real app and watches for real errors.
 *
 * Run:  node scripts/verify-all-sections.mjs
 */
import { chromium } from "@playwright/test";

const WEB = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = "prince.wagan@advo.ph";
const PASSWORD = "changeme";

const SECTIONS = [
  "dashboard", "tasks", "projects", "clients", "library", "team",
  "schedule", "calendar", "availability", "contracts", "meetings",
  "finance", "content", "portfolio", "social", "leads", "proposals",
  "campaign", "notifications", "brand-scraper", "fb-scraper", "settings",
];

async function signIn(page) {
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
}

async function sweep(browser, label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await signIn(page);
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}) ===`);

  const rows = [];
  for (const section of SECTIONS) {
    errors.length = 0;
    await page.goto(`${WEB}/admin/${section}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    const state = await page.evaluate(() => {
      const body = document.body.innerText || "";
      const sidebar = document.querySelector("aside");
      const boundary = /Something broke on this page|Try again/i.test(body);
      return {
        chars: body.trim().length,
        sidebarPresent: !!sidebar,
        boundaryTripped: boundary,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        // "undefined" leaking into rendered copy means an envelope bug.
        leakedUndefined: /\bundefined\b/.test(body),
        // Landing on the client hub means the admin guard bounced us. The page
        // still renders plenty of text, so text length alone cannot catch it.
        bouncedToHub: /YOUR PROJECTS|Request a preview|Change order/i.test(body),
      };
    });

    // The URL check is the load-bearing one. An earlier version of this script
    // scored 44/44 while every admin route silently redirected to /hub, because
    // it only measured "did some text render". It did. The wrong text.
    const landedOnAdmin = new RegExp(`/admin/${section}(?:[?#]|$)`).test(page.url());

    const ok =
      landedOnAdmin &&
      state.sidebarPresent &&
      !state.bouncedToHub &&
      state.chars > 120 &&
      !state.boundaryTripped &&
      errors.length === 0 &&
      state.horizontalOverflow <= 1 &&
      !state.leakedUndefined;

    const notes = [];
    if (!landedOnAdmin) notes.push(`REDIRECTED to ${page.url()}`);
    if (state.bouncedToHub) notes.push("BOUNCED TO CLIENT HUB");
    if (!state.sidebarPresent) notes.push("no admin sidebar");
    if (state.chars <= 120) notes.push(`only ${state.chars} chars rendered`);
    if (state.boundaryTripped) notes.push("ERROR BOUNDARY TRIPPED");
    if (errors.length) notes.push(`js error: ${errors[0].slice(0, 90)}`);
    if (state.horizontalOverflow > 1) notes.push(`overflows by ${state.horizontalOverflow}px`);
    if (state.leakedUndefined) notes.push('renders literal "undefined"');

    rows.push({ section, ok, notes });
    console.log(`${ok ? "PASS" : "FAIL"}  ${section.padEnd(16)} ${notes.join("; ")}`);
  }

  await ctx.close();
  return rows;
}

const browser = await chromium.launch();
let all = [];
try {
  all = all.concat(await sweep(browser, "Desktop", { width: 1440, height: 900 }, false));
  all = all.concat(await sweep(browser, "Phone", { width: 390, height: 844 }, true));
} finally {
  await browser.close();
}

const failed = all.filter((r) => !r.ok);
console.log(`\n${all.length - failed.length}/${all.length} section loads passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.section}: ${f.notes.join("; ")}`);
}
process.exit(failed.length ? 1 : 0);
