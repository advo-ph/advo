import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The ADVO wordmark as an interactive dot matrix.
 *
 * The tagline under it is NOT drawn here. It was, briefly, and Prince killed
 * it on sight: at the size the measure forces, a light face sampled on this
 * grid comes out as dashes. It is HTML text in landing-footer.tsx now, which
 * is also the only version a screen reader was ever going to get.
 *
 * Prince, 09-02: "analyze the website https://op.al, u need to get it exactly
 * as it is". So the mechanism below is op.al's, read off their bundle rather
 * than guessed at: a mask sampled on a grid, a velocity-scaled Gaussian around
 * a smoothed pointer, a linear decay that leaves a comet trail, and a four-tier
 * ramp whose third tier is the hollow ring you see around the cursor.
 *
 * Two deliberate departures, both quality rather than taste:
 *
 * 1. op.al draws the ramp as text — `fillText` of `·◦•●` in Helvetica. Those
 *    glyphs are not dependable outside Apple platforms; on Android the hollow
 *    ring can fall back to a different face or vanish. We draw the same four
 *    tiers with `arc()` at the radii measured from their 7px renders, so the
 *    ring is the ring everywhere.
 * 2. Pointer events instead of mouse events (tablets get the effect), and the
 *    falling shapes stop under prefers-reduced-motion. op.al does neither.
 *
 * Ground is white here, not black, so the ink is a light grey — same single
 * fillStyle for every tier, exactly as op.al does it. A near-black was tried
 * and rejected: "i want the gray color before". The brightness ramp you
 * perceive is ink coverage, never colour.
 */

/** op.al ships #969696 for its light theme. One fillStyle for all four tiers. */
const DOT_COLOR = "#8f8f8f";

/**
 * cell ≈ 0.0030 × canvas width, floored at 3. Roughly half the pitch of the
 * 8px-at-1920 grid this replaced, which is where "more dots" comes from.
 */
const CELL_SCALE = 0.003;
const CELL_MIN = 3;

/** Glyph em size the tier radii are relative to. */
const GLYPH_MIN = 5;
const GLYPH_RATIO = 1.25;

/** Influence bleeds off linearly at 1/3.2 per second — this is the trail, not a lerp. */
const DECAY_PER_SECOND = 1 / 3.2;

/** Pointer position is an exponential follow, tau = 1/7 s. */
const POINTER_TAU = 7;
/** Pointer velocity is an EMA over move events, then decays at tau = 1/3 s when idle. */
const VELOCITY_ALPHA = 0.18;
const VELOCITY_TAU = 3;
const IDLE_AFTER_SECONDS = 0.04;

/** sigma = clamp(3 + 0.012 x speed, 3, 10) x cell. Cutoff at 3 sigma. */
const SIGMA_BASE = 3;
const SIGMA_PER_SPEED = 0.012;
const SIGMA_MAX = 10;

/** Tier thresholds on the 0..1 influence. 0.12-0.35 is the hollow ring. */
const TIER_SOLID = 0.7;
const TIER_BULLET = 0.35;
const TIER_RING = 0.12;

/** Radii as a fraction of the glyph em, measured off op.al's Helvetica renders. */
/**
 * op.al's `·` measures 0.06em. That is tuned for a light mark on black, where
 * a sub-pixel speck still glows; the same speck on white is invisible, and the
 * wordmark has to be legible before anyone moves a cursor over it.
 */
const R_SPECK = 0.14;
/**
 * A touch device never gets a cursor, so the wordmark sits at the speck tier
 * forever — and a hairline on white is a smudge, not a logo. Coarse pointers
 * get a speck you can actually read.
 */
const R_SPECK_COARSE = 0.18;
const R_BULLET = 0.22;
const R_RING = 0.32;
const R_RING_STROKE = 0.09;
const R_SOLID = 0.34;

/** A shape falls through the grid every 4s and forces the cells it covers to 1. */
const SHAPE_INTERVAL_SECONDS = 4;
const SHAPE_BASE_CELLS = 25;

