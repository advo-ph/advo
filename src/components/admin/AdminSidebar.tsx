import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Users2,
  Calendar,
  CalendarClock,
  Instagram,
  FileText,
  Image,
  Banknote,
  Bell,
  UserPlus,
  Settings,
  ChevronLeft,
  ChevronRight,
  Scan,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminSection =
  | "dashboard"
  | "projects"
  | "clients"
  | "team"
  | "schedule"
  | "availability"
  | "social"
  | "content"
  | "portfolio"
  | "finance"
  | "notifications"
  | "leads"
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
}

const navItems: { id: AdminSection; label: string; icon: React.ElementType }[] =
  [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "clients", label: "Clients", icon: Users },
    { id: "team", label: "Team", icon: Users2 },
    { id: "schedule", label: "Deliverables", icon: Calendar },
    { id: "availability", label: "Availability", icon: CalendarClock },
    { id: "social", label: "Social", icon: Instagram },
    { id: "content", label: "Content Studio", icon: FileText },
    { id: "portfolio", label: "Portfolio", icon: Image },
    { id: "finance", label: "Finance", icon: Banknote },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "leads", label: "Leads", icon: UserPlus },
    { id: "brand-scraper", label: "Brand Scraper", icon: Scan },
    { id: "fb-scraper", label: "FB Scraper", icon: BookOpen },
  ];

const AdminSidebar = ({
  activeSection,
  onSectionChange,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onMobileClose,
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
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSectionChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
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
          })}
        </nav>

        {/* Settings & Collapse */}
        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => handleSectionChange("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
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
            className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
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
