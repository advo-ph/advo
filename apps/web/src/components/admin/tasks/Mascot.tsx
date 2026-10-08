import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type MascotMood = "idle" | "happy" | "excited" | "worried" | "sleepy" | "surprised";

export type MascotGait = "still" | "walk" | "run" | "air";

/** Small mouth per mood, centred under the eyes. */
const MOUTH: Record<MascotMood, { d: string; open?: boolean }> = {
  idle: { d: "M 14.6 18.4 Q 16 19.4 17.4 18.4" },
  happy: { d: "M 14.2 18.1 Q 16 20.4 17.8 18.1" },
  excited: { d: "M 14.2 18.1 Q 16 20.4 17.8 18.1", open: true },
  worried: { d: "M 14.6 19.4 Q 16 18.3 17.4 19.4" },
  sleepy: { d: "M 15 18.8 Q 16 19.1 17 18.8" },
  surprised: { d: "M 15.4 18.6 Q 16 18.6 16.6 18.6", open: true },
};

interface MascotBodyProps {
  mood: MascotMood;
  talking: boolean;
  look: { x: number; y: number };
  facing: 1 | -1;
  gait: MascotGait;
}

/**
 * The character: a round puff with two stubby feet, tiny arms, tall shiny eyes
 * and soft cheeks. Ink follows the theme (black on light, white on dark).
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
  const eyeRy = closed ? 0.25 : mood === "surprised" || mood === "excited" ? 2.9 : 2.5;
  const px = Math.max(-1, Math.min(1, look.x)) * 0.9;
  const py = Math.max(-1, Math.min(1, look.y)) * 0.8;

  const moving = gait === "walk" || gait === "run";
  const stepDur = gait === "run" ? 0.22 : 0.36;
  const foot = (phase: 0 | 1) =>
    gait === "air"
      ? { y: -1.6, rotate: phase ? 18 : -18 }
      : moving
        ? {
            y: phase ? [0, -1.8, 0, 0] : [0, 0, -1.8, 0],
            rotate: phase ? [0, -14, 0, 0] : [0, 0, -14, 0],
          }
        : { y: 0, rotate: 0 };
  const footT = moving
    ? { duration: stepDur * 2, repeat: Infinity, ease: "easeInOut" as const }
    : { type: "spring" as const, stiffness: 400, damping: 20 };

  const waving = mood === "excited" || mood === "happy";

  return (
    <motion.svg viewBox="0 0 32 32" className="tc-mascot-svg" style={{ scaleX: facing }} aria-hidden>
      {/* Feet sit behind the body, Kirby style */}
      {([0, 1] as const).map((phase) => (
        <motion.ellipse
          key={phase}
          className="tc-mascot-body"
          cx={phase ? 20.6 : 11.4}
          cy={28}
          rx={4.4}
          ry={2.6}
          style={{ originX: "50%", originY: "50%", transformBox: "fill-box" }}
          animate={foot(phase)}
          transition={footT}
        />
      ))}

      {/* Body breathes */}
      <motion.g
        style={{ originX: "50%", originY: "100%", transformBox: "fill-box" }}
        animate={moving ? { y: [0, -0.8, 0] } : { scaleY: [1, 1.03, 1], scaleX: [1, 0.985, 1] }}
        transition={
          moving
            ? { duration: stepDur, repeat: Infinity, ease: "easeInOut" }
            : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
        }
      >
        {/* Arms */}
        <motion.ellipse
          className="tc-mascot-body tc-mascot-edge"
          cx={4.6}
          cy={17.4}
          rx={2.6}
          ry={2.1}
          style={{ originX: "100%", originY: "50%", transformBox: "fill-box" }}
          animate={{ rotate: waving ? [0, 22, 0] : gait === "air" ? 30 : 0 }}
          transition={waving ? { duration: 0.5, repeat: Infinity } : { type: "spring", stiffness: 300, damping: 16 }}
        />
        <motion.ellipse
          className="tc-mascot-body tc-mascot-edge"
          cx={27.4}
          cy={17.4}
          rx={2.6}
          ry={2.1}
          style={{ originX: "0%", originY: "50%", transformBox: "fill-box" }}
          animate={{ rotate: waving ? [0, -22, 0] : gait === "air" ? -30 : 0 }}
          transition={waving ? { duration: 0.5, repeat: Infinity, delay: 0.1 } : { type: "spring", stiffness: 300, damping: 16 }}
        />

        <circle className="tc-mascot-body tc-mascot-edge" cx={16} cy={15.6} r={11.6} />

        {/* Cheeks */}
        <ellipse className="tc-mascot-cheek" cx={10.2} cy={17.8} rx={2} ry={1.1} />
        <ellipse className="tc-mascot-cheek" cx={21.8} cy={17.8} rx={2} ry={1.1} />

        {/* Eyes: tall ovals with a highlight */}
        {[13.4, 18.6].map((cx) => (
          <g key={cx}>
            <motion.ellipse
              className="tc-mascot-face"
              rx={1.25}
              animate={{ cx: cx + px, cy: 13.4 + py, ry: eyeRy }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
            />
            {!closed && (
              <motion.circle
                className="tc-mascot-body"
                r={0.55}
                animate={{ cx: cx + px - 0.25, cy: 13.4 + py - eyeRy + 1.05 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
              />
            )}
          </g>
        ))}

        {/* Mouth */}
        {mouth.open ? (
          <motion.ellipse
            className="tc-mascot-face"
            cx={16}
            cy={19}
            animate={{
              rx: mood === "surprised" ? 0.8 : 1.4,
              ry: talking ? [0.6, 1.2, 0.6] : mood === "surprised" ? 1 : 1.1,
            }}
            transition={talking ? { duration: 0.22, repeat: Infinity } : { type: "spring", stiffness: 300, damping: 18 }}
          />
        ) : (
          <motion.path
            className="tc-mascot-line"
            fill="none"
            strokeWidth={0.9}
            strokeLinecap="round"
            animate={{ d: talking ? [mouth.d, "M 14.6 18.4 Q 16 20.6 17.4 18.4", mouth.d] : mouth.d }}
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

type Pos = { x: number; y: number };

/**
 * A small character that walks, runs and jumps between elements marked with
 * `data-perch`. It stands on their top edge, looks at the cursor, reacts to
 * clicks, and talks in a short bubble that hides itself.
 */
export const RoamingMascot = ({ stageRef, baseMood, greeting, apiRef, reducedMotion }: RoamingMascotProps) => {
  const [pos, setPos] = useState<Pos>({ x: 24, y: 0 });
  const [anim, setAnim] = useState<{ x: number[] | number; y: number[] | number; duration: number }>({
    x: 24,
    y: 0,
    duration: 0,
  });
  const [facing, setFacing] = useState<1 | -1>(1);
  const [mood, setMood] = useState<MascotMood>(baseMood);
  const [bubble, setBubble] = useState<string | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [squash, setSquash] = useState(false);
  const [gait, setGait] = useState<MascotGait>("still");
  const gaitTimer = useRef<number>();
  const posRef = useRef(pos);
  const perchRef = useRef<string>("headline");
  const moodTimer = useRef<number>();
  const bubbleTimer = useRef<number>();
  const busy = useRef(false);
  const placed = useRef(false);
  const selfRef = useRef<HTMLButtonElement>(null);

  posRef.current = pos;

  useEffect(() => setMood(baseMood), [baseMood]);

  /** Walkable top edge of a perch element, in stage coordinates. */
  const perchBounds = (name: string) => {
    const stage = stageRef.current;
    const el = stage?.querySelector<HTMLElement>(`[data-perch="${name}"]`);
    if (!stage || !el) return null;
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const minX = r.left - s.left + 4;
    const maxX = Math.max(minX, r.right - s.left - SIZE - 4);
    return { minX, maxX, y: r.top - s.top - SIZE + 2 };
  };

  /** Spot on top of a perch element, in stage coordinates. */
  const perchPoint = (name: string, side: "left" | "right" | "random" = "random"): Pos | null => {
    const b = perchBounds(name);
    if (!b) return null;
    const x =
      side === "left" ? b.minX : side === "right" ? b.maxX : b.minX + Math.random() * (b.maxX - b.minX);
    return { x, y: b.y };
  };

  const setGaitFor = (g: MascotGait, seconds: number) => {
    window.clearTimeout(gaitTimer.current);
    setGait(g);
    gaitTimer.current = window.setTimeout(() => setGait("still"), seconds * 1000);
  };

  const moveTo = (target: Pos, opts: { run?: boolean } = {}) => {
    const from = posRef.current;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    if (Math.abs(dx) > 2) setFacing(dx > 0 ? 1 : -1);
    if (reducedMotion) {
      setAnim({ x: target.x, y: target.y, duration: 0 });
      setPos(target);
      return 0;
    }
    const dist = Math.hypot(dx, dy);
    const sameLevel = Math.abs(dy) < 6;
    if (sameLevel) {
      // Walk (or run): feet step, body bobs a little.
      const speed = opts.run ? 300 : 90;
      const duration = Math.max(0.3, Math.abs(dx) / speed);
      const steps = Math.max(2, Math.round(Math.abs(dx) / (opts.run ? 40 : 22)));
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i <= steps; i++) {
        xs.push(from.x + (dx * i) / steps);
        ys.push(target.y - (i % 2 === 1 ? (opts.run ? 2.5 : 1) : 0));
      }
      ys[ys.length - 1] = target.y;
      if (Math.abs(dx) > 3) setGaitFor(opts.run ? "run" : "walk", duration);
      setAnim({ x: xs, y: ys, duration });
      setPos(target);
      return duration;
    }
    // Jump: arc over to the new surface.
    const peak = Math.min(from.y, target.y) - 50 - dist * 0.08;
    const duration = 0.55 + Math.min(0.4, dist / 1200);
    setGaitFor("air", duration);
    setAnim({
      x: [from.x, from.x + dx * 0.5, target.x],
      y: [from.y, peak, target.y],
      duration,
    });
    setPos(target);
    window.setTimeout(() => {
      setSquash(true);
      window.setTimeout(() => setSquash(false), 160);
    }, duration * 1000);
    return duration;
  };

  const say = (text: string, m?: MascotMood) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    if (m) {
      window.clearTimeout(moodTimer.current);
      setMood(m);
      moodTimer.current = window.setTimeout(() => setMood(baseMood), 3200);
    }
    bubbleTimer.current = window.setTimeout(() => setBubble(null), Math.min(5000, 1600 + text.length * 55));
  };

  const hopTo = (name: string, run = false) => {
    const p = perchPoint(name);
    if (!p) return;
    perchRef.current = name;
    moveTo(p, { run });
  };

  apiRef.current = {
    say,
    hopTo: (n) => hopTo(n, true),
    celebrate: () => {
      const p = posRef.current;
      setMood("excited");
      if (!reducedMotion) {
        setGaitFor("air", 0.9);
        setAnim({ x: [p.x, p.x, p.x, p.x, p.x], y: [p.y, p.y - 40, p.y, p.y - 18, p.y], duration: 0.9 });
      }
      window.clearTimeout(moodTimer.current);
      moodTimer.current = window.setTimeout(() => setMood(baseMood), 2400);
    },
  };

  // Land on the headline at start and greet.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const p = perchPoint("headline", "left");
      perchRef.current = "headline";
      if (p && placed.current) moveTo(p, { run: true });
      else if (p) {
        placed.current = true;
        setAnim({ x: p.x, y: p.y, duration: 0 });
        setPos(p);
      }
      window.setTimeout(() => say(greeting), 400);
    }, 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting]);

  // Wander on its own every few seconds.
  useEffect(() => {
    if (reducedMotion) return;
    const perches = () =>
      Array.from(stageRef.current?.querySelectorAll<HTMLElement>("[data-perch]") ?? []).map(
        (el) => el.dataset.perch as string,
      );
    const id = window.setInterval(() => {
      if (busy.current || document.hidden) return;
      const list = perches();
      if (!list.length) return;
      const roll = Math.random();
      if (roll < 0.45) {
        // Stroll on the current surface.
        const p = perchPoint(perchRef.current);
        if (p) moveTo(p);
      } else {
        const next = list[Math.floor(Math.random() * list.length)];
        perchRef.current = next;
        const p = perchPoint(next);
        if (p) moveTo(p, { run: roll > 0.85 });
      }
    }, 4200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Keep its footing when content above it changes (new task, text wraps).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (busy.current) return;
      const b = perchBounds(perchRef.current) ?? perchBounds("headline");
      if (!b) return;
      const cur = posRef.current;
      const x = Math.min(b.maxX, Math.max(b.minX, cur.x));
      if (Math.abs(b.y - cur.y) > 3 || Math.abs(x - cur.x) > 3) moveTo({ x, y: b.y });
    }, 700);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep its footing when the layout resizes.
  useEffect(() => {
    const onResize = () => {
      const p = perchPoint(perchRef.current);
      if (p) {
        setAnim({ x: p.x, y: p.y, duration: 0 });
        setPos(p);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Poked too much: runs off to another spot.
      pokes.current = 0;
      window.clearTimeout(moodTimer.current);
      setMood("surprised");
      moodTimer.current = window.setTimeout(() => setMood(baseMood), 1800);
      const list = Array.from(stageRef.current?.querySelectorAll<HTMLElement>("[data-perch]") ?? []);
      const other = list.find((el) => el.dataset.perch !== perchRef.current);
      if (other) hopTo(other.dataset.perch as string, true);
      return;
    }
    if (pokes.current === 1) say("Hi.", "happy");
    apiRef.current?.celebrate();
  };

  const stageW = stageRef.current?.clientWidth ?? 0;
  const bubbleAlign = pos.x < 90 ? "left" : stageW && pos.x > stageW - 130 ? "right" : "center";

  return (
    <motion.button
      ref={selfRef}
      type="button"
      aria-label="Task buddy"
      className="tc-mascot"
      style={{ width: SIZE, height: SIZE }}
      initial={false}
      animate={{ x: anim.x, y: anim.y }}
      transition={{ duration: anim.duration, ease: "easeInOut" }}
      onClick={onPoke}
      onMouseEnter={() => !bubble && setLook((l) => ({ ...l, y: 1 }))}
      onAnimationStart={() => (busy.current = true)}
      onAnimationComplete={() => (busy.current = false)}
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
        animate={squash ? { scaleY: 0.8, scaleX: 1.15 } : { scaleY: 1, scaleX: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
      >
        <MascotBody mood={mood} talking={!!bubble} look={look} facing={facing} gait={gait} />
      </motion.span>
    </motion.button>
  );
};
