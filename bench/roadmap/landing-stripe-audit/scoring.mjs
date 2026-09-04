#!/usr/bin/env node
/**
 * Landing audit — retargeted 2026-08-18.
 *
 * This bench was written against the Stripe-era component set (Hero.tsx,
 * WhyDigital.tsx, ContactCTA.tsx, TechTicker.tsx, ProcessSteps.tsx,
 * ServiceTiers.tsx, InfrastructureDiagram.tsx, FAQ.tsx, Footer.tsx). None of
 * those were ever rendered by `/`; the shipped landing is LandingPage.tsx.
 * They have been deleted, so the checks now assert the same *intent* against
 * the surface that actually ships.
 *
 * It also used `new URL(...).pathname` for repoRoot, which yields `/C:/...` on
 * Windows and resolved to `C:\C:\...` — every read() returned "" and all 15
 * checks failed regardless of the code. Fixed to fileURLToPath, matching the
 * sibling benches.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const files = {
  landingPage: read("apps/web/src/components/landing/LandingPage.tsx"),
  landingFooter: read("apps/web/src/components/landing/landing-footer.tsx"),
  landingShell: read("apps/web/src/components/landing/landing-shell.tsx"),
  landingCss: read("apps/web/src/components/landing/landing-page.css"),
  portfolioCard: read("apps/web/src/components/landing/PortfolioCard.tsx"),
  floatingNav: read("apps/web/src/components/landing/FloatingNav.tsx"),
  drawerTest: read("apps/web/src/test/mobile-nav-drawer.test.ts"),
  indexCss: read("apps/web/src/index.css"),
  readme: read("README.md"),
};

const hasAll = (source, terms) =>
  terms.every((term) => new RegExp(term, "i").test(source));

/** Components under landing/ that are allowed to exist, and why. */
const allowedLandingModule = new Set([
  "LandingPage.tsx", // rendered by /
  "landing-footer.tsx", // rendered by / and by every landing-shell route
  "landing-shell.tsx", // /start /login /team /project/:slug /404
  "FloatingNav.tsx", // /hub
  "PortfolioCard.tsx", // proof-card unit under test
  "landing-page.css",
]);

