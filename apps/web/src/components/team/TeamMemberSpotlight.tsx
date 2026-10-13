import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type PanInfo,
} from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import ScrambleText from "./ScrambleText";
import { PORTRAIT_SIZES, portraitOf } from "./spotlight-portrait";
import { getResponsiveImageSrcSet } from "@/lib/image-urls";

export interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  preview_image_url: string | null;
  email: string | null;
  linkedin_url: string | null;
}

interface TeamMemberSpotlightProps {
  members: TeamMember[];
  /** Index of the open member, or null when the overlay is closed. */
  activeIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Runs once the close animation has finished and the overlay is gone. */
  onExitComplete?: () => void;
}

/** Same curve as --landing-ease, in the form framer needs. */
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** Must match the phone breakpoint in team-page.css: below it the portraits
    become a carousel with the neighbours peeking in from the sides. */
const COMPACT_QUERY = "(max-width: 900px)";

/** Centre-to-centre distance between portraits, in portrait widths. On a
    phone the neighbours sit close and shrink so they peek in at the edges; on
    desktop the stage clips and the next portrait slides in from outside it. */
const PEEK_STEP = 0.96;
const SLIDE_STEP = 1.08;
const PEEK_SHRINK = 0.18;
/** How far a neighbour fades. On the dark scrim, fading reads as dimming, and
    opacity on the slide's own layer is free where an overlay would repaint. */
const PEEK_FADE = 0.62;

/** Wait before the copy decrypts on open, so it starts once the wave is under it. */
const OPEN_LEAD_MS = 220;

/** Critically damped: the carousel settles without a bounce. */
const SLIDE_SPRING = { type: "spring", stiffness: 300, damping: 35, mass: 1 } as const;

const mod = (value: number, count: number) => ((value % count) + count) % count;

/** Signed distance around a ring of `count` slots, in (-count/2, count/2]. */
const ringOffset = (value: number, count: number) => {
  const wrapped = mod(value, count);
  return wrapped > count / 2 ? wrapped - count : wrapped;
};

const subscribeCompact = (onChange: () => void) => {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readCompact = () => window.matchMedia(COMPACT_QUERY).matches;
const useCompact = () => useSyncExternalStore(subscribeCompact, readCompact, () => false);

/**
 * Runs once the frame after this commit has reached the screen. Opening the
 * overlay costs a slow first frame (mounting it, drawing its layers), and an
 * animation started before that frame keeps its clock running through it: on
 * desktop the wave lost its first ~230ms and jumped from a dot to the full
 * screen. Starting here, a slow frame only delays the open.
 */
const afterFirstPaint = (run: () => void) => {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(run);
  });
  return () => cancelAnimationFrame(frame);
};

/* ---------------------------------------------------------------- Wave */

const WAVE_POINTS = 72;
const WAVE_SAMPLES = 18;
const WAVE_OPEN_MS = 820;
/** The close plays the same wave backwards, this much faster. */
const WAVE_CLOSE_RATE = 1.7;
/** Every direction has landed well before the open's last keyframe, so a
    plain reverse holds a full dark screen for its first ~300ms. Ease-in on the
    keyframes, played backwards, rushes through that hold and then slows into
    the centre. */
const WAVE_CLOSE_EASING = "cubic-bezier(0.32, 0, 0.67, 0)";

type WaveFrame = { clipPath: string; opacity?: number; offset: number };

/** Low harmonics only, so neighbouring directions move together and the edge
    reads as one liquid front rather than a star. Roughly in [-1, 1]. */
const waveNoise = (theta: number, phase: number[]) =>
  0.55 * Math.sin(2 * theta + phase[0]) +
  0.3 * Math.sin(3 * theta + phase[1]) +
  0.15 * Math.sin(5 * theta + phase[2]);

/**
 * Keyframes for a polygon that grows from the middle of the screen to past its
 * corners. Every direction has its own arrival time, so the shape bulges ahead
 * in some directions and lags in others, and a small ripple on the edge dies
 * away as it lands. `head` brings every arrival forward, which is what lets the
 * orange front run ahead of the dark body. The front's shape is turned a little
 * (`twist`), so the band between them is thick in some directions and thin in
 * others.
 */
