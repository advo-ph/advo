import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";
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
 * Static frame: vertical sides are the global rails; horizontal sides are
 * full-viewport-width hairlines drawn here. As the comet sweeps to this box's
 * vertical band, two things animate, driven by the comet's proximity:
 *  - a soft inset glow on all four inner edges (on top of the content), and
 *  - a bright light on each horizontal line that starts at both far ends,
 *    sweeps inward through the rail intersections, and converges/fades at the
 *    center.
 *
 * Pure opacity/transform on pointer-events-none layers; no layout impact. When
 * the spine is inactive (mobile / reduced motion / pre-mount) the context value
 * is null and everything stays dark.
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

  // Viewport width — drives how far the horizontal sweeps travel from the edges.
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const measure = () => setVw(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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
    "inset 22px 0 44px -24px hsl(var(--accent) / 0.4)",
    "inset -22px 0 44px -24px hsl(var(--accent) / 0.4)",
    "inset 0 22px 44px -24px hsl(var(--accent) / 0.4)",
    "inset 0 -22px 44px -24px hsl(var(--accent) / 0.4)",
  ].join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Content. */}
      <div className="relative z-10">{children}</div>

      {/* Static horizontal frame lines, extended to the full viewport width via
          a centered 100vw breakout. Verticals are the global rails. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />

      {/* Four-edge glow on TOP of the content. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{ opacity: glow, boxShadow }}
      />

      {/* Bright sweeps riding the horizontal lines (ends → center). */}
      <LineSweep glow={glow} vw={vw} edge="top" />
      <LineSweep glow={glow} vw={vw} edge="bottom" />
    </div>
  );
}

/**
 * Two bright streaks on one horizontal line. They begin at the far viewport
 * ends, travel inward (passing the rail intersections), and converge at the
 * center where they fade out — position and brightness both driven by the
 * comet-proximity value `glow` (0 = far → at the ends; 1 = centered → gone).
 */
function LineSweep({
  glow,
  vw,
  edge,
}: {
  glow: MotionValue<number>;
  vw: number;
  edge: "top" | "bottom";
}): ReactElement {
  const STREAK_W = 180;
  const travel = Math.max(0, vw / 2 - STREAK_W / 2);

  // glow 0 → at the far end; glow 1 → at the center (x = 0).
  const xLeft = useTransform(glow, (v) => -(1 - v) * travel);
  const xRight = useTransform(glow, (v) => (1 - v) * travel);
  // Appear from the ends, brightest mid-sweep, gone by the center.
  const opacity = useTransform(glow, (v) =>
    Math.sin(Math.max(0, Math.min(1, v)) * Math.PI) * 0.9,
  );

  const base: React.CSSProperties = {
    width: STREAK_W,
    height: 2,
    marginLeft: -STREAK_W / 2,
    background:
      "linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.95), transparent)",
    boxShadow:
      "0 0 10px 2px hsl(var(--accent) / 0.6), 0 0 20px 4px hsl(var(--accent) / 0.3)",
    ...(edge === "top" ? { top: -1 } : { bottom: -1 }),
  };

  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ ...base, x: xLeft, opacity }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ ...base, x: xRight, opacity }}
      />
    </>
  );
}

export default EdgeGlow;
