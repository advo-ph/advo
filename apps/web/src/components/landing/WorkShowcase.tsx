import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { ShippedProject } from "@/hooks/usePortfolio";
import CardSwap, { Card } from "./CardSwap";

/** Screens of scroll each card past the first is given. */
const STEP_VH = 0.72;

/** Card geometry, all derived from the width the stage can spare. */
const CARD_MIN = 300;
const CARD_MAX = 720;
/**
 * 9/16. Prince, 09-03: "make sure the cards for work has the same ratio as the
 * images, js use the common ratio". Measured across the six live rows: 1.760,
 * 1.757, 1.776, 1.728, then 1.905 and 2.009. Four sit on 16:9, so 16:9 is the
 * ratio — it crops the two outliers by 7% and 11% instead of cropping the
 * majority by 17%, which is what the old 3:2 card was doing.
 */
const CARD_RATIO = 0.5625;
const CARD_SHARE = 0.9;
/**
 * Lean, as a fraction of the card. Tighter than CardSwap's default, and it has
 * to be: upstream demos three cards, the portfolio runs six, and at the default
 * spread the back of a six-card stack lands 200px past the right edge.
 */
const SPREAD_X = 0.08;
const SPREAD_Y = 0.11;

interface WorkShowcaseProps {
  project: ShippedProject[];
}

const WorkShowcase = ({ project }: WorkShowcaseProps) => {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [card, setCard] = useState({ w: 440, h: 290 });

  const total = project.length;

  useEffect(() => {
    const node = trackRef.current;
    if (!node || total === 0) return;

    let raf = 0;
    const read = () => {
      raf = 0;
      const rect = node.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) {
        setActive(0);
        return;
      }
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      setActive(Math.round(progress * (total - 1)));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [total]);

  // CardSwap takes pixel dimensions, so the responsive step has to happen here
  // rather than in the stylesheet. Layout effect, or the first paint ships the
  // fallback size and the deck visibly resizes under the reader.
  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Width alone is not enough. On the one-column layout the stage is the
      // full page wide but only a third of a screen tall, so a width-only card
      // hangs half its height out of its own slot. Whichever axis runs out
      // first decides the card.
      const w = Math.round(
        Math.min(CARD_MAX, height / CARD_RATIO, Math.max(CARD_MIN, width * CARD_SHARE)),
      );
      setCard({ w, h: Math.round(w * CARD_RATIO) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [total]);

  // Never a heading over an empty rail. No rows, no section.
  if (total === 0) return null;

  const current = project[Math.min(active, total - 1)];
  const href = current.live_url ?? (current.slug ? `/project/${current.slug}` : null);
  const label = current.live_url ? "View site" : "View project";

  const openCard = (index: number) => {
    const item = project[index];
    if (item?.live_url) window.open(item.live_url, "_blank", "noopener,noreferrer");
  };

  return (
    <section
      ref={trackRef}
      className="work"
      id="work"
      aria-label="Work we have shipped"
      style={{ ["--work-steps" as string]: total - 1 }}
    >
      <div className="work-stage">
        <div className="work-stage-inner">
          <div className="work-copy">
            <h2 className="work-copy-eyebrow">Our projects</h2>

            {/* Keyed on the index so React remounts it, which is what replays
                the entrance. A transition would need the old and new copy in
                the DOM at once for no gain at this size. */}
            <div className="work-copy-swap" key={current.portfolio_project_id}>
              <p className="work-copy-title">{current.title}</p>
              {current.blurb ? <p className="work-copy-desc">{current.blurb}</p> : null}
              {href ? (
                current.live_url ? (
                  <a
                    className="work-copy-link"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>{label}</span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </a>
                ) : (
                  <Link className="work-copy-link" to={href}>
                    <span>{label}</span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                )
              ) : null}
            </div>
          </div>

          <div className="work-cards" ref={stageRef}>
            <CardSwap
              width={card.w}
              height={card.h}
              cardDistance={Math.round(card.w * SPREAD_X)}
              verticalDistance={Math.round(card.h * SPREAD_Y)}
              skewAmount={5}
              activeIndex={active}
              instant={Boolean(reduceMotion)}
              onCardClick={openCard}
            >
              {project.map((item) => (
                <Card key={item.portfolio_project_id} customClass="work-card">
                  <img src={item.screenshotUrl ?? ""} alt={`${item.title} website`} loading="lazy" />
                  <span className="work-card-label">{item.title}</span>
                </Card>
              ))}
            </CardSwap>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkShowcase;
