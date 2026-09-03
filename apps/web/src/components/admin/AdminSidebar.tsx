import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  Users,
  Users2,
  Calendar,
  CalendarDays,
  CalendarClock,
  Instagram,
  Mic,
  Image,
  Bell,
  UserPlus,
  FileCheck2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Scan,
  BookOpen,
  Sun,
  Moon,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrawerLock } from "@/hooks/useDrawerLock";
import { useRoles } from "@/hooks/useRoles";

/** Shared with the hamburger's aria-controls so focus returns to it on close. */
export const ADMIN_DRAWER_ID = "admin-navigation-drawer";

const appVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";
const appCommit = import.meta.env.VITE_APP_COMMIT || "local";
const versionLabel = `v${appVersion} · ${appCommit}`;

export type AdminSection =
  | "dashboard"
  | "projects"
  | "clients"
  | "team"
  | "tasks"
  | "schedule"
  | "calendar"
  | "availability"
  | "contracts"
  | "meetings"
  | "social"
  | "portfolio"
  | "finance"
  | "notifications"
  | "leads"
  | "proposals"
  | "campaign"
  | "library"
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

type NavGroup = {
  label: string;
  items: NavItem[];
  ownerOnly?: boolean;
  /** Renders a clickable heading that folds the group away. Starts closed. */
  collapsible?: boolean;
};

/**
 * `ownerOnly` groups are hidden from non-owner console users. Operations is the
 * shared surface everyone gets; everything after it is the owner's back office.
 *
 * Presentation only — the routes still exist and the API still enforces its own
 * permissions. A hidden nav item is not an access control boundary.
 *
 * Finance, Contracts, and Files are deliberately absent from every group:
 * Finance and Contracts now live inside a project (Project → Finance /
 * Contracts tabs) and the standalone screens duplicated them. Their sections
 * and routes are kept so existing /admin/finance, /admin/contracts, and
 * /admin/library links still resolve instead of bouncing to the dashboard.
 */
const navGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      // First in Operations: this is the daily-driver screen.
      { id: "tasks", label: "Tasks", icon: ListChecks },
      { id: "projects", label: "Projects", icon: FolderKanban },
      { id: "clients", label: "Clients", icon: Users },
      { id: "calendar", label: "Calendar", icon: CalendarDays },
      { id: "availability", label: "Availability", icon: CalendarClock },
      { id: "meetings", label: "Meetings", icon: Mic },
      // Last in Operations: consulted, not driven. The owner-only controls on
      // the screen itself are what gate the roster, not this nav item.
      { id: "team", label: "Team", icon: Users2 },
    ],
  },
  {
    label: "Marketing",
    collapsible: true,
    items: [
      { id: "portfolio", label: "Portfolio", icon: Image },
      { id: "social", label: "Social", icon: Instagram },
    ],
  },
  {
    label: "Sales",
    collapsible: true,
    items: [
      { id: "leads", label: "Leads", icon: UserPlus },
      { id: "proposals", label: "Proposals", icon: FileCheck2 },
      { id: "campaign", label: "Campaigns", icon: Send },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Tools",
    collapsible: true,
    items: [
      { id: "brand-scraper", label: "Brand Research", icon: Scan },
      { id: "fb-scraper", label: "Facebook Research", icon: BookOpen },
    ],
  },
];

