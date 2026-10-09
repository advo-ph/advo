import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { createTimeline, onScroll, splitText, stagger, type Timeline, type TextSplitter } from "animejs";
import { ArrowUpRight } from "lucide-react";
import { createServicesScene, type SceneState } from "./services-scene";

/**
 * Services as a full-screen 3D scene. It opens on a centered title with a
 * single glowing dot, which bursts into scattered dust as you scroll, and
 * then the Connect, Automate, and Grow chapters follow. Nothing is pinned: the chapter panels
 * scroll at normal speed, and the scene layer stays in view behind them.
 * anime.js maps scroll position to the scene state and the text reveals, so
 * scrolling back plays everything in reverse.
 */
interface Chapter {
  title: string;
  line: string;
  chips: string[];
}

const chapters: Chapter[] = [
  {
    title: "Connect",
    line: "Every part of your business in one system.",
    chips: ["Billing", "POS", "Scheduling", "Data migration"],
  },
  {
    title: "Automate",
    line: "AI that answers, books, and follows up.",
    chips: ["Calls", "Bookings", "Website chat", "Follow-ups"],
  },
  {
    title: "Grow",
    line: "Turn visitors into paying customers.",
    chips: ["Websites", "Lead capture", "Online booking", "Reporting"],
  },
];

export default function ServicesScroll() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (reduceMotion || !section || !canvas) return;

    const state: SceneState = { burst: 0, join: 0, flow: 0, settle: 0, spin: 0 };
    let scene: ReturnType<typeof createServicesScene> | null = null;
    try {
      scene = createServicesScene(canvas, state);
    } catch {
      // No WebGL: the chapters still read fine on the dark ground.
      canvas.hidden = true;
    }

    // One timeline, 1000 units long, scrubbed by the whole section's scroll:
    // from the section's top entering the screen to its bottom reaching the
    // bottom of the screen.
    const master: Timeline = createTimeline({
      defaults: { ease: "inOutSine" },
      autoplay: onScroll({
        target: section,
        enter: { target: "top", container: "bottom" },
        leave: { target: "bottom", container: "bottom" },
        sync: true,
      }),
    })
      .add(state, { burst: [0, 1], duration: 170 }, 230)
      .add(state, { join: [0, 1], duration: 110 }, 400)
      .add(state, { spin: [0, 1], duration: 1000, ease: "linear" }, 0)
      .add(state, { flow: [0, 1], duration: 150 }, 590)
      .add(state, { settle: [0, 1], duration: 190 }, 770)
      .add(".landing-services-progress", { opacity: [0, 1], duration: 60 }, 300)
      .add(barRef.current!, { scaleY: [0, 1], duration: 670, ease: "linear" }, 330);

    // Each panel reveals its own text as it rises into view.
    const splitters: TextSplitter[] = [];
    const reveals: Timeline[] = [];
    section.querySelectorAll<HTMLElement>(".landing-services-panel").forEach((panel) => {
      const title = panel.querySelector<HTMLElement>("h3");
      if (!title) return;
      const split = splitText(title, { words: { wrap: "clip" }, chars: true });
      splitters.push(split);
      const reveal = createTimeline({
        defaults: { ease: "outQuart" },
        autoplay: onScroll({
          target: panel,
          enter: { target: "top", container: "bottom" },
          leave: { target: "top", container: "top" },
          sync: true,
        }),
      })
        .add(split.chars, { y: ["110%", "0%"], rotate: [8, 0], duration: 500, delay: stagger(40) }, 0)
        .add(panel.querySelector("p")!, { opacity: [0, 1], y: [28, 0], duration: 400 }, 300)
        .add(panel.querySelectorAll("li"), { opacity: [0, 1], y: [20, 0], scale: [0.9, 1], duration: 300, delay: stagger(60) }, 450);
      const cta = panel.querySelector(".landing-services-cta");
      if (cta) reveal.add(cta, { opacity: [0, 1], y: [20, 0], duration: 300 }, 650);
      reveals.push(reveal);
    });

    // Only draw frames while the section is on screen.
    const io = new IntersectionObserver(([entry]) => scene?.setRunning(entry.isIntersecting), { rootMargin: "100px 0px" });
    io.observe(section);

    // The title lights up from its center once it is well on screen.
    const intro = introRef.current;
    const lightIo = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      intro?.classList.add("is-lit");
      lightIo.disconnect();
    }, { threshold: 0.6 });
    if (intro) lightIo.observe(intro);

    return () => {
      io.disconnect();
      lightIo.disconnect();
      // revert() also drops each timeline's scroll observer.
      [master, ...reveals].forEach((tl) => tl.revert());
      splitters.forEach((s) => s.revert());
      scene?.dispose();
    };
  }, [reduceMotion]);

  return (
    <section
      className={reduceMotion ? "landing-services is-static" : "landing-services"}
      id="services"
      aria-labelledby="services-heading"
      ref={sectionRef}
    >

      {!reduceMotion && (
        <div className="landing-services-stage-wrap" aria-hidden="true">
          <div className="landing-services-stage">
            <canvas ref={canvasRef} className="landing-services-canvas" />
            <span className="landing-services-progress"><span ref={barRef} /></span>
          </div>
        </div>
      )}

      <div className="landing-services-intro" ref={introRef}>
        <h2 id="services-heading">Prepare your business for AI modernization</h2>
      </div>

      {chapters.map((c, i) => (
        <article className="landing-services-panel" key={c.title}>
          <div className="landing-services-panel-copy">
            <h3>{c.title}</h3>
            <p>{c.line}</p>
            <ul className="landing-services-chips">
              {c.chips.map((chip) => <li key={chip}>{chip}</li>)}
            </ul>
            {i === chapters.length - 1 && (
              <a className="landing-services-cta" href="#start">
                <span>Plan your modernization</span>
                <ArrowUpRight size={17} strokeWidth={1.5} aria-hidden="true" />
              </a>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
