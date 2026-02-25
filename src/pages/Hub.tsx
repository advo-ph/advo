import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Briefcase, ChevronRight, User, Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useClientData, type ClientProject } from "@/hooks/useClientData";
import { useClientNotifications } from "@/hooks/useNotifications";
import ProjectDashboard from "@/components/hub/ProjectDashboard";
import FloatingNav from "@/components/landing/FloatingNav";
import Footer from "@/components/landing/Footer";

const Hub = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { projects, isLoading } = useClientData();
  const { notifications, unreadCount, markRead } = useClientNotifications();
  const [selectedProject, setSelectedProject] = useState<ClientProject | null>(null);
  const [bellOpen, setBellOpen] = useState(false);

  // Auto-select first project once loaded
  if (!selectedProject && projects.length > 0) {
    setSelectedProject(projects[0]);
  }

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
                      {/* Notification Bell */}
                      <div className="relative">
                        <button
                          onClick={() => setBellOpen(!bellOpen)}
                          className="relative p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                        >
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-bold">
                              {unreadCount}
                            </span>
                          )}
                        </button>

                        {/* Notification Dropdown */}
                        {bellOpen && (
                          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                            <div className="p-3 border-b border-border flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wider">Notifications</span>
                              {unreadCount > 0 && (
                                <Badge className="text-[10px] bg-accent text-white">
                                  {unreadCount} new
                                </Badge>
                              )}
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                              {notifications.length === 0 ? (
                                <p className="p-4 text-sm text-muted-foreground text-center">
                                  No notifications yet
                                </p>
                              ) : (
                                notifications.map((n) => (
                                  <div
                                    key={n.notification_id}
                                    className={`p-3 border-b border-border last:border-0 ${!n.is_read ? "bg-accent/5" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${n.is_read ? "text-muted-foreground" : ""}`}>
                                          {n.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                          {n.body}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                          {new Date(n.sent_at).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            hour: "numeric",
                                            minute: "2-digit",
                                          })}
                                        </p>
                                      </div>
                                      {!n.is_read && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markRead(n.notification_id);
                                          }}
                                          className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0"
                                          title="Mark as read"
                                        >
                                          <Check className="h-3 w-3 text-accent" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
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
                            ${
                              selectedProject?.project_id === project.project_id
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