/** The collapsible group holding this section, if any. */
const groupLabelFor = (section: AdminSection) =>
  navGroups.find((g) => g.collapsible && g.items.some((i) => i.id === section))?.label;

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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of navGroups) {
      if (g.collapsible) init[g.label] = g.items.some((i) => i.id === activeSection);
    }
    return init;
  });
  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  // isOwner starts false and flips true once /api/auth/me lands, so the
  // owner-only groups appear a beat after first paint rather than never.
  const { isOwner } = useRoles();
  const visibleGroups = navGroups.filter((g) => !g.ownerOnly || isOwner);

  // The nav list is taller than a laptop viewport, so the last group can sit
  // below the fold with nothing to hint at it. A group heading stranded at the
  // bottom edge reads as "this section is broken and empty" rather than
  // "scroll down". This tracks whether more nav exists below the visible area
  // so a fade can say so.
  const navScrollRef = useRef<HTMLElement | null>(null);
  const [hasMoreNavBelow, setHasMoreNavBelow] = useState(false);

  const syncNavOverflow = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setHasMoreNavBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useEffect(() => {
    syncNavOverflow();
    window.addEventListener("resize", syncNavOverflow);
    return () => window.removeEventListener("resize", syncNavOverflow);
  }, [syncNavOverflow, expandedGroups, isCollapsed, isOwner]);

  useEffect(() => {
    const owner = groupLabelFor(activeSection);
    if (owner) setExpandedGroups((prev) => ({ ...prev, [owner]: true }));
  }, [activeSection]);

  // The collapse toggle is `hidden lg:flex`, so a sidebar collapsed on a wide
  // screen and then narrowed became a 72px icon strip with no control left to
  // expand it. Collapse is a desktop state only.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Escape to close, scroll lock, focus trap, and focus returned to the
  // hamburger on close. The landing shells have had this since ff10f77; the
  // admin drawer never got it, so the page scrolled behind an open drawer.
  useDrawerLock(isMobileOpen && !isDesktop, onMobileClose, ADMIN_DRAWER_ID);

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
        id={ADMIN_DRAWER_ID}
        initial={false}
        animate={{
          width: isDesktop && isCollapsed ? 72 : 240,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        // Below lg this is a modal drawer over the page, so it says so. On
        // desktop it is permanent furniture and carries no dialog semantics.
        role={isDesktop ? undefined : "dialog"}
        aria-modal={isDesktop ? undefined : true}
        aria-label={isDesktop ? undefined : "Admin navigation"}
        className={cn(
          "fixed left-0 top-16 bottom-0 bg-card border-r border-border z-40 flex flex-col transition-transform duration-300 ease-out",
          // Mobile: slide in/out. Desktop: always visible.
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Navigation */}
        <div className="relative min-h-0 flex-1">
          {hasMoreNavBelow && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent"
            />
          )}
        <nav
          ref={navScrollRef}
          onScroll={syncNavOverflow}
          className="h-full p-3 overflow-y-auto"
        >
          {(() => {
            const renderItem = (item: NavItem) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent-ink"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] flex-shrink-0",
                      isActive && "text-accent-ink",
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
                {visibleGroups.map((group) => {
                  const isExpanded = expandedGroups[group.label] ?? true;
                  const showItems = !group.collapsible || isCollapsed || isExpanded;
                  const groupActive = group.collapsible && group.items.some((i) => i.id === activeSection);

                  return (
                    <div key={group.label} className="mt-3 space-y-1">
                      {!isCollapsed && group.collapsible && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.label)}
                          aria-expanded={isExpanded}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 pb-1 text-[10px] uppercase tracking-[0.16em] transition-colors",
                            groupActive
                              ? "text-accent-ink/80"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span>{group.label}</span>
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 flex-shrink-0 transition-transform duration-200",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </button>
                      )}
                      {!isCollapsed && !group.collapsible && (
                        <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {group.label}
                        </div>
                      )}
                      {isCollapsed && (
                        <div className="mx-3 mb-1 h-px bg-border/50" />
                      )}
                      {showItems && group.items.map(renderItem)}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </nav>
        </div>

        {/* Version, Theme toggle, Settings & Collapse */}
        <div className="p-3 border-t border-border space-y-1">
          {/* One line, not a labelled block. The nav list is taller than the
              viewport, so every pixel spent down here is a nav item pushed
              behind a scroll the user has no reason to suspect is there. */}
          {!isCollapsed && (
            <div className="px-3 pb-1.5 mb-1.5 border-b border-border/60 text-[11px] text-muted-foreground">
              {versionLabel}
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
                ? "bg-accent/10 text-accent-ink"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
            )}
          >
            <Settings
              className={cn(
                "h-5 w-5 flex-shrink-0",
                activeSection === "settings" && "text-accent-ink",
              )}
            />
            {!isCollapsed && (
              <span className="text-sm font-medium">Settings</span>
            )}
          </button>

          {/* Collapse — desktop only */}
          <button
            onClick={onToggleCollapse}
            // Collapsed, this button is a bare chevron with no text, so it needs
            // a name of its own.
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
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
