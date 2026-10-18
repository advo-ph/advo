import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, animate, useMotionValue } from "framer-motion";

export type MascotMood = "idle" | "happy" | "excited" | "worried" | "sleepy" | "surprised";

export type MascotGait = "still" | "walk" | "run" | "climb" | "air";

/** Small mouth per mood, centred under the eyes. */
const MOUTH: Record<MascotMood, { d: string; open?: boolean }> = {
  idle: { d: "M 15 19.7 Q 16 20.5 17 19.7" },
  happy: { d: "M 14.7 19.5 Q 16 21.1 17.3 19.5" },
  excited: { d: "M 14.7 19.5 Q 16 21.1 17.3 19.5", open: true },
  worried: { d: "M 15 20.4 Q 16 19.6 17 20.4" },
  sleepy: { d: "M 15.3 20 Q 16 20.2 16.7 20" },
  surprised: { d: "M 15.5 19.9 Q 16 19.9 16.5 19.9", open: true },
};
const TALK = "M 15 19.7 Q 16 21.3 17 19.7";

/** Dome head, straight sides, and a hem of three round lobes. `k` sets how low each lobe hangs. */
const ghostPath = (k: [number, number, number]) =>
  "M 6 26.5 L 6 15.5 C 6 9.98 10.48 5.5 16 5.5 C 21.52 5.5 26 9.98 26 15.5 L 26 26.5 " +
  `C 26 ${26.5 + k[0]} 19.33 ${26.5 + k[0]} 19.33 26.5 ` +
  `C 19.33 ${26.5 + k[1]} 12.67 ${26.5 + k[1]} 12.67 26.5 ` +
  `C 12.67 ${26.5 + k[2]} 6 ${26.5 + k[2]} 6 26.5 Z`;
const HEM_A = ghostPath([4.4, 3, 4.4]);
const HEM_B = ghostPath([3, 4.4, 3]);

/** Float height, rhythm, and forward lean for each way of moving. Lift is tiny on purpose. */
const GAIT: Record<MascotGait, { lift: number; period: number; lean: number }> = {
  still: { lift: 0.6, period: 2.8, lean: 0 },
  walk: { lift: 0.3, period: 0.6, lean: 4 },
  run: { lift: 0.45, period: 0.34, lean: 8 },
  climb: { lift: 0, period: 0.5, lean: 6 },
  air: { lift: 0, period: 0.5, lean: 0 },
};

interface MascotBodyProps {
  mood: MascotMood;
  talking: boolean;
  look: { x: number; y: number };
  facing: 1 | -1;
  gait: MascotGait;
}

/**
 * The character: a small ghost with a round head, a wavy hem, two stub arms
 * and plain oval eyes. One ink that follows the theme (black on light, white on dark).
 */
