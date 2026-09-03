#!/usr/bin/env node
/**
 * Landing audit — retargeted 2026-09-02.
 *
 * The previous revision scored the eleven-section marketing page: a process
 * tab strip, an engagement/quotation grid, an FAQ accordion, an integration
 * marquee, a fake workspace mockup, and stock isometric clipart. Prince cut
 * all of it ("nobody cares about that... just showcases what we've done and
 * what we can do"), so twelve of those checks were asserting the presence of
 * deleted code. Scoring the old architecture louder does not bring it back.
 *
 * The checks below guard the page that actually ships, and — more usefully —
 * guard it against drifting back: no pricing, no process, no clipart, work
 * panels that fill a viewport, and a footer dot field faithful to the op.al
 * mechanism it was rebuilt from.
 *
 * Hero check retargeted 2026-09-03. `hero-is-type-only` asserted the headline
 * "We digitalize it for you" on white and banned any hero image. The approved
 * direction is now a full-bleed video of a working tower, so that check was
 * asserting a design decision that had been reversed on purpose. It is replaced
 * by `hero-headline-over-media-with-still-fallback`, which guards the thing the
 * new hero can actually get wrong: the wrong sentence, missing media, or a blank
 * first screen while the video downloads.
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
  workShowcase: read("apps/web/src/components/landing/WorkShowcase.tsx"),
  dotField: read("apps/web/src/components/landing/AdvoDotField.tsx"),
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
const hasNone = (source, terms) =>
  terms.every((term) => !new RegExp(term, "i").test(source));

/**
 * Comments carry em dashes and describe the sections that were removed, so a
 * naive grep for "engagement" or "—" would fail on the very commit that
 * deleted them. Copy checks run against code with comments stripped.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const copy = {
  landingPage: stripComments(files.landingPage),
  workShowcase: stripComments(files.workShowcase),
  landingFooter: stripComments(files.landingFooter),
};

/** Components under landing/ that are allowed to exist, and why. */
const allowedLandingModule = new Set([
  "LandingPage.tsx", // rendered by /
  "WorkShowcase.tsx", // the work panels on /
  "AdvoDotField.tsx", // the footer wordmark canvas
  "landing-footer.tsx", // rendered by / and by every landing-shell route
  "landing-shell.tsx", // /start /login /team /project/:slug /404
  "FloatingNav.tsx", // /hub
  "PortfolioCard.tsx", // proof-card unit under test
  "landing-page.css",
]);

