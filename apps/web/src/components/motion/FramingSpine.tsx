import { useEffect, useRef, useState, type ReactElement } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRootScrollProgress } from "@/lib/useRootScroll";

interface FramingSpineProps {
  /** Which gutter the rail hugs. Defaults to the left rail. */
  side?: "left" | "right";
  className?: string;
}

/**
 * FramingSpine — the global vertical blueprint rail + travelling comet.
 *
 * Mounted ONCE in the page shell (Index.tsx). Fixed, pointer-events-none,
 * desktop-only (`hidden lg:block`). Reads the canonical #root scroll progress
 * and drives a single translateY on the comet — scroll-bound, no duration.
 *
 * Reduced motion: renders ONLY the dim static rail plus a single static marker
 * near the top (~12%). It does NOT subscribe to scroll progress (no useTransform
 * binding, no useSpring churn) — the most vestibular-triggering element is fully
 * suppressed while the rail survives as quiet structural decoration.
 */
export default function FramingSpine({
  side = "left",
  className,
}: FramingSpineProps): ReactElement {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackHeight, setTrackHeight] = useState(0);

  // Resolve the #root scroll container once after mount. The Comet (which binds
  // useScroll) only mounts once this is non-null, so framer-motion attaches to a
  // live element on its first render — see useRootScroll.ts for the race detail.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(document.getElementById("root"));
  }, []);

  // Comet length sourced from --light-length (~5rem ≈ 80px). Measured from a
  // probe so it stays in sync with the CSS var without hardcoding px.
  const [lightPx, setLightPx] = useState(80);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = () => {
      setTrackHeight(el.clientHeight);
      const remPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      );
      const raw = getComputedStyle(el)
        .getPropertyValue("--light-length")
        .trim();
      const parsed = raw.endsWith("rem")
        ? parseFloat(raw) * remPx
        : parseFloat(raw);
      if (!Number.isNaN(parsed) && parsed > 0) setLightPx(parsed);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const containerStyle =
    side === "left"
      ? { left: "max(var(--spine-gutter), calc(50% - var(--spine-col) / 2))" }
      : { right: "max(var(--spine-gutter), calc(50% - var(--spine-col) / 2))" };

  return (
    <div
      ref={trackRef}
      aria-hidden
      className={cn(
        "hidden lg:block fixed inset-y-0 z-30 pointer-events-none",
        className,
      )}
      style={containerStyle}
    >
      {/* Dim static rail */}
      <div
        className="absolute inset-y-0 bg-border/60"
        style={{ width: "var(--spine-width)" }}
      />

      {reduced || !root ? (
        <StaticMarker />
      ) : (
        <Comet root={root} trackHeight={trackHeight} lightPx={lightPx} />
      )}
    </div>
  );
}

/**
 * Static reduced-motion marker: a quiet accent/white dot near the top (~12%).
 * No scroll subscription.
 */
function StaticMarker(): ReactElement {
  return (
    <div
      className="absolute -left-px w-0.5 rounded-full"
      style={{
        top: "12%",
        height: "10px",
        background: "hsl(var(--foreground) / 0.85)",
        boxShadow:
          "0 0 8px 1px hsl(var(--accent) / 0.5), 0 0 16px 3px hsl(var(--accent) / 0.2)",
      }}
    />
  );
}

/**
 * The travelling comet. Owns the scroll subscription so it only binds
 * useTransform/useSpring when actually rendered (never under reduced motion,
 * since the reduced branch renders <StaticMarker /> instead). The light spring
 * adds momentum smoothing.
 */
function Comet({
  root,
  trackHeight,
  lightPx,
}: {
  root: HTMLElement;
  trackHeight: number;
  lightPx: number;
}): ReactElement {
  const scroll = useRootScrollProgress(root);
  const range = Math.max(0, trackHeight - lightPx);
  const rawY = useTransform(scroll, [0, 1], [0, range]);
  const y = useSpring(rawY, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <motion.div
      className="spine-light absolute -left-px w-0.5"
      style={{
        y,
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
