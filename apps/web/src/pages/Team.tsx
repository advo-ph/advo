import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Linkedin, Loader2 } from "lucide-react";
import LandingShell from "@/components/landing/landing-shell";
import { get } from "@/lib/api";

interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  email: string | null;
  linkedin_url: string | null;
}

const Team = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await get<Array<Record<string, unknown>>>("/api/team");
      setMembers(
        (data || []).map((m) => ({
          team_member_id: (m.teamMemberId ?? m.team_member_id) as number,
          name: m.name as string,
          role: m.role as string,
          bio: (m.bio as string) || null,
          avatar_url: (m.avatarUrl ?? m.avatar_url) as string | null,
          email: (m.email as string) || null,
          linkedin_url: (m.linkedinUrl ?? m.linkedin_url) as string | null,
        })),
      );
      setLoading(false);
    })();
  }, []);

  return (
    <LandingShell>
      <main className="landing-shell-main">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.18em] mb-4 block">
              About Us
            </span>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
              Meet the Team
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A small team of engineers and designers who love building great software.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">
              Portraits will appear here shortly.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {members.map((member) => (
                <div
                  key={member.team_member_id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card aspect-[3/4]"
                >
                  {/* Full-bleed image */}
                  <div className="absolute inset-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-7xl font-semibold text-muted-foreground/10 bg-secondary">
                        {member.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Gradient fade — concentrated at the bottom, fading upward */}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card via-card/90 via-30% to-transparent" />

                  {/* Content overlaid at bottom */}
                  <div className="absolute inset-x-0 bottom-0 px-6 pb-5 pt-6">
                    <h3 className="text-xl font-semibold tracking-tight mb-1">
                      {member.name}
                    </h3>
                    <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-accent mb-4">
                      {member.role}
                    </p>

                    {member.bio && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4 opacity-90">
                        {member.bio}
                      </p>
                    )}

                    <div className="flex items-center gap-1">
                      {member.linkedin_url && (
                        <a
                          href={member.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Linkedin className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-24 pt-16 border-t border-border">
            <p className="text-muted-foreground mb-6">Want to work with us?</p>
            <Link
              to="/start"
              className="inline-flex items-center px-6 py-3 bg-foreground text-background rounded-full text-sm font-medium hover:bg-foreground/90 btn-press"
            >
              Start a Project
            </Link>
          </div>
        </div>
      </main>
    </LandingShell>
  );
};

export default Team;
