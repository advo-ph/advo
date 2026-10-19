import { useState, useMemo, useLayoutEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
import {
  Plus,
  School,
  Users,
  Ban,
  Loader2,
  Trash2,
  ChevronsUpDown,
  CalendarSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam, publicSiteOrder } from "@/hooks/useAdminTeam";
import {
  useAdminAvailability,
  blockAppliesOn,
  type AvailabilityBlock,
  type BlockType,
} from "@/hooks/useAdminAvailability";
import { useCalendar } from "@/hooks/useCalendar";
import { useRoles } from "@/hooks/useRoles";
import {
  formatManilaDate,
  manilaToday,
  minutesToClock12h,
  timeRangeProblem,
  timeToMinutes,
} from "@/lib/manila-time";
import {
  ATTENDANCE_ORDER,
  classifyAttendance,
  findDaySlots,
  formatClockRange12h,
  majorityLabel,
  meetingDays,
  meetingSpan,
  type AttendanceStatus,
  type BusyInterval,
  type MajoritySlot,
  type MeetingWindowInput,
  type Range,
} from "@/lib/free-time";
import { advancePastSearchDates, availabilityHorizon, defaultAvailabilityMeeting, defaultSearchDates } from "@/lib/availability-search";
import { FreeMembersMeeting, FreeTimeDateRange } from "./AvailabilitySearchFields";
import { layoutAvailabilitySlots } from "@/lib/availability-layout";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { ResponsiveSheet } from "@/components/admin/shared/ResponsiveSheet";
import { Panel } from "./_ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The grid starts at 7am. Nobody schedules work at 3am, and the six empty rows above
 * it were most of why the week did not fit on one screen. A block that starts earlier
 * is clipped to 7am; one that ends by 7am is listed under the grid instead.
 */
const FIRST_HOUR = 7;
const GRID_START = FIRST_HOUR * 60;
const HOURS = Array.from({ length: 24 - FIRST_HOUR }, (_, i) => FIRST_HOUR + i); // 7am to 11pm

const hourLabel = (hour: number) => minutesToClock12h(hour * 60);

/** A free slot shorter than this is not a meeting, it is an arithmetic artefact. */
const MIN_FREE_SLOT_MINUTES = 30;

// Cool, flat palette — small color cues against the charcoal canvas, no glow.
// `short` is for the legend and the type chips, which both have to fit one line at 390px.
const blockTypeConfig: Record<BlockType, { label: string; short: string; color: string; bgColor: string; dot: string; icon: React.ElementType }> = {
  school: { label: "School", short: "School", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500", icon: School },
  meeting: { label: "Meeting", short: "Meeting", color: "text-violet-400", bgColor: "bg-violet-500/10 border-violet-500/30", dot: "bg-violet-500", icon: Users },
  unavailable: { label: "Unavailable", short: "Unavailable", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/30", dot: "bg-rose-500", icon: Ban },
};
const BLOCK_TYPES = Object.keys(blockTypeConfig) as BlockType[];

// Text labels identify the Free Members groups.
const attendanceConfig: Record<AttendanceStatus, { label: string }> = {
  available: { label: "Available" },
  "may-be-late": { label: "May be late" },
  "will-be-late": { label: "Will be late" },
  "leaves-early": { label: "Leaves early" },
  "not-available": { label: "Not available" },
};

/** Fit the longest first name, then apply that size to the whole roster. */
function CompactPeopleGrid({ children }: { children: ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const fitNames = () => {
      grid.style.fontSize = "14px";
      let size = 14;
      grid.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        const name = button.querySelector<HTMLElement>("span");
        if (!name) return;
        const style = getComputedStyle(button);
        const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const width = name.getBoundingClientRect().width;
        if (width > 0) size = Math.min(size, 14 * available / width);
      });
      grid.style.fontSize = `${Math.max(1, Math.floor(size * 10) / 10)}px`;
    };
    fitNames();
    const observer = new ResizeObserver(fitNames);
    observer.observe(grid);
    let active = true;
    document.fonts?.ready.then(() => { if (active) fitNames(); });
    return () => { active = false; observer.disconnect(); };
  }, [children]);
  return <div ref={gridRef} className="grid grid-cols-4 gap-1.5 text-sm md:grid-cols-5">{children}</div>;
}

type SearchMode = "time" | "members";

// ─── Minute ranges ───
// Everything below works in minutes past midnight. The grid used to compare only
// parseInt(start_time.split(":")[0]), which threw the minutes away: "13:15–13:45" matched
// no cell at all and rendered nowhere, while reporting "Added" on save. The range maths
// (merge, subtract, the free-time sweep) lives in lib/free-time.ts.

