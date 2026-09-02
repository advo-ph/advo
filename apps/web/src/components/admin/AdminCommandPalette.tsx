/**
 * ⌘K — the admin's way past a sidebar that has outgrown itself.
 *
 * There are twenty-odd admin sections behind a sidebar with a collapsible Tools group.
 * Past roughly a dozen destinations, navigation stops being free: you scan, you guess
 * which group something is under, and you learn a spatial map that changes whenever a
 * section is added. A palette makes the cost of a destination independent of how many
 * there are, which is exactly the property a growing admin needs.
 *
 * Four things this does that a naive palette does not:
 *
 *   1. IT DOES NOT SWALLOW ⌘K WHILE SOMEONE IS TYPING. If focus is in an input, a
 *      textarea, or a contenteditable, the keystroke belongs to that field. A palette
 *      that hijacks a shortcut mid-sentence is worse than no palette.
 *
 *   2. ACTIONS, NOT JUST DESTINATIONS. "Export this month's books" is a thing an admin
 *      wants to DO, and burying it three clicks into Finance is why nobody knows it
 *      exists. Actions are grouped separately so the list does not read as one
 *      undifferentiated soup.
 *
 *   3. IT NAMES SYNONYMS. Someone looking for invoices types "invoice", not "finance";
 *      someone looking for the sign-off flow types "revision". `keyword` carries the
 *      words people actually reach for, which is most of what makes search feel like it
 *      works.
 *
 *   4. THE EXPORT ACTION IS HONEST ABOUT ITS PERIOD. It exports the CURRENT CALENDAR
 *      MONTH TO DATE and says so in the label, rather than picking a range silently.
 *      A finance export whose period you have to guess is one nobody can check.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarDays,
  Download,
  FileCheck2,
  FileSignature,
  FileText,
  FolderKanban,
  Image,
  Instagram,
  LayoutDashboard,
  Mic,
  MessageSquare,
  Clock,
  Bell,
  Send,
  Settings,
  UserPlus,
  Users,
  Users2,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { getAccessToken } from "@/lib/api";
import type { AdminSection } from "@/components/admin/AdminSidebar";

type Destination = {
  id: AdminSection;
  label: string;
  icon: React.ElementType;
  /** The words people actually type. Search matches these as well as the label. */
  keyword: string;
};

const DESTINATION: Destination[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, keyword: "overview home start" },
  { id: "projects", label: "Projects", icon: FolderKanban, keyword: "project work engagement build" },
  { id: "clients", label: "Clients", icon: Users, keyword: "client customer company account" },
  { id: "library", label: "Library", icon: BookOpen, keyword: "library asset prompt module reuse" },
  { id: "team", label: "Team", icon: Users2, keyword: "team member dev staff people junior" },
  { id: "schedule", label: "Deliverables", icon: Calendar, keyword: "deliverable task todo milestone" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, keyword: "calendar event schedule date" },
  { id: "availability", label: "Availability", icon: CalendarClock, keyword: "availability capacity blackout school load" },
  { id: "contracts", label: "Contracts", icon: FileSignature, keyword: "contract moa sow nda signed paper agreement" },
  { id: "meetings", label: "Meetings", icon: Mic, keyword: "meeting mom minutes plaud recording transcript" },
  { id: "messages", label: "Messages", icon: MessageSquare, keyword: "message sms viber messenger inbox inbound outbound consent triage chat text" },
  { id: "time", label: "Time", icon: Clock, keyword: "time hours effort log timesheet capacity load actual" },
  // The synonym that matters most: nobody navigates to "Finance" looking for an invoice.
  { id: "finance", label: "Finance", icon: Banknote, keyword: "invoice payment money expense billing receipt recurring fee commission payout revenue" },
  { id: "content", label: "Content Studio", icon: FileText, keyword: "content copy cms page" },
  { id: "portfolio", label: "Portfolio", icon: Image, keyword: "portfolio case study proof work showcase" },
  { id: "social", label: "Social", icon: Instagram, keyword: "social instagram post feed" },
  { id: "leads", label: "Leads", icon: UserPlus, keyword: "lead prospect inbound enquiry clinic" },
  { id: "proposals", label: "Proposals", icon: FileCheck2, keyword: "proposal quote quotation pitch" },
  { id: "campaign", label: "Campaigns", icon: Send, keyword: "campaign outreach email blast send suppression bounce" },
  { id: "notifications", label: "Notifications", icon: Bell, keyword: "notification alert notify" },
  { id: "settings", label: "Settings", icon: Settings, keyword: "settings config preference branding" },
];

/**
 * True when the keystroke belongs to whatever the person is typing in.
 *
 * Without this, ⌘K inside a project description opens the palette and eats the
 * keystroke — and the person loses their place in a form they were halfway through.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** The first day of the current month, and today, as YYYY-MM-DD in local time. */
function currentMonthRange(now: Date = new Date()): { fromOn: string; toOn: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    fromOn: `${y}-${pad(m)}-01`,
    toOn: `${y}-${pad(m)}-${pad(now.getDate())}`,
  };
}

interface AdminCommandPaletteProps {
  onNavigate: (section: AdminSection) => void;
}

const AdminCommandPalette = ({ onNavigate }: AdminCommandPaletteProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // Choice 1: never steal the keystroke from a field.
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setIsOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (section: AdminSection) => {
      setIsOpen(false);
      onNavigate(section);
    },
    [onNavigate],
  );

  /**
   * Download a books sheet for the month so far.
   *
   * fetch + object URL rather than a bare `window.open`, because the endpoint is
   * authenticated and a plain navigation carries no Authorization header — it would
   * download a 401 body as a .csv, which looks like a corrupt export rather than an
   * auth problem.
   */
  const exportSheet = useCallback(async (sheet: "revenue" | "expense" | "summary") => {
    setIsOpen(false);
    const { fromOn, toOn } = currentMonthRange();
    const base = import.meta.env.DEV ? "http://localhost:6407" : "https://api.advo.ph";
    const token = getAccessToken();

    const res = await fetch(
      `${base}/api/insight/export/${sheet}?fromOn=${fromOn}&toOn=${toOn}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) {
      // Surfaced rather than swallowed: a silent no-op on a download is indistinguishable
      // from a browser that blocked it, and people retry forever.
      window.alert(`Export failed (${res.status}). ${await res.text()}`);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `advo-${sheet}-${fromOn}-to-${toOn}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const { fromOn, toOn } = currentMonthRange();

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput placeholder="Go to, or do…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Go to">
          {DESTINATION.map((one) => (
            <CommandItem
              key={one.id}
              value={`${one.label} ${one.keyword}`}
              onSelect={() => go(one.id)}
            >
              <one.icon className="mr-2 h-4 w-4" aria-hidden="true" />
              {one.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Choice 2: things to DO. Choice 4: the period is in the label, not implied. */}
        <CommandGroup heading={`Export — ${fromOn} to ${toOn}`}>
          <CommandItem
            value="export revenue invoices books bookkeeping csv accountant"
            onSelect={() => exportSheet("revenue")}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Revenue (CSV)
            <CommandShortcut>month to date</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="export expense receipts books bookkeeping csv accountant"
            onSelect={() => exportSheet("expense")}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Expenses (CSV)
            <CommandShortcut>month to date</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="export summary totals books bookkeeping csv accountant"
            onSelect={() => exportSheet("summary")}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Summary (CSV)
            <CommandShortcut>month to date</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default AdminCommandPalette;
