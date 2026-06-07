import {
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSpineGlowY } from "@/components/motion/FramingSpine";

type Side = "left" | "right";

interface EdgeGlowProps {
  /** Which inner edges glow as the spine comet passes. Defaults to both. */
  sides?: Side[];
  /**
   * Vertical reach (px) above/below the element over which the comet's
   * proximity fades the glow in and out. Larger = softer, longer-lived glow.
   */
  radius?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * EdgeGlow — inner-edge glow synced to the FramingSpine comet.
 *
 * Wraps an element whose left/right edges sit on the spine rails (e.g. a
 * `max-w-6xl` content column). As the comet sweeps to this element's vertical
 * band, an inset glow fades in on the rail-facing edge(s), making the component
 * appear lit from the line. Pure opacity animation on a pointer-events-none
 * overlay — no layout impact.
 *
 * When the spine is inactive (mobile / reduced motion / pre-mount) the context
 * value is null, the glow stays at 0, and this renders as a plain wrapper.
 */
export function EdgeGlow({
  sides = ["left", "right"],
  radius = 220,
  className,
  children,
}: EdgeGlowProps): ReactElement {
  const ctxY = useSpineGlowY();
  // Stable fallback so the hooks below always have a MotionValue to read.
  const fallback = useMotionValue(-9999);
  const cometY = ctxY ?? fallback;

  const ref = useRef<HTMLDivElement>(null);
  const glow = useMotionValue(0);

  useMotionValueEvent(cometY, "change", (cy) => {
    const el = ref.current;
    if (!el || cy < -9000) {
      glow.set(0);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.height === 0) {
      glow.set(0);
      return;
    }
    const center = r.top + r.height / 2;
    const reach = r.height / 2 + radius;
    const intensity = Math.max(0, Math.min(1, 1 - Math.abs(cy - center) / reach));
    glow.set(intensity);
  });

  const boxShadow = sides
    .map((s) =>
      s === "left"
        ? "inset 22px 0 44px -24px hsl(var(--accent) / 0.95)"
        : "inset -22px 0 44px -24px hsl(var(--accent) / 0.95)",
    )
    .join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
        style={{ opacity: glow, boxShadow }}
      />
    </div>
  );
}

export default EdgeGlow;
