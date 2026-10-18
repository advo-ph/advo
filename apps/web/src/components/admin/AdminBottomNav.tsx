import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  CalendarDays,
  FolderKanban,
  ListChecks,
  MoreHorizontal,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrawerLock } from "@/hooks/useDrawerLock";
import { topItem, useVisibleNavGroups, type AdminSection } from "@/components/admin/AdminSidebar";

export const ADMIN_MORE_SHEET_ID = "admin-more-sheet";

interface AdminBottomNavProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

const MAIN_ITEMS = [
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "availability", label: "Availability", icon: CalendarClock },
] as const satisfies ReadonlyArray<{ id: AdminSection; label: string; icon: unknown }>;

const MAIN_IDS: readonly AdminSection[] = MAIN_ITEMS.map((i) => i.id);

// Phone only. The thumb reaches the bottom of the screen, not the top-left
// corner, so the daily sections live on the bar and the rest sit behind "More".
const AdminBottomNav = ({ activeSection, onSectionChange }: AdminBottomNavProps) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { visibleGroups } = useVisibleNavGroups();
  const close = () => setIsMoreOpen(false);

  // Escape, scroll lock, focus trap, and focus back to "More" on close.
  useDrawerLock(isMoreOpen, close, ADMIN_MORE_SHEET_ID);

  // A short, flat list on purpose: the four pages people reach for on a phone, no
  // category headers. Everything else stays in the desktop sidebar and ⌘K. Meetings
  // and Team still honour the owner's Settings → Sidebar visibility.
  const visibleItem = (id: AdminSection) =>
    visibleGroups.flatMap((g) => g.items).find((i) => i.id === id);
  const moreItems = [
    topItem,
    visibleItem("meetings"),
    visibleItem("team"),
    { id: "settings" as AdminSection, label: "Settings", icon: Settings },
  ].filter((i): i is NonNullable<typeof i> => !!i);

  const isMainSection = MAIN_IDS.includes(activeSection);

  const go = (id: AdminSection) => {
    onSectionChange(id);
    close();
  };

  const itemClass = (active: boolean) =>
    cn(
      "flex-1 min-w-0 min-h-12 flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors",
      active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="lg:hidden">
      <AnimatePresence>
        {isMoreOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            />
            <motion.div
              key="sheet"
              id={ADMIN_MORE_SHEET_ID}
              role="dialog"
              aria-modal="true"
              aria-label="More pages"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
              transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 34 }}
              style={{ transformOrigin: "bottom right" }}
              className="fixed inset-x-3 z-50 mx-auto max-w-md bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] max-h-[min(70vh,560px)] flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl shadow-black/15"
            >
              <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-sm font-medium">More</span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="min-h-11 min-w-11 -mr-2 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {moreItems.map(({ id, label, icon: Icon }) => {
                    const active = activeSection === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => go(id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "min-h-[72px] flex flex-col items-center justify-center gap-1.5 rounded-2xl px-1 transition-colors",
                          active
                            ? "bg-foreground/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[11px] font-medium text-center leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        aria-label="Main sections"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-1 p-1.5 rounded-full border border-border/60 bg-background/60 backdrop-blur-xl backdrop-saturate-150 shadow-lg shadow-black/10">
          {MAIN_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = !isMoreOpen && activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={active ? "page" : undefined}
                className={itemClass(active)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium truncate max-w-full">{label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsMoreOpen((v) => !v)}
            aria-controls={ADMIN_MORE_SHEET_ID}
            aria-expanded={isMoreOpen}
            className={itemClass(isMoreOpen || !isMainSection)}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default AdminBottomNav;
