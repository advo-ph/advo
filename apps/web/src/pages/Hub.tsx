import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LogOut,
  Briefcase,
  ChevronRight,
  User,
  Bell,
  Check,
  FileSignature,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useClientData, type ClientProject } from "@/hooks/useClientData";
import { useClientNotifications } from "@/hooks/useNotifications";
import { useMyContracts } from "@/hooks/useContracts";
import ProjectDashboard from "@/components/hub/ProjectDashboard";
import FloatingNav from "@/components/landing/FloatingNav";

const typeLabel = (v: string) => {
  const map: Record<string, string> = {
    contract: "Contract",
    moa: "MOA",
    sow: "SOW",
    nda: "NDA",
    retainer: "Retainer",
  };
  return map[v] ?? v;
};

const statusLabel = (v: string) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1) : v;

const fmtSigned = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

const Hub = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { projects, isLoading } = useClientData();
  const { contract, isLoading: contractLoading } = useMyContracts();
  const { notifications, unreadCount, markRead } = useClientNotifications();
  const [selectedProject, setSelectedProject] = useState<ClientProject | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  // The contracts fold is a <details>; its open state follows the breakpoint.
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsWide(mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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

  const pageLoading = isLoading || contractLoading;
  const hasProject = projects.length > 0;
  const hasContract = contract.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <FloatingNav />

      <main className="pt-24 pb-16 px-6 flex-1">
        <div className="max-w-7xl mx-auto">
          {pageLoading ? (
            <div className="space-y-4">
              <div className="h-6 w-48 bg-secondary animate-pulse rounded" />
              <div className="h-64 bg-secondary animate-pulse rounded-lg" />
            </div>
          ) : !hasProject && !hasContract ? (
            <div className="border border-border rounded-lg bg-card px-4 py-12 text-center max-w-md mx-auto">
              <Briefcase className="h-7 w-7 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Your projects will appear here once we begin working together.
              </p>
              <Button asChild className="btn-press bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/start">Start a project</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Sidebar - Project List + User Info (Sticky) */}
              <div className="lg:w-72 flex-shrink-0">
                <div className="lg:sticky lg:top-24 space-y-4">
                  {/* User Card */}
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 h-12 border-b border-border">
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user?.email}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user?.role ?? "Client"}</p>
                      </div>
                      {/* Notification Bell */}
                      <div className="relative">
                        <button
                          onClick={() => setBellOpen(!bellOpen)}
                          className="relative p-1.5 rounded-md hover:bg-secondary/50 transition-colors"
                        >
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] flex items-center justify-center font-semibold tabular-nums">
                              {unreadCount}
                            </span>
                          )}
                        </button>

                        {/* Notification Dropdown */}
                        {bellOpen && (
                          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="px-3 h-11 border-b border-border flex items-center justify-between">
                              <span className="text-sm font-medium">Notifications</span>
                              {unreadCount > 0 && (
                                <span className="text-xs text-accent tabular-nums">{unreadCount} new</span>
                              )}
                            </div>
                            <div className="max-h-64 overflow-y-auto divide-y divide-border">
                              {notifications.length === 0 ? (
                                <p className="px-4 py-10 text-sm text-muted-foreground text-center">
                                  No notifications yet
                                </p>
                              ) : (
                                notifications.map((n) => (
                                  <div
                                    key={n.notification_id}
                                    className={`px-3 py-2.5 ${!n.is_read ? "bg-accent/[0.06]" : ""}`}
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
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>

                  {/* Projects List */}
                  {hasProject && (
                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                      <div className="px-3 h-9 border-b border-border flex items-center">
                        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                          Your projects
                        </span>
                      </div>
                      <nav className="flex overflow-x-auto lg:block lg:overflow-visible divide-x lg:divide-x-0 lg:divide-y divide-border">
                        {projects.map((project) => {
                          const isActive = selectedProject?.project_id === project.project_id;
                          return (
                            <button
                              key={project.project_id}
                              onClick={() => setSelectedProject(project)}
                              className={`relative shrink-0 lg:w-full text-left flex items-center justify-between gap-2 px-3 h-11 text-sm transition-colors ${
                                isActive
                                  ? "bg-accent/[0.06] text-foreground"
                                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                              }`}
                            >
                              {isActive && (
                                <span className="absolute left-0 right-0 bottom-0 h-0.5 lg:top-0 lg:right-auto lg:h-auto lg:w-0.5 bg-accent" />
                              )}
                              <span className="font-medium truncate max-w-[60vw] lg:max-w-none">{project.title}</span>
                              <ChevronRight className="hidden lg:block h-4 w-4 shrink-0 opacity-60" />
                            </button>
                          );
                        })}
                      </nav>
                    </div>
                  )}

                  {/* Contracts list — open document_url when present. Folded on
                      phones so the dashboard is one swipe away, open on a laptop. */}
                  <details className="bg-card border border-border rounded-lg overflow-hidden" open={isWide}>
                    <summary className="list-none cursor-pointer px-3 h-9 border-b border-border flex items-center gap-1.5 lg:cursor-default">
                      <FileSignature className="h-3 w-3 text-muted-foreground/70" />
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                        Contracts
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground lg:hidden">{contract.length}</span>
                    </summary>
                    {contract.length === 0 ? (
                      <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                        No contracts yet
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {contract.map((c) => {
                          const signed = fmtSigned(c.signedAt);
                          const body = (
                            <>
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">{c.title}</span>
                                {c.documentUrl && (
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 mt-0.5" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                                <span>{typeLabel(c.contractType)}</span>
                                <span aria-hidden>·</span>
                                <span>{statusLabel(c.status)}</span>
                                {signed && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>Signed {signed}</span>
                                  </>
                                )}
                              </div>
                            </>
                          );
                          return (
                            <li key={c.contractId}>
                              {c.documentUrl ? (
                                <a
                                  href={c.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                                >
                                  {body}
                                </a>
                              ) : (
                                <div className="px-3 py-2.5 text-muted-foreground">{body}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>
                </div>
              </div>

              {/* Main Content - Project Dashboard (Scrollable) */}
              <div className="flex-1 min-w-0">
                {selectedProject ? (
                  <ProjectDashboard project={selectedProject} />
                ) : (
                  <div className="border border-border rounded-lg bg-card px-4 py-12 text-center">
                    <FileSignature className="h-7 w-7 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Your signed contracts are listed in the sidebar.
                      {hasContract
                        ? " Open a document link to view the file."
                        : " Projects will appear here when work begins."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Hub;
