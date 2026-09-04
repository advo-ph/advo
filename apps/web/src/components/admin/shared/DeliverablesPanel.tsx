import { useState } from "react";
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  BadgeCheck,
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
import { Table, THead, TBody, TRow, Empty, Dot } from "@/components/admin/_ui";
import {
  formatManilaDate,
  formatManilaDateTime,
  isPastDue,
  manilaDateOf,
} from "@/lib/manila-time";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";

const statusConfig: Record<DeliverableStatus, { label: string; dot: string }> = {
  todo:     { label: "To do",      dot: "bg-muted-foreground" },
  ongoing:  { label: "Ongoing",    dot: "bg-blue-500" },
  review:   { label: "For Review", dot: "bg-purple-500" },
  finished: { label: "Finished",   dot: "bg-green-500" },
};

const STATUS_ORDER: DeliverableStatus[] = [
  "todo",
  "ongoing",
  "review",
  "finished",
];

// 0 is a real stored priority: meeting.routes.ts creates action-item deliverables with
// priority 0. Without an option for it, opening the edit dialog on one of those coerced
// it to "Low" and the next save wrote that back — a silent edit nobody asked for.
const PRIORITY_OPTIONS = [
  { value: "0", label: "None" },
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
  status: "todo",
  priority: "1",
  due_date: "",
});

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

interface DeliverablesPanelProps {
  /**
   * When provided, only deliverables for this project are shown and new
   * deliverables are automatically assigned to this project on create.
   * When undefined, all deliverables are shown (AdminSchedule behaviour).
   */
  projectId?: number;
  /**
   * When true, the "Project" column is hidden in the table and the project
   * field is hidden in the dialog (pre-filled from projectId).
   */
  hideProjectColumn: boolean;
  /**
   * Optional team member ID to filter the visible rows. Used by AdminSchedule
   * to let the owner narrow deliverables by assignee without re-fetching.
   */
  memberFilter?: number;
}

export function DeliverablesPanel({
  projectId,
  hideProjectColumn,
  memberFilter,
}: DeliverablesPanelProps) {
  const { toast } = useToast();
  const { activeMembers: teamMembers, isLoading: teamLoading } = useAdminTeam();
  const { projects } = useOrgProjects();
  const {
    deliverables: allDeliverables,
    isLoading: deliverablesLoading,
    createDeliverable,
    updateDeliverable,
    updateStatus,
    setVerified,
    deleteDeliverable,
    isSaving,
  } = useAdminDeliverables();

  const isLoading = teamLoading || deliverablesLoading;

  // Filter by project when projectId is provided, then optionally by member
  const deliverables = (() => {
    let rows = allDeliverables;
    if (projectId !== undefined)
      rows = rows.filter((d) => d.project_id === projectId);
    if (memberFilter !== undefined)
      rows = rows.filter((d) => d.assigned_to === memberFilter);
    return rows;
  })();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const defaultProjectId =
    projectId !== undefined
      ? String(projectId)
      : projects[0]
        ? String(projects[0].project_id)
        : "";

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(defaultProjectId));
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
      priority: String(d.priority ?? 0),
      // Manila date to avoid UTC-offset date-walking on save
      due_date: manilaDateOf(d.due_date) ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.project_id) {
      toast({
        title: "Project required",
        description: "Pick a project for this deliverable.",
        variant: "destructive",
      });
      return;
    }
    if (!form.title.trim()) {
      toast({
        title: "Title required",
        description: "Give the deliverable a title.",
        variant: "destructive",
      });
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

  // Deletion is confirmed first to prevent accidental one-click removes.
  const handleDelete = async () => {
    if (!editing) return;
    setConfirmDelete(false);
    try {
      await deleteDeliverable(editing.deliverable_id);
      setIsDialogOpen(false);
    } catch {
      /* error toast handled in the hook */
    }
  };

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button onClick={openAdd} size="sm" className="h-9">
          <Plus className="h-4 w-4 mr-1.5" />
          Add work item
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="border border-border rounded-lg bg-card divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 px-3 flex items-center">
              <div className="h-3 w-1/3 bg-secondary animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : deliverables.length === 0 ? (
        <Table>
          <Empty text="No work items yet. Add one to get started." icon={Calendar} />
        </Table>
      ) : (
        // The fixed columns need 412px; a 390px phone offers 332px. Without a
        // scroll floor the wrapper clipped the last 80px.
        <Table minWidth="34rem">
          <THead>
            <span className="flex-1 min-w-0">Title</span>
            {!hideProjectColumn && (
              <span className="hidden lg:block w-40 shrink-0">Project</span>
            )}
            <span className="w-32 shrink-0">Status</span>
            <span className="hidden md:block w-28 shrink-0">Assignee</span>
            <span className="w-12 shrink-0 text-center">Pri</span>
            <span className="w-16 shrink-0 text-right">Due</span>
            <span className="w-20 shrink-0 text-right">Verify</span>
            <span className="w-8 shrink-0" />
          </THead>
          <TBody>
            {deliverables.map((deliverable) => {
              // A thing due today is not late today. isPastDue() compares Manila
              // calendar dates, so this flips the morning after, not at 08:00 that day.
              const overdue =
                isPastDue(deliverable.due_date) &&
                deliverable.status !== "finished";

              return (
                <TRow key={deliverable.deliverable_id}>
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-medium truncate">{deliverable.title}</span>
                    {overdue && (
                      <span className="text-[10px] font-medium text-destructive shrink-0">
                        Overdue
                      </span>
                    )}
                  </span>

                  {!hideProjectColumn && (
                    <span className="hidden lg:block w-40 shrink-0 text-xs text-muted-foreground truncate">
                      {deliverable.project?.title || "No project"}
                    </span>
                  )}

                  {/* Inline quick status change */}
                  <span className="w-32 shrink-0">
                    <Select
                      value={deliverable.status}
                      onValueChange={(v) =>
                        updateStatus(
                          deliverable.deliverable_id,
                          v as DeliverableStatus,
                        )
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
                        <span className="truncate">
                          {deliverable.assignee.name.split(" ")[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
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
                      overdue ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {formatManilaDate(deliverable.due_date)}
                  </span>

                  <span className="w-20 shrink-0 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 gap-1 text-xs ${
                        deliverable.verified_at
                          ? "text-green-600 hover:text-green-700"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() =>
                        setVerified(
                          deliverable.deliverable_id,
                          !deliverable.verified_at,
                        )
                      }
                      aria-label={
                        deliverable.verified_at
                          ? "Clear verification"
                          : "Verify deliverable"
                      }
                      title={
                        deliverable.verified_at
                          ? `Verified ${formatManilaDateTime(deliverable.verified_at)}`
                          : "Mark verified"
                      }
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {deliverable.verified_at ? "Verified" : "Verify"}
                    </Button>
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
            <DialogTitle>{editing ? "Edit work item" : "Add work item"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Project field: hidden when hideProjectColumn (project is already obvious) */}
            {!hideProjectColumn && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <Select
                  value={form.project_id}
                  onValueChange={(v) => setForm({ ...form, project_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        projects.length ? "Select project" : "Loading projects…"
                      }
                    />
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
            )}

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
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
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
                    <SelectItem
                      key={m.team_member_id}
                      value={m.team_member_id.toString()}
                    >
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
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as DeliverableStatus })
                  }
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
              <Button
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        noun="deliverable"
        name={editing?.title}
      />
    </div>
  );
}
