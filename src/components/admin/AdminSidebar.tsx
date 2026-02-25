import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Calendar,
  CalendarClock,
  Instagram,
  Inbox,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminSection = "dashboard" | "projects" | "clients" | "schedule" | "availability" | "social" | "leads" | "settings";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems: { id: AdminSection; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "clients", label: "Clients", icon: Users },
  { id: "schedule", label: "Deliverables", icon: Calendar },
  { id: "availability", label: "Availability", icon: CalendarClock },
  { id: "social", label: "Social", icon: Instagram },
  { id: "leads", label: "Leads", icon: Inbox },
];

const AdminSidebar = ({
  activeSection,
  onSectionChange,
  isCollapsed,
  onToggleCollapse,
}: AdminSidebarProps) => {
  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 240 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed left-0 top-16 bottom-0 bg-card border-r border-border z-40 flex flex-col"
    >
      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-accent")} />
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium truncate"
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings & Collapse */}
      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={() => onSectionChange("settings")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
            activeSection === "settings"
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Settings className={cn("h-5 w-5 flex-shrink-0", activeSection === "settings" && "text-accent")} />
          {!isCollapsed && <span className="text-sm font-medium">Settings</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
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
  );
};

export default AdminSidebar;
