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
   * proximity fades the frame glow in and out.
   */
  radius?: number;
  className?: string;
  children?: ReactNode;
}

// How far (in px of comet↔line distance) the horizontal sweep runs.
const APPROACH = 350; // ends → rail intersection as the comet nears the line
const AFTER = 250; //    intersection → center as the comet passes the line

/**
 * EdgeGlow — a framed content box wired to the FramingSpine comet.
 *
 * Static frame: vertical sides are the global rails; horizontal sides are
 * full-viewport-width hairlines drawn here. As the comet sweeps to this box,
 * two things animate:
 *  - a soft inset glow on all four inner edges, and
 *  - a bright streak on each horizontal line that comes in from both far ends
 *    and reaches the rail intersections exactly as the vertical comet crosses
 *    that line — so they converge — then continues to the center and fades.
 *
 * Pure opacity/transform on pointer-events-none layers. Inactive (mobile /
 * reduced motion / pre-mount) → context null → everything stays dark.
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

  // Frame inset-glow intensity (comet proximity to the box center).
  const glow = useMotionValue(0);
  // Per-line sweep: distance of each streak from center (px) + its opacity.
  const posTop = useMotionValue(0);
  const opTop = useMotionValue(0);
  const posBottom = useMotionValue(0);
  const opBottom = useMotionValue(0);

  // Viewport width — the streaks start at ±vw/2 (the far ends).
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const measure = () => setVw(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useMotionValueEvent(cometY, "change", (cy) => {
    const el = ref.current;
    const clear = () => {
      glow.set(0);
      opTop.set(0);
      opBottom.set(0);
    };
    if (!el || cy < -9000) return clear();
    const r = el.getBoundingClientRect();
    if (r.height === 0) return clear();

    // Frame glow: proximity of the comet to the box center.
    const center = r.top + r.height / 2;
    const reach = r.height / 2 + radius;
    glow.set(Math.max(0, Math.min(1, 1 - Math.abs(cy - center) / reach)));

    // Horizontal sweep, per line. `pos` is distance from center: the far end
    // (vw/2) → the rail intersection (box half-width) → the center (0). It hits
    // the intersection at d = 0, i.e. exactly when the comet center is on the
    // line — converging with the vertical comet there.
    const end = vw / 2;
    const railHalf = r.width / 2;
    const sweep = (lineY: number, pos: MotionValue<number>, op: MotionValue<number>) => {
      const d = cy - lineY;
      if (d <= -APPROACH || d >= AFTER) {
        op.set(0);
        return;
      }
      if (d < 0) {
        const f = (d + APPROACH) / APPROACH; // 0 (far) → 1 (at line)
        pos.set(end + (railHalf - end) * f);
        op.set(f);
      } else {
        const f = d / AFTER; // 0 (at line) → 1 (gone at center)
        pos.set(railHalf * (1 - f));
        op.set(1 - f);
      }
    };
    sweep(r.top, posTop, opTop);
    sweep(r.bottom, posBottom, opBottom);
  });

  // Soft inset accent glow on all four inner edges — completes the framed box.
  const boxShadow = [
    "inset 22px 0 44px -24px hsl(var(--accent) / 0.2)",
    "inset -22px 0 44px -24px hsl(var(--accent) / 0.2)",
    "inset 0 22px 44px -24px hsl(var(--accent) / 0.2)",
    "inset 0 -22px 44px -24px hsl(var(--accent) / 0.2)",
  ].join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Content. */}
      <div className="relative z-10">{children}</div>

      {/* Static horizontal frame lines, full viewport width (centered 100vw
          breakout). Verticals are the global rails. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-px w-screen -translate-x-1/2 bg-border/60"
      />

      {/* Soft four-edge glow on top of the content. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{ opacity: glow, boxShadow }}
      />

      {/* Bright sweeps riding the horizontal lines. */}
      <LineSweep pos={posTop} op={opTop} edge="top" />
      <LineSweep pos={posBottom} op={opBottom} edge="bottom" />
    </div>
  );
}

/**
 * Two bright streaks on one horizontal line, mirrored about the center. Styling
 * matches the vertical comet: a solid near-white bar faded at its ends by a
 * gradient mask — no colored glow.
 */
function LineSweep({
  pos,
  op,
  edge,
}: {
  pos: MotionValue<number>;
  op: MotionValue<number>;
  edge: "top" | "bottom";
}): ReactElement {
  const xLeft = useTransform(pos, (v) => -v);

  const base: React.CSSProperties = {
    width: "var(--light-length)",
    height: 2,
    marginLeft: "calc(var(--light-length) / -2)",
    background: "hsl(var(--foreground) / 0.85)",
    WebkitMaskImage: "linear-gradient(90deg, transparent, #000, transparent)",
    maskImage: "linear-gradient(90deg, transparent, #000, transparent)",
    ...(edge === "top" ? { top: -1 } : { bottom: -1 }),
  };

  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ ...base, x: xLeft, opacity: op }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ ...base, x: pos, opacity: op }}
      />
    </>
  );
}

export default EdgeGlow;
