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
