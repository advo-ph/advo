import { useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import {
  useAdminDeliverables,
  type Deliverable,
  type DeliverableInput,
  type DeliverableStatus,
} from "@/hooks/useAdminDeliverables";

const statusConfig: Record<DeliverableStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "Not Started", color: "bg-secondary text-muted-foreground", icon: Circle },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  review: { label: "In Review", color: "bg-purple-500/10 text-purple-500", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-500", icon: CheckCircle2 },
  blocked: { label: "Blocked", color: "bg-red-500/10 text-red-500", icon: AlertCircle },
};

const STATUS_ORDER: DeliverableStatus[] = [
  "not_started",
  "in_progress",
  "review",
  "completed",
  "blocked",
];

const PRIORITY_OPTIONS = [
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
];

const UNASSIGNED = "none";

interface FormState {
  project_id: string;
  title: string;
  description: string;
  assigned_to: string;
  status: DeliverableStatus;
  priority: string;
  due_date: string;
}

const emptyForm = (projectId = ""): FormState => ({
  project_id: projectId,
  title: "",
  description: "",
  assigned_to: UNASSIGNED,
  status: "not_started",
  priority: "1",
  due_date: "",
});

const AdminSchedule = () => {
  const { toast } = useToast();
  const { activeMembers: teamMembers, isLoading: teamLoading } = useAdminTeam();
  const { projects } = useOrgProjects();
  const {
    deliverables,
    isLoading: deliverablesLoading,
    createDeliverable,
    updateDeliverable,
    updateStatus,
    deleteDeliverable,
    isSaving,
  } = useAdminDeliverables();
  const isLoading = teamLoading || deliverablesLoading;

  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const filteredDeliverables = selectedMember
    ? deliverables.filter((d) => d.assigned_to === selectedMember)
    : deliverables;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(projects[0] ? String(projects[0].project_id) : ""));
    setIsDialogOpen(true);
  };

  const openEdit = (d: Deliverable) => {
    setEditing(d);
    setForm({
      project_id: String(d.project_id),
      title: d.title,
      description: d.description || "",
      assigned_to: d.assigned_to ? String(d.assigned_to) : UNASSIGNED,
      status: d.status,
      priority: String(d.priority || 1),
      due_date: d.due_date ? d.due_date.slice(0, 10) : "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.project_id) {
      toast({ title: "Project required", description: "Pick a project for this deliverable.", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Give the deliverable a title.", variant: "destructive" });
      return;
    }
    const input: DeliverableInput = {
      project_id: Number(form.project_id),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assigned_to: form.assigned_to === UNASSIGNED ? null : Number(form.assigned_to),
      status: form.status,
      priority: Number(form.priority),
      due_date: form.due_date || null,
    };
    try {
      if (editing) await updateDeliverable(editing.deliverable_id, input);
      else await createDeliverable(input);
      setIsDialogOpen(false);
    } catch {
      /* error toast handled in the hook */
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await deleteDeliverable(editing.deliverable_id);
      setIsDialogOpen(false);
    } catch {
      /* error toast handled in the hook */
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Schedule & Deliverables</h1>
          <p className="text-muted-foreground">Track team assignments and deadlines</p>
        </div>
        <Button onClick={openAdd} className="rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Deliverable
        </Button>
      </div>

      {/* Team Member Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedMember(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedMember === null
              ? "bg-accent text-white"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All Members
        </button>
        {teamMembers.map((member) => (
          <button
            key={member.team_member_id}
            onClick={() => setSelectedMember(member.team_member_id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              selectedMember === member.team_member_id
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

      {/* Deliverables Grid */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filteredDeliverables.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No deliverables yet</p>
          <Button onClick={openAdd} variant="outline" className="rounded-full">
            <Plus className="h-4 w-4 mr-2" />
            Add your first deliverable
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDeliverables.map((deliverable, index) => {
            const status = statusConfig[deliverable.status];
            const StatusIcon = status.icon;
            const isPastDue =
              deliverable.due_date &&
              new Date(deliverable.due_date) < new Date() &&
              deliverable.status !== "completed";

            return (
              <motion.div
                key={deliverable.deliverable_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`p-5 bg-card border rounded-xl shadow-card transition-colors ${
                  isPastDue ? "border-red-500/50" : "border-border hover:border-accent/30"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-semibold">{deliverable.title}</h3>
                      {/* Inline quick status change */}
                      <Select
                        value={deliverable.status}
                        onValueChange={(v) =>
                          updateStatus(deliverable.deliverable_id, v as DeliverableStatus)
                        }
                      >
                        <SelectTrigger className={`h-7 w-auto gap-1 border-0 px-2.5 text-xs font-medium ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => {
                            const cfg = statusConfig[s];
                            const Icon = cfg.icon;
                            return (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" />
                                  {cfg.label}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {isPastDue && (
                        <Badge variant="destructive" className="text-xs">
                          Overdue
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">
                      {deliverable.project?.title || "No project"}
                    </p>

                    <div className="flex items-center gap-4 text-sm">
                      {deliverable.assignee && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={deliverable.assignee.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {getInitials(deliverable.assignee.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">
                            {deliverable.assignee.name}
                          </span>
                        </div>
                      )}

                      {deliverable.due_date && (
                        <div className={`flex items-center gap-1 ${isPastDue ? "text-red-500" : "text-muted-foreground"}`}>
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(deliverable.due_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1" title={`Priority ${deliverable.priority}`}>
                      {[1, 2, 3].map((p) => (
                        <div
                          key={p}
                          className={`w-1.5 h-4 rounded-full ${
                            p <= deliverable.priority ? "bg-accent" : "bg-secondary"
                          }`}
                        />
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(deliverable)}
                      aria-label="Edit deliverable"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Deliverable" : "Add Deliverable"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <Select
                value={form.project_id}
                onValueChange={(v) => setForm({ ...form, project_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={projects.length ? "Select project" : "Loading projects…"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={p.project_id.toString()}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Homepage hero section"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Details, acceptance criteria…"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Assignee</label>
              <Select
                value={form.assigned_to}
                onValueChange={(v) => setForm({ ...form, assigned_to: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
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
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as DeliverableStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusConfig[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Due date (optional)</label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            {editing && (
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

export default AdminSchedule;
