import type { Variants } from "framer-motion";

/**
 * Single source of truth for reveal/animation tokens across the landing page.
 * Lifted verbatim from Hero's previously-local EASE/fadeUp/stagger so Hero,
 * every section, and Footer share one easing and one variant set.
 *
 * Pure constants — no JSX, no side effects.
 */

/** One easing for the whole page (lifted from Hero). */
export const EASE = [0.32, 0.72, 0, 1] as const;

/** Base fade-up reveal variant. Final ("show") state is the static default. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

/**
 * Stagger orchestration parent. Children animate in sequence.
 * For whileInView groups, keep delayChildren at 0 — viewport entry already gates.
 */
export const staggerParent = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

/** whileInView viewport config: fire once when 20% visible, never replay. */
export const REVEAL_VIEWPORT = { once: true, amount: 0.2 } as const;

/** Reveal durations: standard cards vs. large section headlines. */
export const DURATION = { reveal: 0.5, headline: 0.6 } as const;

/**
 * Canonical stagger groupings (seconds between children).
 * Use these so spacing intent is consistent across sections.
 */
export const STAGGER = {
  /** Default between cards. */
  default: 0.08,
  /** ProcessSteps: Discovery -> Design -> Build -> Launch progression. */
  process: 0.12,
  /** FAQ rows / dense nested lists. */
  dense: 0.06,
  /** Footer columns: Brand, Company, Services, Contact. */
  footer: 0.08,
} as const;

// Usage:
//   import { fadeUp, staggerParent, EASE, REVEAL_VIEWPORT, DURATION } from "@/lib/motion";
