import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAdminData } from "@/hooks/useAdminData";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import { useTheme } from "@/hooks/useTheme";
import { formatCurrency } from "@/types/admin";

import ErrorBoundary from "@/components/ErrorBoundary";

// Admin Components
import AdminSidebar, { ADMIN_DRAWER_ID, type AdminSection } from "@/components/admin/AdminSidebar";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminProjects from "@/components/admin/AdminProjects";
import AdminClients from "@/components/admin/AdminClients";
import AdminTeam from "@/components/admin/AdminTeam";
import AdminTasks from "@/components/admin/AdminTasks";
import AdminSchedule from "@/components/admin/AdminSchedule";
import AdminCalendar from "@/components/admin/AdminCalendar";
import AdminContracts from "@/components/admin/AdminContracts";
import AdminMeetings from "@/components/admin/AdminMeetings";
import AdminSocial from "@/components/admin/AdminSocial";
import AdminAvailability from "@/components/admin/AdminAvailability";
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

/**
 * Names each section for the error boundary heading, so a crash says which page
 * broke. Typed as a full Record, so adding a section to AdminSection without a
 * label here is a compile error rather than a silent blank.
 */
const SECTION_LABEL: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  clients: "Clients",
  team: "Team",
  tasks: "Tasks",
  schedule: "Work Items",
  calendar: "Calendar",
  availability: "Availability",
  contracts: "Contracts",
  meetings: "Meetings",
  social: "Social",
  portfolio: "Portfolio",
  finance: "Finance",
  notifications: "Notifications",
  leads: "Leads",
  proposals: "Proposals",
  campaign: "Campaigns",
  library: "Library",
  "brand-scraper": "Brand Scraper",
  "fb-scraper": "FB Scraper",
  settings: "Settings",
};

/**
 * The URL is user input, so a path segment is only a section if it is one of the
 * keys above. SECTION_LABEL is the single list, which means a new section cannot
 * be routable without also being nameable.
 */
function isAdminSection(value: string | undefined): value is AdminSection {
  return !!value && Object.prototype.hasOwnProperty.call(SECTION_LABEL, value);
}

const Admin = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme(user?.userId);

  // The section lives in the URL, not in state. Before this it was useState, so
  // the whole console was one address: no deep link to a page, no bookmark, and
  // no browser back. Back matters most on a phone, where it is a system gesture.
  const { section } = useParams<{ section: string }>();
  const activeSection: AdminSection = isAdminSection(section) ? section : "dashboard";
  const setActiveSection = (next: AdminSection) => navigate(`/admin/${next}`);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // An unknown or missing section settles on the dashboard, and rewrites the
  // address so a stale bookmark repairs itself instead of lingering.
  useEffect(() => {
    if (!isAdminSection(section)) navigate("/admin/dashboard", { replace: true });
  }, [section, navigate]);

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Calculate sidebar width for main content offset
  const sidebarWidth = isSidebarCollapsed ? 72 : 240;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              // useDrawerLock finds this by aria-controls to hand focus back
              // when the drawer closes.
              aria-controls={ADMIN_DRAWER_ID}
              aria-expanded={isMobileMenuOpen}
              className="lg:hidden min-h-11 min-w-11 p-2 -ml-2 flex items-center justify-center text-foreground hover:bg-secondary/60 rounded-lg transition-colors"
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
            <span className="hidden sm:block text-sm text-muted-foreground">Members</span>
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
          {/* One boundary per section, keyed on the section id. A crash in one
              section leaves the header and sidebar mounted, so the user can
              always navigate away, and switching sections remounts the boundary
              and clears the error. */}
          <ErrorBoundary
            key={activeSection}
            label={SECTION_LABEL[activeSection]}
            hint="Pick another section from the sidebar, or try again."
          >
            {activeSection === "dashboard" && (
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

            {activeSection === "tasks" && <AdminTasks />}

            {activeSection === "schedule" && <AdminSchedule />}

            {activeSection === "calendar" && <AdminCalendar />}

            {activeSection === "availability" && <AdminAvailability />}

            {activeSection === "contracts" && <AdminContracts clients={clients} />}

            {activeSection === "meetings" && <AdminMeetings projects={projects} />}

            {activeSection === "social" && <AdminSocial />}

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
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
};

export default Admin;
