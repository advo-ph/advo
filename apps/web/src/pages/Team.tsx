import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import LandingShell from "@/components/landing/landing-shell";
import TeamMemberCard from "@/components/TeamMemberCard";
import { get } from "@/lib/api";

interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  preview_image_url: string | null;
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
          preview_image_url: (m.previewImageUrl ?? m.preview_image_url ?? null) as string | null,
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
                <TeamMemberCard
                  key={member.team_member_id}
                  name={member.name}
                  role={member.role}
                  avatar_url={member.avatar_url}
                  preview_image_url={member.preview_image_url}
                />
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
