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

interface SpreadTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Override the line breaks instead of the auto midpoint split. */
  lines?: string[];
  /** How fast the random glyphs flood out from the first letter (ms). */
  spreadMs?: number;
  /** How long the flooded glyphs take to resolve into real text (ms). */
  decodeMs?: number;
}

/**
 * SpreadText — a 2D "flood + decode" headline effect.
 *
 * Phase 1 (spread): starts as a single random glyph at the top-left, then
 * floods outward one cell at a time — to the right and downward (Manhattan
 * wavefront) — until the whole two-line grid is full of constantly-randomizing
 * glyphs. Phase 2 (decode): those glyphs resolve, outward in the same order,
 * into the real words.
 *
 * Layout-safe: an invisible copy of the final lines reserves the exact height;
 * the animated copy is overlaid with `whitespace-pre` so cell positions never
 * shift. Reduced motion → plain text.
 */
export function SpreadText({
  text,
  as: Tag = "span",
  className,
  lines: linesProp,
  spreadMs = 450,
  decodeMs = 850,
}: SpreadTextProps): ReactElement {
  const reduced = useReducedMotion();
  const lines = linesProp ?? splitTwoLines(text);

  // Per-cell timeline: when it floods in, and when it finishes decoding.
  const schedule = useRef(
    lines.map((line, r) =>
      [...line].map((ch, c) => {
        const dist = r + c;
        return { ch, dist };
      }),
    ),
  );
  // Recompute when the text changes.
  schedule.current = lines.map((line, r) =>
    [...line].map((ch, c) => ({ ch, dist: r + c })),
  );

  const maxDist = Math.max(
    1,
    ...schedule.current.flatMap((row) => row.map((cell) => cell.dist)),
  );

  const [display, setDisplay] = useState<string[]>(() =>
    reduced ? lines : lines.map((l) => " ".repeat(l.length)),
  );
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(lines);
      return;
    }
    const perDist = spreadMs / maxDist;
    const decodeStart = spreadMs + 120;

    // Stable per-cell decode end time so resolution doesn't jitter frame to frame.
    const decodeEnd = schedule.current.map((row) =>
      row.map((cell) => {
        const lead = (cell.dist / maxDist) * decodeMs * 0.55;
        const tail = decodeMs * 0.25 + Math.random() * decodeMs * 0.3;
        return decodeStart + lead + tail;
      }),
    );

    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = ts - startTs;
      let done = true;
      const out = schedule.current.map((row, r) => {
        let line = "";
        for (let c = 0; c < row.length; c++) {
          const { ch, dist } = row[c];
          if (ch === " ") {
            line += " ";
            continue;
          }
          const appear = dist * perDist;
          if (t < appear) {
            line += " "; // not yet flooded in
            done = false;
          } else if (t < decodeEnd[r][c]) {
            line += rnd(); // flooded — keep randomizing
            done = false;
          } else {
            line += ch; // resolved
          }
        }
        return line;
      });
      setDisplay(out);
      if (done) {
        setDisplay(lines);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, spreadMs, decodeMs, reduced]);

  if (reduced) {
    return (
      <Tag className={className}>
        {lines.map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag className={cn("relative", className)} aria-label={text}>
      {/* Reserve final layout so the page never reflows while it floods. */}
      <span aria-hidden className="invisible">
        {lines.map((l, i) => (
          <span key={i} className="block whitespace-pre">
            {l}
          </span>
        ))}
      </span>
      {/* Overlaid flooding/decoding text. whitespace-pre keeps cells aligned. */}
      <span aria-hidden className="absolute inset-0">
        {display.map((l, i) => (
          <span key={i} className="block whitespace-pre">
            {l}
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
