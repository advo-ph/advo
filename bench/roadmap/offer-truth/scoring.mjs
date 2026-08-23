#!/usr/bin/env node
/**
 * Offer truth — authored 2026-08-23, RED at authoring.
 *
 * Two founder instructions from the 2026-08-15 / 08-21 threads:
 *
 *   1. "remove the price boi we dont put the pricing on the website, its always
 *      get a quotation"                                    — Prince, 08-21 9:06pm
 *   2. "lets just keep only the section for the websites that we've already
 *      created, put emphasis on each project that weve made (large screenshot
 *      images, get them from the advo portfolio database) with short and
 *      concise and simple descs only"                      — Prince, 08-21 9:19pm
 *
 * (1) directly contradicts the committed `engagement-cta` check in
 * landing-stripe-audit/scoring.mjs, which asserts the landing DOES carry peso
 * figures. That check is now wrong; retiring it is part of this lane's work and
 * `stale-price-check-retired` below is what forces the resolution. Do not
 * satisfy this bench by deleting the sibling bench.
 *
 * LandingPage.tsx today is fully static — it never reads portfolio_project.
 * That is the gap (2) closes.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const files = {
  landingPage: read("apps/web/src/components/landing/LandingPage.tsx"),
  stripeBench: read("bench/roadmap/landing-stripe-audit/scoring.mjs"),
  indexHtml: read("apps/web/index.html"),
};

/** Every description string rendered by the work section, for the length cap. */
const workDesc = [...files.landingPage.matchAll(/desc:\s*"([^"]*)"/g)].map((m) => m[1]);

const checks = [
  {
    id: "no-public-price",
    title: "No price is published on the landing",
    passed:
      !/₱/.test(files.landingPage) &&
      !/starting at/i.test(files.landingPage) &&
      !/\/mo\b|\/hr\b/.test(files.landingPage),
    expected:
      "LandingPage.tsx carries no peso figure, no 'starting at', and no /mo or /hr rate. Pricing is a quotation conversation, not a page.",
  },
  {
    id: "quotation-cta",
    title: "The engagement surface asks for a quotation",
    passed:
      /quotation|request a quote|get a quote/i.test(files.landingPage) &&
      !/price:/.test(files.landingPage),
    expected:
      "The engagement entries route to a quotation request and no longer carry a `price:` field.",
  },
  {
    id: "stale-price-check-retired",
    title: "The contradicting peso assertion is retired, not deleted around",
    passed:
      files.stripeBench.length > 0 &&
      /engagement-cta/.test(files.stripeBench) &&
      !/"₱"/.test(files.stripeBench),
    expected:
      "landing-stripe-audit still runs an `engagement-cta` check, but it asserts quotation language instead of requiring '₱'. The sibling bench must survive — retiring the assertion is not deleting the check.",
  },
  {
    id: "work-from-portfolio",
    title: "Shipped work is read from the portfolio database",
    passed:
      /portfolio/i.test(files.landingPage) &&
      /useQuery|fetch\(|usePortfolio/.test(files.landingPage),
    expected:
      "The work section sources real shipped sites from portfolio_project rather than a hardcoded rail. LandingPage.tsx is static today.",
  },
  {
    id: "work-screenshot-not-stock",
    title: "Work cards show project screenshots, not stock imagery",
    passed:
      !/\/landing\/rw\/(create|plan|approve|after)\.jpg/.test(files.landingPage) &&
      /screenshot|screen_url|screenshotUrl/i.test(files.landingPage),
    expected:
      "Work cards render a large per-project screenshot. The generic /landing/rw/*.jpg workspace stock is gone from the work rail.",
  },
  {
    id: "tagline-is-the-mission-line",
    title: "The tagline is the founder's mission line",
    passed:
      /We digitalize it for you/i.test(files.landingPage) &&
      /We digitalize it for you/i.test(files.indexHtml),
    expected:
      'Prince asked twice (2026-08-19, 08-21) for the mission line "We digitalize it for you." as the tagline. Angelo settled the hardware objection on 2026-08-23 in favour of shipping it verbatim. It appears on the landing AND in the document title/OG, which currently say "Build together. Ship with clarity."',
  },
  {
    id: "vision-line-present",
    title: "The vision statement is on the page",
    passed:
      /infrastructure of the technological layer/i.test(files.landingPage) &&
      /modernize the Philippines/i.test(files.landingPage),
    expected:
      'The vision Prince supplied verbatim: "To become the infrastructure of the technological layer for industries around the Philippines. We will modernize the Philippines."',
  },
  {
    id: "stale-tagline-retired",
    title: "The old Stripe-era tagline is gone everywhere",
    passed:
      !/Build together/i.test(files.landingPage) &&
      !/Build together/i.test(files.indexHtml) &&
      !/Ship with clarity/i.test(files.indexHtml),
    expected:
      '"Build together. Ship with clarity." is removed from the hero, the <title>, and the OG tags. Note this deliberately reverses the shipped `title-meta` row in docs/ROADMAP.md P2, which dropped this line — record that in your close-out.',
  },
  {
    id: "work-desc-concise",
    title: "Project descriptions stay short",
    passed: workDesc.length > 0 && workDesc.every((d) => d.length <= 120),
    expected:
      "Every rendered project description is 120 characters or fewer — 'short and concise and simple descs only'.",
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "offer-truth",
  date: "2026-08-23",
  passed,
  counts: {
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    total: checks.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(passed ? 0 : 1);
