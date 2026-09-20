import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* Uppercase latin, digits and a handful of symbols. Lowercase is left out on
   purpose: mixed-case noise reads as a typo, all-caps noise reads as cipher. */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*<>/";

/* A single rAF drives progress, but re-rolling every glyph at 60fps is a
   strobe rather than a decrypt. Glyphs churn on this slower clock instead. */
const CHURN_MS = 34;

type ScrambleTag = "span" | "div" | "p" | "h1" | "h2" | "h3";

interface ScrambleTextProps {
  text: string;
  /** ms from the first character cycling to the last one locking in. */
  duration?: number;
  /** ms of cipher held before the line starts resolving. */
  delay?: number;
  className?: string;
  as?: ScrambleTag;
}

const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

const cipherOf = (text: string) =>
  Array.from(text)
    .map((char) => (char === " " ? " " : randomGlyph()))
    .join("");

/**
 * Decrypt effect: the line starts as cipher and locks into the real string one
 * character at a time, left to right.
 */
const ScrambleText = ({
  text,
  duration = 560,
  delay = 0,
  className,
  as: Tag = "span",
}: ScrambleTextProps) => {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (reduceMotion ? text : cipherOf(text)));
  const glyphsRef = useRef<string[]>([]);

  /* Each word gets its own box so the line wraps exactly where the real string
     wraps. Whitespace stays a plain text node between them, which is what lets
     the browser break the line at all. */
  const tokens = useMemo(() => {
    let offset = 0;
    return text.split(/(\s+)/).map((value) => {
      const token = { value, offset, isSpace: /^\s+$/.test(value) };
      offset += Array.from(value).length;
      return token;
    });
  }, [text]);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(text);
      return;
    }

    const chars = Array.from(text);
    glyphsRef.current = chars.map(randomGlyph);

    let frame = 0;
    let startedAt = 0;
    let churnedAt = 0;

    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      if (now - churnedAt >= CHURN_MS) {
        churnedAt = now;
        glyphsRef.current = glyphsRef.current.map(randomGlyph);
      }

      const elapsed = now - startedAt - delay;
      const progress = elapsed <= 0 ? 0 : Math.min(elapsed / duration, 1);
      const head = progress * chars.length;

      setDisplay(
        chars
          // Spaces stay spaces so the word shape survives the whole transition.
          .map((char, i) => (char === " " ? " " : i < head ? char : glyphsRef.current[i]))
          .join(""),
      );

      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration, delay, reduceMotion]);

  if (reduceMotion) {
    return <Tag className={className}>{text}</Tag>;
  }

  const live = Array.from(display);

  return (
    <Tag className={className ? `team-scramble ${className}` : "team-scramble"} aria-label={text}>
      {/* The real string, for assistive tech only — everything drawn on screen
          below it is aria-hidden so a screen reader never reads the cipher. */}
      <span className="team-sr-only">{text}</span>
      {tokens.map((token, index) =>
        token.isSpace ? (
          <span key={index} aria-hidden="true">
            {token.value}
          </span>
        ) : (
          <span className="team-scramble-word" key={index} aria-hidden="true">
            {/* Invisible, but it is what holds the word's real width. */}
            <span className="team-scramble-reserve">{token.value}</span>
            <span className="team-scramble-live">
              {live.slice(token.offset, token.offset + Array.from(token.value).length).join("")}
            </span>
          </span>
        ),
      )}
    </Tag>
  );
};

export default ScrambleText;
