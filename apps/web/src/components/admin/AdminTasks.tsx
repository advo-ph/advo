import { useMemo, useState, useRef } from "react";
import {
  Paperclip,
  Pencil,
  Loader2,
  MessageSquare,
  Plus,
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
import { cn } from "@/lib/utils";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { useOrgProjects } from "@/hooks/useOrgProjects";
import {
  useAdminDeliverables,
  useDeliverableComments,
  type Deliverable,
  type DeliverableInput,
  type DeliverableStatus,
} from "@/hooks/useAdminDeliverables";
import { useRoles } from "@/hooks/useRoles";
import { upload } from "@/lib/api";
import { PageHeader } from "@/components/admin/_ui";
import { useToast } from "@/hooks/use-toast";

// ─── Status order and labels ──────────────────────────────────────────────────

export const DELIVERABLE_STATUS_ORDER = ["todo", "ongoing", "review", "finished"] as const;
export type KanbanStatus = typeof DELIVERABLE_STATUS_ORDER[number];

const STATUS_LABEL: Record<KanbanStatus, string> = {
  todo: "To do",
  ongoing: "Ongoing",
  review: "For Review",
  finished: "Finished",
};

// Left-edge stripe colour per status (+ unread override applied inline)
const STATUS_STRIPE: Record<KanbanStatus, string> = {
  todo: "bg-muted-foreground/40",
  ongoing: "bg-blue-500",
  review: "bg-violet-500",
  finished: "bg-emerald-500",
};

// ─── Template quick-picks ─────────────────────────────────────────────────────

const TASK_TEMPLATES: { label: string; title: string }[] = [
  { label: "Proposal",  title: "Proposal Creation" },
  { label: "Sign-off",  title: "Sign-off Creation" },
  { label: "Contract",  title: "Contract Signing" },
  { label: "Meeting",   title: "Set a Meeting" },
  { label: "Revisions", title: "Client Revisions" },
];

// ─── PDF-gate document titles ─────────────────────────────────────────────────

const PDF_GATE_RE = /proposal|sign.?off|contract signing/i;

function requiresPdfUpload(title: string): boolean {
  return PDF_GATE_RE.test(title);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const UNASSIGNED = "unassigned";

/** Relative timestamp — keeps the UI dense without full date strings. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  assignedTo: string;
  projectId: string;
  status: KanbanStatus;
}

const emptyForm = (defaultProjectId = ""): FormState => ({
  title: "",
  description: "",
  assignedTo: UNASSIGNED,
  projectId: defaultProjectId,
  status: "todo",
});

// ─── PDF Upload Dialog ────────────────────────────────────────────────────────

interface PdfDialogProps {
  open: boolean;
  existingUrl: string | null;
  onClose: () => void;
  onConfirm: (url: string) => Promise<void>;
}

const PdfUploadDialog = ({ open, existingUrl, onClose, onConfirm }: PdfDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [useExisting, setUseExisting] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 25 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setUseExisting(false);
  };

  const handleConfirm = async () => {
    if (useExisting && existingUrl) {
      await onConfirm(existingUrl);
      return;
    }
    if (!file) return;
    setUploading(true);
    try {
      const result = await upload(file, "assets");
      if (result.error) {
        toast({ title: "Upload failed", description: result.error, variant: "destructive" });
        return;
      }
      await onConfirm(result.url);
    } finally {
      setUploading(false);
    }
  };

  const canConfirm = (!!file || useExisting) && !uploading;

  // Reset on close
  const handleClose = () => {
    setFile(null);
    setUseExisting(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm rounded-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {existingUrl && (
            <div className="rounded-md border border-border p-2.5 space-y-2">
              <p className="text-xs text-muted-foreground">
                A file is already attached.{" "}
                <a href={existingUrl} target="_blank" rel="noreferrer" className="underline">
                  View existing
                </a>
              </p>
              <button
                type="button"
                onClick={() => { setUseExisting(true); setFile(null); }}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  useExisting
                    ? "border-accent bg-accent/10 text-accent-ink"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {useExisting ? "Using existing file" : "Keep existing file"}
              </button>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              {existingUrl ? "Replace file (PDF, max 25 MB)" : "PDF file (max 25 MB)"}
            </label>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-9 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors px-3 text-left"
            >
              {file ? file.name : "Choose file..."}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Comments Dialog ──────────────────────────────────────────────────────────

type CommentMode = "read" | "write";

interface CommentsDialogProps {
  open: boolean;
  deliverableId: number | null;
  mode: CommentMode;
  onClose: () => void;
  onAddComment: (body: string) => Promise<void>;
  onMarkRead: () => Promise<void>;
  isAddingComment: boolean;
  isMarkingRead: boolean;
}

const CommentsDialog = ({
  open,
  deliverableId,
  mode,
  onClose,
  onAddComment,
  onMarkRead,
  isAddingComment,
  isMarkingRead,
}: CommentsDialogProps) => {
  const [body, setBody] = useState("");
  const { data: comments = [], isLoading } = useDeliverableComments(
    open ? deliverableId : null,
  );

  const handleWrite = async () => {
    if (!body.trim()) return;
    await onAddComment(body.trim());
    setBody("");
    onClose();
  };

  const handleMarkRead = async () => {
    await onMarkRead();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm rounded-lg">
        <DialogHeader>
          <DialogTitle>{mode === "write" ? "Add comment" : "Comments"}</DialogTitle>
        </DialogHeader>

        {/* Comment history — always shown when there are comments */}
        {isLoading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : comments.length > 0 ? (
          <div className="space-y-2 max-h-56 overflow-y-auto -mx-1 px-1">
            {comments.map((c) => (
              <div key={c.commentId} className="rounded-md bg-secondary/50 px-3 py-2 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{c.authorName}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        ) : mode === "read" ? (
          <p className="text-sm text-muted-foreground py-2">No comments yet.</p>
        ) : null}

        {/* Textarea for owner write mode */}
        {mode === "write" && (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Write a comment..."
            className="resize-none"
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {mode === "write" ? (
            <Button onClick={handleWrite} disabled={!body.trim() || isAddingComment}>
              {isAddingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          ) : (
            <Button onClick={handleMarkRead} disabled={isMarkingRead}>
              {isMarkingRead ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── DeliverableCard ──────────────────────────────────────────────────────────

interface CardAction {
  label: string;
  variant?: "default" | "outline";
  className?: string;
  onClick: () => void;
}

const DeliverableCard = ({
  deliverable,
  isAssignee,
  isOwner,
  onEdit,
  onStatusChange,
  onOpenComments,
  onOpenWrite,
}: {
  deliverable: Deliverable;
  isAssignee: boolean;
  isOwner: boolean;
  onEdit: () => void;
  onStatusChange: (status: KanbanStatus, extra?: { attachmentUrl?: string | null }) => void;
  onOpenComments: () => void;
  onOpenWrite: () => void;
}) => {
  const status = deliverable.status as KanbanStatus;
  const hasUnread = deliverable.has_unread_comments;
  const hasComments = deliverable.comment_count > 0;
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  // Determine workflow buttons
  const buttons: CardAction[] = [];

  if (status === "todo" && isAssignee) {
    buttons.push({
      label: "Start Task",
      onClick: () => onStatusChange("ongoing"),
    });
  } else if (status === "ongoing" && isAssignee) {
    if (hasUnread) {
      buttons.push({
        label: "View Comments",
        variant: "outline",
        className: "border-accent text-accent-ink hover:bg-accent/10",
        onClick: onOpenComments,
      });
    } else if (hasComments) {
      // Has comments but all read: side-by-side
      buttons.push({
        label: "View Comment",
        variant: "outline",
        onClick: onOpenComments,
      });
      buttons.push({
        label: "Task Finished",
        onClick: () => {
          if (requiresPdfUpload(deliverable.title)) {
            setPdfDialogOpen(true);
          } else {
            onStatusChange("review");
          }
        },
      });
    } else {
      // No comments at all
      buttons.push({
        label: "Task Finished",
        onClick: () => {
          if (requiresPdfUpload(deliverable.title)) {
            setPdfDialogOpen(true);
          } else {
            onStatusChange("review");
          }
        },
      });
    }
  } else if (status === "review" && isOwner) {
    buttons.push({
      label: "Comment",
      variant: "outline",
      onClick: onOpenWrite,
    });
    buttons.push({
      label: "Verified",
      onClick: () => onStatusChange("finished"),
    });
  }
  // finished → no buttons

  const handlePdfConfirm = async (url: string) => {
    await onStatusChange("review", { attachmentUrl: url });
    setPdfDialogOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-4 shadow-sm transition-colors hover:border-foreground/20",
          hasUnread && "border-accent/40 bg-accent/[0.06]",
        )}
      >
        {/* Left-edge status stripe */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg",
            hasUnread ? "bg-accent" : STATUS_STRIPE[status],
          )}
        />

        {/* Row 1 — title + comment badge + edit */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium leading-snug">{deliverable.title}</p>
            {hasComments && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-medium",
                  hasUnread
                    ? "bg-accent/20 text-accent-ink"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                <MessageSquare className="h-2.5 w-2.5" />
                {deliverable.comment_count}
              </span>
            )}
          </div>
          {isOwner && (
            <button
              aria-label="Edit"
              onClick={onEdit}
              className="h-9 w-9 lg:h-7 lg:w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0 -mr-1 -mt-0.5"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Row 2 — description (2-line clamp, only if set) */}
        {deliverable.description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {deliverable.description}
          </p>
        )}

        {/* Row 3 — project label */}
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 truncate">
          {deliverable.project?.title ?? "No project"}
        </p>

        {/* Row 4 — assignee */}
        <div className="mt-1.5 flex items-center gap-1.5 min-w-0">
          {deliverable.assignee ? (
            <>
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarImage src={deliverable.assignee.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px]">
                  {getInitials(deliverable.assignee.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium truncate">{deliverable.assignee.name}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>

        {/* Row 5 — attachment link */}
        {deliverable.attachment_url && (
          <a
            href={deliverable.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
          >
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {deliverable.attachment_url.split("/").pop() ?? "Attachment"}
            </span>
          </a>
        )}

        {/* Row 6 — workflow buttons (full-width) */}
        {buttons.length > 0 && (
          <div className={cn("mt-2 flex gap-2", buttons.length > 1 && "")}>
            {buttons.map((btn) => (
              <Button
                key={btn.label}
                variant={btn.variant ?? "default"}
                size="sm"
                className={cn(
                  "flex-1 h-9 text-xs",
                  btn.className,
                )}
                onClick={btn.onClick}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* PDF gate dialog — lives here so it can access deliverable context */}
      <PdfUploadDialog
        open={pdfDialogOpen}
        existingUrl={deliverable.attachment_url}
        onClose={() => setPdfDialogOpen(false)}
        onConfirm={handlePdfConfirm}
      />
    </>
  );
};

// ─── AdminTasks ───────────────────────────────────────────────────────────────

const AdminTasks = () => {
  const {
    deliverables,
    viewerTeamMemberId,
    isLoading,
    createDeliverable,
    updateDeliverable,
    updateStatus,
    deleteDeliverable,
    addComment,
    markCommentsRead,
    isSaving,
    isAddingComment,
    isMarkingRead,
  } = useAdminDeliverables();
  const { isOwner, teamMemberId } = useRoles();
  const { activeMembers } = useAdminTeam();
  const { projects } = useOrgProjects();
  const { toast } = useToast();

  // "My Tasks / All Tasks" toggle — default is "All Tasks"
  const [taskView, setTaskView] = useState<"mine" | "all">("all");

  // Phone: pick one column to show
  const [visibleList, setVisibleList] = useState<KanbanStatus>("todo");

  // Add / Edit dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  // Captured once when edit dialog opens; drives which status options are available.
  const [originalStatus, setOriginalStatus] = useState<KanbanStatus>("todo");

  // Comments dialog
  const [commentDeliverable, setCommentDeliverable] = useState<Deliverable | null>(null);
  const [commentMode, setCommentMode] = useState<"read" | "write">("read");

  // Apply "My Tasks" filter before grouping
  const filtered = useMemo(() => {
    if (taskView === "mine") {
      return deliverables.filter((d) => d.assigned_to === viewerTeamMemberId);
    }
    return deliverables;
  }, [deliverables, taskView, viewerTeamMemberId]);

  const byStatus = useMemo(() => {
    const groups: Record<KanbanStatus, Deliverable[]> = {
      todo: [],
      ongoing: [],
      review: [],
      finished: [],
    };
    for (const d of filtered) {
      const s = d.status as KanbanStatus;
      if (s in groups) groups[s].push(d);
    }
    return groups;
  }, [filtered]);

  const defaultProjectId =
    projects.length > 0 ? String(projects[0].project_id) : "";

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(defaultProjectId));
    setIsDialogOpen(true);
  };

  const openEdit = (d: Deliverable) => {
    setEditing(d);
    const savedStatus = (d.status as KanbanStatus) ?? "todo";
    setOriginalStatus(savedStatus);
    setForm({
      title: d.title,
      description: d.description ?? "",
      assignedTo: d.assigned_to != null ? String(d.assigned_to) : UNASSIGNED,
      projectId: String(d.project_id),
      status: savedStatus,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.projectId) {
      toast({
        title: "Project required",
        description: "Pick a project for this task.",
        variant: "destructive",
      });
      return;
    }
    if (!form.title.trim()) {
      toast({
        title: "Title required",
        description: "Give the task a title.",
        variant: "destructive",
      });
      return;
    }

    // New tasks always start as todo; edits preserve current status.
    const input: DeliverableInput = {
      project_id: Number(form.projectId),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assigned_to: form.assignedTo === UNASSIGNED ? null : Number(form.assignedTo),
      status: editing ? form.status : "todo",
      priority: 0,
      due_date: null,
    };

    try {
      if (editing) {
        await updateDeliverable(editing.deliverable_id, input);
      } else {
        await createDeliverable(input);
      }
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
      <PageHeader
        title="Tasks"
        meta={`${filtered.length} total`}
        action={
          <div className="flex items-center gap-2">
            {/* My Tasks / All Tasks segmented control */}
            <div className="inline-flex rounded-lg bg-secondary p-0.5">
              <button
                onClick={() => setTaskView("mine")}
                aria-pressed={taskView === "mine"}
                className={cn(
                  "h-8 px-3 rounded-md text-sm font-medium transition-colors",
                  taskView === "mine"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                My Tasks
              </button>
              <button
                onClick={() => setTaskView("all")}
                aria-pressed={taskView === "all"}
                className={cn(
                  "h-8 px-3 rounded-md text-sm font-medium transition-colors",
                  taskView === "all"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All Tasks
              </button>
            </div>

            <Button onClick={openAdd} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1.5" />
              Add task
            </Button>
          </div>
        }
      />

      {/* Phone: segmented column picker. Hidden from lg up. */}
      <div className="inline-flex rounded-lg bg-secondary p-0.5 w-full lg:hidden">
        {DELIVERABLE_STATUS_ORDER.map((status) => (
          <button
            key={status}
            onClick={() => setVisibleList(status)}
            aria-pressed={visibleList === status}
            className={cn(
              "flex-1 h-8 rounded-md text-xs font-medium transition-colors px-1 min-w-0",
              visibleList === status
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{STATUS_LABEL[status]}</span>
            <span className="ml-1 tabular-nums opacity-70">
              {byStatus[status].length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="border border-border rounded-lg bg-card divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 px-3 flex items-center">
              <div className="h-3 w-1/3 bg-secondary animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
          {DELIVERABLE_STATUS_ORDER.map((status) => (
            <div
              key={status}
              className={cn("lg:block", visibleList === status ? "block" : "hidden")}
            >
              {/* Bare column header — no panel wrapper */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold">{STATUS_LABEL[status]}</span>
                <span className="text-xs tabular-nums rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                  {byStatus[status].length}
                </span>
              </div>

              {/* Cards stack */}
              {byStatus[status].length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                  Nothing {STATUS_LABEL[status].toLowerCase()}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {byStatus[status].map((d) => {
                    const isAssignee =
                      teamMemberId !== null && d.assigned_to === teamMemberId;
                    return (
                      <DeliverableCard
                        key={d.deliverable_id}
                        deliverable={d}
                        isAssignee={isAssignee}
                        isOwner={isOwner}
                        onEdit={() => openEdit(d)}
                        onStatusChange={(newStatus, extra) =>
                          updateStatus(d.deliverable_id, newStatus as DeliverableStatus, extra)
                        }
                        onOpenComments={() => {
                          setCommentDeliverable(d);
                          setCommentMode("read");
                        }}
                        onOpenWrite={() => {
                          setCommentDeliverable(d);
                          setCommentMode("write");
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "Add task"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Title with quick-picks (add dialog only) */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title</label>
              {!editing && (
                <div className="flex flex-wrap gap-1.5">
                  {TASK_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setForm({ ...form, title: t.title })}
                      className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs doing"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Optional"
              />
            </div>

            {/* Project — required, no "No project" option */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Project</label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm({ ...form, projectId: v })}
                disabled={projects.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={projects.length === 0 ? "No projects yet" : "Select project"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={String(p.project_id)}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee — name only, no role */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Assignee</label>
              <Select
                value={form.assignedTo}
                onValueChange={(v) => setForm({ ...form, assignedTo: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status — edit mode only; new tasks are always todo.
                Option list is derived from originalStatus (captured at dialog open) so it
                does not collapse as the user changes the value:
                  • todo / ongoing / review  →  offer todo, ongoing, review
                  • finished                 →  offer all four (allow reverting) */}
            {editing && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as KanbanStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(originalStatus === "finished"
                      ? (["todo", "ongoing", "review", "finished"] as KanbanStatus[])
                      : (["todo", "ongoing", "review"] as KanbanStatus[])
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row">
            {/* Delete — owner only, edit mode only, left-aligned */}
            {editing && isOwner && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="mr-auto"
              >
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments dialog */}
      <CommentsDialog
        open={commentDeliverable !== null}
        deliverableId={commentDeliverable?.deliverable_id ?? null}
        mode={commentMode}
        onClose={() => setCommentDeliverable(null)}
        onAddComment={async (body) => {
          if (!commentDeliverable) return;
          await addComment(commentDeliverable.deliverable_id, body);
        }}
        onMarkRead={async () => {
          if (!commentDeliverable) return;
          await markCommentsRead(commentDeliverable.deliverable_id);
        }}
        isAddingComment={isAddingComment}
        isMarkingRead={isMarkingRead}
      />
    </div>
  );
};

export default AdminTasks;
