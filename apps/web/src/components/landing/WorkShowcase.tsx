import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { ShippedProject } from "@/hooks/usePortfolio";
import {
  CaseStudyFlipStack,
  type CaseStudyFlipItem,
} from "@/components/ui/case-study-flip-stack";

/** Card geometry, kept in the same common landscape ratio as V1. */
const CARD_MIN = 300;
const CARD_MAX = 720;
/**
 * The six live screenshots cluster around 1.76:1. The flip stack uses that
 * common ratio for its shared card slot, while V2's image rule is `contain` so
 * the source image is never cropped when an individual row is wider or taller.
 */
const CARD_RATIO = 1 / 1.76;
const CARD_SHARE = 0.9;
const SPREAD_X = 0.08;
const SPREAD_Y = 0.11;

interface WorkShowcaseProps {
  project: ShippedProject[];
}

function toStackItem(project: ShippedProject): CaseStudyFlipItem {
  return {
    eyebrow: "",
    title: project.title,
    description: project.blurb,
    image: project.screenshotUrl ?? "",
    imageAlt: `${project.title} website screenshot`,
    background: "transparent",
  };
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
      setActive(Math.min(total - 1, Math.floor(progress * total)));
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

  // The stack still receives a pixel size so its visual geometry stays exactly
  // as stable as V1 while the document is being resized.
  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.round(
        Math.min(CARD_MAX, height / CARD_RATIO, Math.max(CARD_MIN, width * CARD_SHARE)),
      );
      setCard({ w, h: Math.round(w * CARD_RATIO) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [total]);

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
      className="work work-v2"
      id="work"
      aria-label="Portfolio — projects we have shipped"
      style={{ ["--work-steps" as string]: total - 1 }}
    >
      <div className="work-stage">
        <div className="work-stage-inner">
          <div className="work-copy">
            <h2 className="work-copy-eyebrow">Our projects</h2>

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
            <CaseStudyFlipStack
              items={project.map(toStackItem)}
              width={card.w}
              height={card.h}
              cardDistance={Math.round(card.w * SPREAD_X)}
              verticalDistance={Math.round(card.h * SPREAD_Y)}
              activeIndex={active}
              instant={Boolean(reduceMotion)}
              onCardClick={openCard}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkShowcase;