export const MascotBody = ({ mood, talking, look, facing, gait }: MascotBodyProps) => {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 110);
        loop();
      }, 2400 + Math.random() * 2800);
    };
    loop();
    return () => window.clearTimeout(t);
  }, []);

  const mouth = MOUTH[mood];
  const closed = blink || mood === "sleepy";
  const eyeRy = closed ? 0.25 : mood === "surprised" || mood === "excited" ? 2.4 : 2.1;
  const px = Math.max(-1, Math.min(1, look.x)) * 0.9;
  const py = Math.max(-1, Math.min(1, look.y)) * 0.7;

  const g = GAIT[gait];
  const cheering = gait === "still" && (mood === "excited" || mood === "happy");
  const arm = (i: 0 | 1) => {
    if (gait === "climb") return { y: i ? [0, -2.6, 0] : [-2.6, 0, -2.6] };
    if (gait === "air") return { y: -2.2 };
    if (gait === "walk" || gait === "run") return { y: i ? [0, -0.6, 0] : [-0.6, 0, -0.6] };
    if (cheering) return { y: [0, -1.4, 0] };
    return { y: 0 };
  };
  const armT =
    gait === "air" || (gait === "still" && !cheering)
      ? { type: "spring" as const, stiffness: 300, damping: 20 }
      : { duration: cheering ? 0.5 : g.period, repeat: Infinity, ease: "easeInOut" as const };

  return (
    <motion.svg viewBox="0 0 32 32" className="tc-mascot-svg" style={{ scaleX: facing }} aria-hidden>
      <motion.g
        style={{ originX: "50%", originY: "100%", transformBox: "fill-box" }}
        animate={{ y: g.lift ? [0, -g.lift, 0] : 0, rotate: g.lean }}
        transition={{
          y: g.lift ? { duration: g.period, repeat: Infinity, ease: "easeInOut" } : { duration: 0.15 },
          rotate: { type: "spring", stiffness: 200, damping: 22 },
        }}
      >
        {([0, 1] as const).map((i) => (
          <motion.ellipse
            key={i}
            className="tc-mascot-body"
            cx={i ? 26.6 : 5.4}
            cy={20}
            rx={2}
            ry={1.5}
            animate={arm(i)}
            transition={armT}
          />
        ))}

        {/* The hem ripples faster the faster it moves */}
        <motion.path
          className="tc-mascot-body"
          initial={{ d: HEM_A }}
          animate={{ d: [HEM_A, HEM_B, HEM_A] }}
          transition={{ duration: gait === "still" ? 2.4 : g.period * 1.2, repeat: Infinity, ease: "easeInOut" }}
        />

        {[12.9, 19.1].map((cx) => (
          <motion.ellipse
            key={cx}
            className="tc-mascot-face"
            rx={1.45}
            initial={false}
            animate={{ cx: cx + px, cy: 15.8 + py, ry: eyeRy }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          />
        ))}

        {mouth.open ? (
          <motion.ellipse
            className="tc-mascot-face"
            cx={16}
            cy={20.1}
            initial={false}
            animate={{
              rx: mood === "surprised" ? 0.7 : 1.2,
              ry: talking ? [0.5, 1, 0.5] : 0.9,
            }}
            transition={talking ? { duration: 0.22, repeat: Infinity } : { type: "spring", stiffness: 300, damping: 18 }}
          />
        ) : (
          <motion.path
            className="tc-mascot-line"
            fill="none"
            strokeWidth={0.8}
            strokeLinecap="round"
            initial={false}
            animate={{ d: talking ? [mouth.d, TALK, mouth.d] : mouth.d }}
            transition={talking ? { duration: 0.24, repeat: Infinity } : { type: "spring", stiffness: 260, damping: 16 }}
          />
        )}
      </motion.g>
    </motion.svg>
  );
};

// ─── Roaming mascot ──────────────────────────────────────────────────────────

export interface MascotHandle {
  say: (text: string, mood?: MascotMood) => void;
  hopTo: (perch: string) => void;
  celebrate: () => void;
}

interface RoamingMascotProps {
  /** Playground the mascot is allowed to move inside. */
  stageRef: React.RefObject<HTMLElement>;
  baseMood: MascotMood;
  greeting: string;
  apiRef: React.MutableRefObject<MascotHandle | null>;
  reducedMotion: boolean;
}

const SIZE = 44;
/** Empty space between the box edge and the ghost's body, so it can press against a wall. */
const INSET = 8;
/** How far below a top edge the ghost hangs before it pulls itself up. */
const LIP = 14;
/** Speeds in px per second. Walking and climbing are linear. */
const WALK = 70;
const RUN = 190;
const CLIMB = 52;
const CLIMB_RUN = 100;
/** Sets how long a hop of a given height takes, so arcs look like real jumps. */
const GRAVITY = 1400;

type Pos = { x: number; y: number };
type Box = { left: number; right: number; top: number; bottom: number };
type Side = "left" | "right";
type Perch = { name: string; box: Box };
type Home = { perch: string; relX: number };
type Seg = {
  kind: "walk" | "climb" | "hop" | "poof";
  to: Pos;
  dur: number;
  lift?: number;
  run?: boolean;
  face?: 1 | -1;
};
type Route = { segs: Seg[]; i: number; t0: number; from: Pos; home: Home };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Box position for standing on a perch, and the x range it can walk along. */
const topY = (b: Box) => b.top - SIZE + 2;
const minX = (b: Box) => b.left + 4;
const maxX = (b: Box) => Math.max(minX(b), b.right - SIZE - 4);
const clampX = (b: Box, x: number) => Math.min(maxX(b), Math.max(minX(b), x));
/** Box x that puts the ghost flat against one side of a perch. */
const wallX = (b: Box, side: Side) => (side === "left" ? b.left - SIZE + INSET : b.right - INSET);

/** Ballistic arc that peaks `lift` px above the higher end. */
const hopTime = (y0: number, y1: number, lift: number) => {
  const apex = Math.min(y0, y1) - lift;
  return Math.sqrt(2 / GRAVITY) * (Math.sqrt(y0 - apex) + Math.sqrt(y1 - apex));
};
const hopY = (y0: number, y1: number, lift: number, t: number) => {
  const apex = Math.min(y0, y1) - lift;
  const a = Math.sqrt(y0 - apex);
  const s = a + Math.sqrt(y1 - apex);
  return y0 - 2 * a * s * t + s * s * t * t;
};

