import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import TeamMemberSpotlight, { type TeamMember } from "@/components/team/TeamMemberSpotlight";
import { portraitOf, preloadSpotlightPortrait } from "@/components/team/spotlight-portrait";
import "@/components/team/team-page.css";
import { fetchTeam } from "@/hooks/useAdminTeam";
import { getResponsiveImageSrcSet } from "@/lib/image-urls";

const FOUNDER_QUOTE = "We’re here to build the future we imagine for the Philippines.";

/** A member's photo, or their initial when there is none. */
const TeamPortrait = ({ member, sizes }: { member: TeamMember; sizes: string }) => {
  const image = portraitOf(member);
  // The .svg avatars are letter placeholders; a tall crop cuts the letter, so draw our own.
  if (!image || image.toLowerCase().endsWith(".svg")) {
    return (
      <span className="landing-team-fallback" aria-hidden="true">
        {member.name.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={image}
      srcSet={getResponsiveImageSrcSet(image)}
      sizes={sizes}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalHeight > 0) {
          image.closest<HTMLElement>(".landing-team-item")?.style.setProperty(
            "--portrait-ratio",
            String(image.naturalWidth / image.naturalHeight),
          );
        }
      }}
    />
  );
};

/**
 * The roster on the landing page. The founder leads with a compact portrait, the
 * name, role and a quote beside it. Everyone else runs below: desktop shows
 * them in an evenly sized strip that widens on hover; phones get a four-up
 * grid so the whole team fits on about one screen. A tap on any portrait opens
 * the same spotlight as /team.
 * Shares the ["publicTeam"] query with the Team page, so a visit to one warms the other.
 */
const LandingTeam = () => {
  const { data: roster = [] } = useQuery({
    queryKey: ["publicTeam"],
    queryFn: fetchTeam,
    staleTime: 2 * 60 * 1000,
  });
  const members: TeamMember[] = roster.filter((member) => member.is_active);
  const founderIndex = members.findIndex((member) => /\bfounder\b/i.test(member.role));
  const founder = founderIndex === -1 ? null : members[founderIndex];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeSpotlight = useCallback(() => setActiveIndex(null), []);
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const hasMembers = members.length > 0;
  const hasFounder = founder !== null;

  // The founder and the roster each play their entrance once, when a
  // quarter of the block is on screen. The flag is a DOM attribute React never
  // renders, so a later re-render cannot clear it and replay the entrance.
  useEffect(() => {
    const blocks = sectionRef.current?.querySelectorAll<HTMLElement>("[data-team-reveal]:not([data-revealed])");
    if (!blocks?.length) return;
    if (typeof IntersectionObserver === "undefined") {
      blocks.forEach((block) => block.setAttribute("data-revealed", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 },
    );
    blocks.forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, [hasMembers, hasFounder]);

  // A failed or empty roster hides the section rather than showing an error on the home page.
  if (!hasMembers) return null;

  return (
    <section
      ref={sectionRef}
      className="landing-team"
      id="team"
      aria-labelledby="landing-team-title"
      data-motion={reduceMotion ? undefined : ""}
    >
      <h2 className="landing-display landing-solutions-title landing-team-title" id="landing-team-title">
        The Team That Makes It All Possible
      </h2>

      {founder && (
        <div className="landing-team-lead" data-team-reveal>
          <button
            type="button"
            className="landing-team-lead-card"
            onPointerDown={() => preloadSpotlightPortrait(founder)}
            onClick={() => setActiveIndex(founderIndex)}
            aria-label={`${founder.name}, ${founder.role}`}
          >
            <TeamPortrait member={founder} sizes="(max-width: 680px) 42vw, (max-width: 1023px) 36vw, 320px" />
          </button>
          <div className="landing-team-lead-copy">
            <h3 className="landing-team-lead-name">{founder.name}</h3>
            <p className="landing-team-lead-role">{founder.role}</p>
            <blockquote className="landing-team-lead-quote">
              <p>“{FOUNDER_QUOTE}”</p>
            </blockquote>
          </div>
        </div>
      )}

      <ul className="landing-team-strip" data-team-reveal>
        {members.map((member, index) => {
          if (index === founderIndex) return null;
          const firstName = member.name.split(" ")[0];
          // Place in the roster with the founder left out, for the entrance stagger.
          const order = founderIndex !== -1 && index > founderIndex ? index - 1 : index;
          return (
            <li
              key={member.team_member_id}
              className="landing-team-item"
              style={{ "--i": order } as CSSProperties}
            >
              <button
                type="button"
                className="landing-team-card"
                onPointerDown={() => preloadSpotlightPortrait(member)}
                onClick={() => setActiveIndex(index)}
                aria-label={`${member.name}, ${member.role}`}
              >
                <span className="landing-team-frame">
                  <TeamPortrait member={member} sizes="(max-width: 680px) 24vw, 420px" />
                </span>
                <span className="landing-team-caption" aria-hidden="true">
                  <span className="landing-team-name">
                    <span className="landing-team-name-full">{member.name}</span>
                    <span className="landing-team-name-short">{firstName}</span>
                  </span>
                  <span className="landing-team-role">{member.role}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <TeamMemberSpotlight
        members={members}
        activeIndex={activeIndex}
        onClose={closeSpotlight}
        onNavigate={setActiveIndex}
      />
    </section>
  );
};

export default LandingTeam;
