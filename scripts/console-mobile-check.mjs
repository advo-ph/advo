/**
 * Live check of the admin console: deep links, mobile ergonomics, drawer a11y.
 *
 * Runs the same probe set before and after the simplification work, so the
 * numbers in the report are measured rather than asserted. Pass `--tag before`
 * or `--tag after` to name the screenshot set.
 *
 * Run: node scripts/console-mobile-check.mjs --tag before
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:6448";
const tagIndex = process.argv.indexOf("--tag");
const TAG = tagIndex > -1 ? process.argv[tagIndex + 1] : "run";
const OUT = `bench/console-mobile/${TAG}`;
mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.AS_EMAIL || "prince.wagan@advo.ph";
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
  await page.getByRole("button", { name: "Sign in with password instead" }).click();
  await page.fill("#email-pw", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

/** Open the mobile drawer via the header hamburger. */
async function openDrawer(page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(450);
}

async function gotoSection(page, label) {
  const vw = page.viewportSize().width;
  if (vw < 1024) await openDrawer(page);
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(1200);
}

const report = { tag: TAG, base: BASE };

// ── 1. Deep links + browser history ──────────────────────────────────────────
{
  const { context, page, problems } = await open(1440, 900);
  await login(page);
  report.urlAfterLogin = page.url();

  // Direct navigation to a section URL.
  const deep = {};
  for (const path of ["/admin/tasks", "/admin/calendar", "/admin/finance"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1400);
    deep[path] = {
      landedUrl: page.url(),
      h1: await page
        .locator("h1")
        .first()
        .textContent()
        .catch(() => null),
    };
  }
  report.deepLinks = deep;

  // Click through sections, then test back/forward.
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const trail = [];
  const readState = async () => ({
    url: page.url(),
    h1: await page.locator("h1").first().textContent().catch(() => null),
  });
  trail.push({ step: "start", ...(await readState()) });
  for (const label of ["Tasks", "Clients", "Calendar"]) {
    await gotoSection(page, label);
    trail.push({ step: `click ${label}`, ...(await readState()) });
  }
  await page.goBack();
  await page.waitForTimeout(900);
  trail.push({ step: "back", ...(await readState()) });
  await page.goBack();
  await page.waitForTimeout(900);
  trail.push({ step: "back", ...(await readState()) });
  await page.goForward();
  await page.waitForTimeout(900);
  trail.push({ step: "forward", ...(await readState()) });
  report.history = trail;

  report.deepLinkProblems = problems;
  await context.close();
}

// ── 2. Desktop screenshot 1440 ───────────────────────────────────────────────
{
  const { context, page } = await open(1440, 900);
  await login(page);
  await page.screenshot({ path: `${OUT}/desktop-1440-dashboard.png`, fullPage: false });
  await gotoSection(page, "Deliverables").catch(() => {});
  await page.screenshot({ path: `${OUT}/desktop-1440-deliverables.png`, fullPage: false });
  await context.close();
}

