#!/usr/bin/env node
/**
 * Landing visual system — authored 2026-08-23, RED at authoring.
 *
 * Prince, 2026-08-15 and again 08-21: "can u make it like runway.com ui" and
 * "onto the new design also if u were able to get runway ui".
 *
 * A reference site is not acceptance criteria — but this repo has already solved
 * that once. bench/roadmap/landing-stripe-audit turned a Stripe audit into
 * fifteen source checks and it worked. The move is to translate the reference
 * into PROPERTIES it has, then assert those, rather than scoring resemblance.
 * What the runway reference does and this landing does not: one ground, a
 * single restrained type scale, generous vertical rhythm, media doing the
 * talking, near-zero decorative chrome.
 *
 * Deliberately NOT graded: colour distance to their palette, screenshot diffing
 * against their site, or anything satisfiable by copying their CSS. Prince asked
 * for the feel — cloning a competitor's stylesheet is a different and worse
 * thing, and `no-cloned-stylesheet` below fails it.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const css = read("apps/web/src/components/landing/landing-page.css");
const page = read("apps/web/src/components/landing/LandingPage.tsx");
const footer = read("apps/web/src/components/landing/landing-footer.tsx");

/** Distinct font-size declarations — a proxy for type-scale discipline. */
const distinctFontSize = new Set(
  [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim()),
).size;

/** Distinct hard-coded colours in the landing stylesheet. */
const hexColour = new Set(
  [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()),
);

const keyframeCount = (css.match(/@keyframes/g) ?? []).length;
const reducedMotionCount = (css.match(/prefers-reduced-motion/g) ?? []).length;

// ─── Design brief (added 2026-09-02) ───────────────────
//
// The brief that followed the visual pass: no glass, no drop shadow, one-weight line
// icons, at most one gradient. Each is a property the current code already has; the
// checks exist so the next pass cannot quietly bring frosted panels and 1.5px icons back.

/** Every box-shadow value. `none` REMOVES a shadow (the mobile nav reset) and is not one. */
const boxShadowValue = [...css.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1].trim());
const nonInsetShadow = boxShadowValue.filter((value) => value !== "none" && !value.startsWith("inset"));

const backdropFilterCount = (css.match(/backdrop-filter/g) ?? []).length;
const linearGradientCount = (css.match(/linear-gradient\(/g) ?? []).length;

/**
 * Every icon element carrying a `size=` prop across the landing surface. Lucide takes
 * `strokeWidth={1}`; the Tabler brand marks in the footer take `stroke={1}` (their name
 * for the same prop). Either is the one-weight line the brief asks for.
 */
const iconSurface = [
  page,
  footer,
  read("apps/web/src/components/landing/landing-shell.tsx"),
  read("apps/web/src/components/LandingNav.tsx"),
  read("apps/web/src/pages/CaseStudy.tsx"),
];
const iconElement = iconSurface.flatMap((source) => [...source.matchAll(/<[A-Z][A-Za-z]*\b[^>]*\bsize=[^>]*\/?>/g)].map((m) => m[0]));
const offWeightIcon = iconElement.filter((element) => !/\b(strokeWidth|stroke)=\{1\}/.test(element));

const checks = [
  {
    id: "type-scale-bounded",
    title: "The landing uses a bounded type scale",
    passed: distinctFontSize > 0 && distinctFontSize <= 10,
    expected: `A restrained scale is the most legible property of the reference. Found ${distinctFontSize} distinct font-size values; the ceiling is 10. Consolidate onto steps, not one-off sizes.`,
  },
  {
    id: "colour-is-tokenised",
    title: "Colour comes from tokens, not scattered hex literals",
    passed: hexColour.size <= 12,
    expected: `Found ${hexColour.size} distinct hex literals in landing-page.css. One ground plus a token palette is what makes the reference read as a single system; the ceiling is 12.`,
  },
  {
    id: "section-rhythm-is-a-token",
    title: "Vertical rhythm is one shared spacing token",
    passed: /--[a-z-]*(section|rhythm)[a-z-]*:/i.test(css),
    expected:
      "Section padding derives from a named custom property rather than per-section magic numbers. Generous, consistent vertical space is most of the effect being asked for.",
  },
  {
    id: "media-led-sections",
    title: "The page leads with media, not with chrome",
    passed:
      (page.match(/<img/g) ?? []).length >= 4 &&
      (page.match(/landing-kicker/g) ?? []).length <= 3,
    expected:
      "The reference shows work and says little. Keep the imagery; cut the eyebrow/kicker labels to at most three across the whole page.",
  },
  {
    id: "no-decorative-gradient",
    title: "No decorative gradient is carrying the design",
    passed: (css.match(/linear-gradient|radial-gradient/g) ?? []).length <= 3,
    expected:
      "The root ROADMAP already rejected decorative gradients as the main source of wow without real product evidence. That rejection stands; this enforces it.",
  },
  {
    id: "motion-stays-guarded",
    title: "Every animation respects reduced-motion",
    passed: reducedMotionCount > 0 && keyframeCount <= reducedMotionCount * 6,
    expected:
      "A visual pass is where unguarded animation creeps in. The reduced-motion policy is shipped and green in bench:landing and must survive.",
  },
  {
    id: "viewport-gate-survives",
    title: "The existing viewport contract is untouched",
    passed: /data-viewport-check/.test(page) || /data-viewport-check/.test(footer),
    expected:
      "The viewport harness keys off data-viewport-check hooks at 360/390/768/1280/1440. A redesign that removes them silently disables the overflow gate.",
  },
  {
    id: "no-cloned-stylesheet",
    title: "No runway asset, class name, or stylesheet was copied in",
    passed: css.length > 0 && !/runway/i.test(css) && !/runway/i.test(page),
    expected:
      "Take the properties, not the CSS. A copied stylesheet or asset from a named company is a legal and taste problem, and it is not what was asked for.",
  },
  {
    id: "no-glass",
    title: "No frosted-glass surface",
    passed: css.length > 0 && backdropFilterCount === 0,
    expected: `backdrop-filter appears ${backdropFilterCount} time(s) in landing-page.css. The brief is one flat ground; a blurred panel is chrome pretending to be depth.`,
  },
  {
    id: "no-shadow",
    title: "Every box-shadow is an inset hairline",
    passed: css.length > 0 && nonInsetShadow.length === 0,
    expected: `Found ${nonInsetShadow.length} non-inset box-shadow value(s): ${nonInsetShadow.join(" | ") || "none"}. Hairlines draw an edge; a drop shadow fakes elevation the page does not have.`,
  },
  {
    id: "icons-stroke-one",
    title: "Every sized icon is drawn at one-unit stroke",
    passed: iconElement.length > 0 && offWeightIcon.length === 0,
    expected: `${iconElement.length} icon element(s) with size=; ${offWeightIcon.length} without strokeWidth={1} / stroke={1}: ${offWeightIcon.join(" | ") || "none"}. One line weight across the whole surface is what makes the icon set read as a set.`,
  },
  {
    id: "one-gradient",
    title: "At most one linear-gradient literal",
    passed: linearGradientCount <= 1,
    expected: `Found ${linearGradientCount} linear-gradient literal(s) in landing-page.css; the ceiling is 1 (the edge-fade mask on the logo strip).`,
  },
];

const passed = checks.every((check) => check.passed);
const result = {
  benchmark: "landing-visual",
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
