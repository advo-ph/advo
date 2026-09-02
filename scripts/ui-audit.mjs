/**
 * One-off live UI audit of advo.ph — drawer, nav panels, console errors,
 * per-width overflow, and the routes the landing links to.
 * Run: node scripts/ui-audit.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.AUDIT_URL || "https://advo.ph";
const OUT = "bench/ui-audit-out";
mkdirSync(OUT, { recursive: true });

const executablePath = "C:\\Users\\maran\\.agent-browser\\browsers\\chrome-152.0.7977.42\\chrome.exe";

const browser = await chromium.launch({ executablePath, headless: true });

async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") problems.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => problems.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`http ${res.status()}: ${res.url()}`);
  });
  return { context, page, problems };
}

const report = { base: BASE, widths: {}, drawer: {}, navPanel: {}, routes: {} };

// ── 1. Desktop: overflow, console, marquee context ──
{
  const { context, page, problems } = await newPage(1440, 900);
  await page.goto(BASE, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.widths["1440"] = { overflowPx: overflow, problems };
  await page.screenshot({ path: `${OUT}/desktop-hero.png` });
  await context.close();
}

// ── 2. Mobile 390: overflow + drawer behaviour ──
{
  const { context, page, problems } = await newPage(390, 844);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.widths["390"] = { overflowPx: overflow, problems };

  const menu = page.locator("button.landing-menu");
  report.drawer.menuVisible = await menu.isVisible();
  await menu.click();
  await page.waitForTimeout(300);
  report.drawer.open = await page.evaluate(() => {
    const nav = document.getElementById("mobile-navigation-drawer");
    if (!nav) return "NO NAV ELEMENT";
    const style = getComputedStyle(nav);
    return { display: style.display, ariaExpanded: nav.getAttribute("aria-expanded") ?? "(on button)", scrollLocked: document.body.style.overflow };
  });
  await page.screenshot({ path: `${OUT}/drawer-open.png` });

  // scroll-lock check: try scrolling while open
  const scrollYWhileOpen = await page.evaluate(() => { window.scrollTo(0, 400); return window.scrollY; });
  report.drawer.scrollYWhileOpen = scrollYWhileOpen;

  // ESC closes?
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  report.drawer.closesOnEscape = await page.evaluate(() => getComputedStyle(document.getElementById("mobile-navigation-drawer")).display === "none");
  report.drawer.scrollRestored = await page.evaluate(() => document.body.style.overflow === "");

  // open again, tap "Product" — does the sub-panel open, or does it navigate?
  await menu.click();
  await page.waitForTimeout(200);
  await page.locator("#mobile-navigation-drawer a", { hasText: "Product" }).first().click();
  await page.waitForTimeout(400);
  report.navPanel.mobileTapProduct = await page.evaluate(() => ({
    url: location.pathname + location.hash,
    drawerStillOpen: getComputedStyle(document.getElementById("mobile-navigation-drawer")).display !== "none",
    panelVisible: (() => {
      const panels = document.querySelectorAll("#mobile-navigation-drawer .landing-nav-panel");
      return Array.from(panels).map((p) => getComputedStyle(p).display);
    })(),
  }));
  await page.screenshot({ path: `${OUT}/drawer-after-product-tap.png` });
  await context.close();
}

// ── 3. Desktop nav panel: hover opens, keyboard? ──
{
  const { context, page } = await newPage(1440, 900);
  await page.goto(BASE, { waitUntil: "networkidle" });
  const product = page.locator(".landing-nav-item", { hasText: "Product" }).first();
  await product.locator("> a").hover();
  await page.waitForTimeout(200);
  report.navPanel.desktopHoverOpens = await page.evaluate(() => {
    const p = document.querySelector(".landing-nav-panel");
    return p ? getComputedStyle(p).display !== "none" : false;
  });
  await page.screenshot({ path: `${OUT}/nav-panel-hover.png` });
  // keyboard: focus the Product link — panel?
  await page.locator(".landing-nav-item > a", { hasText: "Product" }).first().focus();
  report.navPanel.keyboardFocusOpens = await page.evaluate(() => {
    const p = document.querySelector(".landing-nav-panel");
    return p ? getComputedStyle(p).display !== "none" : false;
  });
  await context.close();
}

// ── 4. Routes the landing links to ──
for (const route of ["/start", "/login", "/team", "/project/vbe-eye-center-clinic", "/terms", "/privacy", "/refund", "/dispute"]) {
  const { context, page, problems } = await newPage(1440, 900);
  try {
    const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const h1 = await page.locator("h1, h2").first().textContent({ timeout: 3000 }).catch(() => "(no h1/h2)");
    report.routes[route] = { status: res?.status(), h1: h1?.trim().slice(0, 80), overflowPx: overflow, problems: problems.slice(0, 6) };
    await page.screenshot({ path: `${OUT}/route${route.replace(/\//g, "_")}.png` });
  } catch (e) {
    report.routes[route] = { error: String(e).slice(0, 120) };
  }
  await context.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