const checks = [
  {
    id: "no-dead-landing-module",
    title: "Nothing under landing/ is unreachable",
    passed: (() => {
      const dir = join(repoRoot, "apps/web/src/components/landing");
      if (!existsSync(dir)) return false;
      return readdirSync(dir).every((name) => allowedLandingModule.has(name));
    })(),
    expected:
      "Every file under apps/web/src/components/landing is rendered by a live route (or is the PortfolioCard unit under test).",
  },
  {
    id: "product-surfaces",
    title: "Services are ADVO product surfaces",
    passed: hasAll(files.landingPage, [
      "Client Hub",
      "Admin",
      "Public site",
      "Hardware floor",
    ]),
    expected:
      "The landing exposes Client Hub, Admin, public site, and hardware-floor surfaces instead of generic agency services.",
  },
  {
    id: "hero-product-system-offer",
    title: "Hero sells the website plus system offer",
    passed:
      hasAll(files.landingPage, [
        "We digitalize it for you",
        "Philippine software agency and client workspace",
      ]) &&
      // The missing-piece section carries the system framing under the hero.
      hasAll(files.landingPage, ["landing-piece", "the system is the fourth"]) &&
      !/Build together|Ship with clarity/i.test(files.landingPage),
    expected:
      "Hero headline and the section under it position ADVO as a website-plus-system builder, not a generic agency intro. The headline is the founder's mission line; the Stripe-era 'Build together. Ship with clarity.' is retired.",
  },
  {
    id: "proof-metrics",
    title: "Portfolio carries case-study proof",
    passed:
      /(metric|outcome|before|after|products used|launch timeline|caseStudy)/i.test(
        files.portfolioCard,
      ) &&
      hasAll(files.portfolioCard, [
        'data-viewport-check="proof-system-map"',
        "Client hub",
        "Admin console",
        "VPS handoff",
      ]),
    expected:
      "The proof card exposes outcomes, before/after, products used, launch timeline data, and a non-empty system proof map.",
  },
  {
    id: "mobile-drawer",
    title: "Mobile nav is a full-screen route drawer",
    passed:
      /aria-expanded/.test(files.floatingNav) &&
      /(fixed\s+inset-0|min-h-svh|h-svh)/.test(files.floatingNav) &&
      /(bottom-|mt-auto|sticky\s+bottom)/.test(files.floatingNav) &&
      /Client Hub/.test(files.floatingNav),
    expected:
      "Mobile nav exposes aria-expanded, occupies the viewport, and bottom-pins Start a Project / Client Hub actions.",
  },
  {
    id: "mobile-drawer-tested",
    title: "Drawer escape / scroll-lock / route-close are covered by a test",
    passed:
      has("apps/web/src/test/mobile-nav-drawer.test.ts") &&
      hasAll(files.drawerTest, [
        "Escape",
        "body\\.style\\.overflow",
        "route change",
      ]),
    expected:
      "An automated test drives the drawer's Escape close, body scroll lock/restore, and route-change close instead of a manual phone check.",
  },
  {
    id: "floating-nav-scroll-threshold",
    title: "Floating nav tracks the page scroll container",
    passed:
      /scrollTop\s*\?\?\s*window\.scrollY|window\.scrollY/.test(files.floatingNav) &&
      />\s*80/.test(files.floatingNav),
    expected:
      "Floating nav's compact state follows the live scroll container (#root when the app owns scrolling, window otherwise) past an 80px threshold.",
  },
  {
    id: "reduced-motion",
    title: "Landing animations respect reduced motion",
    passed:
      /useReducedMotion/.test(files.landingPage) &&
      /useReducedMotion/.test(files.landingShell) &&
      /prefers-reduced-motion/.test(files.landingCss),
    expected:
      "Both landing mounts read useReducedMotion and the landing stylesheet has a prefers-reduced-motion block.",
  },
  {
    id: "docs-current-design",
    title: "README describes current design system",
    passed:
      // `#E67A3A` was in the original deny-list, but it is still the live
      // `--accent` token in index.css — documenting it is correct. The
      // remaining terms only appear when the README is *describing* the
      // abandoned 3D/blob direction, not denying it.
      !/(Isometric 3D scene|organic orange blob|zero scroll animations|React Three Fiber)/i.test(
        files.readme,
      ) && /(advo-section-rails|editorial grid|Linear|rail)/i.test(files.readme),
    expected:
      "README no longer documents stale 3D/blob design work and describes the current rail/grid direction.",
  },
  {
    id: "private-stack-narrative",
    title: "The stack handoff is on the page",
    passed:
      hasAll(files.landingPage, ["landing-workflow-section", "Inquiry", "Scope", "Build", "Review", "Launch"]) &&
      /VPS handoff/i.test(files.landingFooter),
    expected:
      "The inquiry-to-floor sequence is a rendered section and the VPS handoff is named where the system story closes.",
  },
  {
    id: "why-system-not-generic-digital",
    title: "The section under the hero explains the system, not digital-transformation",
    passed:
      hasAll(files.landingPage, [
        "Three pieces already exist",
        "Paper, Viber, tally sheets",
      ]) &&
      !/Invest in Your Digital Future|24\/7 Online Presence|Scale Effortlessly|Better Customer Experience/.test(
        files.landingPage,
      ),
    expected:
      "The first post-hero section names the concrete gap on the floor instead of generic digital-transformation benefits.",
  },
  {
    id: "integration-strip",
    title: "Integration strip is quiet and locally served",
    passed:
      /landing-marquee/.test(files.landingPage) &&
      /\/landing\/integration\//.test(files.landingPage) &&
      !/simpleicons|cdn\.simpleicons/.test(files.landingPage),
    expected:
      "The integration strip serves its own marks and does not depend on an external logo CDN.",
  },
  {
    id: "process-system-sequence",
    title: "Process section is a product-system sequence",
    passed:
      hasAll(files.landingPage, [
        "Discover",
        "Design",
        "Build",
        "Review",
        "Launch",
        "Support",
        "Learn the floor before we write software",
      ]) && !/How We Work|Understanding your needs, goals, and vision/.test(files.landingPage),
    expected:
      "Process defaults describe ADVO's discover-to-support delivery sequence instead of generic agency phases.",
  },
  {
    id: "tasteful-interaction-layer",
    title: "Landing hover treatment is restrained and reduced-motion aware",
    passed:
      /:hover/.test(files.landingCss) &&
      /@media \(prefers-reduced-motion: reduce\)/.test(files.landingCss) &&
      /is-reduce-motion/.test(files.landingCss) &&
      !/interactive-surface/.test(files.indexCss),
    expected:
      "The landing's own stylesheet owns hover, guards it under prefers-reduced-motion, and the orphaned Stripe-era .interactive-surface utility is gone.",
  },
  {
    id: "footer-system-continuity",
    title: "Footer continues the product-system story",
    passed:
      hasAll(files.landingFooter, [
        "Start the system",
        "Websites with client systems behind them",
        "Client Hub",
        "Admin Console",
        "VPS handoff",
        'data-viewport-check="footer-wordmark"',
      ]) &&
      !/We digitalize for you|Web Applications|Mobile Apps|Cloud Architecture/.test(
        files.landingFooter,
      ) &&
      // One footer, mounted by both the landing and the shell — no drift.
      /LandingFooter/.test(files.landingPage) &&
      /LandingFooter/.test(files.landingShell),
    expected:
      "A single footer component uses the product-system language, includes the project CTA and large wordmark, avoids generic service copy, and is shared by / and the shell routes.",
  },
  // Retired 2026-09-04 (landing merge): the standalone engagement band and FAQ
  // sections were removed to shorten the page toward the revised fork's length —
  // the `engagement-cta` and `faq-product-system` checks that asserted their
  // presence went with them. See ROADMAP "Landing merge" and bench:landing-merge.
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "landing-stripe-audit",
  date: "2026-08-18",
  passed,
  counts: {
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).length,
    total: checks.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(passed ? 0 : 1);
