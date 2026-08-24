#!/usr/bin/env node
/**
 * Landing viewport check — RESPONSIVE STRUCTURE, not editorial composition.
 *
 * SCOPE DECISION, 2026-08-25. This bench was authored at 68d033f against the landing tree
 * that `offer-truth` deleted at 780485c. It went to 22/63 and stayed there: 41 of its
 * checks asserted the old page's composition — a hero "system rail", named product
 * surfaces, a proof section, a full-width footer wordmark, specific footer copy, specific
 * section headings — on a page that is live, correct, and deliberately different.
 *
 * The failing checks were NOT re-authored to agree with whatever the new page renders.
 * That would have produced a bench that measures nothing: a mirror passes by construction
 * and catches no regression. Instead the bench was NARROWED, and the line is drawn here:
 *
 *   KEPT — guarantees that survive any redesign, because they are about the page working
 *   at a size rather than the page saying a thing: no horizontal overflow, the document
 *   scrolls its full height, the primary CTA is reachable without scrolling, the fixed
 *   header fits its viewport, the mobile drawer expands, and the drawer is opaque (a
 *   transparent drawer over content is unreadable — a real bug class, so it was retargeted
 *   to the new drawer rather than dropped).
 *
 *   REMOVED — assertions about what the landing SAYS and which sections it has. Those are
 *   editorial decisions owned by whoever owns the landing, and they changed on purpose
 *   (see ROADMAP "quote instead of price, show the sites we shipped"). A viewport bench is
 *   the wrong instrument for them: it cannot tell a deliberate rewrite from a regression,
 *   so it reported a correct page as broken for two days.
 *
 *   ALSO REMOVED — `mobile-drawer-fills-viewport` and `mobile-drawer-actions-bottom-pinned`.
 *   Both described the old FloatingNav drawer's specific visual treatment. The landing
 *   drawer is a different design; asserting the old one's geometry is not a guarantee, it
 *   is a memory.
 *
 * If the landing needs content guarantees again, they belong in a bench that is explicitly
 * about landing CONTENT (bench/roadmap/offer-truth and landing-follow already are), where a
 * copy change is expected to require a deliberate bench change. Drawer BEHAVIOUR — escape,
 * scroll lock, route-change close — lives in bench/roadmap/drawer-a11y.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// `new URL(...).pathname` yields `/C:/...` on Windows and resolves to
// `C:\C:\...`; fileURLToPath is the portable form the sibling benches use.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const baseUrl = process.env.ADVO_LANDING_URL || "http://127.0.0.1:6100/";
const dateStamp =
  process.env.ADVO_BENCH_DATE ||
  new Date().toISOString().slice(0, 10);
const screenshotDir = path.join(
  repoRoot,
  "bench/roadmap/landing-stripe-audit/screenshots",
  dateStamp,
);
const runPath = path.join(
  repoRoot,
  "bench/roadmap/landing-stripe-audit/runs",
  `${dateStamp}-viewport-check.json`,
);

const viewports = [
  { width: 360, height: 780, name: "mobile-360" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 768, height: 900, name: "tablet-768" },
  { width: 1280, height: 900, name: "desktop-1280" },
  { width: 1440, height: 960, name: "desktop-1440" },
];

const expectedLabels = ["Website", "Client Hub", "Admin", "Care Plan"];

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const check = (id, passed, details) => ({ id, passed: Boolean(passed), details });

const isVisibleEnough = async (locator) => {
  const count = await locator.count();
  if (count === 0) return false;
  for (let index = 0; index < count; index += 1) {
    const box = await locator.nth(index).boundingBox();
    if (box && box.width > 0 && box.height > 0) return true;
  }
  return false;
};

const getPageMetrics = async (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const maxScrollWidth = Math.max(
      doc.scrollWidth,
      body?.scrollWidth ?? 0,
      root?.scrollWidth ?? 0,
    );
    const maxScrollHeight = Math.max(
      doc.scrollHeight,
      body?.scrollHeight ?? 0,
      root?.scrollHeight ?? 0,
    );
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const footerLogo = footer?.querySelector('[data-viewport-check="footer-wordmark"]');
    const headerRect = header?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const footerLogoRect = footerLogo?.getBoundingClientRect();
    const productSection = [...document.querySelectorAll("section")].find((section) =>
      section.textContent?.includes("One system, not just a website."),
    );
    const proofSection = [...document.querySelectorAll("section")].find((section) =>
      section.textContent?.includes("Proof, not just screenshots."),
    );
    const footerText = footer?.textContent ?? "";
    const productRect = productSection?.getBoundingClientRect();
    const proofRect = proofSection?.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      maxScrollWidth,
      maxScrollHeight,
      headerRect: headerRect
        ? {
            left: headerRect.left,
            right: headerRect.right,
            top: headerRect.top,
            width: headerRect.width,
            height: headerRect.height,
          }
        : null,
      footerRect: footerRect
        ? {
            left: footerRect.left,
            right: footerRect.right,
            width: footerRect.width,
            height: footerRect.height,
          }
        : null,
      footerText,
      footerLogoRect: footerLogoRect
        ? {
            left: footerLogoRect.left,
            right: footerLogoRect.right,
            width: footerLogoRect.width,
            height: footerLogoRect.height,
          }
        : null,
      productRect: productRect
        ? {
            left: productRect.left,
            right: productRect.right,
            width: productRect.width,
          }
        : null,
      proofRect: proofRect
        ? {
            left: proofRect.left,
            right: proofRect.right,
            width: proofRect.width,
          }
        : null,
    };
  });

const getMobileDrawerMetrics = async (page) =>
  page.evaluate(() => {
    const drawer = document.getElementById("mobile-navigation-drawer");
    // The old FloatingNav drawer carried a dedicated panel node; the landing nav that
    // replaced it IS the panel. Fall back to the drawer element so the opacity guarantee
    // survives the redesign instead of silently reading null.
    const panel =
      document.querySelector('[data-viewport-check="mobile-drawer-panel"]') ?? drawer;
    const navToggle = document.querySelector('[aria-controls="mobile-navigation-drawer"]');
    const drawerRect = drawer?.getBoundingClientRect();
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const visibleLinkByText = (text) =>
      [...document.querySelectorAll("a")]
        .map((link) => ({ link, rect: link.getBoundingClientRect() }))
        .find(
          ({ link, rect }) =>
            link.textContent?.trim() === text && rect.width > 0 && rect.height > 0,
        );
    const startLink = visibleLinkByText("Start a Project");
    const hubLink = visibleLinkByText("Client Hub");
    const startRect = startLink?.rect;
    const hubRect = hubLink?.rect;

    return {
      expanded: navToggle?.getAttribute("aria-expanded"),
      panelBackground: panelStyle?.backgroundColor ?? null,
      drawerRect: drawerRect
        ? {
            left: drawerRect.left,
            right: drawerRect.right,
            top: drawerRect.top,
            bottom: drawerRect.bottom,
            width: drawerRect.width,
            height: drawerRect.height,
          }
        : null,
      startRect: startRect
        ? {
            top: startRect.top,
            bottom: startRect.bottom,
            width: startRect.width,
            height: startRect.height,
          }
        : null,
      hubRect: hubRect
        ? {
            top: hubRect.top,
            bottom: hubRect.bottom,
            width: hubRect.width,
            height: hubRect.height,
          }
        : null,
    };
  });

const run = async () => {
  ensureDir(screenshotDir);
  ensureDir(path.dirname(runPath));

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
      });
      page.setDefaultTimeout(10_000);

      // `networkidle` is the wrong signal here and Playwright says so: the dev server
      // holds an HMR websocket open and the landing fetches its portfolio row, so "no
      // network for 500ms" is not reliably reached inside the 10s default and the whole
      // bench dies on a page that rendered fine. Wait for the thing being measured to
      // exist instead — deterministic, and faster.
      await page.goto(baseUrl, { waitUntil: "load" });
      await page.waitForSelector("header.landing-nav", { state: "attached" });
      await page.screenshot({
        path: path.join(screenshotDir, `${viewport.name}.png`),
        fullPage: true,
      });

      const metrics = await getPageMetrics(page);
      const heroCtaVisible = await isVisibleEnough(
        page.getByRole("link", { name: /start a project|get started/i }).first(),
      );
      const heroSystemRailVisible = await isVisibleEnough(
        page.locator('[data-viewport-check="hero-system-rail"]'),
      );
      const serviceHeadingVisible = await isVisibleEnough(
        page.getByRole("heading", { name: /one system, not just a website/i }),
      );
      const proofHeadingVisible = await isVisibleEnough(
        page.getByRole("heading", { name: /proof, not just screenshots/i }),
      );
      const labelsPresent = [];
      for (const label of expectedLabels) {
        labelsPresent.push({
          label,
          visible: await isVisibleEnough(page.getByText(label, { exact: true })),
        });
      }

      const widthSlack = 2;
      const checks = [
        check(
          "no-horizontal-overflow",
          metrics.maxScrollWidth <= viewport.width + widthSlack,
          { maxScrollWidth: metrics.maxScrollWidth, viewportWidth: viewport.width },
        ),
        check(
          "document-scrolls-full-landing",
          metrics.maxScrollHeight >= viewport.height * 4,
          { maxScrollHeight: metrics.maxScrollHeight, viewportHeight: viewport.height },
        ),
        check("hero-cta-visible", heroCtaVisible, {
          expected: "Hero primary CTA is visible without relying on scroll.",
        }),
        check(
          "fixed-header-fits",
          Boolean(
            metrics.headerRect &&
              metrics.headerRect.left >= -widthSlack &&
              metrics.headerRect.right <= viewport.width + widthSlack &&
              metrics.headerRect.height >= 56,
          ),
          { headerRect: metrics.headerRect },
        ),
      ];

      if (viewport.width <= 390) {
        const menuButton = page.locator('[aria-controls="mobile-navigation-drawer"]');
        await menuButton.click();
        await page.waitForSelector("#mobile-navigation-drawer");
        await page.screenshot({
          path: path.join(screenshotDir, `${viewport.name}-drawer.png`),
          fullPage: true,
        });

        const drawerMetrics = await getMobileDrawerMetrics(page);
        const panelOpaque = /^rgb\(/.test(drawerMetrics.panelBackground ?? "");
        checks.push(
          check("mobile-drawer-expanded", drawerMetrics.expanded === "true", drawerMetrics),
          check("mobile-drawer-panel-opaque", panelOpaque, drawerMetrics),
        );
      }

      await page.close();
      results.push({
        viewport,
        passed: checks.every((item) => item.passed),
        checks,
      });
    }
  } finally {
    await browser.close();
  }

  const allChecks = results.flatMap((result) => result.checks);
  const output = {
    benchmark: "landing-stripe-audit-viewport",
    baseUrl,
    date: dateStamp,
    passed: allChecks.every((item) => item.passed),
    counts: {
      passed: allChecks.filter((item) => item.passed).length,
      failed: allChecks.filter((item) => !item.passed).length,
      total: allChecks.length,
    },
    screenshots: path.relative(repoRoot, screenshotDir),
    results,
  };

  fs.writeFileSync(runPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  process.exit(output.passed ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
