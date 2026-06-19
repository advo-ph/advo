#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("../../..", import.meta.url).pathname);

const read = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
};

const files = {
  serviceTiers: read("apps/web/src/components/landing/ServiceTiers.tsx"),
  portfolioCard: read("apps/web/src/components/landing/PortfolioCard.tsx"),
  portfolioGrid: read("apps/web/src/components/landing/PortfolioGrid.tsx"),
  floatingNav: read("apps/web/src/components/landing/FloatingNav.tsx"),
  whyDigital: read("apps/web/src/components/landing/WhyDigital.tsx"),
  techTicker: read("apps/web/src/components/landing/TechTicker.tsx"),
  contactCta: read("apps/web/src/components/landing/ContactCTA.tsx"),
  processSteps: read("apps/web/src/components/landing/ProcessSteps.tsx"),
  faq: read("apps/web/src/components/landing/FAQ.tsx"),
  footer: read("apps/web/src/components/landing/Footer.tsx"),
  infrastructure: read("apps/web/src/components/landing/InfrastructureDiagram.tsx"),
  hero: read("apps/web/src/components/landing/Hero.tsx"),
  indexCss: read("apps/web/src/index.css"),
  readme: read("README.md"),
};

const allLandingSource = Object.values(files).join("\n");

const hasAll = (source, terms) =>
  terms.every((term) => new RegExp(term, "i").test(source));

