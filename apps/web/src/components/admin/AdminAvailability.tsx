import { useState, useMemo, type KeyboardEvent } from "react";
import {
  Plus,
  School,
  Coffee,
  Briefcase,
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
  dayKey,
  formatManilaDate,
  manilaToday,
  minutesToTime,
  timeRangeProblem,
  timeToMinutes,
} from "@/lib/manila-time";
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

const hourLabel = (hour: number) =>
  hour === 0 ? "12am" : hour > 12 ? `${hour - 12}pm` : hour === 12 ? "12pm" : `${hour}am`;

/** A free slot shorter than this is not a meeting, it is an arithmetic artefact. */
const MIN_FREE_SLOT_MINUTES = 30;

/** Days ahead the free-time search looks. Bookings are dated, so the search must be too. */
const FREE_TIME_HORIZON_DAYS = 7;

// Cool, flat palette — small color cues against the charcoal canvas, no glow.
// `short` is for the legend and the type chips, which both have to fit one line at 390px.
const blockTypeConfig: Record<BlockType, { label: string; short: string; color: string; bgColor: string; dot: string; icon: React.ElementType }> = {
  school: { label: "School", short: "School", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500", icon: School },
  break: { label: "Break", short: "Break", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500", icon: Coffee },
  work: { label: "Work Available", short: "Work", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-500", icon: Briefcase },
  unavailable: { label: "Unavailable", short: "Unavailable", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/30", dot: "bg-rose-500", icon: Ban },
};
const BLOCK_TYPES = Object.keys(blockTypeConfig) as BlockType[];

// ─── Minute ranges ───
// Everything below works in minutes past midnight. The grid used to compare only
// parseInt(start_time.split(":")[0]), which threw the minutes away: "13:15–13:45" matched
// no cell at all and rendered nowhere, while reporting "Added" on save.

interface Range {
  start: number;
  end: number;
}

const rangeOf = (b: AvailabilityBlock): Range => ({
  start: timeToMinutes(b.start_time),
  end: timeToMinutes(b.end_time, true),
});

/**
 * Overlapping and touching ranges collapsed into one.
 *
 * A member can hold two work blocks that overlap ("13:00–23:00" and "13:00–00:00" both
 * exist in this table today). Intersecting without merging first yields the same free
 * window once per source block, so the panel offers the same slot twice.
 */
function merge(ranges: Range[]): Range[] {
  if (ranges.length < 2) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [sorted[0]];
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** a ∩ b, for two sorted-by-nothing lists of ranges. */
function intersect(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const r1 of a) {
    for (const r2 of b) {
      const start = Math.max(r1.start, r2.start);
      const end = Math.min(r1.end, r2.end);
      if (start < end) out.push({ start, end });
    }
  }
  return out;
}

/** base minus every blocker, splitting a range that a blocker lands in the middle of. */
function subtract(base: Range[], blockers: Range[]): Range[] {
  let out = base;
  for (const blocker of blockers) {
    const next: Range[] = [];
    for (const r of out) {
      if (blocker.end <= r.start || blocker.start >= r.end) {
        next.push(r);
        continue;
      }
      if (blocker.start > r.start) next.push({ start: r.start, end: blocker.start });
      if (blocker.end < r.end) next.push({ start: blocker.end, end: r.end });
    }
    out = next;
  }
  return out;
}

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
    block_type: "work" as BlockType,
    label: "",
    effective_from: "",
    effective_to: "",
  });

  // Find Free Time state
  const [showFreeTime, setShowFreeTime] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  // The concrete days the free-time search covers. Recurring blocks have no dates, but
  // meetings and deadlines do, so the search has to happen on real days to be able to
  // subtract them.
  const horizon = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: FREE_TIME_HORIZON_DAYS }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: d, key: dayKey(d), dow: d.getDay() };
    });
    const end = new Date(days[days.length - 1].date);
    end.setHours(23, 59, 59, 999);
    return { days, from: start, to: end };
  }, []);

  const { events } = useCalendar(horizon.from, horizon.to);

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
        const dayEnd = new Date(day.date);
        dayEnd.setHours(23, 59, 59, 999);
        if (last < dayStart || start > dayEnd) continue;

        const from = start < dayStart ? 0 : start.getHours() * 60 + start.getMinutes();
        const to = last > dayEnd ? 1440 : last.getHours() * 60 + last.getMinutes();
        if (to > from) map.set(day.key, [...(map.get(day.key) ?? []), { start: from, end: to }]);
      }
    }
    return map;
  }, [events, horizon.days]);

  const filteredBlocks = useMemo(() => {
    if (!selectedMember) return [];
    return blocks.filter((b) => b.team_member_id === selectedMember);
  }, [blocks, selectedMember]);

  /**
   * Overlapping free time.
   *
   * Three things were wrong here and all three had the same shape: the search was
   * narrower than the data it claimed to summarise.
   *
   *   1. It looped `day = 1; day <= 5`, so Saturday and Sunday were never considered even
   *      though the grid above renders weekend blocks and people work weekends.
   *   2. It filtered to block_type === "work" and stopped, so school, break and
   *      unavailable were never subtracted. It proposed meetings during a class.
   *   3. Its dependency list named only blocks, so nothing dated was ever subtracted and
   *      it proposed slots on top of meetings that already existed.
   *
   * So: every day, work minus every other block type, intersected across the selected
   * members, minus the bookings actually on that date, and finally minus anything too
   * short to be a meeting.
   */
  const freeTimeSlots = useMemo(() => {
    if (!showFreeTime || selectedMembers.length < 2) return [];

    const slots: { key: string; date: Date; dow: number; start: string; end: string }[] = [];

    for (const day of horizon.days) {
      const perMember = selectedMembers.map((memberId) => {
        const mine = blocks.filter(
          (b) => b.team_member_id === memberId && blockAppliesOn(b, day.key, day.dow),
        );
        const work = merge(mine.filter((b) => b.block_type === "work").map(rangeOf));
        const busy = merge(mine.filter((b) => b.block_type !== "work").map(rangeOf));
        return subtract(work, busy);
      });

      if (perMember.some((r) => r.length === 0)) continue;

      let shared = perMember[0];
      for (let i = 1; i < perMember.length && shared.length > 0; i++) {
        shared = intersect(shared, perMember[i]);
      }

      shared = merge(subtract(shared, merge(bookingsByDay.get(day.key) ?? [])));

      for (const r of shared) {
        if (r.end - r.start < MIN_FREE_SLOT_MINUTES) continue;
        slots.push({
          key: `${day.key}-${r.start}`,
          date: day.date,
          dow: day.dow,
          start: minutesToTime(r.start),
          end: minutesToTime(r.end),
        });
      }
    }

    return slots;
  }, [showFreeTime, selectedMembers, blocks, horizon.days, bookingsByDay]);

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
      block_type: "work",
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

  const openFreeTime = () => {
    setSelectedMembers(teamMembers.map((m) => m.team_member_id));
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
  const placed = gridBlocks.flatMap((block) => {
    const { start, end } = rangeOf(block);
    return end > GRID_START ? [{ block, start, end, top: Math.max(start, GRID_START) }] : [];
  });
  const earlyBlocks = gridBlocks
    .filter((b) => rangeOf(b).end <= GRID_START)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  // Free slots grouped per day, so a phone reads one row per day instead of a wall of chips.
  const slotDays: { date: Date; dow: number; slots: typeof freeTimeSlots }[] = [];
  for (const slot of freeTimeSlots) {
    const last = slotDays[slotDays.length - 1];
    if (last && last.date.getTime() === slot.date.getTime()) last.slots.push(slot);
    else slotDays.push({ date: slot.date, dow: slot.dow, slots: [slot] });
  }
  const allSelected = teamMembers.length > 0 && selectedMembers.length === teamMembers.length;

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

  const freeTimeBody = (
    <div className="space-y-4">
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
        <div className="flex flex-wrap gap-2">
          {teamMembers.map((member) => {
            const active = selectedMembers.includes(member.team_member_id);
            return (
              <button
                key={member.team_member_id}
                type="button"
                data-testid={`freetime-member-${member.team_member_id}`}
                aria-pressed={active}
                onClick={() => toggleMemberSelection(member.team_member_id)}
                className={`flex h-10 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors sm:h-9 ${
                  active
                    ? "bg-accent/[0.08] border-accent/40 text-foreground"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                {member.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {selectedMembers.length < 2 ? (
        <p className="text-sm text-muted-foreground">Select at least 2 people to find common free time.</p>
      ) : slotDays.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No overlapping free time in the next {FREE_TIME_HORIZON_DAYS} days for the selected people.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Everyone is free ({MIN_FREE_SLOT_MINUTES} minutes or more)
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {slotDays.map((day) => (
              <li key={day.date.getTime()} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="whitespace-nowrap pt-0.5 text-sm font-medium">
                  {DAYS[day.dow]} {formatManilaDate(day.date)}
                </span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {day.slots.map((slot) => (
                    <span
                      key={slot.key}
                      className="rounded border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-xs tabular-nums text-accent-ink"
                    >
                      {slot.start}–{slot.end}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        desktopClassName="max-w-lg"
        testId="free-time-sheet"
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
                    {startingHere.map(({ block, start, end, top }) => {
                      const config = blockTypeConfig[block.block_type];
                      const Icon = config.icon;
                      const duration = end - start;
                      const shown = end - top;
                      // Started before 7am: drawn flush from the top edge, with a dashed
                      // top border saying there is more of it above.
                      const clipped = start < GRID_START;
                      const expired = block.effective_to !== null && block.effective_to < today;

                      return (
                        <div
                          key={block.block_id}
                          className={`absolute inset-x-0.5 z-10 cursor-pointer overflow-hidden rounded-md border px-1 py-0.5 transition-[filter] hover:brightness-110 sm:inset-x-1 sm:px-1.5 ${config.bgColor} ${
                            clipped ? "rounded-t-none" : ""
                          } ${expired ? "opacity-40" : ""}`}
                          style={{
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
                            <Icon className={`mt-0.5 hidden h-3 w-3 shrink-0 sm:block ${config.color}`} />
                            <span className="min-w-0 text-[10px] font-medium leading-tight [overflow-wrap:anywhere] sm:truncate sm:text-xs sm:leading-4">
                              {block.label || config.label}
                            </span>
                          </div>
                          {shown >= 60 && (
                            <div className="mt-0.5 hidden text-[10px] leading-none tabular-nums text-muted-foreground sm:block">
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
                  const { start, end } = rangeOf(block);
                  const allDay = end - start === 1440;
                  return (
                    <button
                      key={block.block_id}
                      type="button"
                      onClick={() => openEditDialog(block)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums transition-[filter] hover:brightness-110 ${config.bgColor}`}
                    >
                      <config.icon className={`h-3 w-3 ${config.color}`} />
                      <span className="font-medium">
                        {DAYS[block.day_of_week]} {formatManilaDate(`${date}T00:00:00+08:00`)}
                      </span>
                      <span className="text-muted-foreground">
                        {block.label || config.label} ·{" "}
                        {allDay ? "all day" : `${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`}
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

          {/* Type: one row of chips, sized to their labels so all four fit at 390px. */}
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