const waveFrames = (phase: number[], head: number, twist: number, fadeOut: boolean): WaveFrame[] => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const reach = Math.hypot(cx, cy) * 1.06;
  const vertices = Array.from({ length: WAVE_POINTS }, (_, index) => {
    const theta = (index / WAVE_POINTS) * Math.PI * 2;
    return { theta, arrive: (0.72 + 0.22 * waveNoise(theta + twist, phase)) * (1 - head) };
  });

  return Array.from({ length: WAVE_SAMPLES + 1 }, (_, sample) => {
    const t = sample / WAVE_SAMPLES;
    const points = vertices.map(({ theta, arrive }) => {
      const local = Math.min(t / arrive, 1);
      const eased = 1 - (1 - local) ** 3;
      const ripple = 1 + 0.05 * Math.sin(4 * theta + phase[3] + t * 7) * (1 - eased);
      const radius = reach * eased * ripple;
      return `${(cx + radius * Math.cos(theta)).toFixed(1)}px ${(cy + radius * Math.sin(theta)).toFixed(1)}px`;
    });
    const frame: WaveFrame = { clipPath: `polygon(${points.join(", ")})`, offset: t };
    if (fadeOut) frame.opacity = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    return frame;
  });
};

/**
 * The open: an orange front and the dark scrim behind it spread out from the
 * middle of the screen. The close plays the same animation backwards, and the
 * overlay stays mounted until it has finished.
 */
const SpotlightWave = () => {
  const frontRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const waves = useRef<Animation[]>([]);
  const started = useRef(false);
  const cancelStart = useRef<() => void>(() => {});
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const front = frontRef.current;
    const body = bodyRef.current;
    if (!front || !body || typeof body.animate !== "function") return;

    const phase = Array.from({ length: 4 }, () => Math.random() * Math.PI * 2);
    const timing: KeyframeAnimationOptions = { duration: WAVE_OPEN_MS, easing: "linear", fill: "both" };
    waves.current = [
      front.animate(waveFrames(phase, 0.16, 0.35, true), timing),
      body.animate(waveFrames(phase, 0, 0, false), timing),
    ];
    // Held on the first keyframe (nothing drawn) until the overlay is on screen.
    waves.current.forEach((wave) => wave.pause());
    cancelStart.current = afterFirstPaint(() => {
      started.current = true;
      waves.current.forEach((wave) => wave.play());
    });

    // The polygon is drawn in pixels for this viewport. A rotation or resize
    // drops it, which leaves the scrim covering the whole screen as it should.
    const drop = () => {
      waves.current.forEach((wave) => wave.cancel());
      waves.current = [];
      front.style.opacity = "0";
    };
    window.addEventListener("resize", drop);
    return () => {
      cancelStart.current();
      window.removeEventListener("resize", drop);
      waves.current.forEach((wave) => wave.cancel());
    };
  }, []);

  useEffect(() => {
    const running = waves.current;
    if (isPresent) {
      // The first open is started by the layout effect above.
      if (!started.current) return;
      // Reopened mid-close: play forwards again from wherever the close got to.
      running.forEach((wave) => {
        wave.onfinish = null;
        wave.updatePlaybackRate(1);
        wave.play();
      });
      return;
    }
    // Closed before the open got going: never start it.
    cancelStart.current();
    started.current = true;
    if (running.length === 0) {
      safeToRemove?.();
      return;
    }
    running.forEach((wave) => {
      // Only a finished open: changing the easing mid-wave would jump its shape.
      if (wave.playState === "finished") wave.effect?.updateTiming({ easing: WAVE_CLOSE_EASING });
      wave.updatePlaybackRate(-WAVE_CLOSE_RATE);
    });
    const body = running[running.length - 1];
    body.onfinish = () => safeToRemove?.();
    running.forEach((wave) => wave.play());
  }, [isPresent, safeToRemove]);

  return (
    <>
      <span ref={frontRef} className="team-wave is-front" aria-hidden="true" />
      <span ref={bodyRef} className="team-wave is-body" aria-hidden="true" />
    </>
  );
};

/* ---------------------------------------------------------------- Fit */

/** Shrinks a one-line element's font until its text fits the box. It never
    grows past the size the stylesheet gives it. */
