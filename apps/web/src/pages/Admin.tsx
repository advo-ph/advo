import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAdminData } from "@/hooks/useAdminData";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { useTheme } from "@/hooks/useTheme";
import { formatCurrency } from "@/types/admin";

// Admin Components
import AdminSidebar, { type AdminSection } from "@/components/admin/AdminSidebar";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminRiskPanel from "@/components/admin/AdminRiskPanel";
import AdminCommandPalette from "@/components/admin/AdminCommandPalette";
import AdminProjects from "@/components/admin/AdminProjects";
import AdminClients from "@/components/admin/AdminClients";
import AdminTeam from "@/components/admin/AdminTeam";
import AdminSchedule from "@/components/admin/AdminSchedule";
import AdminCalendar from "@/components/admin/AdminCalendar";
import AdminContracts from "@/components/admin/AdminContracts";
import AdminMeetings from "@/components/admin/AdminMeetings";
import AdminMessages from "@/components/admin/AdminMessages";
import AdminCorpus from "@/components/admin/AdminCorpus";
import AdminTime from "@/components/admin/AdminTime";
import AdminSocial from "@/components/admin/AdminSocial";
import AdminAvailability from "@/components/admin/AdminAvailability";
import AdminContentStudio from "@/components/admin/AdminContentStudio";
import AdminPortfolio from "@/components/admin/AdminPortfolio";
import AdminFinance from "@/components/admin/AdminFinance";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminLeads from "@/components/admin/AdminLeads";
import AdminProposals from "@/components/admin/AdminProposals";
import AdminCampaign from "@/components/admin/AdminCampaign";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminBrandScraper from "@/components/admin/AdminBrandScraper";
import AdminFacebookScraper from "@/components/admin/AdminFacebookScraper";
import AdminLibrary from "@/components/admin/AdminLibrary";

const Admin = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme(user?.userId);

  // Layout state
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Centralized data
  const {
    projects,
    clients,
    leads,
    recentActivity,
    upcomingDeadlines,
    isLoading,
    refetch,
  } = useAdminData(user);

  // GitHub-enriched projects for the Projects section
  const {
    projects: orgProjects,
    isLoading: orgLoading,
    refetch: orgRefetch,
  } = useOrgProjects();

  // Only the ACTIVE members. A capacity view listing people who have left reads as a
  // team that is under-loaded, which is the opposite of the truth.
  const { activeMembers } = useAdminTeam();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Calculate sidebar width for main content offset
  const sidebarWidth = isSidebarCollapsed ? 72 : 240;

  return (
    <div className={`min-h-screen bg-background${theme === "light" ? " admin-light" : ""}`}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-foreground hover:bg-secondary/60 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="shrink-0">
              <img
                src="/advo-logo-black.png"
                alt="ADVO"
                className={`h-5 w-auto${theme === "dark" ? " invert" : ""}`}
              />
            </Link>
            <span className="hidden sm:block h-3.5 w-px bg-border" />
            <span className="hidden sm:block text-sm text-muted-foreground">Console</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="hidden md:inline text-sm text-muted-foreground truncate max-w-[180px]">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      {/* ⌘K. Mounted at page level rather than inside a section, so reaching any
          destination costs the same from anywhere in admin — which is the whole point
          of a palette once the sidebar has twenty entries. */}
      <AdminCommandPalette onNavigate={setActiveSection} />

      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content */}
      <main
        className="pt-24 pb-16 px-4 sm:px-6 transition-all duration-200 lg:ml-[var(--sidebar-w)]"
        style={{ ["--sidebar-w" as string]: `${sidebarWidth}px` }}
      >
        <div className="max-w-6xl mx-auto">
          {activeSection === "dashboard" && (
            <>
              {/* Above the pipeline, deliberately. Coffee Rush went into development
                  with no signed contract and nothing on this screen said so, even
                  though every fact needed to say it was already in the database.
                  The panel renders NOTHING when there is nothing to report — a
                  permanent "0 issues" tile is furniture, and furniture is invisible
                  by the time it finally has something on it. */}
              <div className="mb-5">
                <AdminRiskPanel
                  formatCurrency={formatCurrency}
                  onOpenProject={() => setActiveSection("projects")}
                />
              </div>
              <AdminDashboard
                projects={projects}
                clients={clients}
                leads={leads}
                formatCurrency={formatCurrency}
                recentActivity={recentActivity}
                upcomingDeadlines={upcomingDeadlines}
                userName={user?.email}
                onNavigate={setActiveSection}
              />
            </>
          )}

          {activeSection === "projects" && (
            <AdminProjects
              projects={orgProjects}
              clients={clients}
              isLoading={orgLoading}
              onRefresh={orgRefetch}
            />
          )}

          {activeSection === "clients" && (
            <AdminClients
              clients={clients}
              isLoading={isLoading}
              onRefresh={refetch}
            />
          )}

          {activeSection === "team" && <AdminTeam />}

          {activeSection === "schedule" && <AdminSchedule />}

          {activeSection === "calendar" && <AdminCalendar />}

          {activeSection === "availability" && <AdminAvailability />}

          {activeSection === "contracts" && <AdminContracts clients={clients} />}

          {activeSection === "meetings" && <AdminMeetings projects={projects} />}

          {activeSection === "messages" && <AdminMessages />}
          {activeSection === "corpus" && <AdminCorpus />}

          {/* Team comes from useAdminTeam so the load bars can name people rather than
              printing member ids -- a capacity view that says "Member 7 is over" is one
              nobody acts on. */}
          {activeSection === "time" && <AdminTime projects={projects} team={activeMembers} />}

          {activeSection === "social" && <AdminSocial />}

          {activeSection === "content" && <AdminContentStudio />}

          {activeSection === "portfolio" && <AdminPortfolio />}

          {activeSection === "finance" && <AdminFinance projects={projects} />}

          {activeSection === "notifications" && <AdminNotifications />}

          {activeSection === "leads" && <AdminLeads />}

          {activeSection === "proposals" && <AdminProposals />}
          {activeSection === "campaign" && <AdminCampaign />}

          {activeSection === "library" && <AdminLibrary />}

          {activeSection === "brand-scraper" && <AdminBrandScraper />}

          {activeSection === "fb-scraper" && <AdminFacebookScraper />}

          {activeSection === "settings" && <AdminSettings />}
        </div>
      </main>
    </div>
  );
};

export default Admin;
