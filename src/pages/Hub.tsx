import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Briefcase, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import * as db from "@/lib/db";
import ProjectDashboard from "@/components/hub/ProjectDashboard";
import FloatingNav from "@/components/landing/FloatingNav";
import Footer from "@/components/landing/Footer";

type ProjectStatus = "discovery" | "architecture" | "development" | "testing" | "shipped";

interface Project {
  project_id: number;
  title: string;
  description?: string;
  repository_name?: string;
  preview_url?: string;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  progress_update: Array<{
    progress_update_id: number;
    update_title: string;
    update_body?: string;
    commit_sha_reference?: string;
    created_at: string;
  }>;
}

const Hub = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;

      const { data, error } = await db.getClientProjects();

      if (error) {
        console.error("Error fetching projects:", error);
      } else if (data) {
        const typedProjects = data.map((p) => ({
          ...p,
          project_status: p.project_status as ProjectStatus,
          tech_stack: (p.tech_stack || []) as string[],
          progress_update: (p.progress_update || []).map((u: {
            progress_update_id: number;
            update_title: string;
            update_body?: string;
            commit_sha_reference?: string;
            created_at: string;
          }) => ({
            progress_update_id: u.progress_update_id,
            update_title: u.update_title,
            update_body: u.update_body,
            commit_sha_reference: u.commit_sha_reference,
            created_at: u.created_at,
          })),
        }));
        setProjects(typedProjects);
        if (typedProjects.length > 0 && !selectedProject) {
          setSelectedProject(typedProjects[0]);
        }
      }
      setIsLoading(false);
    };

    fetchProjects();
  }, [user, selectedProject]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-8 w-48 bg-secondary animate-pulse rounded" />
              <div className="h-64 bg-secondary animate-pulse rounded-lg" />
            </div>
          ) : projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-24"
            >
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                <Briefcase className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Projects Yet</h2>
              <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                Your projects will appear here once we begin working together.
              </p>
              <Button asChild className="btn-press gradient-accent text-white border-0">
                <Link to="/start">Start a Project</Link>
              </Button>
            </motion.div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar - Project List + User Info (Sticky) */}
              <div className="lg:w-72 flex-shrink-0">
                <div className="lg:sticky lg:top-24 space-y-6">
                  {/* User Card */}
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                        <User className="h-5 w-5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user?.email}</p>
                        <p className="text-xs text-muted-foreground">Client</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleSignOut}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>

                  {/* Projects List */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">
                      Your Projects
                    </span>
                    <nav className="space-y-2">
                      {projects.map((project) => (
                        <button
                          key={project.project_id}
                          onClick={() => setSelectedProject(project)}
                          className={`
                            w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between card-glow
                            ${selectedProject?.project_id === project.project_id
                              ? "bg-card border-accent shadow-card"
                              : "border-border hover:bg-card hover:shadow-card hover:border-border"
                            }
                          `}
                        >
                          <span className="text-sm font-medium truncate">{project.title}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>

              {/* Main Content - Project Dashboard (Scrollable) */}
              <div className="flex-1 min-w-0">
                {selectedProject && <ProjectDashboard project={selectedProject} />}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Hub;
