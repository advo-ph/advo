import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Linkedin, Github, Mail, Loader2 } from "lucide-react";
import FloatingNav from "@/components/landing/FloatingNav";
import { supabase } from "@/integrations/supabase/client";

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
    const fetchTeam = async () => {
      const { data } = await supabase
        .from("team_member")
        .select("team_member_id, name, role, bio, avatar_url, email, linkedin_url")
        .eq("is_active", true)
        .order("team_member_id", { ascending: true });

      setMembers(data || []);
      setLoading(false);
    };

    fetchTeam();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />

      <main className="max-w-6xl mx-auto px-6 pt-24 pb-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-2 block">
            About Us
          </span>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Meet the Team
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            We're a small team of engineers and designers who love building great software.
          </p>
        </motion.div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          /* Team Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {members.map((member, index) => (
              <motion.div
                key={member.team_member_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-xl p-6 text-center"
              >
                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                  {member.avatar_url ? (
                    <img 
                      src={member.avatar_url} 
                      alt={member.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-muted-foreground/50">
                      {member.name.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <h3 className="text-xl font-semibold mb-1">{member.name}</h3>
                <p className="text-sm text-accent mb-3">{member.role}</p>
                <p className="text-sm text-muted-foreground mb-4">{member.bio || ""}</p>

                {/* Social Links */}
                <div className="flex items-center justify-center gap-3">
                  {member.linkedin_url && (
                    <a 
                      href={member.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Linkedin className="h-5 w-5" />
                    </a>
                  )}
                  {member.email && (
                    <a 
                      href={`mailto:${member.email}`}
                      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Mail className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-16"
        >
          <p className="text-muted-foreground mb-4">
            Want to work with us?
          </p>
          <Link 
            to="/start"
            className="inline-flex items-center px-6 py-3 bg-foreground text-background rounded-full font-medium hover:bg-foreground/90 transition-colors"
          >
            Start a Project
          </Link>
        </motion.div>
      </main>
    </div>
  );
};

export default Team;
