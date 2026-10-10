import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import type { ShippedProject } from "@/hooks/usePortfolio";

/**
 * The portfolio as a scroll flight. The title holds the center with the
 * screenshots far behind it. Scrolling flies the camera through the title and
 * then through a spiral of screenshots, each passing beside you. At the end the
 * screenshots come back out of the distance and lock into one wall under the
 * title. Scroll position is the only clock, so scrolling back plays it in
 * reverse. The stage is sticky; scrolling itself is never taken over.
 *
 * Every number below is in "screens" of scroll (1 = one stage height), so the
 * pacing reads the same on a phone and on a desktop.
 */
const INTRO = 0.3;
const PER_CARD = 0.24;
const ASSEMBLE = 0.4;
/** Barely any: once the wall is up, the page moves on. */
const HOLD = 0.04;
const ASSEMBLE_STAGGER = 0.035;
/** The wall starts forming this early, behind the last cards still flying. */
const WALL_LEAD = 0.2;

/** Screenshots cluster around this ratio. */
const CARD_RATIO = 1.76;
/** Golden angle: each card lands on the opposite side from the one before it. */
const SPIRAL_STEP = (137.5 * Math.PI) / 180;
const SPIRAL_START = (200 * Math.PI) / 180;
/** How far a card orbits per depth gap as it flies in. */
const SPIRAL_TWIST = (40 * Math.PI) / 180;
const NAV_HEIGHT = 68;

interface WorkShowcaseProps {
  project: ShippedProject[];
}

interface Layout {
  w: number;
  h: number;
  /** Perspective distance. */
  persp: number;
  /** Depth gap between two cards in the flight. */
  gap: number;
  cardW: number;
  rx: number;
  ry: number;
  titleY: number;
  cells: { x: number; y: number; scale: number }[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (v: number, from: number, to: number) => clamp01((v - from) / (to - from));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * When card i sets off for the wall: in order, but never while it is still
 * flying. A card has faded out 0.56 of a slot after it crosses the screen plane
 * (fade ends at persp * 0.42, and a slot is persp * 0.75 deep), plus a margin.
 */
function wallStart(i: number, total: number) {
  const flightEnd = INTRO + total * PER_CARD;
  const leftFlight = INTRO + PER_CARD * (i + 1.2);
  return Math.max(flightEnd - WALL_LEAD + i * ASSEMBLE_STAGGER, leftFlight);
}

function travelFor(total: number) {
  return wallStart(total - 1, total) + ASSEMBLE + HOLD;
}

function measure(stage: HTMLElement, title: HTMLElement, total: number): Layout {
  const w = stage.clientWidth;
  const h = stage.clientHeight - NAV_HEIGHT;
  const wide = w / h > 1.1;
  const persp = wide ? Math.max(w, h) * 0.9 : h;
  const cardW = wide ? Math.min(700, Math.max(320, w * 0.4)) : w * 0.84;

  // The closing wall: three across on wide screens, two on tall ones.
  const cols = Math.min(total, wide ? 3 : 2);
  const rows = Math.ceil(total / cols);
  const pad = wide ? 48 : 24;
  const gutter = wide ? 40 : 20;
  const cellGap = wide ? 20 : 10;
  const titleH = title.offsetHeight;
  const titleGap = wide ? 40 : 24;
  const maxGridW = Math.min(1180, w - gutter * 2);
  const maxGridH = h - pad * 2 - titleH - titleGap;
  const cellW = Math.max(
    80,
    Math.min(
      (maxGridW - (cols - 1) * cellGap) / cols,
      ((maxGridH - (rows - 1) * cellGap) / rows) * CARD_RATIO,
    ),
  );
  const cellH = cellW / CARD_RATIO;
  const gridH = rows * cellH + (rows - 1) * cellGap;
  const top = -(titleH + titleGap + gridH) / 2;

  const cells = Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? total - row * cols : cols;
    const col = i - row * cols;
    const rowW = inRow * cellW + (inRow - 1) * cellGap;
    return {
      x: -rowW / 2 + cellW / 2 + col * (cellW + cellGap),
      y: top + titleH + titleGap + cellH / 2 + row * (cellH + cellGap),
      scale: cellW / cardW,
    };
  });

