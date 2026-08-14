import { useState, useMemo } from "react";
import {
  Plus,
  School,
  Coffee,
  Briefcase,
  Ban,
  Sparkles,
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
  type AvailabilityBlock,
  type BlockType,
} from "@/hooks/useAdminAvailability";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import { projectCountByMember, capacityRemaining } from "@/lib/capacity";
import { PageHeader, Panel } from "./_ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12am to 11pm

// Cool, flat palette — small color cues against the charcoal canvas, no glow.
const blockTypeConfig: Record<BlockType, { label: string; color: string; bgColor: string; dot: string; icon: React.ElementType }> = {
  school: { label: "School/Class", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500", icon: School },
  break: { label: "Break", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500", icon: Coffee },
  work: { label: "Work Available", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-500", icon: Briefcase },
  unavailable: { label: "Unavailable", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/30", dot: "bg-rose-500", icon: Ban },
};

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
  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [formData, setFormData] = useState({
    team_member_id: "",
    day_of_week: "1",
    start_time: "09:00",
    end_time: "12:00",
    block_type: "work" as BlockType,
    label: "",
  });

  // Find Free Time state
  const [showFreeTime, setShowFreeTime] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const filteredBlocks = useMemo(() => {
    if (!selectedMember) return [];
    return blocks.filter(b => b.team_member_id === selectedMember);
  }, [blocks, selectedMember]);

  // Calculate overlapping free times
  const freeTimeSlots = useMemo(() => {
    if (!showFreeTime || selectedMembers.length < 2) return [];

    const slots: { day: number; start: string; end: string }[] = [];

    // For each day, find work blocks that overlap for all selected members
    for (let day = 1; day <= 5; day++) {
      const memberWorkBlocks = selectedMembers.map(memberId =>
        blocks.filter(b =>
          b.team_member_id === memberId &&
          b.day_of_week === day &&
          b.block_type === "work"
        )
      );

      // Find overlapping intervals
      if (memberWorkBlocks.every(wb => wb.length > 0)) {
        // Get all work blocks as minute ranges
        const ranges = memberWorkBlocks.map(wb =>
          wb.map(b => ({
            start: timeToMinutes(b.start_time),
            end: timeToMinutes(b.end_time),
          }))
        );

        // Find intersections across all members
        let intersection = ranges[0];
        for (let i = 1; i < ranges.length; i++) {
          const newIntersection: { start: number; end: number }[] = [];
          for (const r1 of intersection) {
            for (const r2 of ranges[i]) {
              const start = Math.max(r1.start, r2.start);
              const end = Math.min(r1.end, r2.end);
              if (start < end) {
                newIntersection.push({ start, end });
              }
            }
          }
          intersection = newIntersection;
        }

        // Add to slots
        for (const { start, end } of intersection) {
          slots.push({
            day,
            start: minutesToTime(start),
            end: minutesToTime(end),
          });
        }
      }
    }

    return slots;
  }, [showFreeTime, selectedMembers, blocks]);

  const openAddDialog = (day?: number, hour?: number) => {
    setEditingBlock(null);
    setFormData({
      team_member_id: selectedMember?.toString() || "",
      day_of_week: day?.toString() || "1",
      start_time: hour ? `${hour.toString().padStart(2, "0")}:00` : "09:00",
      end_time: hour ? `${(hour + 1).toString().padStart(2, "0")}:00` : "12:00",
      block_type: "work",
      label: "",
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
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.team_member_id || !formData.start_time || !formData.end_time) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const input = {
      team_member_id: parseInt(formData.team_member_id),
      day_of_week: parseInt(formData.day_of_week),
      start_time: formData.start_time,
      end_time: formData.end_time,
      block_type: formData.block_type,
      label: formData.label || undefined,
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
    setIsDialogOpen(false);
    try {
      await deleteBlock(editingBlock.block_id);
    } catch {
      // Hook surfaces the toast
    }
  };

  const toggleMemberSelection = (memberId: number) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                  setSelectedMembers(teamMembers.map(m => m.team_member_id));
                }
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Find free time
            </Button>
            <Button
              size="sm"
              onClick={() => openAddDialog()}
              className="h-9 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" />
              Add block
            </Button>
          </div>
        }
      />

      {/* Find Free Time Panel */}
      {showFreeTime && (
        <Panel title="Find free time" meta="Work blocks shared across members">
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {teamMembers.map(member => {
                const active = selectedMembers.includes(member.team_member_id);
                return (
                  <button
                    key={member.team_member_id}
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
                <p className="text-xs text-muted-foreground pt-3">Available when everyone is free</p>
                <div className="flex flex-wrap gap-2">
                  {freeTimeSlots.map((slot, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 text-xs text-accent border border-accent/30 bg-accent/[0.06] rounded-md px-2 py-1 tabular-nums"
                    >
                      {FULL_DAYS[slot.day]} {slot.start.slice(0, 5)} – {slot.end.slice(0, 5)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedMembers.length >= 2 && freeTimeSlots.length === 0 && (
              <p className="text-sm text-muted-foreground">No overlapping free time found for selected members.</p>
            )}

            {selectedMembers.length < 2 && (
              <p className="text-sm text-muted-foreground">Select at least 2 members to find common free time.</p>
            )}
          </div>
        </Panel>
      )}

      {/* Team Member Tabs + capacity chip (active project count) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {teamMembers.map(member => {
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
                      ? "bg-accent/10 border-accent/30 text-accent"
                      : "bg-secondary border-border text-muted-foreground"
                }`}
              >
                {activeProjectCount} proj
                {!isAtCapacity && remaining < 3 && (
                  <span className="ml-1 opacity-70">· {remaining} left</span>
                )}
                {isAtCapacity && <span className="ml-1 opacity-70">· full</span>}
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

          {/* Time Grid */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            {HOURS.map(hour => (
              <div key={hour} className="contents">
                {/* Hour Label */}
                <div className="px-2 text-[11px] tabular-nums text-muted-foreground text-right border-t border-border bg-secondary/20 flex items-start justify-end pt-1 min-h-[40px]">
                  {hour === 0 ? "12am" : hour > 12 ? `${hour - 12}pm` : hour === 12 ? "12pm" : `${hour}am`}
                </div>

                {/* Day Cells */}
                {DAYS.map((_, dayIndex) => {
                  const cellBlocks = filteredBlocks.filter(b => {
                    const startHour = parseInt(b.start_time.split(":")[0]);
                    const endHour = parseInt(b.end_time.split(":")[0]);
                    return b.day_of_week === dayIndex && startHour <= hour && endHour > hour;
                  });

                  return (
                    <div
                      key={`${hour}-${dayIndex}`}
                      className="min-h-[40px] border-t border-l border-border relative group cursor-pointer hover:bg-secondary/30"
                      onClick={() => openAddDialog(dayIndex, hour)}
                    >
                      {cellBlocks.map((block) => {
                        const config = blockTypeConfig[block.block_type];
                        const Icon = config.icon;
                        const startHour = parseInt(block.start_time.split(":")[0]);

                        if (startHour !== hour) return null;

                        const endHour = parseInt(block.end_time.split(":")[0]);
                        const heightSpan = endHour - startHour;

                        return (
                          <div
                            key={block.block_id}
                            className={`absolute inset-x-1 top-1 ${config.bgColor} border rounded-md p-1.5 cursor-pointer z-10 overflow-hidden hover:brightness-110 transition-[filter]`}
                            style={{ height: `calc(${heightSpan * 100}% - 8px)` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(block);
                            }}
                          >
                            <div className="flex items-center gap-1">
                              <Icon className={`h-3 w-3 ${config.color} flex-shrink-0`} />
                              <span className="text-xs font-medium truncate">{block.label || config.label}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                              {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
                            </div>
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
                  {teamMembers.map(m => (
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
              <Button variant="destructive" onClick={handleDelete} className="mr-auto">
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
    </div>
  );
};

export default AdminAvailability;