const useFitLine = (ref: RefObject<HTMLElement>) => {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = "";
      const { clientWidth, scrollWidth } = element;
      if (!clientWidth || scrollWidth <= clientWidth + 0.5) return;
      const size = parseFloat(getComputedStyle(element).fontSize);
      element.style.fontSize = `${Math.floor(((size * clientWidth * 0.99) / scrollWidth) * 10) / 10}px`;
    };
    fit();
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    window.addEventListener("resize", fit);
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
    };
  }, [ref]);
};

/* ---------------------------------------------------------------- Slides */

interface SlideProps {
  member: TeamMember;
  index: number;
  count: number;
  /** Continuous carousel position: the index at the centre, fractional mid-swipe. */
  position: MotionValue<number>;
  compact: boolean;
  /** Where this slide sits relative to the selected member once settled. */
  slot: number;
  onPick: (delta: number) => void;
}

const SpotlightSlide = ({ member, index, count, position, compact, slot, onPick }: SlideProps) => {
  const distance = (p: number) => Math.min(Math.abs(ringOffset(index - p, count)), 1);
  const x = useTransform(position, (p) => `${ringOffset(index - p, count) * (compact ? PEEK_STEP : SLIDE_STEP) * 100}%`);
  const scale = useTransform(position, (p) => (compact ? 1 - PEEK_SHRINK * distance(p) : 1));
  const opacity = useTransform(position, (p) => 1 - distance(p) * PEEK_FADE);
  // Anything past the neighbours is off screen; skip painting it.
  const visibility = useTransform(position, (p) =>
    Math.abs(ringOffset(index - p, count)) > 1.5 ? "hidden" : "visible",
  );

  const portrait = portraitOf(member);
  const isNeighbour = Math.abs(slot) === 1;
  // The selected member and two either side load, so a swipe never lands on an empty frame.
  const loadImage = Math.abs(slot) <= 2;

  return (
    <motion.div className="team-slide" style={{ x, scale, opacity, visibility }} aria-hidden={slot !== 0}>
      {portrait && loadImage ? (
        <img
          src={portrait}
          srcSet={getResponsiveImageSrcSet(portrait)}
          sizes={PORTRAIT_SIZES}
          alt={slot === 0 ? member.name : ""}
          decoding="async"
          draggable={false}
        />
      ) : (
        <span className="team-spotlight-fallback">{portrait ? null : member.name.charAt(0)}</span>
      )}
      {isNeighbour && count > 1 ? (
        <button
          type="button"
          className="team-slide-pick"
          tabIndex={-1}
          onClick={() => onPick(slot)}
        >
          <span className="team-sr-only">{member.name}</span>
        </button>
      ) : null}
    </motion.div>
  );
};

/* ---------------------------------------------------------------- Copy */

interface CopyProps {
  member: TeamMember;
  /** ms to hold the decrypt so it starts once the overlay is drawn. */
  lead: number;
  reduceMotion: boolean;
}

