import {
  type KeyboardEvent as ReactKeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, type Transition, type Variants } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";

export interface SolutionItem {
  key: string;
  title: string;
  heading: string;
  copy: string;
  image: string;
  offer: { name: string; copy: string }[];
  href?: string;
}

interface SolutionExplorerProps {
  items: SolutionItem[];
  reduceMotion: boolean | null;
}

const ID_PREFIX = "solutions-industry";

/* One spring for everything that moves with the selection: the pill, the card
 * height, and the copy. Shared so the bar and the card land on the same beat. */
const SPRING: Transition = { type: "spring", stiffness: 380, damping: 36, mass: 0.9 };

/* The new photo wipes in from the side the visitor moved toward while the old
 * one drifts the other way underneath it. */
const imageVariants: Variants = {
  enter: (direction: number) => ({
    clipPath: direction > 0 ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)",
    scale: 1.12,
    zIndex: 1,
  }),
  center: {
    clipPath: "inset(0% 0% 0% 0%)",
    scale: 1,
    zIndex: 1,
    transition: { duration: 0.75, ease: EASE },
  },
  exit: (direction: number) => ({
    x: `${direction * -24}%`,
    zIndex: 0,
    transition: { duration: 0.75, ease: EASE },
  }),
};

const copyVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: {
    opacity: 1,
    x: 0,
    transition: { x: SPRING, opacity: { duration: 0.3, ease: EASE }, staggerChildren: 0.05, delayChildren: 0.06 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -20,
    transition: { duration: 0.2, ease: EASE },
  }),
};

const lineVariants: Variants = {
  enter: { opacity: 0, y: 10, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: EASE } },
};

const still: Variants = { enter: {}, center: {}, exit: {} };

/**
 * Phone view of the Solutions section: one card that swaps between the
 * verticals, with the selector docked under it. The selector stays reachable
 * at the bottom of the screen while the card is long enough to scroll.
 */
const SolutionExplorer = ({ items, reduceMotion }: SolutionExplorerProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [bodyHeight, setBodyHeight] = useState<number | "auto">("auto");
  const measureRef = useRef<HTMLDivElement>(null);
  const current = items[activeIndex] ?? items[0];

  // The copy differs in length per vertical. Track the live height so the card
  // grows or shrinks on the spring instead of jumping.
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBodyHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!current) return null;

  const select = (index: number) => {
    if (index === activeIndex) return;
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextIndex: number | null = null;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + items.length) % items.length;
    else if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % items.length;
    if (nextIndex === null) return;

    event.preventDefault();
    select(nextIndex);
    document.getElementById(`${ID_PREFIX}-tab-${nextIndex}`)?.focus();
  };

  const motionOn = !reduceMotion;
  const image = motionOn ? imageVariants : still;
  const copy = motionOn ? copyVariants : still;
  const line = motionOn ? lineVariants : still;

  return (
    <Reveal className="landing-solution" delay={0.1}>
      <div
        className="landing-solution-card"
        id={`${ID_PREFIX}-panel`}
        role="tabpanel"
        aria-labelledby={`${ID_PREFIX}-tab-${activeIndex}`}
        tabIndex={0}
      >
        <div className="landing-solution-media">
          <AnimatePresence initial={false} custom={direction}>
            <motion.img
              key={current.key}
              src={current.image}
              alt=""
              decoding="async"
              custom={direction}
              variants={image}
              initial="enter"
              animate="center"
              exit="exit"
            />
          </AnimatePresence>
        </div>

        <motion.div
          className="landing-solution-body"
          initial={false}
          animate={{ height: bodyHeight }}
          transition={motionOn ? SPRING : { duration: 0 }}
        >
          <div className="landing-solution-measure" ref={measureRef}>
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.div
                key={current.key}
                className="landing-solution-copy"
                custom={direction}
                variants={copy}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.h3 variants={line}>{current.heading}</motion.h3>
                <motion.p variants={line} className="landing-solution-lede">{current.copy}</motion.p>
                <ul className="landing-solution-offer">
                  {current.offer.map((offer) => (
                    <motion.li variants={line} key={offer.name}>
                      <span className="landing-industry-offer-name">{offer.name}</span>
                      <span className="landing-industry-offer-copy">{offer.copy}</span>
                    </motion.li>
                  ))}
                </ul>
                {current.href ? (
                  <motion.div variants={line} className="landing-solution-actions">
                    <a
                      className="landing-solution-more"
                      href={current.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>See more</span>
                      <ArrowUpRight size={17} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                  </motion.div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <div
        className="landing-solution-bar"
        role="tablist"
        aria-orientation="horizontal"
        aria-label="Choose a solution"
        onKeyDown={handleTabKeyDown}
      >
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              type="button"
              role="tab"
              id={`${ID_PREFIX}-tab-${index}`}
              aria-controls={`${ID_PREFIX}-panel`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              key={item.key}
              className={isActive ? "is-active" : undefined}
              onClick={() => select(index)}
            >
              {isActive ? (
                <motion.span
                  className="landing-solution-pill"
                  layoutId="landing-solution-pill"
                  transition={motionOn ? SPRING : { duration: 0 }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="landing-solution-label">{item.title}</span>
            </button>
          );
        })}
      </div>
    </Reveal>
  );
};

export default SolutionExplorer;
