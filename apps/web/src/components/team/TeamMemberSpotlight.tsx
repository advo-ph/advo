import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import ScrambleText from "./ScrambleText";

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
}

/** Same curve as --landing-ease, in the form framer needs. */
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/* Faint orange glows inside the scrim. Each one wanders a random loop of spots
   for as long as the overlay is open. */
const AURA = [
  { color: "rgba(230, 122, 58, 0.16)", size: 48 },
  { color: "rgba(230, 122, 58, 0.1)", size: 60 },
  { color: "rgba(214, 98, 40, 0.12)", size: 40 },
];

const AURA_STOPS = 6;

const randomPath = () => {
  const stops = Array.from({ length: AURA_STOPS }, () => ({
    x: `${Math.round(Math.random() * 90 - 20)}vw`,
    y: `${Math.round(Math.random() * 90 - 20)}vh`,
    scale: 0.8 + Math.random() * 0.6,
  }));
  // Close the loop so each repeat starts where the last one ended.
  stops.push(stops[0]);
  return {
    x: stops.map((stop) => stop.x),
    y: stops.map((stop) => stop.y),
    scale: stops.map((stop) => stop.scale),
  };
};

const AuraBlob = ({ color, size, still }: { color: string; size: number; still: boolean }) => {
  const [path] = useState(randomPath);
  const [duration] = useState(() => 12 + Math.random() * 6);
  const start = { x: path.x[0], y: path.y[0], scale: path.scale[0] };

  return (
    <motion.span
      className="team-aura-blob"
      style={{ background: color, width: `${size}vmax`, height: `${size}vmax` }}
      initial={start}
      animate={still ? start : path}
      transition={still ? { duration: 0 } : { duration, ease: "easeInOut", repeat: Infinity }}
    />
  );
};

const TeamMemberSpotlight = ({
  members,
  activeIndex,
  onClose,
  onNavigate,
}: TeamMemberSpotlightProps) => {
  const reduceMotion = useReducedMotion();
  const open = activeIndex !== null;
  const member = activeIndex === null ? null : members[activeIndex] ?? null;

  // The exit animation outlives the selection, so the last opened member is
  // held here to keep rendering while the overlay fades out.
  const lastMember = useRef<TeamMember | null>(null);
  if (member) lastMember.current = member;
  const shown = member ?? lastMember.current;

  const step = useCallback(
    (delta: number) => {
      if (activeIndex === null || members.length < 2) return;
      onNavigate((activeIndex + delta + members.length) % members.length);
    },
    [activeIndex, members.length, onNavigate],
  );

  // Landing routes scroll on <html> (landing-page.css), where Radix's
  // body-level lock is a no-op and the page keeps scrolling behind the scrim.
  useEffect(() => {
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
    if ((event.target as HTMLElement).closest("button, a")) return;
    if (window.getSelection()?.toString()) return;
    if (members.length > 1) step(1);
    else if (event.target === event.currentTarget) onClose();
  };

  if (!shown) return null;

  const portrait = shown.preview_image_url || shown.avatar_url;
  const hasLinks = Boolean(shown.linkedin_url);
  const motionClass = reduceMotion ? " is-reduce-motion" : "";

  // Radix warns about a missing description unless aria-describedby is passed
  // explicitly as undefined, which only applies when this member has no bio.
  const describedBy: { "aria-describedby"?: undefined } = shown.bio
    ? {}
    : { "aria-describedby": undefined };

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0.12 : 0.4, delay: reduceMotion ? 0 : delay, ease: EASE },
  });

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
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount key="team-spotlight">
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className={`team-scrim${motionClass}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.25, ease: EASE }}
              >
                {AURA.map((blob, index) => (
                  <AuraBlob key={index} {...blob} still={Boolean(reduceMotion)} />
                ))}
              </motion.div>
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount onKeyDown={handleKeyDown} {...describedBy}>
              <motion.div
                className={`team-spotlight${members.length > 1 ? " is-steppable" : ""}${motionClass}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.25, ease: EASE }}
                onClick={handleSurfaceClick}
              >
                <button type="button" className="team-spotlight-close" onClick={onClose}>
                  <X size={20} strokeWidth={1.5} aria-hidden="true" />
                  <span className="team-sr-only">Close</span>
                </button>

                <div className="team-spotlight-panel">
                  {/* Keyed on the member so arrowing to the next one remounts the
                      portrait and the copy: the reveal and both scrambles replay.
                      The nav row stays mounted so focus survives a step. */}
                  <motion.div
                    key={`media-${shown.team_member_id}`}
                    className="team-spotlight-media"
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 1.06, clipPath: "inset(14% 14% 14% 14% round 16px)" }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, scale: 1, clipPath: "inset(0% 0% 0% 0% round 16px)" }
                    }
                    transition={{ duration: reduceMotion ? 0.12 : 0.58, ease: EASE }}
                  >
                    {portrait ? (
                      <img src={portrait} alt={shown.name} />
                    ) : (
                      <span className="team-spotlight-fallback" aria-hidden="true">
                        {shown.name.charAt(0)}
                      </span>
                    )}
                  </motion.div>

                  <div className="team-spotlight-copy">
                    <div key={`copy-${shown.team_member_id}`}>
                      <Dialog.Title className="team-spotlight-name">
                        <ScrambleText text={shown.name} delay={reduceMotion ? 0 : 90} />
                      </Dialog.Title>
                      <p className="team-spotlight-role">
                        <ScrambleText text={shown.role} delay={reduceMotion ? 0 : 210} />
                      </p>

                      {shown.bio ? (
                        <Dialog.Description asChild>
                          <motion.p className="team-spotlight-bio" {...fade(0.44)}>
                            {shown.bio}
                          </motion.p>
                        </Dialog.Description>
                      ) : null}

                      {hasLinks ? (
                        <motion.div className="team-spotlight-links" {...fade(0.54)}>
                          {shown.linkedin_url ? (
                            <a href={shown.linkedin_url} target="_blank" rel="noreferrer">
                              LinkedIn
                            </a>
                          ) : null}
                        </motion.div>
                      ) : null}
                    </div>

                    {members.length > 1 ? (
                      <div className="team-spotlight-nav">
                        <button
                          type="button"
                          className="team-spotlight-arrow is-prev"
                          onClick={() => step(-1)}
                        >
                          <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
                          <span className="team-sr-only">Previous member</span>
                        </button>
                        <div className="team-spotlight-dots">
                          {members.map((item, index) => (
                            <button
                              key={item.team_member_id}
                              type="button"
                              className="team-spotlight-dot"
                              aria-current={index === activeIndex ? "true" : undefined}
                              onClick={() => onNavigate(index)}
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
                          <ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" />
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