const SpotlightCopy = ({ member, lead, reduceMotion }: CopyProps) => {
  const nameRef = useRef<HTMLHeadingElement>(null);
  const roleRef = useRef<HTMLParagraphElement>(null);
  useFitLine(nameRef);
  useFitLine(roleRef);

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduceMotion ? 0.12 : 0.4,
      delay: reduceMotion ? 0 : lead / 1000 + delay,
      ease: EASE,
    },
  });

  return (
    <div className="team-spotlight-text">
      <Dialog.Title ref={nameRef} className="team-spotlight-name">
        <ScrambleText text={member.name} delay={reduceMotion ? 0 : lead + 90} />
      </Dialog.Title>
      <p ref={roleRef} className="team-spotlight-role">
        <ScrambleText text={member.role} delay={reduceMotion ? 0 : lead + 210} />
      </p>

      <div className="team-spotlight-body">
        {member.bio ? (
          <Dialog.Description asChild>
            <motion.p className="team-spotlight-bio" {...fade(0.44)}>
              {member.bio}
            </motion.p>
          </Dialog.Description>
        ) : null}

        {member.linkedin_url ? (
          <motion.div className="team-spotlight-links" {...fade(0.54)}>
            <a href={member.linkedin_url} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Spotlight */

const TeamMemberSpotlight = ({
  members,
  activeIndex,
  onClose,
  onNavigate,
  onExitComplete,
}: TeamMemberSpotlightProps) => {
  const reduceMotion = useReducedMotion() ?? false;
  const compact = useCompact();
  const open = activeIndex !== null;
  const member = activeIndex === null ? null : members[activeIndex] ?? null;
  const count = members.length;

  // The exit animation outlives the selection, so the last opened member is
  // held here to keep rendering while the overlay closes.
  const lastMember = useRef<TeamMember | null>(null);
  const lastIndex = useRef(0);
  if (member) {
    lastMember.current = member;
    lastIndex.current = activeIndex ?? 0;
  }
  const shown = member ?? lastMember.current;
  const shownIndex = activeIndex ?? lastIndex.current;

  // Only the first member after an open waits for the wave; a step decrypts at once.
  const wasOpen = useRef(false);
  const stepped = useRef(false);
  if (open && !wasOpen.current) stepped.current = false;
  wasOpen.current = open;

  // The carousel position is continuous (it keeps counting past the last
  // member), so a step from the end to the start still slides one slot.
  const position = useMotionValue(activeIndex ?? 0);
  const target = useRef(activeIndex ?? 0);
  const slide = useRef<AnimationPlaybackControls | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const panFrom = useRef<number | null>(null);
  const panned = useRef(false);

  // An index set from outside (the roster tap that opens the overlay) jumps
  // straight there; the steps below have already moved the carousel.
  useLayoutEffect(() => {
    if (activeIndex === null || count === 0) return;
    if (mod(Math.round(target.current), count) !== activeIndex) {
      slide.current?.stop();
      target.current = activeIndex;
      position.jump(activeIndex);
    }
  }, [activeIndex, count, position]);

  const goTo = useCallback(
    (next: number, velocity = 0) => {
      if (count === 0) return;
      target.current = next;
      stepped.current = true;
      const index = mod(next, count);
      if (index !== activeIndex) onNavigate(index);
      slide.current?.stop();
      if (reduceMotion) {
        slide.current = null;
        position.jump(next);
      } else {
        slide.current = animate(position, next, { ...SLIDE_SPRING, velocity });
      }
    },
    [activeIndex, count, onNavigate, position, reduceMotion],
  );

  const step = useCallback(
    (delta: number) => {
      if (activeIndex === null || count < 2) return;
      goTo(Math.round(target.current) + delta);
    },
    [activeIndex, count, goTo],
  );

  const jumpTo = (index: number) => {
    const from = Math.round(target.current);
    goTo(from + ringOffset(index - mod(from, count), count));
  };

  // The entrance (CSS, team-page.css) waits on data-live the same way the wave
  // waits on afterFirstPaint, so both start together on the first shown frame.
  // A data attribute, not a class: React never rewrites it on a re-render.
  useLayoutEffect(() => {
    if (!open) return;
    return afterFirstPaint(() => {
      scrimRef.current?.setAttribute("data-live", "");
      sheetRef.current?.setAttribute("data-live", "");
    });
  }, [open]);

  // Landing routes scroll on <html> (landing-page.css), where Radix's
  // body-level lock is a no-op and the page keeps scrolling behind the scrim.
  // A layout effect, so the relayout this costs lands in the first frame and
  // not in the middle of the wave.
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  // A tap anywhere that is not a control steps to the next member. With one
  // member there is nothing to step to, so a tap on the padding closes.
  const handleSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    if (panned.current) return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    if (window.getSelection()?.toString()) return;
    if (count > 1) step(1);
    else if (event.target === event.currentTarget) onClose();
  };

  // Swipes are for touch and pen. A mouse drag stays free to select the bio.
  const slideWidth = () => {
    const first = stageRef.current?.querySelector<HTMLElement>(".team-slide");
    return (first?.offsetWidth ?? window.innerWidth) * (compact ? PEEK_STEP : SLIDE_STEP);
  };

  const handlePanStart = (event: PointerEvent) => {
    panned.current = false;
    if (event.pointerType === "mouse" || count < 2) return;
    slide.current?.stop();
    panFrom.current = position.get();
  };

  const handlePan = (_event: PointerEvent, info: PanInfo) => {
    if (panFrom.current === null) return;
    panned.current = true;
    position.set(panFrom.current - info.offset.x / slideWidth());
  };

  const handlePanEnd = (_event: PointerEvent, info: PanInfo) => {
    if (panFrom.current === null) return;
    const width = slideWidth();
    const moved = -info.offset.x / width;
    const flick = -info.velocity.x / width;
    const base = Math.round(panFrom.current);
    let delta = 0;
    if (Math.abs(flick) > 0.6) delta = Math.sign(flick);
    else if (Math.abs(moved) > 0.22) delta = Math.sign(moved);
    panFrom.current = null;
    goTo(base + delta, flick);
    // The click that can follow a touch release must not also step.
    window.setTimeout(() => {
      panned.current = false;
    }, 60);
  };

  if (!shown) return null;

  const motionClass = reduceMotion ? " is-reduce-motion" : "";
  const lead = stepped.current || reduceMotion ? 0 : OPEN_LEAD_MS;

  // Radix warns about a missing description unless aria-describedby is passed
  // explicitly as undefined, which only applies when this member has no bio.
  const describedBy: { "aria-describedby"?: undefined } = shown.bio
    ? {}
    : { "aria-describedby": undefined };

  const fadeTransition = { duration: reduceMotion ? 0.12 : 0.25, ease: EASE };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* AnimatePresence sits OUTSIDE the portal: Radix hands every direct child
          of Dialog.Portal a ref, and AnimatePresence has none to give. forceMount
          throughout hands presence to framer so the exit animations can run. */}
      <AnimatePresence onExitComplete={onExitComplete}>
        {open ? (
          <Dialog.Portal forceMount key="team-spotlight">
            <Dialog.Overlay asChild forceMount>
              <motion.div
                ref={scrimRef}
                className={`team-scrim${motionClass}`}
                initial={reduceMotion ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                // The wave carries the close; this fade only clears what is left of it at the end.
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12, delay: 0.36 } }}
                transition={fadeTransition}
              >
                {reduceMotion ? null : <SpotlightWave />}
                <span className="team-aura-wrap" aria-hidden="true">
                  <span className="team-aura" />
                </span>
              </motion.div>
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount onKeyDown={handleKeyDown} {...describedBy}>
              <motion.div
                ref={sheetRef}
                className={`team-spotlight${count > 1 ? " is-steppable" : ""}${motionClass}`}
                initial={reduceMotion ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.12 : 0.16, ease: EASE } }}
                transition={fadeTransition}
                onClick={handleSurfaceClick}
                onPanStart={handlePanStart}
                onPan={handlePan}
                onPanEnd={handlePanEnd}
              >
                <button type="button" className="team-spotlight-close" onClick={onClose}>
                  <X size={24} strokeWidth={1.6} aria-hidden="true" />
                  <span className="team-sr-only">Close</span>
                </button>

                <div className="team-spotlight-panel">
                  <div ref={stageRef} className="team-spotlight-stage">
                    {members.map((item, index) => (
                      <SpotlightSlide
                        key={item.team_member_id}
                        member={item}
                        index={index}
                        count={count}
                        position={position}
                        compact={compact}
                        slot={ringOffset(index - shownIndex, count)}
                        onPick={step}
                      />
                    ))}
                  </div>

                  <div className="team-spotlight-copy">
                    {/* Keyed on the member so a step remounts the copy and both
                        scrambles replay. The nav row stays mounted so focus
                        survives a step. */}
                    <SpotlightCopy
                      key={`copy-${shown.team_member_id}`}
                      member={shown}
                      lead={lead}
                      reduceMotion={reduceMotion}
                    />

                    {count > 1 ? (
                      <div className="team-spotlight-nav">
                        <button
                          type="button"
                          className="team-spotlight-arrow is-prev"
                          onClick={() => step(-1)}
                        >
                          <ArrowLeft size={22} strokeWidth={1.5} aria-hidden="true" />
                          <span className="team-sr-only">Previous member</span>
                        </button>
                        <div className="team-spotlight-dots">
                          {members.map((item, index) => (
                            <button
                              key={item.team_member_id}
                              type="button"
                              className="team-spotlight-dot"
                              aria-current={index === activeIndex ? "true" : undefined}
                              onClick={() => jumpTo(index)}
                            >
                              <span className="team-sr-only">{item.name}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="team-spotlight-arrow is-next"
                          onClick={() => step(1)}
                        >
                          <ArrowRight size={22} strokeWidth={1.5} aria-hidden="true" />
                          <span className="team-sr-only">Next member</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
};

export default TeamMemberSpotlight;
