import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactElement,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_/\\[]{}=+*^?#$%&";
const rnd = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** Scramble a string into random glyphs, preserving spaces. */
function scramble(text: string): string {
  let out = "";
  for (const ch of text) out += ch === " " ? " " : rnd();
  return out;
}

interface ScrambleTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Delay before the decode starts (ms). */
  delay?: number;
  /** Total decode duration (ms). */
  duration?: number;
}

/**
 * ScrambleText — a "decode" effect: the string starts as random code/symbols
 * and resolves left-to-right into the real words (hacker/terminal feel).
 *
 * Layout-safe: an invisible copy of the final text reserves the exact wrapped
 * height, and the scrambling text is overlaid absolutely on top — so the page
 * below never reflows while it decodes. Reduced motion → plain text.
 */
export function ScrambleText({
  text,
  as: Tag = "span",
  className,
  delay = 0,
  duration = 1300,
}: ScrambleTextProps): ReactElement {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(() =>
    reduced ? text : scramble(text),
  );
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(text);
      return;
    }
    const n = text.length;
    // Per-character reveal window: staggered start (left→right) + a scramble tail.
    const windows = Array.from({ length: n }, (_, i) => {
      const begin = (i / n) * duration * 0.55 + delay;
      const end = begin + duration * 0.35 + Math.random() * duration * 0.25;
      return { begin, end };
    });

    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = ts - startTs;
      let out = "";
      let done = true;
      for (let i = 0; i < n; i++) {
        const ch = text[i];
        if (ch === " ") {
          out += " ";
          continue;
        }
        if (t >= windows[i].end) {
          out += ch;
        } else {
          out += rnd();
          done = false;
        }
      }
      setDisplay(out);
      if (done) setDisplay(text);
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, delay, duration, reduced]);

  if (reduced) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag className={cn("relative", className)} aria-label={text}>
      {/* Reserve final layout so the page never reflows during decode. */}
      <span aria-hidden className="invisible">
        {text}
      </span>
      {/* Overlaid scrambling text. */}
      <span aria-hidden className="absolute inset-0">
        {display}
      </span>
    </Tag>
  );
}

/** Split a phrase into two roughly balanced lines (by word count). */
function splitTwoLines(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/**
 * Blinking digital caret: solid while typing, then blinks 3 times once idle and
 * disappears. `repeat: 2` plays the blink cycle 3 times total; once the whole
 * animation completes, the caret unmounts.
 */
function Caret({ blink }: { blink: boolean }): ReactElement | null {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <motion.span
      aria-hidden
      className="inline-block bg-foreground"
      style={{
        width: "0.07em",
        height: "0.82em",
        marginLeft: "0.04em",
        transform: "translateY(0.1em)",
      }}
      animate={blink ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
      transition={
        blink
          ? { duration: 1.05, repeat: 2, ease: "linear", times: [0, 0.5, 0.5, 1] }
          : { duration: 0.12 }
      }
      onAnimationComplete={() => {
        if (blink) setHidden(true);
      }}
    />
  );
}

interface TypewriterProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Override the line breaks instead of the auto midpoint split. */
  lines?: string[];
  /** Base ms per character (jittered slightly for a natural feel). */
  speed?: number;
  /** Natural pause between finishing one line and starting the next (ms). */
  linePause?: number;
  /** Delay before typing begins (ms). */
  startDelay?: number;
}

/**
 * Typewriter — a digital typing effect: characters appear one at a time with a
 * lightly jittered cadence, the line splits with a natural pause between them,
 * and a blinking line cursor trails the text — solid while typing, blinking
 * once the headline is complete. Reduced motion → full text, static caret.
 *
 * Layout-safe: an invisible copy of the final lines reserves the exact height
 * so the page below never reflows as the text types in.
 */
export function Typewriter({
  text,
  as: Tag = "span",
  className,
  lines: linesProp,
  speed = 62,
  linePause = 480,
  startDelay = 250,
}: TypewriterProps): ReactElement {
  const reduced = useReducedMotion();
  const lines = linesProp ?? splitTwoLines(text);
  const total = lines.reduce((n, l) => n + l.length, 0);

  const [typed, setTyped] = useState(reduced ? total : 0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (reduced) {
      setTyped(total);
      return;
    }
    setTyped(0);
    let count = 0;
    let cancelled = false;

    // Cumulative char index at which each line ends — used to insert the pause.
    const lineEnds: number[] = [];
    let acc = 0;
    for (const l of lines) {
      acc += l.length;
      lineEnds.push(acc);
    }

    const step = () => {
      if (cancelled) return;
      count += 1;
      setTyped(count);
      if (count >= total) return;
      const atLineBreak = lineEnds.includes(count) && count < total;
      const jitter = (Math.random() - 0.5) * speed * 0.7;
      const delay = atLineBreak ? linePause : Math.max(22, speed + jitter);
      timer.current = setTimeout(step, delay);
    };
    timer.current = setTimeout(step, startDelay);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, linePause, startDelay, reduced]);

  // Slice each line to its typed length; track which line the cursor sits on.
  let remaining = typed;
  let cursorLine = 0;
  const visible = lines.map((l, i) => {
    const take = Math.min(l.length, Math.max(0, remaining));
    if (take > 0) cursorLine = i;
    remaining -= l.length;
    return l.slice(0, take);
  });
  const done = typed >= total;

  return (
    <Tag className={cn("relative", className)} aria-label={text}>
      {/* Reserve final layout so the page never reflows while it types. */}
      <span aria-hidden className="invisible">
        {lines.map((l, i) => (
          <span key={i} className="block whitespace-pre">
            {l}
          </span>
        ))}
      </span>
      {/* Overlaid typing text with a trailing caret. */}
      <span aria-hidden className="absolute inset-0">
        {visible.map((l, i) => (
          <span key={i} className="block whitespace-pre">
            {l}
            {i === cursorLine && <Caret blink={done || reduced} />}
          </span>
        ))}
      </span>
    </Tag>
  );
}

interface WordRevealProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Delay before the first word reveals (s). */
  delay?: number;
  /** Seconds between each word. */
  stagger?: number;
}

/**
 * WordReveal — words "focus in" one by one: each rises slightly and sharpens
 * from a blur. A calmer, refined counterpart to the headline's decode, so the
 * subtext settles into place after the title resolves. Reduced motion → plain.
 */
export function WordReveal({
  text,
  as: Tag = "p",
  className,
  delay = 0,
  stagger = 0.045,
}: WordRevealProps): ReactElement {
  const reduced = useReducedMotion();
  if (reduced) {
    return <Tag className={className}>{text}</Tag>;
  }

  const words = text.split(" ");

  return (
    <Tag className={className} aria-label={text}>
      <motion.span
        aria-hidden
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: stagger, delayChildren: delay },
          },
        }}
      >
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="inline-block whitespace-pre"
            variants={{
              hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
              show: { opacity: 1, y: 0, filter: "blur(0px)" },
            }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            {word + (i < words.length - 1 ? " " : "")}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}