/** Every in-page anchor the nav and footer offer must resolve to a real id. */
const anchorTargets = (() => {
  const source = `${files.landingPage}\n${files.workShowcase}`;
  const ids = new Set([...source.matchAll(/id="([a-z0-9-]+)"/gi)].map((m) => m[1]));
  const hrefs = new Set(
    [...`${copy.landingPage}\n${copy.landingFooter}`.matchAll(/href[=:]\s*"\/?#([a-z0-9-]+)"/gi)].map(
      (m) => m[1],
    ),
  );
  return { ids, hrefs, dangling: [...hrefs].filter((href) => !ids.has(href)) };
})();

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
    id: "client-irrelevant-sections-gone",
    title: "The page carries no section a client did not ask for",
    passed: hasNone(copy.landingPage, [
      "landing-usecase", // process tabs
      "landing-engagement", // pricing / quotation tiers
      "landing-faq",
      "landing-marquee", // integration logo strip
      "landing-surface", // "Apps for Everything" grid
      "landing-workflow-section", // inquiry-to-floor nodes
      "landing-app-shell", // fake workspace mockup
      "landing-floor", // clinic / cafe / shop cards
      "landing-piece", // "the gap"
    ]),
    expected:
      "The process strip, quotation tiers, FAQ, integration marquee, surface grid, workflow nodes, dashboard mockup, floor cards, and gap section are all gone from the landing.",
  },
  {
    id: "no-published-rate",
    title: "No pricing is published",
    passed: hasNone(copy.landingPage, ["₱", "starting at", "per month", "/mo\\b"]),
    expected: "The landing names no rate, retainer price, or per-seat figure.",
  },
  {
    id: "no-stock-clipart",
    title: "No stock illustration is rendered on the landing",
    passed: hasNone(`${copy.landingPage}\n${copy.landingFooter}`, [
      "/landing/icon/",
      "/landing/service-",
      "/landing/engagement-",
      "/landing/feature-",
      "/landing/integration/",
      "/landing/rw/",
    ]),
    expected:
      "The landing renders no isometric clipart, service card art, or stock photography. Its only bitmap is the ADVO wordmark.",
  },
  {
    id: "hero-headline-over-media-with-still-fallback",
    title: "Hero is the approved headline over background media that is never blank",
    passed: (() => {
      // Read the h1 rather than grep the file: a grep for the sentence passes
      // on a stray comment, and JSX wraps the copy across source lines.
      const headline = /<h1>([\s\S]*?)<\/h1>/.exec(copy.landingPage)?.[1] ?? "";
      return (
        headline.replace(/\s+/g, " ").trim() ===
          "Building the technological infrastructure for industries across the Philippines." &&
        hasAll(copy.landingPage, [
          "landing-hero-media",
          "landing-hero-scrim",
          "<video",
          "/landing/hero-building\\.mp4",
          // The still is the poster, so the video element is never a black box…
          'poster="/landing/hero-building\\.jpg"',
        ]) &&
        // …and it is also the media layer's own background, which is what
        // covers the reduced-motion mount: that one ships no <video> at all.
        /\.landing-hero-media\s*\{[^}]*background-image:\s*url\("\/landing\/hero-building\.jpg"\)/.test(
          files.landingCss,
        ) &&
        has("apps/web/public/landing/hero-building.mp4") &&
        has("apps/web/public/landing/hero-building.jpg")
      );
    })(),
    expected:
      "The hero renders the approved headline verbatim in its h1 over a full-bleed video with a scrim, and the same JPG still is both the video poster and the CSS background, so no reader ever sees an empty first screen. Both assets exist under public/landing.",
  },
  {
    id: "work-is-full-viewport",
    title: "Each shipped project fills a screen",
    passed:
      /\.work-panel\s*\{[^}]*height:\s*100svh/.test(files.landingCss) &&
      /\.work-panel-media\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/.test(files.landingCss) &&
      /object-fit:\s*cover/.test(files.landingCss) &&
      /scroll-snap-align/.test(files.landingCss),
    expected:
      "A work panel is 100svh with an absolutely positioned, cover-fitted screenshot behind it, and snaps as you scroll.",
  },
  {
    id: "work-panel-affordance",
    title: "A work panel is a name, one line, and a text link",
    passed:
      hasAll(copy.workShowcase, [
        "work-panel-title",
        "work-panel-desc",
        "work-panel-link",
        "View site",
      ]) &&
      /\.work-panel-link\s*\{[^}]*text-decoration:\s*underline/.test(files.landingCss) &&
      // Card chrome is what the panel replaced; a border or a chip means it crept back.
      hasNone(copy.workShowcase, ["landing-work-card", "landing-chip-line", "landing-work-shot"]),
    expected:
      "Each panel shows the project name, one clamped line, and an underlined text link. No card border, no chip button.",
  },
  {
    id: "work-never-invents-a-row",
    title: "An empty portfolio renders no work section",
    passed:
      /project\.length === 0/.test(files.workShowcase) &&
      /return null/.test(files.workShowcase) &&
      // …and the nav must not offer an anchor to a section that did not render.
      /shippedProject\.length > 0/.test(files.landingPage),
    expected:
      "With no portfolio rows the work section is absent, and the nav drops its Work anchor rather than scrolling nowhere.",
  },
  {
    id: "no-dangling-anchor",
    title: "Every in-page anchor resolves",
    passed: anchorTargets.hrefs.size > 0 && anchorTargets.dangling.length === 0,
    expected: `Every #anchor offered by the nav or footer matches an id that the landing renders. Dangling: ${
      anchorTargets.dangling.join(", ") || "none"
    }.`,
  },
  {
    id: "footer-dot-field",
    title: "The footer is the ADVO dot field on white",
    passed:
      /AdvoDotField/.test(files.landingFooter) &&
      /landing-footer-field/.test(files.landingFooter) &&
      /\.landing-footer\s*\{[^}]*background:\s*var\(--landing-ground\)/.test(files.landingCss) &&
      // The old dark footer and its marketing lede are gone.
      hasNone(copy.landingFooter, ["landing-footer-lede", "Start the system", "landing-footer-grid"]),
    expected:
      "The footer opens with the interactive ADVO dot field on the page's own white ground, and the dark four-column footer with its marketing lede is retired.",
  },
  {
    id: "dot-field-fidelity",
    title: "The dot field reproduces the op.al mechanism",
    passed:
      hasAll(files.dotField, [
        // Gaussian influence around a smoothed pointer, cut off at 3 sigma.
        "Math\\.exp\\(-distSq / twoSigmaSq\\)",
        "cutoffSq",
        // Velocity-scaled sigma.
        "SIGMA_PER_SPEED",
        // Linear decay, not a lerp — this is what leaves the comet trail.
        "DECAY_PER_SECOND = 1 / 3\\.2",
        // Four tiers, the third of which is a stroked ring.
        "TIER_SOLID",
        "TIER_BULLET",
        "TIER_RING",
        "ctx\\.stroke\\(\\)",
        // Mask sampled off the real wordmark, not an approximated path.
        "getImageData",
        "advo-logo-black",
      ]) &&
      // One fill colour for every tier: the ramp is ink coverage, never colour.
      (files.dotField.match(/ctx\.fillStyle = DOT_COLOR/g) || []).length === 1,
    expected:
      "The field samples the real ADVO artwork into a grid, drives it with a velocity-scaled Gaussian and a 1/3.2-per-second linear decay, renders four tiers including a stroked ring, and uses a single fill colour throughout.",
  },
  {
    id: "dot-field-is-not-a-battery-drain",
    title: "The dot field stops when it is off screen",
    passed:
      /IntersectionObserver/.test(files.dotField) &&
      /cancelAnimationFrame/.test(files.dotField) &&
      /ResizeObserver/.test(files.dotField) &&
      /removeEventListener/.test(files.dotField),
    expected:
      "The canvas loop is gated by an IntersectionObserver, cancels its frame when scrolled away, remasks on resize, and unbinds its listeners on unmount.",
  },
  {
    id: "paymongo-disclosures",
    title: "The four merchant-review policies are reachable from every page",
    passed:
      hasAll(copy.landingFooter, [
        "Terms and Conditions",
        "Privacy Policy",
        "Return and Refund Policy",
        "Dispute Resolution Policy",
      ]) &&
      /LandingFooter/.test(files.landingPage) &&
      /LandingFooter/.test(files.landingShell),
    expected:
      "One footer, mounted by both / and the shell routes, carries all four PayMongo disclosures under their full titles.",
  },
  {
    id: "no-em-dash-in-copy",
    title: "User-facing copy carries no em dash",
    passed: hasNone(
      `${copy.landingPage}\n${copy.workShowcase}\n${copy.landingFooter}`,
      ["—"],
    ),
    expected:
      "Prince's standing copy rule: no em dashes in anything a visitor reads. Code comments are exempt and are stripped before this check.",
  },
  {
    id: "proof-metrics",
    title: "Portfolio card carries case-study proof",
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
      hasAll(files.drawerTest, ["Escape", "body\\.style\\.overflow", "route change"]),
    expected:
      "An automated test drives the drawer's Escape close, body scroll lock/restore, and route-change close instead of a manual phone check.",
  },
  {
    id: "landing-drawer-shares-one-lock",
    title: "Both landing mounts use the shared drawer lock",
    passed:
      /useDrawerLock/.test(files.landingPage) &&
      /useDrawerLock/.test(files.landingShell) &&
      /mobile-navigation-drawer/.test(files.landingPage) &&
      /mobile-navigation-drawer/.test(files.landingShell),
    expected:
      "The landing and the shell both drive their drawer through useDrawerLock, so Escape, scroll lock, and focus trapping cannot drift apart.",
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
    title: "Every animated surface respects reduced motion",
    passed:
      /useReducedMotion/.test(files.landingShell) &&
      /useReducedMotion/.test(files.workShowcase) &&
      /useReducedMotion/.test(files.dotField) &&
      /prefers-reduced-motion/.test(files.landingCss) &&
      // Snapping is motion too: it must be off under the same preference.
      /prefers-reduced-motion[\s\S]*scroll-snap-type:\s*none/.test(files.landingCss),
    expected:
      "The work panels, the dot field, and the shell all read useReducedMotion; the stylesheet disables transitions and scroll snapping under the same preference.",
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
    id: "docs-current-design",
    title: "README describes current design system",
    passed:
      !/(Isometric 3D scene|organic orange blob|zero scroll animations|React Three Fiber)/i.test(
        files.readme,
      ) && /(advo-section-rails|editorial grid|Linear|rail)/i.test(files.readme),
    expected:
      "README no longer documents stale 3D/blob design work and describes the current rail/grid direction.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "landing-audit",
  date: "2026-09-02",
  passed,
  counts: {
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).length,
    total: checks.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