// ---------------------------------------------------------------- wordmark

/** Side gutter, as a fraction of the canvas width. The wordmark takes the rest. */
const MARGIN_RATIO = 0.035;
/** Air kept above and below the wordmark, as a fraction of the canvas height. */
const BREATHE_RATIO = 0.08;

/**
 * Dilation applied to the wordmark before sampling, as a fraction of its drawn
 * height. Prince, 09-03, against the reference lockup: "less thicker". The
 * artwork's own weight is the target, so nothing is added — the extra dots come
 * from the finer grid above, not from fattened strokes. Left as a dial because
 * a coarser grid would need it back.
 */
const BOLD_RATIO = 0;
const DILATE_RING = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [-0.7, -0.7],
] as const;

type ShapeKind = "square" | "rect" | "circle" | "ovoid";
const SHAPE_KIND: ShapeKind[] = ["square", "rect", "circle", "ovoid"];

interface Shape {
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  angle: number;
  rotSpeed: number;
}

interface AdvoDotFieldProps {
  /** Mask source. Black artwork on transparency; anything dark becomes a dot. */
  src?: string;
  className?: string;
}

const TAU = Math.PI * 2;

const AdvoDotField = ({ src = "/advo-logo-black.png", className }: AdvoDotFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---------------------------------------------------------------- state

    /** Cell coordinates of every dot inside the letterforms. Nothing outside is stored. */
    let pointX = new Float32Array(0);
    let pointY = new Float32Array(0);
    let influence = new Float32Array(0);
    let tier = new Uint8Array(0);
    let cell = CELL_MIN;
    let glyph = GLYPH_MIN;
    let width = 0;
    let height = 0;

    const pointer = { x: 0, y: 0, active: false };
    const smooth = { x: 0, y: 0, init: false };
    const velocity = { x: 0, y: 0 };
    let lastMoveAt = 0;

    let shape: Shape[] = [];
    let lastSpawnAt = -SHAPE_INTERVAL_SECONDS;
    let elapsed = 0;

    let frame = 0;
    let previous: number | null = null;
    let maskReady = false;

    const speckRatio = window.matchMedia?.("(pointer: coarse)").matches
      ? R_SPECK_COARSE
      : R_SPECK;

    const mask = new Image();

    // ----------------------------------------------------------------- mask

    /**
     * Re-derive the dot grid. Runs on resize and once the artwork decodes.
     *
     * The offscreen pass works in CSS pixels, not device pixels — the grid is
     * a layout thing, and sampling at DPR would change dot pitch per monitor.
     */
    const remask = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || !maskReady) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cell = Math.max(CELL_MIN, Math.round(CELL_SCALE * width));
      glyph = Math.max(GLYPH_MIN, Math.round(GLYPH_RATIO * cell));

      const off = document.createElement("canvas");
      off.width = Math.round(width);
      off.height = Math.round(height);
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;

      // White ground, dark artwork: a dot is a pixel the artwork covered. The
      // logo is black-on-transparent, so filling white first is what makes the
      // "is this ink?" test a simple luminance threshold.
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, off.width, off.height);

      // ---- lay the wordmark out ----------------------------------------
      // Prince, 09-03: "scale more so it fills a bit more the width of website
      // (with some margin on sides ofc)". So the width is the driver, and the
      // mark only shrinks if the box is too short to take it.
      const logoAspect = mask.naturalWidth / mask.naturalHeight;

      const room = off.width - Math.round(off.width * MARGIN_RATIO) * 2;
      const tall = off.height - Math.round(off.height * BREATHE_RATIO) * 2;

      const logoW = room / logoAspect > tall ? tall * logoAspect : room;
      const logoH = logoW / logoAspect;
      const originX = (off.width - logoW) / 2;
      const originY = (off.height - logoH) / 2;

      // Dilate the wordmark by re-drawing it around a small ring. A morphology
      // pass on the pixel buffer would be exact, but this is the same result at
      // a ninth of the cost and it runs on every resize.
      const bold = BOLD_RATIO * logoH;
      for (const [dx, dy] of DILATE_RING) {
        octx.drawImage(mask, originX + dx * bold, originY + dy * bold, logoW, logoH);
      }

      // ---- sample ------------------------------------------------------
      const data = octx.getImageData(0, 0, off.width, off.height).data;
      const cols = Math.floor(off.width / cell);
      const rows = Math.floor(off.height / cell);
      const ox = (width - cols * cell) / 2;
      const oy = (height - rows * cell) / 2;

      const xs: number[] = [];
      const ys: number[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = ox + (col + 0.5) * cell;
          const cy = oy + (row + 0.5) * cell;
          const px = Math.floor(x);
          const py = Math.floor(cy);
          if (px < 0 || py < 0 || px >= off.width || py >= off.height) continue;
          // Red channel is enough: the artwork is greyscale over white.
          if (data[(py * off.width + px) * 4] < 140) {
            xs.push(x);
            ys.push(cy);
          }
        }
      }

      pointX = Float32Array.from(xs);
      pointY = Float32Array.from(ys);
      // Dropping the old influences is what stops a resize from leaving a
      // frozen bright patch where the cursor used to be.
      influence = new Float32Array(xs.length);
      tier = new Uint8Array(xs.length);
    };

    // --------------------------------------------------------------- shapes

    const spawnShape = () => {
      const kind = SHAPE_KIND[Math.floor(Math.random() * SHAPE_KIND.length)];
      const base = SHAPE_BASE_CELLS * cell * (0.8 + 0.4 * Math.random());
      const w = base;
      const h = kind === "square" || kind === "circle" ? base : base * (1.3 + 0.3 * Math.random());
      const diagonal = Math.sqrt(w * w + h * h) / 2;
      shape.push({
        kind,
        x: Math.random() * Math.max(1, width - w),
        y: -12 - h / 2 - diagonal,
        w,
        h,
        speed: 50 + 40 * Math.random(),
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 1.2,
      });
    };

    /** Rotate the point back into the shape's own frame, then test axis-aligned. */
    const hitsShape = (item: Shape, x: number, y: number) => {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const cos = Math.cos(-item.angle);
      const sin = Math.sin(-item.angle);
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cos - dy * sin;
      const v = dx * sin + dy * cos;
      const halfW = item.w / 2;
      const halfH = item.h / 2;

      if (item.kind === "square" || item.kind === "rect") {
        return Math.abs(u) <= halfW && Math.abs(v) <= halfH;
      }
      if (item.kind === "circle") {
        const r = Math.min(item.w, item.h) / 2;
        return u * u + v * v <= r * r;
      }
      return (u * u) / (halfW * halfW) + (v * v) / (halfH * halfH) <= 1;
    };

    // ----------------------------------------------------------------- draw

    /**
     * Every dot in a tier shares a radius, so the tier is one path and one
     * fill. At the pitch this grid runs now that is four draw calls a frame
     * instead of forty thousand, which is the difference between the footer
     * costing nothing and the footer costing the scroll.
     */
    const strokeTier = (want: number, radius: number, fill: boolean) => {
      ctx.beginPath();
      for (let i = 0; i < tier.length; i += 1) {
        if (tier[i] !== want) continue;
        ctx.moveTo(pointX[i] + radius, pointY[i]);
        ctx.arc(pointX[i], pointY[i], radius, 0, TAU);
      }
      if (fill) ctx.fill();
      else ctx.stroke();
    };

    const render = (now: number) => {
      const dt = previous === null ? 0 : Math.min(0.1, (now - previous) / 1000);
      previous = now;
      elapsed += dt;

      ctx.clearRect(0, 0, width, height);

      if (pointer.active) {
        if (!smooth.init) {
          // Snap on re-entry. Sliding the influence across the whole wordmark
          // every time the cursor comes back reads as a glitch.
          smooth.x = pointer.x;
          smooth.y = pointer.y;
          smooth.init = true;
        } else {
          const k = 1 - Math.exp(-POINTER_TAU * dt);
          smooth.x += (pointer.x - smooth.x) * k;
          smooth.y += (pointer.y - smooth.y) * k;
        }
      }

      if (!pointer.active || elapsed - lastMoveAt > IDLE_AFTER_SECONDS) {
        const damp = Math.exp(-VELOCITY_TAU * dt);
        velocity.x *= damp;
        velocity.y *= damp;
      }

      const speed = Math.hypot(velocity.x, velocity.y);
      const sigma = Math.min(SIGMA_MAX, SIGMA_BASE + SIGMA_PER_SPEED * speed) * cell;
      const twoSigmaSq = 2 * sigma * sigma;
      const cutoffSq = 9 * sigma * sigma;

      if (!reduceMotion) {
        if (elapsed - lastSpawnAt > SHAPE_INTERVAL_SECONDS) {
          lastSpawnAt = elapsed;
          spawnShape();
        }
        for (const item of shape) {
          item.y += item.speed * dt;
          item.angle += item.rotSpeed * dt;
        }
        shape = shape.filter((item) => item.y < height + item.h);
      }

      const decay = dt * DECAY_PER_SECOND;
      for (let i = 0; i < pointX.length; i += 1) {
        const x = pointX[i];
        const y = pointY[i];
        let value = influence[i] - decay;
        if (value < 0) value = 0;

        if (pointer.active) {
          const dx = x - smooth.x;
          const dy = y - smooth.y;
          const distSq = dx * dx + dy * dy;
          if (distSq <= cutoffSq) {
            const gaussian = Math.exp(-distSq / twoSigmaSq);
            if (gaussian > value) value = gaussian;
          }
        }

        for (const item of shape) {
          if (hitsShape(item, x, y)) {
            value = 1;
            break;
          }
        }

        influence[i] = value;
        tier[i] =
          value >= TIER_SOLID ? 3 : value >= TIER_BULLET ? 2 : value >= TIER_RING ? 1 : 0;
      }

      ctx.fillStyle = DOT_COLOR;
      ctx.strokeStyle = DOT_COLOR;
      ctx.lineWidth = Math.max(0.7, R_RING_STROKE * glyph);

      strokeTier(0, Math.max(0.5, speckRatio * glyph), true);
      strokeTier(2, R_BULLET * glyph, true);
      strokeTier(3, R_SOLID * glyph, true);
      // The hollow ring. Optically larger than the filled bullet inside it,
      // which is what makes the cursor read as a lens rather than a blob.
      strokeTier(1, R_RING * glyph, false);

      frame = requestAnimationFrame(render);
    };

    const start = () => {
      if (frame) return;
      previous = null;
      frame = requestAnimationFrame(render);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    // -------------------------------------------------------------- wiring

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dt = Math.max(0.001, elapsed - lastMoveAt);

      if (pointer.active) {
        velocity.x = (1 - VELOCITY_ALPHA) * velocity.x + VELOCITY_ALPHA * ((x - pointer.x) / dt);
        velocity.y = (1 - VELOCITY_ALPHA) * velocity.y + VELOCITY_ALPHA * ((y - pointer.y) / dt);
      }

      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
      lastMoveAt = elapsed;
    };

    const onPointerLeave = () => {
      pointer.active = false;
      smooth.init = false;
      velocity.x = 0;
      velocity.y = 0;
    };

    mask.onload = () => {
      maskReady = true;
      remask();
    };
    mask.src = src;

    const resizeObserver = new ResizeObserver(() => remask());
    resizeObserver.observe(canvas);

    // Off screen, the loop stops. A footer canvas has no business burning a
    // frame budget while someone reads the top of the page.
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      mask.onload = null;
    };
  }, [src, reduceMotion]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};

export default AdvoDotField;
