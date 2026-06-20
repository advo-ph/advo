import { useState } from "react";
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
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
import { PageHeader, Table, THead, TBody, TRow, Empty, Dot } from "@/components/admin/_ui";

const statusConfig: Record<DeliverableStatus, { label: string; dot: string }> = {
  not_started: { label: "Not Started", dot: "bg-muted-foreground" },
  in_progress: { label: "In Progress", dot: "bg-blue-500" },
  review: { label: "In Review", dot: "bg-purple-500" },
  completed: { label: "Completed", dot: "bg-green-500" },
  blocked: { label: "Blocked", dot: "bg-red-500" },
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
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Deliverables"
        meta={`${deliverables.length} total${selectedMember ? ` · ${filteredDeliverables.length} shown` : ""}`}
        action={
          <Button onClick={openAdd} size="sm" className="h-9">
            <Plus className="h-4 w-4 mr-1.5" />
            Add deliverable
          </Button>
        }
      />

      {/* Team Member Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedMember(null)}
          className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
            selectedMember === null
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All members
        </button>
        {teamMembers.map((member) => (
          <button
            key={member.team_member_id}
            onClick={() => setSelectedMember(member.team_member_id)}
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
              selectedMember === member.team_member_id
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Avatar className="h-4 w-4">
              <AvatarImage src={member.avatar_url} />
              <AvatarFallback className="text-[9px]">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            {member.name.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Deliverables table */}
      {isLoading ? (
        <div className="border border-border rounded-lg bg-card divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 px-3 flex items-center">
              <div className="h-3 w-1/3 bg-secondary animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : filteredDeliverables.length === 0 ? (
        <Table>
          <Empty text="No deliverables yet" icon={Calendar} />
        </Table>
      ) : (
        <Table>
          <THead>
            <span className="flex-1 min-w-0">Title</span>
            <span className="hidden lg:block w-40 shrink-0">Project</span>
            <span className="w-32 shrink-0">Status</span>
            <span className="hidden md:block w-28 shrink-0">Assignee</span>
            <span className="w-12 shrink-0 text-center">Pri</span>
            <span className="w-16 shrink-0 text-right">Due</span>
            <span className="w-8 shrink-0" />
          </THead>
          <TBody>
            {filteredDeliverables.map((deliverable) => {
              const isPastDue =
                deliverable.due_date &&
                new Date(deliverable.due_date) < new Date() &&
                deliverable.status !== "completed";

              return (
                <TRow key={deliverable.deliverable_id}>
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-medium truncate">{deliverable.title}</span>
                    {isPastDue && (
                      <span className="text-[10px] font-medium text-destructive shrink-0">Overdue</span>
                    )}
                  </span>

                  <span className="hidden lg:block w-40 shrink-0 text-xs text-muted-foreground truncate">
                    {deliverable.project?.title || "No project"}
                  </span>

                  {/* Inline quick status change */}
                  <span className="w-32 shrink-0">
                    <Select
                      value={deliverable.status}
                      onValueChange={(v) =>
                        updateStatus(deliverable.deliverable_id, v as DeliverableStatus)
                      }
                    >
                      <SelectTrigger className="h-7 w-full gap-1.5 border-0 bg-transparent px-1.5 text-xs hover:bg-secondary/60 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map((s) => {
                          const cfg = statusConfig[s];
                          return (
                            <SelectItem key={s} value={s}>
                              <span className="flex items-center gap-2">
                                <Dot className={cfg.dot} />
                                {cfg.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </span>

                  <span className="hidden md:flex w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {deliverable.assignee ? (
                      <>
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={deliverable.assignee.avatar_url} />
                          <AvatarFallback className="text-[9px]">
                            {getInitials(deliverable.assignee.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{deliverable.assignee.name.split(" ")[0]}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </span>

                  <span
                    className="w-12 shrink-0 flex items-center justify-center gap-0.5"
                    title={`Priority ${deliverable.priority}`}
                  >
                    {[1, 2, 3].map((p) => (
                      <span
                        key={p}
                        className={`w-1 h-3.5 rounded-full ${
                          p <= deliverable.priority ? "bg-accent" : "bg-secondary"
                        }`}
                      />
                    ))}
                  </span>

                  <span
                    className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                      isPastDue ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {deliverable.due_date
                      ? new Date(deliverable.due_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>

                  <span className="w-8 shrink-0 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(deliverable)}
                      aria-label="Edit deliverable"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md rounded-lg">
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
