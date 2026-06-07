import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useRootScrollProgress } from "@/lib/useRootScroll";

/**
 * Horizontal offset of each rail from the viewport edge — the edges of a
 * centered `max-w-6xl` (= --spine-col) content column, clamped to the gutter on
 * narrow desktop widths. Both rails and both comets share this so they stay
 * pinned to the content column edges.
 */
const RAIL_OFFSET =
  "max(var(--spine-gutter), calc(50% - var(--spine-col) / 2))";

/**
 * Comet center, in viewport (fixed) pixels from the top. Consumed by <EdgeGlow>
 * so edge-touching components can glow inward as the light sweeps past them.
 * `null` when the spine is inactive (mobile, reduced motion, or pre-mount) — in
 * which case no edge glow runs.
 */
const SpineGlowContext = createContext<MotionValue<number> | null>(null);

export function useSpineGlowY(): MotionValue<number> | null {
  return useContext(SpineGlowContext);
}

interface FramingSpineProps {
  className?: string;
  children?: ReactNode;
}

/**
 * FramingSpine — the global vertical blueprint rails + travelling comets.
 *
 * Wraps the page once (in Index.tsx). Renders a fixed, pointer-events-none,
 * desktop-only overlay with a dim rail on BOTH the left and right edges of the
 * content column and a comet of light riding each rail, scroll-bound (no
 * duration). It also publishes the comet's screen Y via context so <EdgeGlow>
 * consumers can light up their rail-facing edge as the comet passes.
 *
 * Reduced motion / mobile: renders only the dim static rails plus a static
 * marker near the top — no scroll subscription, and the glow context is null so
 * no edge glow animates.
 */
export default function FramingSpine({
  className,
  children,
}: FramingSpineProps): ReactElement {
  const reduced = useReducedMotion();

  // Comet center screen-Y, shared with <EdgeGlow> consumers. Seeded off-screen
  // so nothing glows until the comet is live and has reported a position.
  const cometY = useMotionValue(-9999);

  // Resolve the #root scroll container once after mount. Comets (which bind
  // useScroll) only mount once this is non-null — see useRootScroll.ts.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(document.getElementById("root"));
  }, []);

  // Desktop gate: the rails are `hidden lg:block`, so only run the scroll/glow
  // machinery at lg+ to avoid invisible edge glows on mobile.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Viewport height (= rail track height) and comet length, measured from the
  // --light-length CSS var so px math stays in sync with the token.
  const [vh, setVh] = useState(0);
  const [lightPx, setLightPx] = useState(80);
  useEffect(() => {
    const measure = () => {
      setVh(window.innerHeight);
      const remPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      );
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--light-length")
        .trim();
      const parsed = raw.endsWith("rem")
        ? parseFloat(raw) * remPx
        : parseFloat(raw);
      if (!Number.isNaN(parsed) && parsed > 0) setLightPx(parsed);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const active = !!root && !reduced && isDesktop;

  return (
    <SpineGlowContext.Provider value={active ? cometY : null}>
      <div
        aria-hidden
        className={cn(
          "hidden lg:block pointer-events-none fixed inset-0 z-30",
          className,
        )}
      >
        {/* Dim static rails */}
        <div
          className="absolute inset-y-0 bg-border/60"
          style={{ left: RAIL_OFFSET, width: "var(--spine-width)" }}
        />
        <div
          className="absolute inset-y-0 bg-border/60"
          style={{ right: RAIL_OFFSET, width: "var(--spine-width)" }}
        />

        {active ? (
          <SpineComets
            root={root}
            vh={vh}
            lightPx={lightPx}
            cometY={cometY}
          />
        ) : (
          <>
            <StaticMarker side="left" />
            <StaticMarker side="right" />
          </>
        )}
      </div>

      {children}
    </SpineGlowContext.Provider>
  );
}

/**
 * Owns the scroll subscription (so the hook only runs when the spine is active)
 * and drives both comets from one spring-smoothed value. Mirrors the comet
 * center into `cometY` for <EdgeGlow> consumers.
 */
function SpineComets({
  root,
  vh,
  lightPx,
  cometY,
}: {
  root: HTMLElement;
  vh: number;
  lightPx: number;
  cometY: MotionValue<number>;
}): ReactElement {
  const progress = useRootScrollProgress(root);
  const range = Math.max(0, vh - lightPx);
  const rawTop = useTransform(progress, [0, 1], [0, range]);
  const top = useSpring(rawTop, { stiffness: 120, damping: 30, mass: 0.4 });

  // Mirror the comet center (top + half its length) into the shared glow value.
  useMotionValueEvent(top, "change", (v) => cometY.set(v + lightPx / 2));
  useEffect(() => {
    cometY.set(top.get() + lightPx / 2);
  }, [cometY, top, lightPx]);

  return (
    <>
      <CometVisual top={top} side="left" />
      <CometVisual top={top} side="right" />
    </>
  );
}

/** A single travelling comet, pinned to one rail's x and driven by `top`. */
function CometVisual({
  top,
  side,
}: {
  top: MotionValue<number>;
  side: "left" | "right";
}): ReactElement {
  return (
    <motion.div
      className="spine-light absolute w-0.5"
      style={{
        top: 0,
        y: top,
        [side]: `calc(${RAIL_OFFSET} - 0.5px)`,
        height: "var(--light-length)",
        background: "hsl(var(--foreground) / 0.85)",
        boxShadow:
          "0 0 12px 2px hsl(var(--accent) / 0.55), 0 0 28px 6px hsl(var(--accent) / 0.25)",
        WebkitMaskImage: "linear-gradient(transparent, #000, transparent)",
        maskImage: "linear-gradient(transparent, #000, transparent)",
      }}
    />
  );
}

/**
 * Static reduced-motion / mobile marker: a quiet accent dot near the top (~12%)
 * on the given rail. No scroll subscription.
 */
function StaticMarker({ side }: { side: "left" | "right" }): ReactElement {
  return (
    <div
      className="absolute w-0.5 rounded-full"
      style={{
        [side]: `calc(${RAIL_OFFSET} - 0.5px)`,
        top: "12%",
        height: "10px",
        background: "hsl(var(--foreground) / 0.85)",
        boxShadow:
          "0 0 8px 1px hsl(var(--accent) / 0.5), 0 0 16px 3px hsl(var(--accent) / 0.2)",
      }}
    />
  );
}
