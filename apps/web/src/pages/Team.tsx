import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import LandingShell from "@/components/landing/landing-shell";
import TeamMemberSpotlight, { type TeamMember } from "@/components/team/TeamMemberSpotlight";
import "@/components/team/team-page.css";
import { fetchTeam } from "@/hooks/useAdminTeam";

const Team = () => {
  const {
    data: roster = [],
    isLoading: loading,
    error: teamError,
    refetch: refetchTeam,
  } = useQuery({
    queryKey: ["publicTeam"],
    queryFn: fetchTeam,
    staleTime: 2 * 60 * 1000,
  });
  const members: TeamMember[] = roster.filter((member) => member.is_active);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const closeSpotlight = useCallback(() => setActiveIndex(null), []);

  return (
    <LandingShell flowingBackground>
      <main className="landing-shell-main team-page">
        <header className="team-head">
          <h1>Team</h1>
          <p>The engineers and designers who build every ADVO project.</p>
        </header>

        {loading ? (
          <div className="team-state">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="team-sr-only">Loading team</span>
          </div>
        ) : teamError ? (
          <div className="team-state team-state-error" role="alert">
            <p>We couldn’t load the team right now.</p>
            <button type="button" className="team-retry" onClick={() => void refetchTeam()}>
              Try again
            </button>
          </div>
        ) : members.length === 0 ? (
          <p className="team-state">No team members are available right now.</p>
        ) : (
          <ul className="team-grid">
            {members.map((member, index) => {
              const portrait = member.preview_image_url || member.avatar_url;
              return (
                <li key={member.team_member_id}>
                  <button type="button" className="team-tile" onClick={() => setActiveIndex(index)}>
                    <span className="team-tile-frame">
                      {portrait ? (
                        <img src={portrait} alt="" />
                      ) : (
                        <span className="team-tile-fallback" aria-hidden="true">
                          {member.name.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="team-tile-caption">
                      <span className="team-tile-index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="team-tile-name">{member.name}</span>
                        <span className="team-tile-role">{member.role}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <TeamMemberSpotlight
        members={members}
        activeIndex={activeIndex}
        onClose={closeSpotlight}
        onNavigate={setActiveIndex}
      />
    </LandingShell>
  );
};

export default Team;