/** Collects moves one after another, each starting where the last one ended. */
const makeRoute = (start: Pos, run: boolean) => {
  const segs: Seg[] = [];
  let at = start;
  const push = (seg: Seg) => {
    segs.push(seg);
    at = seg.to;
  };
  return {
    segs,
    at: () => at,
    walk: (x: number) => {
      const d = Math.abs(x - at.x);
      if (d > 1) push({ kind: "walk", to: { x, y: at.y }, dur: d / (run ? RUN : WALK), run });
    },
    climb: (y: number, face: 1 | -1) => {
      const d = Math.abs(y - at.y);
      if (d > 1) push({ kind: "climb", to: { x: at.x, y }, dur: d / (run ? CLIMB_RUN : CLIMB), face });
    },
    hop: (to: Pos, lift: number, face?: 1 | -1) =>
      push({ kind: "hop", to, dur: hopTime(at.y, to.y, lift), lift, face }),
  };
};

/**
 * Route from one perch to another, one level at a time. It never makes a long
 * jump: it walks to an edge, climbs down or up the side of the perch, and only
 * hops across the small gap between two perches.
 */
const planRoute = (
  perches: Perch[],
  from: string,
  start: Pos,
  to: string,
  toX: number,
  run: boolean,
  stageW: number,
): Seg[] | null => {
  const list = [...perches].sort((a, b) => a.box.top - b.box.top);
  let i = list.findIndex((p) => p.name === from);
  const j = list.findIndex((p) => p.name === to);
  if (i < 0 || j < 0) return null;

  const r = makeRoute(start, run);
  // Keep the climbing body inside the stage.
  const fitWall = (x: number) => Math.min(stageW - SIZE + INSET, Math.max(-INSET, x));

  while (i !== j) {
    const up = j < i;
    const upper = list[up ? i - 1 : i].box;
    const lower = list[up ? i : i + 1].box;
    const cost = (s: Side) => {
      const w = wallX(upper, s);
      return Math.abs(r.at().x - w) + Math.abs(w - toX) + (fitWall(w) !== w ? 1000 : 0);
    };
    const side: Side = cost("left") <= cost("right") ? "left" : "right";
    const wx = fitWall(wallX(upper, side));
    const face: 1 | -1 = side === "left" ? 1 : -1;
    const edge = side === "left" ? minX(upper) : maxX(upper);
    const lip = upper.top - SIZE + LIP;
    const foot = Math.max(lip, upper.bottom - SIZE);

    if (up) {
      r.walk(clampX(lower, wx));
      r.hop({ x: wx, y: foot }, 5, face);
      r.climb(lip, face);
      r.hop({ x: edge, y: topY(upper) }, 4);
    } else {
      r.walk(edge);
      r.hop({ x: wx, y: lip }, 3, face);
      r.climb(foot, face);
      r.hop({ x: clampX(lower, wx), y: topY(lower) }, 3, face);
    }
    i += up ? -1 : 1;
  }
  r.walk(clampX(list[j].box, toX));
  return r.segs;
};

/**
 * A small ghost that walks along elements marked with `data-perch`, climbs
 * their sides, and hops only across short gaps. It looks at the cursor,
 * reacts to clicks, and talks in a short bubble that hides itself.
 */
