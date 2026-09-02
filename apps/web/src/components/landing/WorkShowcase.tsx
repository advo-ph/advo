import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import type { ShippedProject } from "@/hooks/usePortfolio";

/**
 * One project, one screen.
 *
 * Prince, 09-02: "like Netflix or like how a movie preview would look like".
 * So the screenshot is the panel — full bleed, full viewport — and the only
 * type on top of it is the name, one line, and a text link. Anything else is
 * the card layout this replaced.
 */
interface WorkPanelProps {
  project: ShippedProject;
  index: number;
  total: number;
}

/**
 * Enters once and stays. A panel that re-hides on scroll-up reads as a bug at
 * this size — the whole screen would blank out under the reader.
 */
function useEnterOnce<T extends HTMLElement>(disabled: boolean) {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(disabled);

  useEffect(() => {
    if (disabled) {
      setEntered(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      // Fires a little before the panel is fully on screen, so the motion has
      // finished by the time the panel is the only thing being looked at.
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled]);

  return { ref, entered };
}

const WorkPanel = ({ project, index, total }: WorkPanelProps) => {
  const reduceMotion = useReducedMotion();
  const { ref, entered } = useEnterOnce<HTMLElement>(Boolean(reduceMotion));

  const label = project.live_url ? "View site" : project.slug ? "View project" : null;
  const href = project.live_url ?? (project.slug ? `/project/${project.slug}` : null);

  const action =
    !label || !href ? null : project.live_url ? (
      <a className="work-panel-link" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <Link className="work-panel-link" to={href}>
        {label}
      </Link>
    );

  return (
    <article
      ref={ref}
      className={entered ? "work-panel is-entered" : "work-panel"}
      aria-label={project.title}
    >
      <div className="work-panel-media">
        <img src={project.screenshotUrl ?? ""} alt={`${project.title} website`} loading="lazy" />
      </div>
      <div className="work-panel-scrim" aria-hidden="true" />

      <div className="work-panel-body">
        <span className="work-panel-count">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <h3 className="work-panel-title">{project.title}</h3>
        {project.blurb ? <p className="work-panel-desc">{project.blurb}</p> : null}
        {action}
      </div>
    </article>
  );
};

interface WorkShowcaseProps {
  project: ShippedProject[];
}

const WorkShowcase = ({ project }: WorkShowcaseProps) => {
  // Never a heading over an empty rail. No rows, no section.
  if (project.length === 0) return null;

  return (
    <section className="work" id="work" aria-label="Work we have shipped">
      {project.map((item, index) => (
        <WorkPanel
          key={item.portfolio_project_id}
          project={item}
          index={index}
          total={project.length}
        />
      ))}
    </section>
  );
};

export default WorkShowcase;
