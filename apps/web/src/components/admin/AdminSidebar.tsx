import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Users2,
  Calendar,
  CalendarDays,
  CalendarClock,
  Instagram,
  FileText,
  FileSignature,
  Mic,
  Image,
  Banknote,
  Bell,
  UserPlus,
  FileCheck2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Scan,
  BookOpen,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const appVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";
const appCommit = import.meta.env.VITE_APP_COMMIT || "local";
const versionLabel = `v${appVersion} · ${appCommit}`;

export type AdminSection =
  | "dashboard"
  | "projects"
  | "clients"
  | "team"
  | "schedule"
  | "calendar"
  | "availability"
  | "contracts"
  | "meetings"
  | "social"
  | "content"
  | "portfolio"
  | "finance"
  | "notifications"
  | "leads"
  | "proposals"
  | "brand-scraper"
  | "fb-scraper"
  | "settings";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

type NavItem = { id: AdminSection; label: string; icon: React.ElementType };

const topItem: NavItem = { id: "dashboard", label: "Dashboard", icon: LayoutDashboard };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { id: "projects", label: "Projects", icon: FolderKanban },
      { id: "clients", label: "Clients", icon: Users },
      { id: "team", label: "Team", icon: Users2 },
      { id: "schedule", label: "Deliverables", icon: Calendar },
      { id: "calendar", label: "Calendar", icon: CalendarDays },
      { id: "availability", label: "Availability", icon: CalendarClock },
      { id: "contracts", label: "Contracts", icon: FileSignature },
      { id: "meetings", label: "Meetings", icon: Mic },
      { id: "finance", label: "Finance", icon: Banknote },
    ],
  },
  {
    label: "Marketing Site",
    items: [
      { id: "content", label: "Content Studio", icon: FileText },
      { id: "portfolio", label: "Portfolio", icon: Image },
      { id: "social", label: "Social", icon: Instagram },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { id: "leads", label: "Leads", icon: UserPlus },
      { id: "proposals", label: "Proposals", icon: FileCheck2 },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "brand-scraper", label: "Brand Scraper", icon: Scan },
      { id: "fb-scraper", label: "FB Scraper", icon: BookOpen },
    ],
  },
];

const AdminSidebar = ({
  activeSection,
  onSectionChange,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onMobileClose,
  theme,
  onToggleTheme,
}: AdminSidebarProps) => {
  const handleSectionChange = (s: AdminSection) => {
    onSectionChange(s);
    onMobileClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onMobileClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 72 : 240,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "fixed left-0 top-16 bottom-0 bg-card border-r border-border z-40 flex flex-col transition-transform duration-300 ease-out",
          // Mobile: slide in/out. Desktop: always visible.
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {(() => {
            const renderItem = (item: NavItem) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] flex-shrink-0",
                      isActive && "text-accent",
                    )}
                  />
                  {!isCollapsed && (
                    <span className="text-sm font-medium truncate">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            };

            return (
              <>
                <div className="space-y-1">{renderItem(topItem)}</div>
                {navGroups.map((group) => (
                  <div key={group.label} className="mt-5 space-y-1">
                    {!isCollapsed && (
                      <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50">
                        {group.label}
                      </div>
                    )}
                    {isCollapsed && (
                      <div className="mx-3 mb-1 h-px bg-border/50" />
                    )}
                    {group.items.map(renderItem)}
                  </div>
                ))}
              </>
            );
          })()}
        </nav>

        {/* Version, Theme toggle, Settings & Collapse */}
        <div className="p-3 border-t border-border space-y-1">
          {!isCollapsed && (
            <div className="px-3 pb-2 mb-2 border-b border-border/60">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Version
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {versionLabel}
              </div>
            </div>
          )}

          <button
            onClick={onToggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 flex-shrink-0" />
            ) : (
              <Moon className="h-5 w-5 flex-shrink-0" />
            )}
            {!isCollapsed && (
              <span className="text-sm font-medium">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
            )}
          </button>

          <button
            onClick={() => handleSectionChange("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
              activeSection === "settings"
                ? "bg-accent/10 text-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
            )}
          >
            <Settings
              className={cn(
                "h-5 w-5 flex-shrink-0",
                activeSection === "settings" && "text-accent",
              )}
            />
            {!isCollapsed && (
              <span className="text-sm font-medium">Settings</span>
            )}
          </button>

          {/* Collapse — desktop only */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>
    </>
  );
};

export default AdminSidebar;
