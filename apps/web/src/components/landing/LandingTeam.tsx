import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reveal } from "@/components/motion/Reveal";
import TeamMemberSpotlight, { type TeamMember } from "@/components/team/TeamMemberSpotlight";
import { preloadSpotlightPortrait } from "@/components/team/spotlight-portrait";
import "@/components/team/team-page.css";
import { fetchTeam } from "@/hooks/useAdminTeam";
import { getResponsiveImageSrcSet } from "@/lib/image-urls";

/**
 * The roster on the landing page. Desktop shows everyone in one strip where
 * the hovered portrait widens; phones get a four-up grid so the whole team
 * fits on about one screen. A tap opens the same spotlight as /team.
 * Shares the ["publicTeam"] query with the Team page, so a visit to one warms the other.
 */
const LandingTeam = () => {
  const { data: roster = [] } = useQuery({
    queryKey: ["publicTeam"],
    queryFn: fetchTeam,
    staleTime: 2 * 60 * 1000,
  });
  const members: TeamMember[] = roster.filter((member) => member.is_active);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeSpotlight = useCallback(() => setActiveIndex(null), []);

  // A failed or empty roster hides the section rather than showing an error on the home page.
  if (members.length === 0) return null;

  return (
    <section className="landing-team" id="team" aria-labelledby="landing-team-title">
      <Reveal as="h2" className="landing-display landing-solutions-title landing-team-title" id="landing-team-title">
        The Team That Makes It All Possible
      </Reveal>

      <Reveal as="ul" className="landing-team-strip" delay={0.08}>
        {members.map((member, index) => {
          const image = member.preview_image_url || member.avatar_url;
          // The .svg avatars are letter placeholders; a tall crop cuts the letter, so draw our own.
          const portrait = image && !image.toLowerCase().endsWith(".svg") ? image : null;
          const firstName = member.name.split(" ")[0];
          return (
            <li key={member.team_member_id} className="landing-team-item">
              <button
                type="button"
                className="landing-team-card"
                onPointerDown={() => preloadSpotlightPortrait(member)}
                onClick={() => setActiveIndex(index)}
                aria-label={`${member.name}, ${member.role}`}
              >
                <span className="landing-team-frame">
                  {portrait ? (
                    <img
                      src={portrait}
                      srcSet={getResponsiveImageSrcSet(portrait)}
                      sizes="(max-width: 680px) 24vw, 420px"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="landing-team-fallback" aria-hidden="true">
                      {member.name.charAt(0)}
                    </span>
                  )}
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
      </Reveal>

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
