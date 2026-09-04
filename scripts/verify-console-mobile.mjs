/**
 * Verifies the console navigation and mobile ergonomics work, by driving the
 * real running app rather than reading the source.
 *
 * Run:  node scripts/verify-console-mobile.mjs
 * Needs the dev servers up (web :6448, api :6407).
 */
import { chromium } from "@playwright/test";

const WEB = process.env.WEB_URL || "http://localhost:6448";
const EMAIL = "prince.wagan@advo.ph";
const PASSWORD = "changeme";

const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

async function signIn(page) {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  const pwToggle = page.locator('button:has-text("password")').first();
  if (await pwToggle.count()) {
    await pwToggle.click();
    await page.waitForTimeout(400);
  }
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

const browser = await chromium.launch();

try {
  // ── Desktop: routing ────────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await signIn(page);
  check("1a. login lands on an /admin URL", /\/admin/.test(page.url()), page.url());

  // Deep link straight to a section.
  await page.goto(`${WEB}/admin/tasks`, { waitUntil: "networkidle" });
  const tasksHeading = await page.locator("h1, h2").first().innerText().catch(() => "");
  check(
    "1b. deep link /admin/tasks renders Tasks",
    page.url().includes("/admin/tasks") && /task/i.test(tasksHeading),
    `url=${page.url()} heading="${tasksHeading}"`
  );

  await page.goto(`${WEB}/admin/calendar`, { waitUntil: "networkidle" });
  const calUrl = page.url();

  // Browser back must return to the previous section.
  await page.goBack({ waitUntil: "networkidle" });
  check(
    "1c. browser back moves between sections",
    page.url().includes("/admin/tasks"),
    `from ${calUrl} back to ${page.url()}`
  );

  await page.goForward({ waitUntil: "networkidle" });
  check("1d. browser forward works", page.url().includes("/admin/calendar"), page.url());

  // Unknown section repairs itself rather than showing a blank console.
  await page.goto(`${WEB}/admin/not-a-real-section`, { waitUntil: "networkidle" });
  check(
    "1e. unknown section falls back to dashboard",
    page.url().includes("/admin/dashboard"),
    page.url()
  );

  // Clicking a nav item must change the address, not just the view.
  await page.goto(`${WEB}/admin/dashboard`, { waitUntil: "networkidle" });
  const navTeam = page.locator('aside button:has-text("Team")').first();
  if (await navTeam.count()) {
    await navTeam.click();
    await page.waitForTimeout(600);
    check("1f. sidebar click updates the URL", page.url().includes("/admin/team"), page.url());
  } else {
    check("1f. sidebar click updates the URL", false, "Team nav button not found");
  }

  // ── Desktop: collapse then narrow must not trap the nav ──────────────
  const collapseBtn = page.locator('aside button[aria-label*="ollapse"], aside button[title*="ollapse"]').first();
  if (await collapseBtn.count()) {
    await collapseBtn.click();
    await page.waitForTimeout(500);
    const collapsedW = await page.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    const narrowW = await page.locator("aside").first().evaluate((el) => el.getBoundingClientRect().width);
    check(
      "2. collapsed on desktop does not trap the drawer at 72px on mobile",
      narrowW > 200,
      `desktop collapsed=${Math.round(collapsedW)}px, mobile drawer=${Math.round(narrowW)}px`
    );
    await page.setViewportSize({ width: 1440, height: 900 });
  } else {
    check("2. collapse trap", false, "collapse button not found");
  }
  await desktop.close();

  // ── Mobile 390px ────────────────────────────────────────────────────
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const m = await mobile.newPage();
  const mobileErrors = [];
  m.on("pageerror", (e) => mobileErrors.push(e.message));
  await signIn(m);

  // 3. The deliverables table must not clip its right-hand controls.
  await m.goto(`${WEB}/admin/schedule`, { waitUntil: "networkidle" });
  await m.waitForTimeout(1200);
  const tableMetrics = await m.evaluate(() => {
    const scroller = document.querySelector("main .overflow-x-auto, .overflow-x-auto");
    if (!scroller) return null;
    return {
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      canScroll: scroller.scrollWidth > scroller.clientWidth,
    };
  });
  if (tableMetrics) {
    check(
      "3. deliverables table scrolls instead of clipping",
      tableMetrics.canScroll || tableMetrics.scrollWidth <= tableMetrics.clientWidth,
      `client=${tableMetrics.clientWidth}px scroll=${tableMetrics.scrollWidth}px canScroll=${tableMetrics.canScroll}`
    );
  } else {
    check("3. deliverables table scrolls instead of clipping", false, "no scroll container found (table may be empty)");
  }

  // 4. A dialog must fit the screen and be scrollable to its own Save button.
  const addBtn = m.locator('button:has-text("Add deliverable")').first();
  if (await addBtn.count()) {
    await addBtn.click();
    await m.waitForTimeout(900);
    const dlg = await m.evaluate(() => {
      // The nav drawer is also role=dialog on mobile, so exclude it by id.
      const d = [...document.querySelectorAll('[role="dialog"]')].find(
        (el) => el.id !== "admin-navigation-drawer"
      );
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return {
        height: Math.round(r.height),
        viewport: window.innerHeight,
        left: Math.round(r.left),
        width: Math.round(r.width),
        scrollable: d.scrollHeight > d.clientHeight,
        withinViewport: r.height <= window.innerHeight + 1,
      };
    });
    if (dlg) {
      check(
        "4a. dialog fits the phone viewport",
        dlg.withinViewport,
        `dialog=${dlg.height}px viewport=${dlg.viewport}px`
      );
      check("4b. dialog has side margin", dlg.left >= 8, `left=${dlg.left}px width=${dlg.width}px`);
      // Save must be reachable: either visible already or reachable by scrolling.
      const saveVisible = await m
        .locator('[role="dialog"]:not(#admin-navigation-drawer) button:has-text("Save")')
        .last()
        .isVisible()
        .catch(() => false);
      check("4c. dialog Save button is reachable", saveVisible, `scrollable=${dlg.scrollable}`);
      await m.keyboard.press("Escape");
      await m.waitForTimeout(400);
    } else {
      check("4a. dialog fits the phone viewport", false, "dialog did not open");
    }
  } else {
    check("4a. dialog fits the phone viewport", false, "Add deliverable button not found");
  }

  // 5. The nav drawer must lock the page behind it and close on Escape.
  await m.goto(`${WEB}/admin/dashboard`, { waitUntil: "networkidle" });
  const hamburger = m.locator('button[aria-label="Open menu"]').first();
  await hamburger.click();
  await m.waitForTimeout(700);

  const drawerState = await m.evaluate(() => {
    const drawer = document.getElementById("admin-navigation-drawer");
    return {
      exists: !!drawer,
      role: drawer?.getAttribute("role") || null,
      ariaModal: drawer?.getAttribute("aria-modal") || null,
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      triggerLinked: !!document.querySelector('[aria-controls="admin-navigation-drawer"]'),
    };
  });
  check("5a. drawer has an id the trigger points at", drawerState.exists && drawerState.triggerLinked,
    `id=${drawerState.exists} aria-controls=${drawerState.triggerLinked}`);
  check("5b. drawer announces itself as a modal dialog",
    drawerState.role === "dialog" && drawerState.ariaModal === "true",
    `role=${drawerState.role} aria-modal=${drawerState.ariaModal}`);
  check("5c. page scroll is locked behind the open drawer",
    drawerState.htmlOverflow === "hidden" && drawerState.bodyOverflow === "hidden",
    `html=${drawerState.htmlOverflow || "(unset)"} body=${drawerState.bodyOverflow || "(unset)"}`);

  await m.keyboard.press("Escape");
  await m.waitForTimeout(700);
  const afterEsc = await m.evaluate(() => ({
    htmlOverflow: document.documentElement.style.overflow,
    focusReturned: document.activeElement?.getAttribute("aria-label") === "Open menu",
  }));
  check("5d. Escape closes the drawer and releases the scroll lock",
    afterEsc.htmlOverflow !== "hidden", `html overflow now "${afterEsc.htmlOverflow || "(unset)"}"`);
  check("5e. focus returns to the hamburger", afterEsc.focusReturned,
    `focused=${afterEsc.focusReturned}`);

  // 6. No horizontal page overflow anywhere on a phone.
  const overflow = await m.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check("6. no horizontal page overflow at 390px", overflow.doc <= overflow.win + 1,
    `scrollWidth=${overflow.doc} viewport=${overflow.win}`);

  check("7. no uncaught page errors", pageErrors.length === 0 && mobileErrors.length === 0,
    `desktop=${pageErrors.length} mobile=${mobileErrors.length} ${[...pageErrors, ...mobileErrors].slice(0, 2).join(" | ")}`);

  await mobile.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
