/**
 * Live check of the task tracker in the real browser.
 *
 * Logs in as a real roster member, opens the Tasks section, and proves the three things the
 * feature is: three lists render, the assignee's button moves a card to the next list, and a
 * card that belongs to someone else is visible but not actionable.
 *
 * Run: node scripts/task-tracker-check.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const OUT = "bench/task-tracker-out";
mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.AS_EMAIL || "angelo.revelo@advo.ph";
const PASSWORD = "changeme";

const browser = await chromium.launch({ headless: true });

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      problems.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`);
    }
  });
  return { context, page, problems };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // The page opens in magic-link mode; password is behind this switch.
  await page.getByRole("button", { name: "Sign in with password instead" }).click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
}

async function gotoTasks(page) {
  await page.getByRole("button", { name: "Tasks", exact: true }).first().click();
  await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
}

/** Titles under each list heading, read from the rendered panels. */
async function board(page) {
  return page.evaluate(() => {
    const out = {};
    for (const label of ["To do", "Ongoing", "Finished"]) {
      const heading = [...document.querySelectorAll("h2")].find(
        (h) => h.textContent.trim() === label,
      );
      if (!heading) {
        out[label] = null;
        continue;
      }
      const panel = heading.closest(".rounded-lg");
      const titles = [...panel.querySelectorAll("p.text-sm.leading-snug")].map((p) =>
        p.textContent.trim(),
      );
      out[label] = titles;
    }
    return out;
  });
}

const report = { desktop: {}, mobile: {} };

// ── Desktop: three lists, advance a card, watch it move ──
{
  const { context, page, problems } = await open(1440, 900);
  await login(page);
  await gotoTasks(page);

  report.desktop.listsRendered = await board(page);
  await page.screenshot({ path: `${OUT}/desktop-board.png`, fullPage: true });

  // Column layout check: the three panels should sit side by side, same row.
  report.desktop.sideBySide = await page.evaluate(() => {
    const tops = ["To do", "Ongoing", "Finished"].map((label) => {
      const h = [...document.querySelectorAll("h2")].find(
        (x) => x.textContent.trim() === label,
      );
      return h ? Math.round(h.getBoundingClientRect().top) : null;
    });
    return { tops, allEqual: new Set(tops).size === 1 };
  });

  // Buttons available to this user vs. shown-but-disabled.
  report.desktop.buttons = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) =>
      ["Start", "Finish"].includes(b.textContent.trim()),
    );
    return btns.map((b) => ({
      label: b.textContent.trim(),
      disabled: b.disabled,
      reason: b.getAttribute("title"),
      card: b.closest(".px-3.py-3")?.querySelector("p.text-sm.leading-snug")?.textContent.trim(),
    }));
  });

  // Press the first ENABLED Start button and confirm the card changes list.
  const target = report.desktop.buttons.find((b) => b.label === "Start" && !b.disabled);
  if (target) {
    report.desktop.advanced = { card: target.card, from: "To do" };
    await page
      .locator("div.px-3.py-3", { hasText: target.card })
      .getByRole("button", { name: "Start", exact: true })
      .click();
    await page.waitForTimeout(1500);
    report.desktop.afterAdvance = await board(page);
    await page.screenshot({ path: `${OUT}/desktop-after-advance.png`, fullPage: true });
  } else {
    report.desktop.advanced = "no enabled Start button for this user";
  }

  report.desktop.problems = problems;
  await context.close();
}

// ── Mobile 390: usable one-handed, segmented control switches lists ──
{
  const { context, page, problems } = await open(390, 844);
  await login(page);

  // Open the mobile nav drawer, then Tasks.
  const menu = page.locator("header button").first();
  await menu.click();
  await page.waitForTimeout(500);
  await gotoTasks(page);

  report.mobile.overflowPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  // Only one list is visible at 390px.
  const visibleLists = () =>
    page.evaluate(() =>
      ["To do", "Ongoing", "Finished"].filter((label) => {
        const h = [...document.querySelectorAll("h2")].find(
          (x) => x.textContent.trim() === label,
        );
        if (!h) return false;
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    );

  report.mobile.visibleLists = await visibleLists();

  // Touch target sizes for the things a thumb has to hit.
  report.mobile.touchTargets = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button")) {
      const t = b.textContent.trim();
      if (["Start", "Finish", "To do 1", "Ongoing", "Finished"].some((x) => t.startsWith(x.split(" ")[0]))) {
        const r = b.getBoundingClientRect();
        if (r.height > 0) out.push({ label: t.slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) });
      }
    }
    return out.slice(0, 8);
  });

  await page.screenshot({ path: `${OUT}/mobile-todo.png`, fullPage: true });

  // Switch to Ongoing via the segmented control.
  await page.getByRole("button", { name: /^Ongoing/ }).first().click();
  await page.waitForTimeout(600);
  report.mobile.visibleListsAfterSwitch = await visibleLists();
  report.mobile.afterSwitch = await board(page);
  await page.screenshot({ path: `${OUT}/mobile-ongoing.png`, fullPage: true });

  report.mobile.problems = problems;
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
