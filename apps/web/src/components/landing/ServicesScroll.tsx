import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { createTimeline, onScroll, stagger, type Timeline } from "animejs";
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

// Where text finishes fading in, as a share of the screen height from the top.
// Phones put it lower, so the text clears the model with more room.
const FADE_LINE = 0.62;
const PHONE_FADE_LINE = 0.68;
const PHONE = "(max-width: 680px)";

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

    // Tall screens put the model in the upper half, so the chapters scroll up
    // through it. Each chapter's text fades out as it rises past the model's
    // bottom edge. Only a mask moves; scrolling stays free.
    const stage = section.querySelector<HTMLElement>(".landing-services-stage");
    const copies = [...section.querySelectorAll<HTMLElement>(".landing-services-panel-copy")];
    let fadeFrame = 0;
    const updateFade = () => {
      fadeFrame = 0;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      // Same rule the scene uses to pick its layout.
      const tall = box.width / box.height <= 1.1;
      section.classList.toggle("is-tall", tall);
      if (!tall) return;
      const line = box.top + box.height * (matchMedia(PHONE).matches ? PHONE_FADE_LINE : FADE_LINE);
      copies.forEach((el) => el.style.setProperty("--landing-fade-line", `${line - el.getBoundingClientRect().top}px`));
    };
    const queueFade = () => {
      if (!fadeFrame) fadeFrame = requestAnimationFrame(updateFade);
    };
    // Capture, so it hears the scroll whichever element owns it.
    window.addEventListener("scroll", queueFade, { passive: true, capture: true });
    window.addEventListener("resize", queueFade);
    updateFade();

    // Phones overlap the chapters so there is no scroll without text (see the
    // CSS), which makes the section shorter than four screens. There each
    // morph plays while its chapter rises from the bottom of the screen to
    // the fade line, and the dust bursts as the title scrolls away.
    const phone = !!stage && section.classList.contains("is-tall") && matchMedia(PHONE).matches;
    let burstAt = [230, 170];
    let joinAt = [400, 110];
    let flowAt = [590, 150];
    let settleAt = [770, 190];
    if (phone) {
      const screen = stage.offsetHeight;
      const length = section.offsetHeight;
      const sectionTop = section.getBoundingClientRect().top;
      // Timeline position where the point `y` px into the section sits at
      // `share` of the screen height from the top.
      const when = (y: number, share: number) => ((y + (1 - share) * screen) / length) * 1000;
      const rise = (y: number) => [when(y, 1), when(y, PHONE_FADE_LINE) - when(y, 1)];
      const [connect, automate, grow] = copies.map((el) => el.getBoundingClientRect().top - sectionTop);
      burstAt = [when(0, 0.08), when(connect, 1) - when(0, 0.08)];
      joinAt = rise(connect);
      flowAt = rise(automate);
      settleAt = rise(grow);
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
      .add(state, { burst: [0, 1], duration: burstAt[1] }, burstAt[0])
      .add(state, { join: [0, 1], duration: joinAt[1] }, joinAt[0])
      .add(state, { spin: [0, 1], duration: 1000, ease: "linear" }, 0)
      .add(state, { flow: [0, 1], duration: flowAt[1] }, flowAt[0])
      .add(state, { settle: [0, 1], duration: settleAt[1] }, settleAt[0]);

    // Each panel reveals its line, list, and button as it rises into view.
    // The chapter title stays still.
    const reveals: Timeline[] = [];
    section.querySelectorAll<HTMLElement>(".landing-services-panel").forEach((panel) => {
      // Phones key the reveal to the text itself, which sits low in a short
      // panel, so it is whole well before it reaches the fade line.
      const reveal = createTimeline({
        defaults: { ease: "outQuart" },
        autoplay: onScroll({
          target: phone ? panel.querySelector<HTMLElement>(".landing-services-panel-copy")! : panel,
          enter: { target: "top", container: "bottom" },
          leave: { target: "top", container: phone ? "76%" : "top" },
          sync: true,
        }),
      })
        .add(panel.querySelector("p")!, { opacity: [0, 1], y: [28, 0], duration: 400 }, 300)
        .add(panel.querySelectorAll("li"), { opacity: [0, 1], y: [20, 0], scale: [0.9, 1], duration: 300, delay: stagger(60) }, 450);
      const cta = panel.querySelector(".landing-services-cta");
      if (cta) reveal.add(cta, { opacity: [0, 1], y: [20, 0], duration: 300 }, 650);
      reveals.push(reveal);
    });

    // Only draw frames while the section is on screen.
    const io = new IntersectionObserver(([entry]) => scene?.setRunning(entry.isIntersecting), { rootMargin: "100px 0px" });
    io.observe(section);

    // Reset the shadowed title as it leaves the reveal threshold, so the
    // center-out lighting replays whenever the intro comes back into view.
    const intro = introRef.current;
    const lightIo = new IntersectionObserver(([entry]) => {
      intro?.classList.toggle("is-lit", entry.isIntersecting && entry.intersectionRatio >= 0.6);
    }, { threshold: 0.6 });
    if (intro) lightIo.observe(intro);

    return () => {
      window.removeEventListener("scroll", queueFade, { capture: true });
      window.removeEventListener("resize", queueFade);
      cancelAnimationFrame(fadeFrame);
      section.classList.remove("is-tall");
      io.disconnect();
      lightIo.disconnect();
      intro?.classList.remove("is-lit");
      // revert() also drops each timeline's scroll observer.
      [master, ...reveals].forEach((tl) => tl.revert());
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
