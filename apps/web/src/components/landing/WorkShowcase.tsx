import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { ShippedProject } from "@/hooks/usePortfolio";
import { Reveal } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import { getResponsiveImageUrl } from "@/lib/image-urls";
import { createDevicesScene } from "./devices-scene";

/**
 * The portfolio on a real 3D MacBook and iPhone (devices-scene.ts). The stage
 * pins while the page scrolls past it. Each project's screenshot wipes up over
 * the last one on the device screen and holds a while before the next one, but
 * the device turns in one slow sweep that follows the scroll from the first
 * project to the last, never holding or snapping back between projects. Phone projects show on the iPhone: where the scroll
 * crosses from a laptop project to a phone one, the MacBook closes and slides
 * away as the iPhone swings in.
 *
 * The screens and the device swap run off `pos`: the project in front, as a
 * fraction, with a hold at each project. The turn runs off `turn`: the same
 * span, straight off the scroll with no holds.
 * The text under the device follows whichever project is in front. A project
 * with a logo shows the logo in place of its title.
 */
const ENTER = 1.3;
const EXIT = 1;
/** Hold longer so each image wipe uses half its previous scroll distance.
 * Step lengths and the independent device turn stay unchanged. */
const DWELL = 0.76;
/** Give the laptop/phone animation 12.5% more scroll without changing the turn. */
const HANDOFF_DWELL = 0.46;
/** The scroll for a laptop to phone swap, as a share of a normal step. */
const HANDOFF = 0.5;

/**
 * Fallback for new logos without optical calibration: wide logos get shorter
 * and square ones taller. The known logos below use individually judged sizes.
 */
const LOGO_SHAPE = -0.25;

/** Optical sizes judged together on the page, rather than equal image bounds.
 * Offsets center the artwork where the source canvas has uneven padding.
 * Each height is relative to the shared responsive logo slot. */
const LOGO_STYLE: Record<string, CSSProperties> = {
  "/landing/logo/fourlinq.png": { "--work-logo-k": 0.89, "--work-logo-y": "2.48%" } as CSSProperties,
  "/landing/logo/vbe-eye-center.png": { "--work-logo-k": 0.97 } as CSSProperties,
  "/landing/logo/felici-artisan-gelato.png": { "--work-logo-k": 1.03, "--work-logo-x": "5.67%", "--work-logo-y": "-0.15%" } as CSSProperties,
  "/landing/logo/camps-ph.png": { "--work-logo-k": 0.83, "--work-logo-x": "1.23%" } as CSSProperties,
  "/landing/logo/floodpass.webp": { "--work-logo-k": 0.44, "--work-logo-x": "-1.615%", "--work-logo-y": "0.72%" } as CSSProperties,
  "/landing/logo/nokoji.webp": { "--work-logo-k": 0.89, "--work-logo-y": "0.17%" } as CSSProperties,
  "/landing/logo/pcedm-members.png": { "--work-logo-k": 0.89, "--work-logo-x": "0.84%" } as CSSProperties,
};

const projectLogoUrl = (url: string | null) => url === "/landing/logo/felici.webp"
  ? "/landing/logo/felici-artisan-gelato.png"
  : url === "/landing/logo/philippine-college-endocrinology.webp"
    ? "/landing/logo/pcedm-members.png"
  : url;

/** Projects shown on a phone, matched on the start of the title. */
const PHONE_PROJECTS = ["nokohi", "floodpass", "pcedm"];
const isPhone = (item: ShippedProject) => {
  const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PHONE_PROJECTS.some((name) => key.startsWith(name));
};

/**
 * How the scroll spreads over the projects. Each gap between two projects
 * gets one step of scroll, or less where the device swaps. Within a step the
 * project in front holds still for a while at each end, and the move between
 * them runs in the middle.
 */
function scrollPlan(phones: boolean[]) {
  const steps = phones.slice(1).map((phone, k) => (phone === phones[k] ? 1 : HANDOFF));
  const total = steps.reduce((sum, step) => sum + step, 0);
  /** Pin progress (0 to 1) to the project in front, as a fraction. */
  const posAt = (pin: number) => {
    let left = Math.min(1, Math.max(0, pin)) * total;
    for (const [k, step] of steps.entries()) {
      if (left <= step || k === steps.length - 1) {
        const hold = (step === HANDOFF ? HANDOFF_DWELL : DWELL) / 2;
        const t = Math.min(1, Math.max(0, (left / step - hold) / (1 - 2 * hold)));
        return k + t * t * (3 - 2 * t);
      }
      left -= step;
    }
    return 0;
  };
  return { total, posAt };
}