const rangeOf = (b: AvailabilityBlock): Range => ({
  start: timeToMinutes(b.start_time),
  end: timeToMinutes(b.end_time, true),
});

// ─── One-off dates ───
// A block whose window is shorter than a week falls on one date at most: an exam day, a
// school break. It is not part of the weekly pattern, so the grid draws it only in the
// week it falls in and lists it under the grid until then. Drawn every week, ten all-day
// exam and break days turned a member's whole Sun–Wed into one solid wall.

const DAY_MS = 86_400_000;

const isOneOff = (b: AvailabilityBlock) =>
  b.effective_from !== null &&
  b.effective_to !== null &&
  Date.parse(b.effective_to) - Date.parse(b.effective_from) < 7 * DAY_MS;

/** The date a one-off block falls on, or null when its weekday is not in its window. */
function oneOffDate(b: AvailabilityBlock): string | null {
  const from = Date.parse(`${b.effective_from}T00:00:00Z`);
  const shift = (b.day_of_week - new Date(from).getUTCDay() + 7) % 7;
  const date = new Date(from + shift * DAY_MS).toISOString().slice(0, 10);
  return date <= b.effective_to! ? date : null;
}

/** Sun–Sat of the Manila week holding `today`, as YYYY-MM-DD. */
function weekOf(today: string): string[] {
  const at = Date.parse(`${today}T00:00:00Z`);
  const sunday = at - new Date(at).getUTCDay() * DAY_MS;
  return DAYS.map((_, i) => new Date(sunday + i * DAY_MS).toISOString().slice(0, 10));
}