export const RoamingMascot = ({ stageRef, baseMood, greeting, apiRef, reducedMotion }: RoamingMascotProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [mood, setMood] = useState<MascotMood>(baseMood);
  const [bubble, setBubble] = useState<string | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [climbLook, setClimbLook] = useState(0);
  const [squash, setSquash] = useState(false);
  const [gait, setGait] = useState<MascotGait>("still");
  const route = useRef<Route | null>(null);
  /** A trip asked for while moving, started as soon as the current move ends. */
  const queued = useRef<(() => void) | null>(null);
  const home = useRef<Home>({ perch: "headline", relX: 0 });
  const restUntil = useRef(0);
  const moodTimer = useRef<number>();
  const bubbleTimer = useRef<number>();
  const squashTimer = useRef<number>();
  const shown = useRef(false);
  const selfRef = useRef<HTMLButtonElement>(null);
  const baseMoodRef = useRef(baseMood);
  const reducedRef = useRef(reducedMotion);

  baseMoodRef.current = baseMood;
  reducedRef.current = reducedMotion;

  useEffect(() => setMood(baseMood), [baseMood]);

  /** Every perch in stage coordinates. */
  const readPerches = (): Perch[] => {
    const stage = stageRef.current;
    if (!stage) return [];
    const s = stage.getBoundingClientRect();
    return Array.from(stage.querySelectorAll<HTMLElement>("[data-perch]")).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name: el.dataset.perch as string,
        box: { left: r.left - s.left, right: r.right - s.left, top: r.top - s.top, bottom: r.bottom - s.top },
      };
    });
  };

  const startRoute = (segs: Seg[], from: Pos, to: Home) => {
    if (!segs.length) {
      home.current = to;
      return;
    }
    route.current = { segs, i: 0, t0: performance.now(), from, home: to };
    beginSeg(segs[0], from);
  };

  const beginSeg = (seg: Seg, from: Pos) => {
    const dx = seg.to.x - from.x;
    if (seg.face) setFacing(seg.face);
    else if (Math.abs(dx) > 2) setFacing(dx > 0 ? 1 : -1);
    setGait(
      seg.kind === "walk" ? (seg.run ? "run" : "walk") : seg.kind === "climb" ? "climb" : seg.kind === "hop" ? "air" : "still",
    );
    setClimbLook(seg.kind === "climb" ? (seg.to.y < from.y ? -1 : 1) : 0);
  };

  const land = () => {
    setSquash(true);
    window.clearTimeout(squashTimer.current);
    squashTimer.current = window.setTimeout(() => setSquash(false), 120);
  };

  /** Moves along the current route at a steady speed, carrying leftover time into the next move. */
  const advance = (r: Route, now: number) => {
    let seg = r.segs[r.i];
    let elapsed = Math.max(0, (now - r.t0) / 1000);
    while (elapsed >= seg.dur) {
      if (seg.kind === "hop") land();
      r.t0 += seg.dur * 1000;
      elapsed -= seg.dur;
      r.from = seg.to;
      r.i += 1;
      if (r.i >= r.segs.length) {
        x.set(seg.to.x);
        y.set(seg.to.y);
        opacity.set(1);
        home.current = r.home;
        route.current = null;
        restUntil.current = now + 2500 + Math.random() * 3500;
        setGait("still");
        setClimbLook(0);
        const next = queued.current;
        queued.current = null;
        next?.();
        return;
      }
      seg = r.segs[r.i];
      beginSeg(seg, r.from);
    }
    const t = elapsed / seg.dur;
    if (seg.kind === "poof") {
      // Fade out where it was, fade in where it goes.
      const there = t >= 0.5 ? seg.to : r.from;
      x.set(there.x);
      y.set(there.y);
      opacity.set(Math.abs(1 - 2 * t));
      return;
    }
    x.set(lerp(r.from.x, seg.to.x, t));
    y.set(seg.kind === "hop" ? hopY(r.from.y, seg.to.y, seg.lift ?? 0, t) : lerp(r.from.y, seg.to.y, t));
  };

  /** Stands still on its perch and rides along when the perch moves. */
  const stay = () => {
    const perches = readPerches();
    if (!perches.length) return;
    const p = perches.find((q) => q.name === home.current.perch);
    if (p) {
      x.set(clampX(p.box, minX(p.box) + home.current.relX));
      y.set(topY(p.box));
      return;
    }
    // Its perch is gone (the task changed). A ghost can vanish and show up elsewhere.
    const next = perches.find((q) => q.name === "headline") ?? perches[0];
    const to = { perch: next.name, relX: 0 };
    if (reducedRef.current) {
      home.current = to;
      return;
    }
    const target = { x: minX(next.box), y: topY(next.box) };
    startRoute([{ kind: "poof", to: target, dur: 0.6 }], { x: x.get(), y: y.get() }, to);
  };

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (route.current) advance(route.current, now);
      else stay();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(moodTimer.current);
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(squashTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Plans and starts a trip to a spot on a perch, or queues it while already on the move. */
  const go = (name: string, toX: number, run: boolean) => {
    if (route.current) {
      queued.current = () => go(name, toX, run);
      return;
    }
    if (!stageRef.current) return;
    const perches = readPerches();
    const target = perches.find((p) => p.name === name);
    if (!target) return;
    const start = { x: x.get(), y: y.get() };
    const segs = planRoute(perches, home.current.perch, start, name, toX, run, stageRef.current.clientWidth);
    if (!segs) return;
    const to = { perch: name, relX: clampX(target.box, toX) - minX(target.box) };
    startRoute(reducedRef.current ? [] : segs, start, to);
  };

  const randomX = (b: Box) => minX(b) + Math.random() * (maxX(b) - minX(b));

  /** Goes up or down one level, never further. */
  const visitNeighbour = (run: boolean) => {
    if (route.current) {
      queued.current = () => visitNeighbour(run);
      return;
    }
    const list = readPerches().sort((a, b) => a.box.top - b.box.top);
    const i = list.findIndex((p) => p.name === home.current.perch);
    if (i < 0) return;
    const options = [list[i - 1], list[i + 1]].filter(Boolean);
    if (!options.length) return;
    const next = options[Math.floor(Math.random() * options.length)];
    go(next.name, randomX(next.box), run);
  };

  const say = (text: string, m?: MascotMood) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    if (m) {
      window.clearTimeout(moodTimer.current);
      setMood(m);
      moodTimer.current = window.setTimeout(() => setMood(baseMoodRef.current), 3200);
    }
    bubbleTimer.current = window.setTimeout(() => setBubble(null), Math.min(5000, 1600 + text.length * 55));
  };

  const celebrate = () => {
    setMood("excited");
    window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setMood(baseMoodRef.current), 2400);
    if (reducedRef.current || route.current) return;
    // Two small hops in place.
    const p = { x: x.get(), y: y.get() };
    startRoute(
      [
        { kind: "hop", to: p, dur: hopTime(p.y, p.y, 12), lift: 12 },
        { kind: "hop", to: p, dur: hopTime(p.y, p.y, 5), lift: 5 },
      ],
      p,
      home.current,
    );
  };

  apiRef.current = {
    say,
    hopTo: (name) => {
      const target = readPerches().find((p) => p.name === name);
      if (target) go(name, randomX(target.box), true);
    },
    celebrate,
  };

  // Appear on the headline at start, then greet on each new task.
  useEffect(() => {
    const t = window.setTimeout(
      () => {
        if (!shown.current) {
          shown.current = true;
          if (reducedRef.current) opacity.set(1);
          else animate(opacity, 1, { duration: 0.4 });
        }
        say(greeting);
      },
      shown.current ? 400 : 650,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting]);

  // Wander on its own: stroll along the current perch, or visit the one above or below.
  useEffect(() => {
    if (reducedMotion) return;
    restUntil.current = performance.now() + 3000;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (route.current || document.hidden || now < restUntil.current) return;
      restUntil.current = now + 2500 + Math.random() * 3500;
      const roll = Math.random();
      if (roll < 0.55) {
        const p = readPerches().find((q) => q.name === home.current.perch);
        if (!p) return;
        const tx = randomX(p.box);
        if (Math.abs(tx - x.get()) > 30) go(p.name, tx, false);
      } else if (roll < 0.9) {
        visitNeighbour(false);
      }
    }, 400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Eyes follow the cursor.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = selfRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      setLook({ x: (dx / len) * 1.4 * facing, y: (dy / len) * 1.2 });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [facing]);

  const pokes = useRef(0);
  const onPoke = () => {
    pokes.current += 1;
    if (pokes.current >= 4) {
      // Poked too much: runs off to the next level.
      pokes.current = 0;
      window.clearTimeout(moodTimer.current);
      setMood("surprised");
      moodTimer.current = window.setTimeout(() => setMood(baseMoodRef.current), 1800);
      visitNeighbour(true);
      return;
    }
    if (pokes.current === 1) say("Hi.", "happy");
    celebrate();
  };

  const stageW = stageRef.current?.clientWidth ?? 0;
  const bx = x.get();
  const bubbleAlign = bx < 90 ? "left" : stageW && bx > stageW - 130 ? "right" : "center";

  return (
    <motion.button
      ref={selfRef}
      type="button"
      aria-label="Task buddy"
      className="tc-mascot"
      style={{ width: SIZE, height: SIZE, x, y, opacity }}
      onClick={onPoke}
      onMouseEnter={() => !bubble && setLook((l) => ({ ...l, y: 1 }))}
    >
      <AnimatePresence>
        {bubble && (
          <motion.span
            key={bubble}
            className="tc-bubble"
            data-align={bubbleAlign}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            role="status"
          >
            {bubble}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        className="tc-mascot-inner"
        animate={squash ? { scaleY: 0.92, scaleX: 1.06 } : { scaleY: 1, scaleX: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 22 }}
      >
        <MascotBody
          mood={mood}
          talking={!!bubble}
          look={climbLook ? { x: 0.6, y: climbLook } : look}
          facing={facing}
          gait={gait}
        />
      </motion.span>
    </motion.button>
  );
};