const checks = [
  {
    id: "product-surfaces",
    title: "Services are ADVO product surfaces",
    passed:
      /PRODUCT_SURFACES/.test(files.serviceTiers) ||
      hasAll(files.serviceTiers, ["Website", "Client Hub", "Admin", "Care Plan"]),
    expected:
      "Service section exposes Website, Client Hub, Admin, and Care Plan surfaces instead of generic agency services.",
  },
  {
    id: "hero-product-system-offer",
    title: "Hero sells the website plus system offer",
    passed:
      /HERO_LAYERS/.test(files.hero) &&
      hasAll(files.hero, [
        "Websites with the system behind them",
        "Client Hub",
        "Admin",
        "Self-hosted stack",
      ]) &&
      !/We digitalize for you/.test(files.hero),
    expected:
      "Hero headline and first-viewport rail position ADVO as a website plus client/admin/private-stack builder, not a generic agency intro.",
  },
  {
    id: "proof-metrics",
    title: "Portfolio carries case-study proof",
    passed:
      /(metric|outcome|before|after|products used|launch timeline|caseStudy)/i.test(
        `${files.portfolioCard}\n${files.portfolioGrid}`,
      ) &&
      hasAll(files.portfolioCard, [
        'data-viewport-check="proof-system-map"',
        "Client hub",
        "Admin console",
        "VPS handoff",
      ]),
    expected:
      "Portfolio/case-study components expose outcomes, before/after, products used, launch timeline data, and a non-empty system proof map.",
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
    id: "floating-nav-document-scroll",
    title: "Floating nav tracks document scroll",
    passed:
      /window\.scrollY\s*>\s*80/.test(files.floatingNav) &&
      !/getElementById\("root"\)[\s\S]{0,180}scrollTop/.test(files.floatingNav),
    expected:
      "Floating nav compact state follows normal document scroll after restoring browser-native page scrolling.",
  },
  {
    id: "reduced-motion",
    title: "Landing animations respect reduced motion",
    passed: /(useReducedMotion|prefers-reduced-motion|motion-reduce|motion-safe)/.test(
      allLandingSource,
    ),
    expected:
      "Landing animation code has a reduced-motion path before more scroll/motion effects are shipped.",
  },
  {
    id: "docs-current-design",
    title: "README describes current design system",
    passed:
      !/(Isometric 3D scene|organic orange blob|#E67A3A|zero scroll animations|React Three Fiber)/i.test(
        files.readme,
      ) &&
      /(advo-section-rails|editorial grid|Linear|rail)/i.test(files.readme),
    expected:
      "README no longer documents stale 3D/orange design work and describes the current rail/grid direction.",
  },
  {
    id: "private-stack-product-narrative",
    title: "Private stack is a gridded product narrative",
    passed:
      /PRODUCT_LAYERS/.test(files.infrastructure) &&
      hasAll(files.infrastructure, [
        "Private deployment map",
        "Website",
        "Client Hub",
        "Admin",
        "Singapore VPS",
      ]),
    expected:
      "Self-hosted section presents public site, client hub, admin, and deployment proof as a gridded system view.",
  },
  {
    id: "why-system-not-generic-digital",
    title: "Why section explains the system behind the site",
    passed:
      hasAll(files.whyDigital, [
        "System Logic",
        "A website is only the front door",
        "Public offer",
        "Client workspace",
        "Team controls",
        "Private stack",
      ]) &&
      !/Invest in Your Digital Future|24\/7 Online Presence|Scale Effortlessly|Better Customer Experience/.test(
        files.whyDigital,
      ),
    expected:
      "The first post-hero section explains ADVO's connected website, client hub, admin, and private-stack offer instead of generic digital-transformation benefits.",
  },
  {
    id: "raw-private-stack-strip",
    title: "Stack strip is raw and self-hosted",
    passed:
      hasAll(files.techTicker, [
        "React / Vite",
        "Hono / Node",
        "Postgres / Drizzle",
        "TLS / JWT",
        "VPS / Nginx",
      ]) && !/simpleicons|Vercel|animate-marquee|cdn\.simpleicons/.test(files.techTicker),
    expected:
      "The technology strip uses a quiet gridded stack map and does not depend on colorful external logo marquees.",
  },
  {
    id: "build-room-cta",
    title: "Contact CTA is a build-room conversion surface",
    passed:
      /BOARD_ROWS/.test(files.contactCta) &&
      hasAll(files.contactCta, ["Build room", "24h", "14d", "Preview link"]) &&
      !/Ready to digitalize|Prepare your business for the future/.test(files.contactCta),
    expected:
      "Final CTA shows a concrete build room with response timing, preview target, task board, and handoff artifacts.",
  },
  {
    id: "process-system-sequence",
    title: "Process section is a product-system sequence",
    passed:
      hasAll(files.processSteps, [
        "Build Path",
        "Build sequence",
        "Map the offer",
        "Design the system",
        "Wire the stack",
        "Ship and operate",
      ]) &&
      !/How We Work|Understanding your needs, goals, and vision/.test(files.processSteps),
    expected:
      "Process defaults describe ADVO's website, client hub, admin, and stack delivery sequence instead of generic agency phases.",
  },
  {
    id: "tasteful-interaction-layer",
    title: "Stable sections share restrained interaction treatment",
    passed:
      /interactive-surface/.test(files.indexCss) &&
      /prefers-reduced-motion: reduce[\s\S]*interactive-surface/.test(files.indexCss) &&
      /(interactive-surface[\s\S]*HERO_LAYERS|HERO_LAYERS[\s\S]*interactive-surface)/.test(files.hero) &&
      /interactive-surface/.test(files.serviceTiers) &&
      /interactive-surface/.test(files.portfolioCard) &&
      /interactive-surface/.test(files.infrastructure) &&
      /interactive-surface/.test(files.contactCta),
    expected:
      "Hero, product, proof, private-stack, and build-room surfaces share a restrained hover treatment that is disabled under reduced motion.",
  },
  {
    id: "footer-system-continuity",
    title: "Footer continues the product-system story",
    passed:
      hasAll(files.footer, [
        "Start the system",
        "Websites with client systems behind them",
        "Client Hub",
        "Admin Console",
        "VPS handoff",
        'data-viewport-check="footer-wordmark"',
      ]) &&
      !/We digitalize for you|Web Applications|Mobile Apps|Cloud Architecture/.test(files.footer),
    expected:
      "Footer uses the product-system language, includes the project CTA and large wordmark, and avoids generic service/footer copy.",
  },
  {
    id: "faq-product-system",
    title: "FAQ answers product-system questions",
    passed:
      hasAll(files.faq, [
        "Questions before we build",
        "client hub",
        "admin console",
        "self-hosted VPS stack",
      ]) &&
      !/Common Questions|web applications, mobile solutions|flexible pricing|modern cloud platforms/.test(files.faq),
    expected:
      "FAQ defaults answer concrete website, hub, admin, hosting, and timeline questions instead of generic agency questions.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "landing-stripe-audit",
  date: "2026-06-16",
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