const AdminAvailability = () => {
  const { toast } = useToast();
  const { members, isLoading: teamLoading } = useAdminTeam();
  // Everyone in the order the public team page shows them; staff who are not on the
  // site but can sign in come last, by name. A switched-off login is not listed.
  const teamMembers = useMemo(
    () => publicSiteOrder(members.filter((m) => m.is_active || m.can_login === true)),
    [members],
  );
  const {
    blocks,
    isLoading: blocksLoading,
    createBlock,
    updateBlock,
    deleteBlock,
    isSaving,
  } = useAdminAvailability();
  const { teamMemberId: myMemberId, isLoading: rolesLoading } = useRoles();

  const isLoading = teamLoading || blocksLoading || rolesLoading;

  // Whose week is on screen. Plain component state on purpose: every visit opens on
  // the signed-in person's own schedule, and picking someone else lasts only until
  // the page is left. Falls back to the first roster member for a login with no
  // roster row (e.g. the shared admin account).
  const [pickedMember, setPickedMember] = useState<number | null>(null);
  const myMember = teamMembers.find((m) => m.team_member_id === myMemberId) ?? null;
  const selectedMember =
    pickedMember ?? myMember?.team_member_id ?? teamMembers[0]?.team_member_id ?? null;
  const selectedMemberRow = teamMembers.find((m) => m.team_member_id === selectedMember) ?? null;
  // The picker lists the signed-in person first, then the roster in team order.
  const pickerMembers = myMember
    ? [myMember, ...teamMembers.filter((m) => m.team_member_id !== myMember.team_member_id)]
    : teamMembers;

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [formData, setFormData] = useState({
    team_member_id: "",
    day_of_week: "1",
    start_time: "09:00",
    end_time: "12:00",
    // "unavailable", not "meeting": the neutral "something is on" default, so a school
    // or personal block saved before its type is picked is not mislabelled a meeting.
    block_type: "unavailable" as BlockType,
    label: "",
    effective_from: "",
    effective_to: "",
  });

  // Find Free Time state
  const [showFreeTime, setShowFreeTime] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const hasOpenedFreeTime = useRef(false);
  // "time": when can the selected people meet. "members": who can make one meeting.
  const [searchMode, setSearchMode] = useState<SearchMode>("time");
  const [searchDates, setSearchDates] = useState(defaultSearchDates);
  const [meetingWindow, setMeetingWindow] = useState<MeetingWindowInput>(defaultAvailabilityMeeting);

  // The concrete days the free-time search covers. Recurring blocks have no dates, but
  // meetings and deadlines do, so the search has to happen on real days to be able to
  // subtract them.
  const horizon = useMemo(
    () => availabilityHorizon(searchDates.start, searchDates.end),
    [searchDates.start, searchDates.end],
  );

  const { events, isLoading: calendarLoading } = useCalendar(horizon.from, horizon.to);

  /**
   * Dated bookings that actually occupy time, as minute ranges, keyed by day.
   *
   * All-day entries are skipped on purpose. Most of what GET /api/calendar returns is a
   * marker rather than a meeting — a deliverable due date, an invoice due date, a BIR
   * filing deadline, a contract expiry — and all of them arrive with allDay: true.
   * Treating a marker as occupied time would delete a whole day from the search because
   * something is due at the end of it, which is the opposite of useful.
   *
   * An event with no end is given 30 minutes so that a bare point in time still displaces
   * a slot rather than being silently free.
   */
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Range[]>();
    for (const e of events) {
      if (e.allDay) continue;
      const start = new Date(e.start);
      if (Number.isNaN(start.getTime())) continue;
      const rawEnd = e.end ? new Date(e.end) : null;
      const last =
        rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd > start
          ? rawEnd
          : new Date(start.getTime() + 30 * 60 * 1000);

      for (const day of horizon.days) {
        const dayStart = new Date(day.date);
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);
        if (last <= dayStart || start >= dayEnd) continue;

        const from = Math.max(0, (start.getTime() - dayStart.getTime()) / 60_000);
        const to = Math.min(1440, (last.getTime() - dayStart.getTime()) / 60_000);
        if (to > from) map.set(day.key, [...(map.get(day.key) ?? []), { start: from, end: to }]);
      }
    }
    return map;
  }, [events, horizon.days]);

  const filteredBlocks = useMemo(() => {
    if (!selectedMember) return [];
    return blocks.filter((b) => b.team_member_id === selectedMember);
  }, [blocks, selectedMember]);

  // The selected people in roster order, so "Majority except …" and the Free Members
  // groups list names the same way the people chips do, whatever order they were tapped.
  const selectedRoster = useMemo(
    () => teamMembers.filter((m) => selectedMembers.includes(m.team_member_id)),
    [teamMembers, selectedMembers],
  );

  /**
   * Free Time: per day, where everyone is free, then where a strict majority is.
   *
   * Three things were wrong here once and all three had the same shape: the search was
   * narrower than the data it claimed to summarise.
   *
   *   1. It looped `day = 1; day <= 5`, so Saturday and Sunday were never considered even
   *      though the grid above renders weekend blocks and people work weekends.
   *   2. It subtracted only some block types, so it proposed meetings during a class.
   *   3. Its dependency list named only blocks, so nothing dated was ever subtracted and
   *      it proposed slots on top of meetings that already existed.
   *
   * So: every day, the 7am–midnight window minus every block (school, meeting and
   * unavailable are all busy), swept across the selected people (findDaySlots), with the
   * dated bookings on that date taken out of both tiers, and anything too short to be a
   * meeting dropped.
   */
  const freeTimeDays = useMemo(() => {
    if (!showFreeTime || searchMode !== "time" || selectedRoster.length < 2) return [];

    const days: { key: string; date: Date; dow: number; everyone: Range[]; majority: MajoritySlot[] }[] = [];
    for (const day of horizon.days) {
      const members = selectedRoster.map((member) => ({
        id: member.team_member_id,
        busy: blocks
          .filter((b) => b.team_member_id === member.team_member_id && blockAppliesOn(b, day.key, day.dow))
          .map(rangeOf),
      }));
      const { everyone, majority } = findDaySlots(members, {
        base: { start: Math.min(1440, Math.max(GRID_START, Math.ceil((Date.now() - day.date.getTime()) / 60_000))), end: 1440 },
        bookings: bookingsByDay.get(day.key) ?? [],
        minMinutes: MIN_FREE_SLOT_MINUTES,
      });
      if (everyone.length > 0 || majority.length > 0) {
        days.push({ key: day.key, date: day.date, dow: day.dow, everyone, majority });
      }
    }
    return days;
  }, [showFreeTime, searchMode, selectedRoster, blocks, horizon.days, bookingsByDay]);

  /**
   * Free Members: where each selected person lands for one start/end.
   *
   * Busy is that person's own school / meeting / unavailable blocks, at their real clock
   * times (not clipped to the 7am grid), on the meeting date plus the day
   * before it. Dated calendar entries are left out on purpose: GET /api/calendar does not
   * say who a booking belongs to, so counting one would mark everybody busy for it.
   */
  const attendance = useMemo(() => {
    if (!showFreeTime || searchMode !== "members") return null;

    const span = meetingSpan(meetingWindow);
    if ("problem" in span) return { problem: span.problem, groups: [] };

    const days = meetingDays(meetingWindow.startDate, meetingWindow.endDate);
    const byStatus = new Map<AttendanceStatus, { member: (typeof teamMembers)[number]; reason: string | null }[]>();
    for (const member of teamMembers) {
      const busy: BusyInterval[] = [];
      for (const block of blocks) {
        if (block.team_member_id !== member.team_member_id) continue;
        const { start, end } = rangeOf(block);
        for (const day of days) {
          if (!blockAppliesOn(block, day.dateKey, day.dow)) continue;
          busy.push({ start: day.offset + start, end: day.offset + end, label: blockTypeConfig[block.block_type].label });
        }
      }
      const { status, reason } = classifyAttendance(busy, span);
      byStatus.set(status, [...(byStatus.get(status) ?? []), { member, reason }]);
    }

    return {
      problem: null,
      groups: ATTENDANCE_ORDER.flatMap((status) => {
        const rows = byStatus.get(status);
        return rows ? [{ status, rows }] : [];
      }),
    };
  }, [showFreeTime, searchMode, meetingWindow, teamMembers, blocks]);

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  const openAddDialog = (day?: number, hour?: number) => {
    setEditingBlock(null);
    // `hour ?? ` and not `hour ? ` — hour 0 is midnight, and it is falsy. Clicking the
    // 12am row used to open a dialog prefilled 09:00–12:00.
    const hasHour = hour !== undefined;
    setFormData({
      team_member_id: selectedMember?.toString() || "",
      day_of_week: day !== undefined ? day.toString() : "1",
      start_time: hasHour ? `${String(hour).padStart(2, "0")}:00` : "09:00",
      // 23:00 + 1h is midnight, which this table spells "00:00" (end of day).
      end_time: hasHour ? `${String((hour! + 1) % 24).padStart(2, "0")}:00` : "12:00",
      block_type: "unavailable",
      label: "",
      effective_from: "",
      effective_to: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (block: AvailabilityBlock) => {
    setEditingBlock(block);
    setFormData({
      team_member_id: block.team_member_id.toString(),
      day_of_week: block.day_of_week.toString(),
      start_time: block.start_time.slice(0, 5),
      end_time: block.end_time.slice(0, 5),
      block_type: block.block_type,
      label: block.label || "",
      effective_from: block.effective_from ?? "",
      effective_to: block.effective_to ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.team_member_id) {
      toast({ title: "Team member required", description: "Pick who this block belongs to.", variant: "destructive" });
      return;
    }

    // Validated here as well as on the server. "17:00 to 09:00" used to save happily and
    // then be invisible in the grid, which made it look like the save had failed while
    // the row sat in the database poisoning the free-time maths.
    const problem = timeRangeProblem(formData.start_time, formData.end_time);
    if (problem) {
      toast({ title: "Check the times", description: problem, variant: "destructive" });
      return;
    }
    if (
      formData.effective_from &&
      formData.effective_to &&
      formData.effective_to < formData.effective_from
    ) {
      toast({
        title: "Check the dates",
        description: "The end date must be on or after the start date.",
        variant: "destructive",
      });
      return;
    }

    const input = {
      team_member_id: parseInt(formData.team_member_id),
      day_of_week: parseInt(formData.day_of_week),
      start_time: formData.start_time,
      end_time: formData.end_time,
      block_type: formData.block_type,
      label: formData.label,
      effective_from: formData.effective_from || null,
      effective_to: formData.effective_to || null,
    };

    setIsDialogOpen(false);
    try {
      if (editingBlock) {
        await updateBlock(editingBlock.block_id, input);
      } else {
        await createBlock(input);
      }
    } catch {
      // Hook surfaces the toast
    }
  };

  const handleDelete = async () => {
    if (!editingBlock) return;
    setConfirmDelete(false);
    setIsDialogOpen(false);
    try {
      await deleteBlock(editingBlock.block_id);
    } catch {
      // Hook surfaces the toast
    }
  };

  const toggleMemberSelection = (memberId: number) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  };

  // Reopening keeps the search, including an intentionally empty people selection.
  // Only dates before Manila today advance; clock times do not expire within a day.
  const openFreeTime = () => {
    if (!hasOpenedFreeTime.current) {
      setSelectedMembers(teamMembers.map((m) => m.team_member_id));
      hasOpenedFreeTime.current = true;
    }
    const now = new Date();
    setSearchDates((dates) => advancePastSearchDates(dates, now));
    setMeetingWindow((meeting) => {
      const dates = advancePastSearchDates({ start: meeting.startDate, end: meeting.endDate }, now);
      return dates.start === meeting.startDate && dates.end === meeting.endDate
        ? meeting
        : { ...meeting, startDate: dates.start, endDate: dates.end };
    });
    setShowFreeTime(true);
  };

  // Arrow keys move between the type chips, as in any radio group.
  const onTypeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = BLOCK_TYPES.indexOf(formData.block_type);
    const next = BLOCK_TYPES[(at + step + BLOCK_TYPES.length) % BLOCK_TYPES.length];
    setFormData({ ...formData, block_type: next });
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-type="${next}"]`)?.focus();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = manilaToday();
  const thisWeek = weekOf(today);
  const gridBlocks = filteredBlocks.filter(
    (b) => !isOneOff(b) || oneOffDate(b) === thisWeek[b.day_of_week],
  );
  const datedDays = filteredBlocks
    .filter(isOneOff)
    .map((block) => ({ block, date: oneOffDate(block) }))
    .filter((d): d is { block: AvailabilityBlock; date: string } => d.date !== null && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.block.start_time.localeCompare(b.block.start_time));

  // What the 7am grid can draw (clipped to 7am when it starts earlier), and what is
  // over before the grid begins, which is listed under it instead of being lost.
  const placed = layoutAvailabilitySlots(gridBlocks.flatMap((block) => {
    const { start, end } = rangeOf(block);
    return end > GRID_START ? [{ block, start, end, top: Math.max(start, GRID_START) }] : [];
  }));
  const earlyBlocks = gridBlocks
    .filter((b) => rangeOf(b).end <= GRID_START)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  const allSelected = teamMembers.length > 0 && selectedMembers.length === teamMembers.length;
  const firstName = (memberId: number) =>
    teamMembers.find((m) => m.team_member_id === memberId)?.name.split(" ")[0] ?? "Someone";

  const memberPicker = selectedMemberRow && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="availability-person-picker"
          className="inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-border bg-card pl-1.5 pr-2.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={selectedMemberRow.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px]">{getInitials(selectedMemberRow.name)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Schedule for </span>
          <span className="truncate">{selectedMemberRow.name}</span>
          {selectedMember === myMemberId && (
            <span className="text-xs font-normal text-muted-foreground">You</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-[min(60vh,420px)] overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Show schedule for</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(selectedMember)}
          onValueChange={(value) => setPickedMember(Number(value))}
        >
          {pickerMembers.map((member) => (
            <DropdownMenuRadioItem
              key={member.team_member_id}
              value={String(member.team_member_id)}
              className="h-10 gap-2 focus:bg-secondary focus:text-foreground"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={member.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{member.name}</span>
              {member.team_member_id === myMemberId && (
                <span className="text-xs text-muted-foreground">You</span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Free Time results: one row per day. Everyone-free slots lead as accent chips; majority
  // slots follow underneath, quieter, each naming who would be missing.
  const freeTimeResults =
    calendarLoading ? (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Checking schedules…
      </p>
    ) : selectedMembers.length < 2 ? (
      <p className="text-sm text-muted-foreground">Select at least 2 people to find common free time.</p>
    ) : freeTimeDays.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        No free time in this date range for the selected people.
      </p>
    ) : (
      <div className="space-y-2">
        <ul className="divide-y divide-border rounded-md border border-border">
          {freeTimeDays.map((day) => (
            <li key={day.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="whitespace-nowrap pt-0.5 text-sm font-medium">
                {DAYS[day.dow]} {formatManilaDate(day.date)}
              </span>
              <div className="flex min-w-0 flex-col items-end gap-1.5">
                {day.everyone.length > 0 && (
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {day.everyone.map((slot) => (
                      <span
                        key={`all-${slot.start}`}
                        data-testid="freetime-slot-everyone"
                        className="whitespace-nowrap rounded border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-xs tabular-nums text-accent-ink"
                      >
                        {formatClockRange12h(slot.start, slot.end)}
                      </span>
                    ))}
                  </span>
                )}
                {day.majority.map((slot) => (
                  // The chip stays beside its label; a long list of names wraps inside the
                  // label instead of pushing the time onto a line of its own.
                  <span
                    key={`most-${slot.start}`}
                    data-testid="freetime-slot-majority"
                    className="flex items-start justify-end gap-1.5"
                  >
                    <span className="min-w-0 pt-[3px] text-right text-[11px] leading-tight text-muted-foreground">
                      {majorityLabel(slot.missing.map(firstName))}
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatClockRange12h(slot.start, slot.end)}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );

  // Free Members always includes the full roster for a single meeting date.
  const freeMembersBody = (
    <div className="space-y-4">
      <FreeMembersMeeting value={meetingWindow} onChange={setMeetingWindow} />

      {attendance?.problem ? (
        <p role="status" className="text-sm text-muted-foreground">{attendance.problem}</p>
      ) : teamMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members found.</p>
      ) : (
        <div className="space-y-3">
          {attendance?.groups.map(({ status, rows }) => (
            <section key={status} data-testid={`freemembers-group-${status}`} aria-label={attendanceConfig[status].label}>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {attendanceConfig[status].label}
                <span className="tabular-nums">· {rows.length}</span>
              </h3>
              <ul className="divide-y divide-border rounded-md border border-border">
                {rows.map(({ member, reason }) => (
                  <li key={member.team_member_id} className="flex min-h-10 items-center gap-2 px-3 py-1.5">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
                    {reason && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  const searchModes: { mode: SearchMode; label: string }[] = [
    { mode: "time", label: "Free Time" },
    { mode: "members", label: "Free Members" },
  ];

  const freeTimeBody = (
    <div className="space-y-4 [overflow-anchor:none]">
      <div className="flex items-center justify-between gap-2">
        <p id="freetime-mode-label" className="text-xs font-medium text-muted-foreground">Search mode</p>
        {/* Two segments, one pressed. A toggle button per mode rather than a radio group,
            so each is one Tab stop and needs no arrow-key handling. */}
        <div
          role="group"
          aria-labelledby="freetime-mode-label"
          className="inline-flex shrink-0 rounded-md border border-border bg-secondary p-0.5"
        >
          {searchModes.map(({ mode, label }) => {
            const on = searchMode === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`freetime-mode-${mode}`}
                aria-pressed={on}
                onClick={() => setSearchMode(mode)}
                className={`h-9 rounded-[5px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 ${
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {searchMode === "time" && (
        <>
          <FreeTimeDateRange start={searchDates.start} end={searchDates.end} minDate={today} onChange={setSearchDates} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">People</p>
              <button
                type="button"
                onClick={() => setSelectedMembers(allSelected ? [] : teamMembers.map((m) => m.team_member_id))}
                className="min-h-8 px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
            </div>
            <CompactPeopleGrid>
              {teamMembers.map((member) => {
                const active = selectedMembers.includes(member.team_member_id);
                return (
                  <button
                    key={member.team_member_id}
                    type="button"
                    data-testid={`freetime-member-${member.team_member_id}`}
                    title={member.name}
                    aria-pressed={active}
                    onClick={() => toggleMemberSelection(member.team_member_id)}
                    className={`flex h-9 min-w-0 items-center justify-center rounded-md border px-1.5 font-medium transition-colors ${
                      active
                        ? "bg-accent/[0.08] border-accent/40 text-foreground"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="shrink-0 whitespace-nowrap">{member.name.trim().split(/\s+/)[0]}</span>
                  </button>
                );
              })}
            </CompactPeopleGrid>
          </div>
        </>
      )}

      {searchMode === "time" ? freeTimeResults : freeMembersBody}
    </div>
  );

  return (
    // Fills the space main leaves between the header and the bottom bar (Admin.tsx turns
    // the page scroll off for this section), and the week grid takes whatever is left.
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      {/* Header. Phones: [picker][Free time][+ Add] on one row (the title is for screen
          readers only there). Desktop: title, picker and actions on one row. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* Visually hidden on phones (the top bar names the section there), so the wrapper
            leaves the flow too and the controls row does not inherit an empty row's gap. */}
        <div className="flex min-w-0 basis-full items-baseline gap-3 max-sm:sr-only lg:basis-0 lg:flex-1">
          <h1 className="sr-only sm:not-sr-only whitespace-nowrap text-lg font-semibold tracking-tight">Team Availability</h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Schedules, capacity, and school blackout blocks
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
          {/* Shrinks first: a long name ends in an ellipsis before a button wraps. */}
          <div className="min-w-0 flex-1 lg:flex-none">{memberPicker}</div>
          {/* Opens a popup rather than toggling an inline panel, so the grid never moves.
              Icon-only below 390px, where the three controls would not fit with text. */}
          <Button
            variant={showFreeTime ? "default" : "outline"}
            size="sm"
            className="h-9 shrink-0 max-[389px]:w-9 max-[389px]:px-0"
            aria-haspopup="dialog"
            aria-expanded={showFreeTime}
            onClick={openFreeTime}
          >
            <CalendarSearch className="hidden max-[389px]:block" aria-hidden />
            <span className="max-[389px]:sr-only sm:hidden">Free time</span>
            <span className="hidden sm:inline">Find free time</span>
          </Button>
          <Button size="sm" onClick={() => openAddDialog()} className="h-9 shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add block</span>
          </Button>
        </div>
      </div>

      <ResponsiveSheet
        open={showFreeTime}
        onOpenChange={setShowFreeTime}
        title="Find free time"
        desktopClassName="max-w-lg max-h-[90dvh] overflow-y-auto"
        testId="free-time-sheet"
        onEscapeKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-availability-picker-open]")) event.preventDefault();
        }}
      >
        {freeTimeBody}
      </ResponsiveSheet>

      {/* Weekly Calendar Grid */}
      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Title and legend each hold one line; on a narrow phone the legend drops under the title. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2 sm:min-h-11 sm:pl-4 sm:pr-3">
          <h2 className="whitespace-nowrap text-sm font-medium">Weekly schedule</h2>
          <div className="flex items-center gap-2.5 whitespace-nowrap sm:gap-3">
            {BLOCK_TYPES.map((type) => (
              <span key={type} className="flex items-center gap-1 text-[11px] text-muted-foreground sm:gap-1.5 sm:text-xs">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${blockTypeConfig[type].dot}`} />
                {blockTypeConfig[type].short}
              </span>
            ))}
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid shrink-0 grid-cols-[32px_repeat(7,minmax(0,1fr))] border-b border-border sm:grid-cols-[52px_repeat(7,minmax(0,1fr))]">
          <div className="h-7 bg-secondary/30 sm:h-8" />
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={`flex h-7 items-center justify-center border-l border-border text-[11px] font-medium sm:h-8 sm:text-xs ${
                i === 0 || i === 6 ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Time Grid, 7am to midnight. The hour rows share the panel's leftover height
            equally, so the whole week fits whatever the screen. Blocks are placed in
            percentages of their starting cell: a cell's padding box is one row minus its
            1px top border, so (100% + 1px) is exactly one row. */}
        <div
          data-testid="availability-week-grid"
          className="grid min-h-0 flex-1 grid-cols-[32px_repeat(7,minmax(0,1fr))] sm:grid-cols-[52px_repeat(7,minmax(0,1fr))]"
          style={{ gridTemplateRows: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
        >
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              {/* Hour Label */}
              <div className="flex min-h-0 items-start justify-end overflow-hidden border-t border-border bg-secondary/20 pr-1 pt-0.5 text-[10px] leading-none tabular-nums text-muted-foreground sm:pr-2 sm:pt-1 sm:text-[11px]">
                {hourLabel(hour)}
              </div>

              {/* Day Cells */}
              {DAYS.map((_, dayIndex) => {
                const hourStart = hour * 60;
                // A block is drawn once, in the row its visible start minute falls in,
                // and is then sized in minutes. Everything here used to be integer
                // hours, which is why a 13:15–13:45 block matched no row and drew nothing.
                const startingHere = placed.filter(
                  (p) => p.block.day_of_week === dayIndex && p.top >= hourStart && p.top < hourStart + 60,
                );

                return (
                  <div
                    key={`${hour}-${dayIndex}`}
                    className="relative min-h-0 cursor-pointer border-l border-t border-border hover:bg-secondary/30"
                    onClick={() => openAddDialog(dayIndex, hour)}
                  >
                    {startingHere.map(({ block, start, end, top, column, columns }) => {
                      const config = blockTypeConfig[block.block_type];
                      const Icon = config.icon;
                      const duration = end - start;
                      const shown = end - top;
                      // Started before 7am: drawn flush from the top edge, with a dashed
                      // top border saying there is more of it above.
                      const clipped = start < GRID_START;
                      const expired = block.effective_to !== null && block.effective_to < today;
                      const dateSubtitle = block.effective_from && block.effective_to
                        ? block.effective_from === block.effective_to
                          ? formatManilaDate(`${block.effective_from}T00:00:00+08:00`)
                          : `${formatManilaDate(`${block.effective_from}T00:00:00+08:00`)} – ${formatManilaDate(`${block.effective_to}T00:00:00+08:00`)}`
                        : null;

                      return (
                        <div
                          key={block.block_id}
                          className={`absolute z-10 cursor-pointer overflow-hidden rounded-md border px-1 py-0.5 transition-[left,width,filter] duration-200 ease-out motion-reduce:transition-none hover:brightness-110 sm:px-1.5 [--slot-gap:2px] sm:[--slot-gap:4px] ${config.bgColor} ${
                            clipped ? "rounded-t-none" : ""
                          } ${expired ? "opacity-40" : ""}`}
                          style={{
                            left: `calc(${column * 100 / columns}% + var(--slot-gap))`,
                            width: `calc(${100 / columns}% - 2 * var(--slot-gap))`,
                            top: clipped ? 0 : `calc((100% + 1px) * ${(top - hourStart) / 60} + 1px)`,
                            height: `max(14px, calc((100% + 1px) * ${shown / 60} - ${clipped ? 2 : 4}px))`,
                            ...(clipped ? { borderTopStyle: "dashed" as const } : {}),
                          }}
                          title={`${block.label || config.label} · ${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}${
                            block.effective_from || block.effective_to
                              ? ` · ${block.effective_from || "any"} to ${block.effective_to || "open-ended"}`
                              : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(block);
                          }}
                        >
                          <div className="flex items-start gap-1">
                            <Icon className={`mt-0.5 hidden h-3 w-3 shrink-0 ${columns === 1 ? "sm:block" : ""} ${config.color}`} />
                            <span className="min-w-0 truncate text-[10px] font-medium leading-tight sm:text-xs sm:leading-4">
                              {block.label || config.label}
                            </span>
                          </div>
                          {dateSubtitle && (
                            <div className="mt-0.5 truncate text-[9px] leading-tight text-muted-foreground sm:text-[10px] sm:leading-snug">
                              {dateSubtitle}
                            </div>
                          )}
                          {shown >= 60 && (
                            <div className="mt-0.5 hidden truncate text-[10px] leading-snug tabular-nums text-muted-foreground sm:block">
                              {duration === 1440
                                ? "all day"
                                : `${block.start_time.slice(0, 5)} – ${block.end_time.slice(0, 5)}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Blocks the grid cannot draw: over before 7am, or dated days in a later week.
            One line that scrolls sideways, so a long list never pushes the grid off screen. */}
        {(earlyBlocks.length > 0 || datedDays.length > 0) && (
          <div
            data-testid="availability-notes"
            className="flex shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap border-t border-border py-1.5 pl-3 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:pl-4"
          >
            {earlyBlocks.length > 0 && (
              <>
                <span className="mr-0.5 shrink-0 text-xs text-muted-foreground">Before 7am</span>
                {earlyBlocks.map((block) => {
                  const config = blockTypeConfig[block.block_type];
                  return (
                    <button
                      key={block.block_id}
                      type="button"
                      onClick={() => openEditDialog(block)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums transition-[filter] hover:brightness-110 ${config.bgColor}`}
                    >
                      <span className="font-medium">
                        {DAYS[block.day_of_week]} {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                      </span>
                      <span className="text-muted-foreground">{block.label || config.label}</span>
                    </button>
                  );
                })}
              </>
            )}
            {earlyBlocks.length > 0 && datedDays.length > 0 && (
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
            )}
            {datedDays.length > 0 && (
              <>
                <span
                  className="mr-0.5 shrink-0 text-xs text-muted-foreground"
                  title="Drawn in the grid during their own week"
                >
                  Dated days
                </span>
                {datedDays.map(({ block, date }) => {
                  const config = blockTypeConfig[block.block_type];
                  return (
                    <button
                      key={block.block_id}
                      type="button"
                      onClick={() => openEditDialog(block)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums transition-[filter] hover:brightness-110 ${config.bgColor}`}
                    >
                      <span className="font-medium">
                        {DAYS[block.day_of_week]} {formatManilaDate(`${date}T00:00:00+08:00`)}
                      </span>
                      <span className="text-muted-foreground">
                        {block.label || config.label}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </Panel>

      {/* Add/Edit block: the same sheet as Find free time on phones, a dialog elsewhere. */}
      <ResponsiveSheet
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingBlock ? "Edit Schedule Block" : "Add Schedule Block"}
        desktopClassName="max-w-md"
        testId="block-sheet"
        footer={
          <div className="flex items-center gap-2">
            {editingBlock && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="h-10">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" className="h-10" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="h-10 min-w-20" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 sm:gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0 space-y-2">
              <label className="text-sm font-medium">Team Member</label>
              <Select
                value={formData.team_member_id}
                onValueChange={(v) => setFormData({ ...formData, team_member_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.team_member_id} value={m.team_member_id.toString()}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <label className="text-sm font-medium">Day</label>
              <Select
                value={formData.day_of_week}
                onValueChange={(v) => setFormData({ ...formData, day_of_week: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FULL_DAYS.map((day, i) => (
                    <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type: one row of chips, sized to their labels so all three fit at 390px. */}
          <div className="space-y-2">
            <span id="block-type-label" className="text-sm font-medium">Type</span>
            <div
              role="radiogroup"
              aria-labelledby="block-type-label"
              onKeyDown={onTypeKeyDown}
              className="flex gap-1.5"
            >
              {BLOCK_TYPES.map((type) => {
                const config = blockTypeConfig[type];
                const on = formData.block_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    data-type={type}
                    onClick={() => setFormData({ ...formData, block_type: type })}
                    className={`inline-flex h-10 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 ${
                      on
                        ? `${config.bgColor} text-foreground`
                        : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
                    {config.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Time</label>
              <Input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          {/* Bounds. A recurring block with no end date repeats until the end of time. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Starts on (optional)</label>
              <Input
                type="date"
                value={formData.effective_from}
                onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ends on (optional)</label>
              <Input
                type="date"
                value={formData.effective_to}
                onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Label (optional)</label>
            <Input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g. CS 101, Lunch, Client meeting"
            />
          </div>
        </div>
      </ResponsiveSheet>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        noun="schedule block"
        name={
          editingBlock
            ? `${editingBlock.label || blockTypeConfig[editingBlock.block_type].label} · ${FULL_DAYS[editingBlock.day_of_week]} ${editingBlock.start_time.slice(0, 5)}–${editingBlock.end_time.slice(0, 5)}`
            : null
        }
      />
    </div>
  );
};

export default AdminAvailability;