// ── 3. Mobile 390: overflow, AdminSchedule table, drawer a11y ────────────────
{
  const { context, page, problems } = await open(390, 844);
  await login(page);
  await page.screenshot({ path: `${OUT}/mobile-390-dashboard.png`, fullPage: false });

  // --- Drawer a11y probe -----------------------------------------------------
  await openDrawer(page);
  await page.screenshot({ path: `${OUT}/mobile-390-drawer.png`, fullPage: false });

  const drawerOpenState = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return {
      asideId: aside?.id || null,
      role: aside?.getAttribute("role") || null,
      ariaModal: aside?.getAttribute("aria-modal") || null,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      activeElementInDrawer: aside ? aside.contains(document.activeElement) : false,
      activeElementTag: document.activeElement?.tagName || null,
      activeElementText: (document.activeElement?.textContent || "").trim().slice(0, 30),
      triggerHasAriaControls: !!document.querySelector('[aria-controls]'),
      hasCloseButton: !!aside?.querySelector('[aria-label*="Close" i]'),
    };
  });
  report.drawerOpen = drawerOpenState;

  // Can the page behind scroll while the drawer is open?
  const scrollBehind = await page.evaluate(() => {
    const before = window.scrollY;
    window.scrollBy(0, 400);
    const after = window.scrollY;
    window.scrollTo(0, before);
    return { before, after, scrolled: after !== before };
  });
  report.drawerScrollBehind = scrollBehind;

  // Focus trap: tab a bunch, see if focus escapes the drawer.
  const trap = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return { startsInside: aside ? aside.contains(document.activeElement) : false };
  });
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  const trapAfter = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return {
      stillInside: aside ? aside.contains(document.activeElement) : false,
      activeText: (document.activeElement?.textContent || "").trim().slice(0, 40),
    };
  });
  report.drawerFocusTrap = { ...trap, ...trapAfter };

  // Escape to close.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  report.drawerEscape = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const r = aside?.getBoundingClientRect();
    return {
      closed: !r || r.right <= 1,
      right: r ? Math.round(r.right) : null,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      focusReturnedToTrigger:
        document.activeElement?.getAttribute("aria-label") === "Open menu",
      activeLabel: document.activeElement?.getAttribute("aria-label") || null,
    };
  });

  // Make sure the drawer is actually shut before measuring the table.
  await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const r = aside?.getBoundingClientRect();
    if (r && r.right > 1) document.body.click();
  });
  await page.waitForTimeout(300);

  // --- AdminSchedule table measurement --------------------------------------
  await gotoSection(page, "Deliverables").catch(async () => {
    await gotoSection(page, "Schedule").catch(() => {});
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/mobile-390-deliverables.png`, fullPage: true });

  report.scheduleTable = await page.evaluate(() => {
    const doc = document.documentElement;
    const rows = [...document.querySelectorAll("main .divide-y > div")];
    const firstRow = rows[0] || null;
    const measureRow = (row) => {
      if (!row) return null;
      const kids = [...row.children].map((c) => {
        const r = c.getBoundingClientRect();
        return {
          text: (c.textContent || "").trim().slice(0, 22),
          w: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          visible: r.width > 0 && r.right <= window.innerWidth + 1,
        };
      });
      const r = row.getBoundingClientRect();
      return {
        rowScrollWidth: row.scrollWidth,
        rowClientWidth: row.clientWidth,
        rowWidth: Math.round(r.width),
        cells: kids,
      };
    };
    // The scroll wrapper around the table, if any.
    const table = firstRow?.closest(".rounded-lg") || null;
    return {
      viewportWidth: window.innerWidth,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      docOverflowPx: doc.scrollWidth - doc.clientWidth,
      rowCount: rows.length,
      tableScrollWidth: table ? table.scrollWidth : null,
      tableClientWidth: table ? table.clientWidth : null,
      tableOverflowPx: table ? table.scrollWidth - table.clientWidth : null,
      tableOverflowXStyle: table ? getComputedStyle(table).overflowX : null,
      firstRow: measureRow(firstRow),
    };
  });

  // Which controls are actually reachable on the first row?
  report.scheduleReachable = await page.evaluate(() => {
    const out = [];
    for (const sel of ['[aria-label="Verify deliverable"]', '[aria-label="Clear verification"]', '[aria-label="Edit deliverable"]']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        out.push({
          sel,
          w: Math.round(r.width),
          h: Math.round(r.height),
          left: Math.round(r.left),
          right: Math.round(r.right),
          insideViewport: r.left >= 0 && r.right <= window.innerWidth + 1 && r.width > 0,
        });
      }
    }
    return out.slice(0, 6);
  });

  // --- Long dialog reachability ---------------------------------------------
  const addBtn = page.getByRole("button", { name: /Add deliverable/i }).first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/mobile-390-dialog.png`, fullPage: false });
    report.dialog = await page.evaluate(() => {
      const content = document.querySelector('[role="dialog"]');
      if (!content) return { found: false };
      const r = content.getBoundingClientRect();
      const save = [...content.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Save",
      );
      const sr = save?.getBoundingClientRect();
      const cs = getComputedStyle(content);
      return {
        found: true,
        dialogTop: Math.round(r.top),
        dialogBottom: Math.round(r.bottom),
        dialogHeight: Math.round(r.height),
        dialogLeft: Math.round(r.left),
        dialogRight: Math.round(r.right),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        maxHeight: cs.maxHeight,
        overflowY: cs.overflowY,
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        saveFound: !!save,
        saveTop: sr ? Math.round(sr.top) : null,
        saveBottom: sr ? Math.round(sr.bottom) : null,
        saveInViewport: sr ? sr.top >= 0 && sr.bottom <= window.innerHeight : null,
      };
    });
    // Try scrolling the dialog to reach Save.
    report.dialogAfterScroll = await page.evaluate(() => {
      const content = document.querySelector('[role="dialog"]');
      if (!content) return null;
      content.scrollTop = content.scrollHeight;
      const save = [...content.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Save",
      );
      const sr = save?.getBoundingClientRect();
      return {
        scrollTop: content.scrollTop,
        saveInViewport: sr ? sr.top >= 0 && sr.bottom <= window.innerHeight : null,
        saveBottom: sr ? Math.round(sr.bottom) : null,
      };
    });
    await page.screenshot({ path: `${OUT}/mobile-390-dialog-scrolled.png`, fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else {
    report.dialog = { found: false, why: "no Add deliverable button" };
  }

  report.mobileProblems = problems;
  await context.close();
}

// ── 4. Collapse trap: collapse on desktop, shrink to 390 ─────────────────────
{
  const { context, page } = await open(1440, 900);
  await login(page);
  const collapse = page.getByRole("button", { name: /^Collapse/ }).first();
  if (await collapse.count()) {
    await collapse.click();
    await page.waitForTimeout(600);
  }
  report.collapsedOnDesktop = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return { width: aside ? Math.round(aside.getBoundingClientRect().width) : null };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(600);
  report.collapseTrap = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const r = aside?.getBoundingClientRect();
    const labelsVisible = aside
      ? [...aside.querySelectorAll("span")].filter((s) => {
          const t = s.textContent.trim();
          const rr = s.getBoundingClientRect();
          return t.length > 2 && rr.width > 0;
        }).length
      : 0;
    const expandBtn = aside
      ? [...aside.querySelectorAll("button")].find((b) =>
          /collapse|expand/i.test(b.textContent),
        )
      : null;
    return {
      drawerWidth: r ? Math.round(r.width) : null,
      visibleTextLabels: labelsVisible,
      expandButtonVisible: expandBtn
        ? expandBtn.getBoundingClientRect().width > 0
        : false,
    };
  });
  await page.screenshot({ path: `${OUT}/mobile-390-collapse-trap.png`, fullPage: false });
  await context.close();
}

// ── 5. Tap targets across the drawer ────────────────────────────────────────
{
  const { context, page } = await open(390, 844);
  await login(page);
  await openDrawer(page);
  report.tapTargets = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return null;
    const btns = [...aside.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent.trim().slice(0, 18) || b.getAttribute("aria-label"), h: Math.round(r.height) };
    }).filter((b) => b.h > 0);
    return {
      total: btns.length,
      under44: btns.filter((b) => b.h < 44).length,
      minHeight: Math.min(...btns.map((b) => b.h)),
      sample: btns.slice(0, 10),
    };
  });
  // Header tap targets too.
  report.headerTapTargets = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("header button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label") || b.textContent.trim().slice(0, 18), h: Math.round(r.height), w: Math.round(r.width) };
    });
    return btns;
  });
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
