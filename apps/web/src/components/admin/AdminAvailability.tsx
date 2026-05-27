import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, 
  Clock, 
  Plus, 
  X, 
  Users, 
  School, 
  Coffee, 
  Briefcase, 
  Ban,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12am to 11pm

const blockTypeConfig: Record<BlockType, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  school: { label: "School/Class", color: "text-blue-500", bgColor: "bg-blue-500/20 border-blue-500/30", icon: School },
  break: { label: "Break", color: "text-amber-500", bgColor: "bg-amber-500/20 border-amber-500/30", icon: Coffee },
  work: { label: "Work Available", color: "text-green-500", bgColor: "bg-green-500/20 border-green-500/30", icon: Briefcase },
  unavailable: { label: "Unavailable", color: "text-red-500", bgColor: "bg-red-500/20 border-red-500/30", icon: Ban },
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

  const isLoading = teamLoading || blocksLoading;
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Team Availability</h1>
          <p className="text-muted-foreground">Manage schedules and find meeting times</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showFreeTime ? "default" : "outline"}
            className="rounded-full"
            onClick={() => {
              setShowFreeTime(!showFreeTime);
              if (!showFreeTime) {
                setSelectedMembers(teamMembers.map(m => m.team_member_id));
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Find Free Time
          </Button>
          <Button onClick={() => openAddDialog()} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </div>
      </div>

      {/* Find Free Time Panel */}
      <AnimatePresence>
        {showFreeTime && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-accent/5 border border-accent/20 rounded-xl"
          >
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm font-medium">Select team members to compare:</span>
              <div className="flex gap-2">
                {teamMembers.map(member => (
                  <button
                    key={member.team_member_id}
                    onClick={() => toggleMemberSelection(member.team_member_id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                      selectedMembers.includes(member.team_member_id)
                        ? "bg-accent text-white"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    {member.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
            
            {selectedMembers.length >= 2 && freeTimeSlots.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-accent">Available times when everyone is free:</span>
                <div className="flex flex-wrap gap-2">
                  {freeTimeSlots.map((slot, i) => (
                    <Badge key={i} className="bg-accent/10 text-accent border-accent/30">
                      {FULL_DAYS[slot.day]} {slot.start.slice(0, 5)} - {slot.end.slice(0, 5)}
                    </Badge>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Member Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {teamMembers.map(member => (
          <button
            key={member.team_member_id}
            onClick={() => setSelectedMember(member.team_member_id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              selectedMember === member.team_member_id
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={member.avatar_url} />
              <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            {member.name}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(blockTypeConfig).map(([type, config]) => {
          const Icon = config.icon;
          return (
            <div key={type} className="flex items-center gap-2 text-sm">
              <div className={`w-4 h-4 rounded ${config.bgColor} border flex items-center justify-center`}>
                <Icon className={`h-2.5 w-2.5 ${config.color}`} />
              </div>
              <span className="text-muted-foreground">{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* Weekly Calendar Grid */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
        {/* Day Headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
          <div className="p-2 bg-secondary/50" />
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={`p-3 text-center text-sm font-medium border-l border-border ${
                i === 0 || i === 6 ? "text-muted-foreground" : ""
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Time Grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map(hour => (
            <div key={hour} className="contents">
              {/* Hour Label */}
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-t border-border bg-secondary/30">
                {hour === 0 ? "12am" : hour > 12 ? `${hour - 12}pm` : hour === 12 ? "12pm" : `${hour}am`}
              </div>
              
              {/* Day Cells */}
              {DAYS.map((_, dayIndex) => {
                const cellBlocks = filteredBlocks.filter(b => {
                  const startHour = parseInt(b.start_time.split(":")[0]);
                  const endHour = parseInt(b.end_time.split(":")[0]);
                  return b.day_of_week === dayIndex && startHour <= hour && endHour > hour;
                });
                
                const isFirstHour = cellBlocks.length > 0 && 
                  parseInt(cellBlocks[0].start_time.split(":")[0]) === hour;
                
                return (
                  <div
                    key={`${hour}-${dayIndex}`}
                    className="min-h-[40px] border-t border-l border-border relative group cursor-pointer hover:bg-secondary/30"
                    onClick={() => openAddDialog(dayIndex, hour)}
                  >
                    {cellBlocks.map((block, i) => {
                      const config = blockTypeConfig[block.block_type];
                      const Icon = config.icon;
                      const startHour = parseInt(block.start_time.split(":")[0]);
                      
                      if (startHour !== hour) return null;
                      
                      const endHour = parseInt(block.end_time.split(":")[0]);
                      const heightSpan = endHour - startHour;
                      
                      return (
                        <motion.div
                          key={block.block_id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`absolute inset-x-1 top-1 ${config.bgColor} border rounded-lg p-1.5 cursor-pointer z-10 overflow-hidden`}
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
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md rounded-xl">
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
