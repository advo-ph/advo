import { useState, useMemo } from "react";
import {
  Plus,
  School,
  Coffee,
  Briefcase,
  Ban,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import {
  useAdminAvailability,
  blockAppliesOn,
  type AvailabilityBlock,
  type BlockType,
} from "@/hooks/useAdminAvailability";
import { useCalendar } from "@/hooks/useCalendar";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import { projectCountByMember, capacityRemaining } from "@/lib/capacity";
import {
  dayKey,
  formatManilaDate,
  manilaToday,
  minutesToTime,
  timeRangeProblem,
  timeToMinutes,
} from "@/lib/manila-time";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { PageHeader, Panel } from "./_ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12am to 11pm
const HOUR_ROW_PX = 40; // must match the min-h-[40px] on each cell

/** A free slot shorter than this is not a meeting, it is an arithmetic artefact. */
const MIN_FREE_SLOT_MINUTES = 30;

/** Days ahead the free-time search looks. Bookings are dated, so the search must be too. */
const FREE_TIME_HORIZON_DAYS = 7;

// Cool, flat palette — small color cues against the charcoal canvas, no glow.
const blockTypeConfig: Record<BlockType, { label: string; color: string; bgColor: string; dot: string; icon: React.ElementType }> = {
  school: { label: "School/Class", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500", icon: School },
  break: { label: "Break", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500", icon: Coffee },
  work: { label: "Work Available", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-500", icon: Briefcase },
  unavailable: { label: "Unavailable", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/30", dot: "bg-rose-500", icon: Ban },
};

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

const AdminAvailability = () => {
  const { toast } = useToast();
  const { activeMembers: teamMembers, isLoading: teamLoading } = useAdminTeam();
  const {
    blocks,
    isLoading: blocksLoading,
    createBlock,
    updateBlock,
    deleteBlock,
    isSaving,
  } = useAdminAvailability();
  const { projects, isLoading: projectLoading } = useOrgProjects();

  const isLoading = teamLoading || blocksLoading || projectLoading;
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  // Active (non-shipped) project count per team member from GET /api/projects.
  const projectCount = useMemo(
    () =>
      projectCountByMember(
        projects.map((p) => ({
          teamMemberId: p.team_member_id,
          projectStatus: p.project_status,
        })),
      ),
    [projects],
  );

  // Auto-select first member when data loads
  if (selectedMember === null && teamMembers.length > 0) {
    setSelectedMember(teamMembers[0].team_member_id);
  }

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = manilaToday();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team Availability"
        meta="Schedules, capacity, and school blackout blocks"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={showFreeTime ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                setShowFreeTime(!showFreeTime);
                if (!showFreeTime) {
                  setSelectedMembers(teamMembers.map((m) => m.team_member_id));
                }
              }}
            >
              Find free time
            </Button>
            <Button
              size="sm"
              onClick={() => openAddDialog()}
              className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add block
            </Button>
          </div>
        }
      />

      {/* Find Free Time Panel */}
      {showFreeTime && (
        <Panel
          title="Find free time"
          meta={`Next ${FREE_TIME_HORIZON_DAYS} days · work blocks shared by everyone selected, minus classes, breaks and anything already booked`}
        >
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {teamMembers.map((member) => {
                const active = selectedMembers.includes(member.team_member_id);
                return (
                  <button
                    key={member.team_member_id}
                    data-testid={`freetime-member-${member.team_member_id}`}
                    aria-pressed={active}
                    onClick={() => toggleMemberSelection(member.team_member_id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
                      active
                        ? "bg-accent/[0.08] border-accent/40 text-foreground"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    {member.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>

            {selectedMembers.length >= 2 && freeTimeSlots.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground pt-3">
                  Available when everyone is free ({MIN_FREE_SLOT_MINUTES} minutes or more)
                </p>
                <div className="flex flex-wrap gap-2">
                  {freeTimeSlots.map((slot) => (
                    <span
                      key={slot.key}
                      className="inline-flex items-center gap-1.5 text-xs text-accent-ink border border-accent/30 bg-accent/[0.06] rounded-md px-2 py-1 tabular-nums"
                    >
                      {DAYS[slot.dow]} {formatManilaDate(slot.date)} {slot.start} – {slot.end}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedMembers.length >= 2 && freeTimeSlots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No overlapping free time in the next {FREE_TIME_HORIZON_DAYS} days for the selected members.
              </p>
            )}

            {selectedMembers.length < 2 && (
              <p className="text-sm text-muted-foreground">Select at least 2 members to find common free time.</p>
            )}
          </div>
        </Panel>
      )}

      {/* Team Member Tabs + capacity chip (active project count) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {teamMembers.map((member) => {
          const active = selectedMember === member.team_member_id;
          const activeProjectCount = projectCount.get(member.team_member_id) ?? 0;
          const remaining = capacityRemaining(activeProjectCount);
          const isAtCapacity = remaining === 0 && activeProjectCount > 0;
          return (
            <button
              key={member.team_member_id}
              onClick={() => setSelectedMember(member.team_member_id)}
              className={`flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors whitespace-nowrap border ${
                active
                  ? "bg-secondary border-border text-foreground"
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
              </Avatar>
              {member.name}
              <span
                title={
                  isAtCapacity
                    ? `${activeProjectCount} active project${activeProjectCount === 1 ? "" : "s"} · at capacity`
                    : `${activeProjectCount} active · ${remaining} capacity remaining`
                }
                className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium tabular-nums border ${
                  isAtCapacity
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : activeProjectCount > 0
                      ? "bg-accent/10 border-accent/30 text-accent-ink"
                      : "bg-secondary border-border text-muted-foreground"
                }`}
              >
                {activeProjectCount} proj
                {!isAtCapacity && remaining < 3 && (
                  // Was opacity-70 which dropped the already-small text-accent to ~1.9:1
                  // in light mode. Removing the modifier keeps the colour legible; the
                  // containing badge already reads as secondary via its border treatment.
                  <span className="ml-1">· {remaining} left</span>
                )}
                {isAtCapacity && <span className="ml-1">· full</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Weekly Calendar Grid */}
      <Panel
        title="Weekly schedule"
        meta={
          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(blockTypeConfig).map(([type, config]) => (
              <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dot}`} />
                {config.label}
              </span>
            ))}
          </div>
        }
      >
        <div className="overflow-hidden rounded-b-lg">
          {/* Day Headers */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
            <div className="h-9 bg-secondary/30" />
            {DAYS.map((day, i) => (
              <div
                key={day}
                className={`h-9 flex items-center justify-center text-xs font-medium border-l border-border ${
                  i === 0 || i === 6 ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Time Grid — capped + internally scrollable on mobile so the page fits the screen. */}
          <div className="max-h-[60vh] overflow-y-auto sm:max-h-none sm:overflow-y-visible">
          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                {/* Hour Label */}
                <div className="px-2 text-[11px] tabular-nums text-muted-foreground text-right border-t border-border bg-secondary/20 flex items-start justify-end pt-1 min-h-[40px]">
                  {hour === 0 ? "12am" : hour > 12 ? `${hour - 12}pm` : hour === 12 ? "12pm" : `${hour}am`}
                </div>

                {/* Day Cells */}
                {DAYS.map((_, dayIndex) => {
                  const hourStart = hour * 60;
                  // A block is drawn once, in the row its start minute falls in, and is
                  // then sized in minutes. Everything here used to be integer hours, which
                  // is why a 13:15–13:45 block matched no row and drew nothing.
                  const startingHere = filteredBlocks.filter((b) => {
                    if (b.day_of_week !== dayIndex) return false;
                    const { start } = rangeOf(b);
                    return start >= hourStart && start < hourStart + 60;
                  });

                  return (
                    <div
                      key={`${hour}-${dayIndex}`}
                      className="min-h-[40px] border-t border-l border-border relative group cursor-pointer hover:bg-secondary/30"
                      onClick={() => openAddDialog(dayIndex, hour)}
                    >
                      {startingHere.map((block) => {
                        const config = blockTypeConfig[block.block_type];
                        const Icon = config.icon;
                        const { start, end } = rangeOf(block);
                        const duration = end - start;
                        const offsetPx = ((start - hourStart) / 60) * HOUR_ROW_PX;
                        const heightPx = Math.max((duration / 60) * HOUR_ROW_PX - 4, 14);
                        const expired = block.effective_to !== null && block.effective_to < today;

                        return (
                          <div
                            key={block.block_id}
                            className={`absolute inset-x-1 ${config.bgColor} border rounded-md px-1.5 py-0.5 cursor-pointer z-10 overflow-hidden hover:brightness-110 transition-[filter] ${
                              expired ? "opacity-40" : ""
                            }`}
                            style={{ top: `${offsetPx + 2}px`, height: `${heightPx}px` }}
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
                            <div className="flex items-center gap-1">
                              <Icon className={`h-3 w-3 ${config.color} flex-shrink-0`} />
                              <span className="text-xs font-medium truncate">{block.label || config.label}</span>
                            </div>
                            {duration >= 45 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
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
          </div>
        </div>
      </Panel>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBlock ? "Edit Schedule Block" : "Add Schedule Block"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={formData.block_type}
                  onValueChange={(v) => setFormData({ ...formData, block_type: v as BlockType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(blockTypeConfig).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <span className="flex items-center gap-2">
                          <config.icon className={`h-4 w-4 ${config.color}`} />
                          {config.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <p className="text-xs text-muted-foreground -mt-2">
              Leave blank to repeat with no end. Set an end date for a semester or a
              temporary schedule so it stops appearing on the calendar afterwards.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">Label (optional)</label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g. CS 101, Lunch, Client meeting"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            {editingBlock && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
