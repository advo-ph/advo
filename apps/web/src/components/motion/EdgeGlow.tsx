import {
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSpineGlowY } from "@/components/motion/FramingSpine";

interface EdgeGlowProps {
  /**
   * Vertical reach (px) above/below the element over which the comet's
   * proximity fades the glow in and out. Larger = softer, longer-lived glow.
   */
  radius?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * EdgeGlow — a framed content box that lights up as the FramingSpine comet
 * passes.
 *
 * Wraps a content column whose left/right edges sit on the spine rails. It
 * draws static top + bottom hairlines (matching the rail color) so the box is
 * fully framed — the vertical sides are the global rails, the horizontal sides
 * are these lines. As the comet sweeps to this box's vertical band, an inset
 * glow fades in on ALL FOUR inner edges, so the whole frame appears lit.
 *
 * Pure opacity animation on pointer-events-none layers; no layout impact. When
 * the spine is inactive (mobile / reduced motion / pre-mount) the context value
 * is null, the glow stays at 0, and only the static frame lines remain.
 */
export function EdgeGlow({
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

  // Inset accent glow on all four inner edges — completes the framed box.
  const boxShadow = [
    "inset 22px 0 44px -24px hsl(var(--accent) / 0.95)",
    "inset -22px 0 44px -24px hsl(var(--accent) / 0.95)",
    "inset 0 22px 44px -24px hsl(var(--accent) / 0.95)",
    "inset 0 -22px 44px -24px hsl(var(--accent) / 0.95)",
  ].join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Content. */}
      <div className="relative z-10">{children}</div>

      {/* Static horizontal frame lines, extended to the full viewport width via
          a centered 100vw breakout (the content column is centered, so this
          spans edge to edge). Verticals are the global rails. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />

      {/* Four-edge glow on TOP of the content, so cards near the frame light up
          from their inner edge as the comet sweeps past. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{ opacity: glow, boxShadow }}
      />
    </div>
  );
}

export default EdgeGlow;