const infoBlock: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE, staggerChildren: 0.04 } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48, transition: { duration: 0.25, ease: EASE } }),
};

const wordIn: Variants = {
  enter: { opacity: 0, y: "0.35em" },
  show: { opacity: 1, y: "0em", transition: { duration: 0.5, ease: EASE } },
};

const fadeIn: Variants = {
  enter: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

interface WorkShowcaseProps {
  project: ShippedProject[];
}

/** The project's live site when it has one, else its own page, else nothing. */
function ProjectLink({
  item,
  className,
  children,
  hidden,
}: {
  item: ShippedProject;
  className: string;
  children: ReactNode;
  hidden?: boolean;
}) {
  // The screenshot repeats the text link, so it stays out of the tab order.
  const extra = hidden ? { tabIndex: -1, "aria-hidden": true } : {};
  if (item.live_url) {
    return (
      <a className={className} href={item.live_url} target="_blank" rel="noopener noreferrer" {...extra}>
        {children}
      </a>
    );
  }
  if (item.slug) {
    return (
      <Link className={className} to={`/project/${item.slug}`} {...extra}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

const WorkShowcase = ({ project }: WorkShowcaseProps) => {
  const reduceMotion = Boolean(useReducedMotion());
  const trackRef = useRef<HTMLDivElement>(null);
  const [{ active, dir }, setFront] = useState({ active: 0, dir: 1 });

  const count = project.length;
  const shotKey = project.map((card) => `${card.screenshotUrl}|${isPhone(card) ? 1 : 0}`).join(",");
  // shotKey stands in for `project`, whose identity changes on every fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => scrollPlan(project.map(isPhone)), [shotKey]);
  const { scrollYProgress: enterProgress } = useScroll({ target: trackRef, offset: ["start end", "start start"] });
  const { scrollYProgress: pinProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const { scrollYProgress: exitProgress } = useScroll({ target: trackRef, offset: ["end end", "end start"] });

  const rawPos = useTransform(
    [enterProgress, pinProgress, exitProgress],
    ([enter, pin, exit]: number[]) => (enter - 1) * ENTER + plan.posAt(pin) + exit * EXIT,
  );
  // The turn runs straight off the scroll, with no hold at each project, so
  // the device keeps turning while a screenshot sits still.
  const rawTurn = useTransform(
    [enterProgress, pinProgress, exitProgress],
    ([enter, pin, exit]: number[]) => (enter - 1) * ENTER + pin * (count - 1) + exit * EXIT,
  );
  // A little lag behind the scrollbar gives the device weight.
  const spring = { stiffness: 140, damping: 26, mass: 0.6, restDelta: 0.0005 };
  const pos = useSpring(rawPos, spring);
  const turn = useSpring(rawTurn, spring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [noWebGL, setNoWebGL] = useState(false);

  // Load every logo up front so none pops in mid-scroll, and keep each one's
  // width / height for uncalibrated logos. 0 marks a failed logo: show the title.
  const logoKey = project.map((card) => projectLogoUrl(card.logoUrl) ?? "").join(",");
  const [logoRatio, setLogoRatio] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    for (const url of new Set(project.flatMap((card) => {
      const url = projectLogoUrl(card.logoUrl);
      return url ? [url] : [];
    }))) {
      const img = new Image();
      const done = (ratio: number) => {
        if (live) setLogoRatio((all) => (all[url] === ratio ? all : { ...all, [url]: ratio }));
      };
      img.onload = () => done(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
      img.onerror = () => done(0);
      img.src = url;
    }
    return () => {
      live = false;
    };
    // logoKey stands in for `project`, whose identity changes on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || project.length === 0) return;
    let scene: ReturnType<typeof createDevicesScene>;
    try {
      scene = createDevicesScene(
        canvas,
        frame,
        project.map((card) => ({
          url: getResponsiveImageUrl(card.screenshotUrl ?? "", isPhone(card) ? 960 : 1440),
          phone: isPhone(card),
        })),
      );
    } catch {
      setNoWebGL(true);
      return;
    }
    // Less motion: the device holds still on the project in front.
    const update = () => {
      if (reduceMotion) {
        const front = Math.round(rawPos.get());
        scene.setPos(front, front);
      } else {
        scene.setPos(pos.get(), turn.get());
      }
    };
    update();
    const stops = (reduceMotion ? [rawPos] : [pos, turn]).map((value) => value.on("change", update));
    const stop = () => stops.forEach((off) => off());
    const io = new IntersectionObserver(([entry]) => scene.setRunning(entry.isIntersecting), { rootMargin: "200px 0px" });
    io.observe(canvas);
    return () => {
      stop();
      io.disconnect();
      scene.dispose();
    };
    // shotKey stands in for `project`, whose identity changes on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotKey, reduceMotion, pos, rawPos, turn]);

  // The text follows the raw scroll so it never trails a fast flick.
  useMotionValueEvent(rawPos, "change", (value) => {
    const next = Math.min(count - 1, Math.max(0, Math.round(value)));
    setFront((current) =>
      current.active === next ? current : { active: next, dir: next > current.active ? 1 : -1 },
    );
  });

  if (count === 0) return null;

  const item = project[Math.min(active, count - 1)];
  const label = item.live_url ? "View site" : "View project";
  const words = item.title.split(/\s+/).filter(Boolean);
  const logoUrl = projectLogoUrl(item.logoUrl);
  const logo = logoUrl && logoRatio[logoUrl] !== 0 ? logoUrl : null;
  const trackStyle = { "--work-count": plan.total } as CSSProperties;

  return (
    <section className="work" id="work" aria-labelledby="work-title">
      <div className="work-track" ref={trackRef} style={trackStyle}>
        <div className="work-stage">
          <Reveal as="h2" className="work-title" id="work-title">
            Businesses running on our technology
          </Reveal>

          {/* The canvas covers the whole stage so a device can run past its
              box; the box below is what the device is framed in. */}
          {noWebGL ? null : <canvas ref={canvasRef} className="work-device-canvas" aria-hidden="true" />}

          <div className="work-device-view" ref={frameRef}>
            {noWebGL ? (
              <img className="work-device-fallback" src={item.screenshotUrl ?? ""} alt="" draggable={false} />
            ) : null}
            {/* A sibling, not a wrapper: the link's element type changes per
                project, and wrapping would remount the canvas. */}
            <ProjectLink item={item} className="work-device-link" hidden>
              {null}
            </ProjectLink>
          </div>

          <div className="work-info" aria-live="polite">
            <AnimatePresence initial={false} custom={dir}>
              <motion.div
                key={item.portfolio_project_id}
                className="work-info-item"
                custom={dir}
                variants={infoBlock}
                initial={reduceMotion ? false : "enter"}
                animate="show"
                exit={reduceMotion ? undefined : "exit"}
              >
                <h3 className={`work-info-title${logo ? " has-logo" : ""}`}>
                  {logo ? (
                    <motion.img
                      className="work-info-logo"
                      src={logo}
                      alt={item.title}
                      draggable={false}
                      variants={wordIn}
                      style={LOGO_STYLE[logo] ?? { "--work-logo-k": (logoRatio[logo] ?? 2) ** LOGO_SHAPE } as CSSProperties}
                    />
                  ) : (
                    words.map((word, i) => (
                      <Fragment key={`${word}-${i}`}>
                        <motion.span className="work-word" variants={wordIn}>
                          {word}
                        </motion.span>
                        {i < words.length - 1 ? " " : null}
                      </Fragment>
                    ))
                  )}
                </h3>
                {item.blurb ? (
                  <motion.p className="work-info-desc" variants={fadeIn}>
                    {item.blurb}
                  </motion.p>
                ) : null}
                {item.live_url || item.slug ? (
                  <motion.div variants={fadeIn}>
                    <ProjectLink item={item} className="work-info-link">
                      <span>{label}</span>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </ProjectLink>
                  </motion.div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkShowcase;