  return {
    w,
    h,
    persp,
    gap: persp * 0.75,
    cardW,
    rx: wide ? w * 0.24 : w * 0.14,
    ry: wide ? h * 0.2 : h * 0.2,
    titleY: top + titleH / 2,
    cells,
  };
}

const WorkShowcase = ({ project }: WorkShowcaseProps) => {
  const reduceMotion = Boolean(useReducedMotion());
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const layoutRef = useRef<Layout | null>(null);

  const total = project.length;
  const travel = travelFor(total);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const title = titleRef.current;
    if (reduceMotion || !stage || !title || total === 0) return;
    const update = () => {
      const layout = measure(stage, title, total);
      layoutRef.current = layout;
      stage.style.setProperty("--showcase-card-w", `${layout.cardW}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    observer.observe(title);
    return () => observer.disconnect();
  }, [reduceMotion, total]);

  useEffect(() => {
    const section = sectionRef.current;
    const scene = sceneRef.current;
    const title = titleRef.current;
    const world = scene?.firstElementChild as HTMLElement | null;
    if (reduceMotion || !section || !scene || !world || !title || total === 0) return;

    const cards = cardRefs.current.slice(0, total);
    const flightEnd = INTRO + total * PER_CARD;
    const fine = matchMedia("(pointer: fine)").matches;

    // Smoothed values chase their targets every frame, which gives the flight
    // its weight. The loop sleeps once everything has caught up.
    let shown = -1;
    let velocity = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    let last = 0;
    let visible = false;

    const target = () => {
      const rect = section.getBoundingClientRect();
      const run = rect.height - window.innerHeight;
      return run > 0 ? clamp01(-rect.top / run) * travel : 0;
    };

    const render = (s: number) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const { persp, gap, rx, ry } = layout;
      // Scrolling fast widens the lens a little, like picking up speed.
      const warp = Math.min(1, Math.abs(velocity) * 10);
      scene.style.perspective = `${persp * (1 - warp * 0.22)}px`;

      // The mouse moves the camera: near cards shift, far ones hold still.
      const wallIn = easeOut(span(s, flightEnd - WALL_LEAD, travel - HOLD));
      const tilt = (1 - wallIn) * 6;
      world.style.transform = `translate3d(${(-pointer.x * 24).toFixed(2)}px, ${(-pointer.y * 16).toFixed(2)}px, 0) rotateX(${(tilt - pointer.y * 2).toFixed(3)}deg) rotateY(${(pointer.x * 3).toFixed(3)}deg)`;

      // Title: zoom through it on the way in, it settles above the wall at the end.
      let tz = 0;
      let ty = 0;
      let tOpacity = 1;
      if (s < flightEnd / 2) {
        tz = easeIn(span(s, 0.04, INTRO * 0.9)) * persp * 0.55;
        tOpacity = 1 - span(s, INTRO * 0.3, INTRO * 0.8);
      } else {
        // After the last card has flown off, so nothing crosses the title.
        const titleIn = Math.max(wallStart(0, total) + ASSEMBLE * 0.25, wallStart(total - 1, total) - ASSEMBLE * 0.1);
        const t = easeOut(span(s, titleIn, titleIn + ASSEMBLE * 0.6));
        tz = -(1 - t) * persp * 0.4;
        ty = layout.titleY;
        tOpacity = t;
      }
      title.style.transform = `translate3d(-50%, calc(-50% + ${ty.toFixed(2)}px), ${tz.toFixed(2)}px)`;
      title.style.opacity = tOpacity.toFixed(3);
      title.style.visibility = tOpacity < 0.01 ? "hidden" : "visible";

      // Camera depth: card i crosses the screen plane halfway through its slot.
      const cam = gap * (1 + (s - INTRO - PER_CARD / 2) / PER_CARD);
      // The title stands alone at first; the cards arrive as you fly through it.
      const arrive = smooth(span(s, INTRO * 0.25, INTRO * 0.8));

      cards.forEach((card, i) => {
        if (!card) return;
        const cell = layout.cells[i];
        const start = wallStart(i, total);
        const assemble = easeOut(span(s, start, start + ASSEMBLE));

        let x: number;
        let y: number;
        let z: number;
        let scale: number;
        let rotY: number;
        let rotX: number;
        let rotZ = 0;
        let opacity: number;

        if (assemble > 0) {
          // The wall: each card returns from deep space and locks into its cell.
          x = cell.x;
          y = cell.y;
          z = -(1 - assemble) * persp * 1.8;
          scale = cell.scale;
          rotY = 0;
          rotX = (1 - assemble) * -18;
          opacity = smooth(span(assemble, 0, 0.45));
        } else {
          // Capped short of the camera: past it, the projection blows the card
          // up without limit and the browser runs out of memory drawing it.
          z = Math.min(cam - gap * (i + 1), persp * 0.42);
          const angle = SPIRAL_START + i * SPIRAL_STEP + (z / gap) * SPIRAL_TWIST;
          // Far cards tumble; they square up as they come close, then swing
          // wide past your shoulders instead of through your face.
          const far = clamp01(-z / (gap * 3));
          const pass = 1 + (Math.max(0, z + gap * 0.5) / persp) * 2.4;
          x = Math.cos(angle) * rx * pass;
          y = Math.sin(angle) * ry * pass;
          scale = 1;
          rotY = -Math.cos(angle) * (14 + 26 * far);
          rotX = Math.sin(angle) * (8 + 14 * far) + velocity * 260;
          rotZ = (i % 2 ? 1 : -1) * 16 * far;
          // Fog in from the far end, gone just before it reaches the viewer.
          opacity =
            arrive * smooth(span(z, -gap * 4.2, -gap * 3)) * (1 - smooth(span(z, persp * 0.18, persp * 0.42)));
        }

        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.visibility = opacity < 0.01 ? "hidden" : "visible";
        card.style.pointerEvents = opacity > 0.6 ? "auto" : "none";
      });
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const goal = target();
      if (shown < 0) shown = goal;
      const ease = 1 - Math.exp(-dt * 7);
      const step = (goal - shown) * ease;
      shown += step;
      velocity += (step / Math.max(dt * 60, 0.5) - velocity) * 0.2;
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      render(shown);

      const settled =
        Math.abs(goal - shown) < 0.0005 &&
        Math.abs(velocity) < 0.0002 &&
        Math.abs(pointer.tx - pointer.x) < 0.001 &&
        Math.abs(pointer.ty - pointer.y) < 0.001;
      if (visible && !settled) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const kick = () => {
      if (visible && !raf) raf = requestAnimationFrame(frame);
    };

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
      kick();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          shown = -1;
          kick();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(section);

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [reduceMotion, total, travel]);

  if (total === 0) return null;

  // A keyboard user tabbing onto a card jumps to the wall, where every card shows.
  const showWall = () => {
    const section = sectionRef.current;
    if (reduceMotion || !section) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + section.offsetHeight - window.innerHeight, behavior: "instant" });
  };

  return (
    <section
      ref={sectionRef}
      className={`showcase${reduceMotion ? " is-static" : ""}`}
      id="work"
      aria-labelledby="showcase-title"
      style={{ ["--showcase-travel" as string]: travel }}
    >
      <div className="showcase-stage" ref={stageRef}>
        <div className="showcase-scene" ref={sceneRef}>
          <div className="showcase-world">
            <h2 className="showcase-title" id="showcase-title" ref={titleRef}>
              Businesses running on our technology
            </h2>
            <div className="showcase-grid">
              {project.map((item, i) => {
                const setRef = (node: HTMLElement | null) => {
                  cardRefs.current[i] = node;
                };
                const image = (
                  <img
                    src={item.screenshotUrl ?? ""}
                    srcSet={item.screenshotSrcSet}
                    sizes="(max-width: 760px) 100vw, 1200px"
                    alt={`${item.title} website`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                );
                if (item.live_url) {
                  return (
                    <a
                      key={item.portfolio_project_id}
                      ref={setRef}
                      className="showcase-card"
                      href={item.live_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onFocus={showWall}
                    >
                      {image}
                    </a>
                  );
                }
                if (item.slug) {
                  return (
                    <Link
                      key={item.portfolio_project_id}
                      ref={setRef}
                      className="showcase-card"
                      to={`/project/${item.slug}`}
                      onFocus={showWall}
                    >
                      {image}
                    </Link>
                  );
                }
                return (
                  <div key={item.portfolio_project_id} ref={setRef} className="showcase-card">
                    {image}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkShowcase;
