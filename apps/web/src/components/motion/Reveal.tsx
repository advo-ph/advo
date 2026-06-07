import {
  createElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  DURATION,
  EASE,
  REVEAL_VIEWPORT,
  fadeUp,
  staggerParent,
} from "@/lib/motion";

/**
 * Resolve a `motion`-wrapped element for an arbitrary tag.
 * The framer-motion `motion` proxy exposes every intrinsic tag as a key.
 *
 * For custom components we must memoize `motion(Component)`: the factory returns
 * a NEW component identity on each call, and React treats a changed element type
 * as a full unmount/remount (state loss, broken animations). The cache keeps one
 * stable wrapper per component so re-renders reuse the same type.
 */
type MotionTagMap = typeof motion;
const motionComponentCache = new WeakMap<React.ComponentType, ElementType>();
function motionTag(as: ElementType): ElementType {
  if (typeof as === "string" && as in motion) {
    return motion[as as keyof MotionTagMap] as ElementType;
  }
  const component = as as React.ComponentType;
  let wrapped = motionComponentCache.get(component);
  if (!wrapped) {
    wrapped = motion(component) as ElementType;
    motionComponentCache.set(component, wrapped);
  }
  return wrapped;
}

interface RevealProps {
  /** Rendered element/tag. Defaults to a div. */
  as?: ElementType;
  /** Extra delay (seconds) before this element reveals. Omit inside RevealGroup. */
  delay?: number;
  /** Vertical travel distance (px). Defaults to the shared fadeUp distance (16). */
  y?: number;
  /** Override viewport `once`. */
  once?: boolean;
  /** Override viewport `amount` (0..1 visibility threshold). */
  amount?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Reveal — the fade-up-on-view workhorse.
 *
 * Standalone: fades up when 20% scrolled into view (once).
 * Inside <RevealGroup>: inherits the parent's `hidden`/`show` orchestration via
 * variants, so omit `delay` and let the parent stagger.
 *
 * Reduced motion: renders a plain element at the FINAL (shown) state with no
 * IntersectionObserver subscription and no animation. Content is never stuck at
 * opacity 0.
 */
export function Reveal({
  as = "div",
  delay = 0,
  y,
  once,
  amount,
  className,
  children,
}: RevealProps): ReactElement {
  const reduced = useReducedMotion();
  const classes = cn("reveal-fallback", className);

  if (reduced) {
    return createElement(as, { className: classes }, children);
  }

  const Tag = motionTag(as);
  const variants =
    y === undefined
      ? fadeUp
      : {
          hidden: { opacity: 0, y },
          show: { opacity: 1, y: 0 },
        };

  return (
    <Tag
      className={classes}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{
        once: once ?? REVEAL_VIEWPORT.once,
        amount: amount ?? REVEAL_VIEWPORT.amount,
      }}
      transition={{ duration: DURATION.reveal, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

interface RevealGroupProps {
  /** Rendered element/tag. Defaults to a div. */
  as?: ElementType;
  /** Seconds between each child reveal. */
  stagger?: number;
  /** Extra delay before the first child. Keep 0 for whileInView groups. */
  delayChildren?: number;
  /** Override viewport `once`. */
  once?: boolean;
  /** Override viewport `amount` (0..1 visibility threshold). */
  amount?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * RevealGroup — stagger orchestration parent.
 *
 * Wraps <Reveal> children (which should NOT set their own `delay`) and reveals
 * them in sequence when the group scrolls into view.
 *
 * Reduced motion: renders a plain element with children at final state, no
 * orchestration, no IntersectionObserver subscription.
 */
export function RevealGroup({
  as = "div",
  stagger = 0.08,
  delayChildren = 0,
  once,
  amount,
  className,
  children,
}: RevealGroupProps): ReactElement {
  const reduced = useReducedMotion();

  if (reduced) {
    return createElement(as, { className }, children);
  }

  const Tag = motionTag(as);

  return (
    <Tag
      className={className}
      variants={staggerParent(stagger, delayChildren)}
      initial="hidden"
      whileInView="show"
      viewport={{
        once: once ?? REVEAL_VIEWPORT.once,
        amount: amount ?? REVEAL_VIEWPORT.amount,
      }}
    >
      {children}
    </Tag>
  );
}

// Usage:
//   <RevealGroup stagger={0.08}>
//     {items.map((i) => (
//       <Reveal key={i.id}>{i.label}</Reveal>
//     ))}
//   </RevealGroup>
