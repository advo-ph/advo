import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  GitCommitHorizontal,
  FolderOpen,
  FileText,
  Banknote,
  ListChecks,
  LayoutDashboard,
  Pencil,
  Sparkles,
  Loader2,
  Upload,
  Trash2,
  Download,
  Mic,
  ChevronDown,
  ChevronUp,
  Plus,
  UserPlus,
  FileAudio,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/types/admin";
import type { MergedProject } from "@/hooks/useOrgProjects";
import { useAdminDeliverables } from "@/hooks/useAdminDeliverables";
// useInvoices removed in Phase 7 — Finance tab now uses ProjectInvoicesPanel directly
import { useProjectAssets } from "@/hooks/useProjectAssets";
import { useMeeting, type ProposeTaskResult } from "@/hooks/useMeeting";
import { useRecordingActions, useRecordingList, type MeetingRecording } from "@/hooks/useRecordings";
import { startPolling } from "@/hooks/useJobPoller";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { MeetingTaskPreview } from "./MeetingTaskPreview";
import { isJuniorRole } from "@/lib/project-assign";
import { get, post, patch, del } from "@/lib/api";
import { updateProject } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { Panel, Empty, Dot } from "@/components/admin/_ui";
import AdminSignoff from "./AdminSignoff";
import { ProjectAssignDialog } from "./shared/ProjectAssignDialog";
import { EditProjectDialog } from "./shared/EditProjectDialog";
import { DeliverablesPanel } from "./shared/DeliverablesPanel";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { FileViewerDialog } from "./shared/FileViewerDialog";
import { useRoles } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteProject } from "@/hooks/useDeleteProject";
import { FinanceStatCards } from "./shared/finance/FinanceStatCards";
import { ProjectInvoicesPanel } from "./shared/finance/ProjectInvoicesPanel";
import { RecurringInvoicesPanel } from "./shared/finance/RecurringInvoicesPanel";
import { CommissionPanel } from "./shared/finance/CommissionPanel";
import { ExpensesPanel } from "./shared/finance/ExpensesPanel";
import type { InvoiceFile } from "./shared/finance/ProjectInvoicesPanel";
import type { RecurringFee } from "./shared/finance/RecurringInvoicesPanel";

interface ProjectCommandCenterProps {
  project: MergedProject;
  onBack: () => void;
  onProjectDeleted?: () => void;
  onProjectSaved?: () => void;
}

// invoiceStatusDot removed in Phase 7 — Finance tab uses ProjectInvoicesPanel

const TABS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "deliverables", label: "Deliverables", icon: ListChecks },
  { value: "files", label: "Files", icon: FolderOpen },
  { value: "contracts", label: "Contracts", icon: FileText },
  { value: "meetings", label: "Meetings", icon: Mic },
  { value: "finance", label: "Finance", icon: Banknote },
];

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ─── Contracts panel ──────────────────────────────────

interface ContractFileRow {
  contractFileId: number;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  status: string;
  hasReview: boolean;
  aiReviewedAt: string | null;
}

const CONTRACT_FILE_STATUSES = ["draft", "final", "signed"] as const;
type ContractFileStatus = (typeof CONTRACT_FILE_STATUSES)[number];

const STATUS_LABELS: Record<ContractFileStatus, string> = {
  draft: "Draft",
  final: "Final",
  signed: "Signed",
};

function ContractsPanel({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<ContractFileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Per-file review state: map from contractFileId to { loading, text }
  const [reviewState, setReviewState] = useState<Record<number, { loading: boolean; text: string | null }>>({});
  const [reviewDialogFileId, setReviewDialogFileId] = useState<number | null>(null);

  // View file dialog
  const [viewerFile, setViewerFile] = useState<ContractFileRow | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ContractFileRow | null>(null);

  const fetchFiles = () => {
    setIsLoading(true);
    get<ContractFileRow[]>(`/api/contracts/files?projectId=${projectId}`)
      .then((res) => {
        if (res.data && !res.error) setFiles(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("projectId", String(projectId));
      formData.append("file", file);

      const res = await post<ContractFileRow>("/api/contracts/files/upload", formData);
      if (res.error || !res.data) {
        toast({ title: "Upload failed", description: res.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      setFiles((prev) => [res.data!, ...prev]);
      toast({ title: "Contract uploaded." });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleStatusChange = async (fileId: number, status: ContractFileStatus) => {
    const { error } = await patch(`/api/contracts/files/${fileId}/status`, { status });
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    setFiles((prev) => prev.map((f) => (f.contractFileId === fileId ? { ...f, status } : f)));
  };

  const handleRename = async (fileId: number, fileName: string) => {
    const { error } = await patch(`/api/contracts/files/${fileId}`, { fileName });
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    setFiles((prev) => prev.map((f) => (f.contractFileId === fileId ? { ...f, fileName } : f)));
    if (viewerFile?.contractFileId === fileId) setViewerFile((v) => v ? { ...v, fileName } : v);
  };

  const handleReview = async (fileId: number) => {
    // If review already exists, show dialog immediately
    const existing = reviewState[fileId]?.text;
    if (existing !== undefined && existing !== null) {
      setReviewDialogFileId(fileId);
      return;
    }
    // Check if already reviewed (from list)
    const row = files.find((f) => f.contractFileId === fileId);
    if (row?.hasReview && reviewState[fileId]?.text === undefined) {
      // fetch it
    }

    setReviewState((prev) => ({ ...prev, [fileId]: { loading: true, text: prev[fileId]?.text ?? null } }));
    try {
      const res = await get<{ contractFileId: number; aiReviewText: string; aiReviewedAt: string }>(
        `/api/contracts/files/${fileId}/review`,
      );
      if (res.data && !res.error) {
        const text = res.data.aiReviewText;
        setReviewState((prev) => ({ ...prev, [fileId]: { loading: false, text } }));
        setFiles((prev) =>
          prev.map((f) => (f.contractFileId === fileId ? { ...f, hasReview: true } : f)),
        );
        setReviewDialogFileId(fileId);
      } else {
        toast({ title: "Review failed", description: res.error ?? "Unknown error", variant: "destructive" });
        setReviewState((prev) => ({ ...prev, [fileId]: { loading: false, text: null } }));
      }
    } catch (err) {
      toast({
        title: "Review failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setReviewState((prev) => ({ ...prev, [fileId]: { loading: false, text: null } }));
    }
  };

  const handleDelete = async (fileId: number) => {
    const { error } = await del(`/api/contracts/files/${fileId}`);
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    setFiles((prev) => prev.filter((f) => f.contractFileId !== fileId));
    setDeleteTarget(null);
    if (viewerFile?.contractFileId === fileId) setViewerFile(null);
    toast({ title: "Contract deleted." });
  };

  const uploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-3.5 w-3.5" />
        )}
        Upload contract
      </Button>
    </>
  );

  const reviewText = reviewDialogFileId !== null ? (reviewState[reviewDialogFileId]?.text ?? null) : null;

  return (
    <>
      <Panel
        className="h-full"
        title="Contracts"
        action={uploadButton}
      >
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <Empty text="No contracts uploaded yet." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map((f) => {
              const rev = reviewState[f.contractFileId];
              const hasText = rev?.text !== undefined && rev.text !== null;
              return (
                <div key={f.contractFileId} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  {/* File name */}
                  <span className="min-w-0 flex-1 truncate text-sm">{f.fileName}</span>

                  {/* Status dropdown */}
                  <Select
                    value={f.status}
                    onValueChange={(v) => void handleStatusChange(f.contractFileId, v as ContractFileStatus)}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_FILE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* View file */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setViewerFile(f)}
                  >
                    View file
                  </Button>

                  {/* Review / See review */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={rev?.loading === true}
                    onClick={() => void handleReview(f.contractFileId)}
                  >
                    {rev?.loading ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : null}
                    {hasText || f.hasReview ? "See review" : "Review"}
                  </Button>

                  {/* Delete */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(f)}
                    aria-label="Delete contract"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Review text dialog */}
      {reviewDialogFileId !== null && reviewText !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setReviewDialogFileId(null)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-xl overflow-auto rounded-lg border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              onClick={() => setReviewDialogFileId(null)}
              aria-label="Close"
            >
              <span aria-hidden className="text-lg leading-none">✕</span>
            </button>
            <h3 className="mb-3 text-sm font-semibold">Contract review</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{reviewText}</p>
          </div>
        </div>
      )}

      {/* File viewer dialog */}
      {viewerFile && (
        <FileViewerDialog
          url={viewerFile.fileUrl}
          fileName={viewerFile.fileName}
          mimeType={viewerFile.mimeType}
          onRename={(newName) => handleRename(viewerFile.contractFileId, newName)}
          onDelete={() => {
            setViewerFile(null);
            setDeleteTarget(viewerFile);
          }}
          onClose={() => setViewerFile(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget.contractFileId); }}
        name={deleteTarget?.fileName}
        noun="contract"
      />
    </>
  );
}

const ProjectCommandCenter = ({ project, onBack, onProjectDeleted, onProjectSaved }: ProjectCommandCenterProps) => {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Edit / Delete header state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { handleDelete: doDeleteProject } = useDeleteProject(() => {
    onProjectDeleted?.();
    onBack();
  });
  const { deliverables } = useAdminDeliverables();
  const { activeMembers: teamMember } = useAdminTeam();
  const { assets, uploadFile, deleteAsset, isUploading } = useProjectAssets(project.project_id);
  const {
    meeting: projectMeeting,
    isLoading: meetingLoading,
    deleteMeeting,
    generateTask,
    proposeTask,
    isGeneratingTask,
  } = useMeeting(project.project_id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("overview");
  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);
  const [generatingMeetingId, setGeneratingMeetingId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<ProposeTaskResult | null>(null);
  const [isConfirmingTask, setIsConfirmingTask] = useState(false);
  // Recording state
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [expandedRecordingMeetingId, setExpandedRecordingMeetingId] = useState<number | null>(null);
  const [deleteRecordingTarget, setDeleteRecordingTarget] = useState<{
    recordingId: number;
    meetingId: number | null;
    fileName: string;
  } | null>(null);
  const [transcriptViewContent, setTranscriptViewContent] = useState<string | null>(null);
  const { isUploading: isUploadingRecording, uploadRecording, transcribeRecording, deleteRecording } =
    useRecordingActions();
  const { data: recordingsForExpanded = [] } = useRecordingList(expandedRecordingMeetingId);

  // Website tab — in-tab repo save
  const [repoInput, setRepoInput] = useState(project.repository_name ?? "");
  const [isSavingRepo, setIsSavingRepo] = useState(false);

  const handleSaveRepo = async () => {
    setIsSavingRepo(true);
    try {
      const { error } = await patch(`/api/projects/${project.project_id}/repository`, {
        repositoryName: repoInput.trim(),
      });
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Repository saved." });
        void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save repository",
        variant: "destructive",
      });
    } finally {
      setIsSavingRepo(false);
    }
  };

  // Website tab — in-tab live URL save
  const [previewInput, setPreviewInput] = useState(project.preview_url ?? "");
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);

  const handleSavePreviewUrl = async () => {
    setIsSavingPreview(true);
    try {
      const { error } = await updateProject(project.project_id, {
        preview_url: previewInput.trim() || null,
      });
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Website link saved." });
        setIsEditingPreview(false);
        void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
        onProjectSaved?.();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save website link",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreview(false);
    }
  };

  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false);
  const [briefInput, setBriefInput] = useState(project.description ?? "");
  const [isSavingBrief, setIsSavingBrief] = useState(false);

  const handleSaveWebsiteDialog = async () => {
    setIsSavingPreview(true);
    setIsSavingBrief(true);
    try {
      const { error } = await updateProject(project.project_id, {
        preview_url: previewInput.trim() || null,
        description: briefInput.trim() || null,
      });
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Website details saved." });
        setWebsiteDialogOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
        onProjectSaved?.();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreview(false);
      setIsSavingBrief(false);
    }
  };

  // Website card — readable host name and a cached screenshot of the site
  const siteHost = (project.preview_url ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(!!project.preview_url);
  useEffect(() => {
    if (!project.preview_url) {
      setScreenshotUrl(null);
      setScreenshotLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const poll = async () => {
      const res = await get<{ ready: boolean; url: string | null }>(
        `/api/projects/${project.project_id}/screenshot`,
      );
      if (cancelled) return;
      if (res.data?.ready && res.data.url) {
        setScreenshotUrl(`${res.data.url}?v=${Date.now()}`);
        setScreenshotLoading(false);
      } else if (++attempts < 15) {
        timer = setTimeout(poll, 3000);
      } else {
        setScreenshotLoading(false);
      }
    };

    setScreenshotLoading(true);
    setScreenshotUrl(null);
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project.preview_url, project.project_id]);

  const [assignedId, setAssignedId] = useState<number[]>(project.team_member_id ?? []);
  const [addMemberId, setAddMemberId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Phase 2 — project role assignments
  const { isOwner } = useRoles();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [peopleList, setPeopleList] = useState<{ assignmentId: number; teamMemberId: number; name: string; projectRole: string }[]>([]);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);

  const ROLE_LABELS: Record<string, string> = {
    referral: "Referral",
    project_manager: "Project Manager",
    lead_developer: "Lead Developer",
    assistant_developer: "Assistant Developer",
    creatives_developer: "Creatives Developer",
  };

  // One row per person; a person holding several roles lists them together.
  const groupedPeople = useMemo(() => {
    const byMember = new Map<number, { teamMemberId: number; name: string; roles: string[] }>();
    for (const p of peopleList) {
      const entry = byMember.get(p.teamMemberId);
      if (entry) {
        if (!entry.roles.includes(p.projectRole)) entry.roles.push(p.projectRole);
      } else {
        byMember.set(p.teamMemberId, {
          teamMemberId: p.teamMemberId,
          name: p.name,
          roles: [p.projectRole],
        });
      }
    }
    return Array.from(byMember.values());
  }, [peopleList]);

  const fetchPeople = () => {
    setIsPeopleLoading(true);
    get<{ assignmentId: number; teamMemberId: number; name: string; projectRole: string }[]>(
      `/api/projects/${project.project_id}/members`,
    )
      .then((res) => {
        if (res.data && !res.error) setPeopleList(res.data);
      })
      .catch(() => {})
      .finally(() => setIsPeopleLoading(false));
  };

  useEffect(() => {
    setRepoInput(project.repository_name ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.project_id]);

  useEffect(() => {
    setAssignedId(project.team_member_id ?? []);
  }, [project.project_id, project.team_member_id]);

  useEffect(() => {
    fetchPeople();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.project_id]);

  // ── Phase 7: Finance tab — local state for stat card sync ──
  const [financeInvoiceFiles, setFinanceInvoiceFiles] = useState<InvoiceFile[]>([]);
  const [financeRecurringFiles, setFinanceRecurringFiles] = useState<InvoiceFile[]>([]);
  const [financeRecurringFee, setFinanceRecurringFee] = useState<RecurringFee | null>(null);

  const assignedMember = teamMember.filter((m) => assignedId.includes(m.team_member_id));
  const juniorOption = teamMember.filter(
    (m) => isJuniorRole(m.role) && !assignedId.includes(m.team_member_id),
  );

  const handleAssign = async () => {
    const teamMemberId = Number(addMemberId);
    if (!teamMemberId) return;
    setIsAssigning(true);
    try {
      const { error } = await post(`/api/projects/${project.project_id}/team`, { teamMemberId });
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        setAssignedId((prev) => (prev.includes(teamMemberId) ? prev : [...prev, teamMemberId]));
        setAddMemberId("");
        void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
        toast({ title: "Assigned", description: "Junior added to project" });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to assign",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (teamMemberId: number) => {
    setIsAssigning(true);
    try {
      const { error } = await del(`/api/projects/${project.project_id}/team/${teamMemberId}`);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        setAssignedId((prev) => prev.filter((id) => id !== teamMemberId));
        void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
        toast({ title: "Removed", description: "Team member removed from project" });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to remove",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const isImageAsset = (a: { url: string; asset_type: string }) =>
    a.asset_type !== "document" || /\.(png|jpe?g|gif|webp|svg|avif|heic)$/i.test(a.url);

  const projDeliverables = deliverables.filter((d) => d.project_id === project.project_id);

  const paidPct =
    project.total_value_cents > 0
      ? Math.round((project.amount_paid_cents / project.total_value_cents) * 100)
      : 0;
  const outstanding = project.total_value_cents - project.amount_paid_cents;
  const openDeliverables = projDeliverables.filter((d) => d.status !== "finished").length;
  const latestCommit = project.commits?.[0];

  const repositoryPanel = (
    <>
      <Panel
        title="Repository"
        action={
          (isOwner || authUser?.role === "admin") ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setRepoInput(project.repository_name ?? "");
                setRepoDialogOpen(true);
              }}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          ) : undefined
        }
      >
        <div className="p-4 space-y-3">
          {repoInput.trim() ? (
            <>
              <a
                href={`https://github.com/advo-ph/${repoInput.trim()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <GitBranch className="h-4 w-4" /> advo-ph/{repoInput.trim()}
              </a>
              {latestCommit && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <GitCommitHorizontal className="h-4 w-4" />
                  <span className="text-xs tabular-nums">{latestCommit.sha.slice(0, 7)}</span>
                  <span className="truncate">{latestCommit.message}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No repository linked.</p>
          )}
        </div>
      </Panel>

      <Dialog open={repoDialogOpen} onOpenChange={setRepoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit repository</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Repository name</label>
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="GitHub repository name"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              github.com/advo-ph/{repoInput.trim() || "..."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepoDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleSaveRepo();
                setRepoDialogOpen(false);
              }}
              disabled={isSavingRepo}
            >
              {isSavingRepo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Projects
        </button>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight">{project.title}</h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Dot className={project.project_status === "shipped" ? "bg-accent" : "bg-muted-foreground"} />
                {project.project_status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.client?.company_name || project.client?.contact_email || "No client"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <span className="text-muted-foreground tabular-nums">
                <span className="text-foreground">{formatCurrency(project.amount_paid_cents)}</span>
                {" / "}
                {formatCurrency(project.total_value_cents)}
              </span>
              {project.repository_name && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  {project.repository_name}
                </span>
              )}
              {project.preview_url && (
                <a
                  href={project.preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Live preview
                </a>
              )}
            </div>
          </div>

          {/* Edit and Delete project */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-destructive hover:bg-destructive/10 border-destructive/40"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent-ink data-[state=active]:shadow-none"
            >
              <Icon className="mr-1.5 h-4 w-4" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
            {/* Row 1, left — 2x2 stat grid */}
            <div className="grid grid-cols-2 gap-px bg-border rounded-lg border border-border overflow-hidden">
                <Stat label="Paid" value={formatCurrency(project.amount_paid_cents)} sub={`${paidPct}%`} accent />
                <Stat label="Outstanding" value={formatCurrency(outstanding)} sub={`of ${formatCurrency(project.total_value_cents)}`} />
                <Stat label="Open tasks" value={String(openDeliverables)} sub={`${projDeliverables.length} total`} />
                <Stat label="Status" value={project.project_status} />
              </div>

            {/* Row 1, right — website card, height matched to the stat grid */}
            <Panel
              title="Website"
              className="flex h-full flex-col overflow-hidden"
              bodyClassName="flex min-h-0 flex-1 flex-col"
              action={
                (isOwner || authUser?.role === "admin") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => {
                      setPreviewInput(project.preview_url ?? "");
                      setBriefInput(project.description ?? "");
                      setWebsiteDialogOpen(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                ) : undefined
              }
            >
              {project.preview_url ? (
                <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                  <a
                    href={project.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative block h-32 w-full shrink-0 overflow-hidden border-b border-border bg-secondary/40 sm:h-auto sm:w-[44%] sm:border-b-0 sm:border-r"
                  >
                    {screenshotLoading ? (
                      <div className="absolute inset-0 animate-pulse bg-muted" />
                    ) : screenshotUrl ? (
                      <img
                        src={screenshotUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-top"
                      />
                    ) : (
                      <Globe className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    )}
                  </a>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4">
                    <p className="truncate text-sm font-medium">{siteHost}</p>
                    {project.description && (
                      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                    <a
                      href={project.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-accent-ink transition-opacity hover:opacity-70"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Visit site</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
                  <p className="text-sm text-muted-foreground">No website link yet.</p>
                  {(isOwner || authUser?.role === "admin") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setPreviewInput("");
                        setBriefInput(project.description ?? "");
                        setWebsiteDialogOpen(true);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Set website link
                    </Button>
                  )}
                </div>
              )}
            </Panel>

            <Dialog open={websiteDialogOpen} onOpenChange={setWebsiteDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit website</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Website link</label>
                    <Input
                      value={previewInput}
                      onChange={(e) => setPreviewInput(e.target.value)}
                      placeholder="https://example.com"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Brief</label>
                    <Textarea
                      value={briefInput}
                      onChange={(e) => setBriefInput(e.target.value)}
                      placeholder="Short description of the project"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setWebsiteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveWebsiteDialog}
                    disabled={isSavingPreview || isSavingBrief}
                  >
                    {(isSavingPreview || isSavingBrief) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Row 2, left — payment progress and repository */}
            <div className="space-y-4">
              <Panel title="Payment progress">
                <div className="p-4 space-y-2">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(paidPct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(project.amount_paid_cents)} of {formatCurrency(project.total_value_cents)} collected
                  </p>
                </div>
              </Panel>

              {repositoryPanel}
            </div>

            {/* Row 2, right — people */}
            <Panel
              title="People"
              meta={`${groupedPeople.length} assigned`}
              className="self-start"
              action={
                (isOwner || authUser?.role === "admin") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Assign
                  </Button>
                ) : undefined
              }
            >
              <div className="divide-y divide-border">
                {isPeopleLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : groupedPeople.length === 0 ? (
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground">No one assigned yet.</p>
                  </div>
                ) : (
                  groupedPeople.map((p) => (
                    <div
                      key={p.teamMemberId}
                      className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {p.roles.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <ProjectAssignDialog
            projectId={project.project_id}
            open={assignDialogOpen}
            onOpenChange={setAssignDialogOpen}
            onSaved={fetchPeople}
          />
        </TabsContent>

        {/* ── Deliverables (full CRUD via shared panel) ── */}
        <TabsContent value="deliverables" className="pt-4">
          <DeliverablesPanel
            projectId={project.project_id}
            hideProjectColumn={true}
          />
        </TabsContent>

        {/* ── Files (Project Drive) ── */}
        <TabsContent value="files" className="pt-4">
          <Panel
            title="Project Drive"
            meta={assets.length > 0 ? `${assets.length} files` : undefined}
            action={
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload
              </Button>
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />

            <div className="p-4">
              {assets.length === 0 ? (
                <Empty text="No files yet. Upload designs, documents, or deliverable assets." icon={FolderOpen} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((a) => (
                    <div key={a.asset_id} className="overflow-hidden rounded-lg border border-border bg-card">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                        {isImageAsset(a) ? (
                          <img src={a.url} alt={a.caption || "asset"} className="h-32 w-full object-cover" />
                        ) : (
                          <div className="flex h-32 w-full items-center justify-center bg-secondary/40">
                            <FileText className="h-9 w-9 text-muted-foreground" />
                          </div>
                        )}
                      </a>
                      <div className="flex items-center justify-between gap-2 border-t border-border p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.caption || a.url.split("/").pop()}</p>
                          {a.uploaded_at && (
                            <p className="text-xs text-muted-foreground">{shortDate(a.uploaded_at)}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Open file"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => deleteAsset(a.asset_id)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                            aria-label="Delete file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </TabsContent>

        {/* ── Contracts (left) + sign-off (right) ── */}
        {/* Sign-off is client-facing final delivery; NOT deliverable.verified_at */}
        <TabsContent value="contracts" className="grid gap-4 pt-4 md:grid-cols-2">
          <div className="flex flex-col space-y-4">
            <ContractsPanel projectId={project.project_id} />
          </div>
          <div className="flex flex-col space-y-4">
            <AdminSignoff projectId={project.project_id} />
          </div>
        </TabsContent>

        {/* ── Meetings (MoM) ── */}
        <TabsContent value="meetings" className="pt-4">
          <Panel
            title="Meeting minutes"
            meta={
              meetingLoading
                ? "loading…"
                : `${projectMeeting.length} meeting note${projectMeeting.length === 1 ? "" : "s"}`
            }
            action={
              <Button
                size="sm"
                onClick={() => audioInputRef.current?.click()}
                disabled={isUploadingRecording}
              >
                {isUploadingRecording ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload recording
              </Button>
            }
          >
            {/* Hidden audio file input — triggered by the Upload recording button */}
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a,audio/mp3,audio/m4a"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                // Create a bare meeting row for this recording.
                const res = await post<{ meetingId: number }>("/api/meeting", {
                  projectId: project.project_id,
                  title: file.name.replace(/\.[^.]+$/, ""),
                  recordedAt: new Date().toISOString(),
                  transcript: "(transcript pending)",
                });
                const meetingId = res.data?.meetingId ?? null;
                await uploadRecording(file, meetingId);
              }}
            />

            {meetingLoading && projectMeeting.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : projectMeeting.length === 0 ? (
              <Empty text="No meeting minutes for this project yet." icon={Mic} />
            ) : (
              <div className="divide-y divide-border">
                {projectMeeting.map((m) => {
                  const isOpen = expandedMeetingId === m.meetingId;
                  return (
                    <div key={m.meetingId}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = isOpen ? null : m.meetingId;
                          setExpandedMeetingId(next);
                          if (next) setExpandedRecordingMeetingId(next);
                        }}
                        className="flex w-full items-center gap-3 px-4 h-11 text-left hover:bg-secondary/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {new Date(m.recordedAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="space-y-2 border-t border-border bg-secondary/20 px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              disabled={
                                isGeneratingTask ||
                                (!m.transcript?.trim() && !m.summary?.trim()) ||
                                generatingMeetingId === m.meetingId
                              }
                              onClick={async () => {
                                setGeneratingMeetingId(m.meetingId);
                                try {
                                  setProposal(await proposeTask(m.meetingId));
                                } catch {
                                  // toast from hook
                                } finally {
                                  setGeneratingMeetingId(null);
                                }
                              }}
                            >
                              {generatingMeetingId === m.meetingId ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Generate tasks
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-destructive hover:bg-destructive/10"
                              onClick={() => void deleteMeeting(m.meetingId)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                          {m.summary?.trim() && (
                            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm text-foreground/90">
                              {m.summary}
                            </div>
                          )}
                          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 font-sans text-sm text-foreground/90">
                            {m.transcript}
                          </pre>

                          {/* Recordings for this meeting */}
                          <ProjectRecordingList
                            meetingId={m.meetingId}
                            recordings={expandedRecordingMeetingId === m.meetingId ? recordingsForExpanded : []}
                            onTranscribe={async (recId) => {
                              const result = await transcribeRecording.mutateAsync(recId);
                              startPolling();
                              return result;
                            }}
                            onDelete={(recId, fileName) =>
                              setDeleteRecordingTarget({ recordingId: recId, meetingId: m.meetingId, fileName })
                            }
                            onViewTranscript={(text) => setTranscriptViewContent(text)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
          <MeetingTaskPreview
            proposal={proposal}
            isConfirming={isConfirmingTask}
            onClose={() => setProposal(null)}
            onConfirm={async () => {
              if (!proposal) return;
              setIsConfirmingTask(true);
              try {
                await generateTask(proposal.meetingId, proposal.task, proposal.method);
                setProposal(null);
              } catch {
                // toast from hook
              } finally {
                setIsConfirmingTask(false);
              }
            }}
          />
        </TabsContent>

        {/* ── Finance ── */}
        <TabsContent value="finance" className="space-y-6 pt-4">
          {/* Stat cards */}
          <FinanceStatCards
            projectTotalValueCents={project.total_value_cents}
            contractFiles={[]}
            invoiceFiles={[
              ...financeInvoiceFiles,
              ...financeRecurringFiles,
            ]}
            recurringFees={financeRecurringFee ? [financeRecurringFee] : []}
          />

          {/* Invoices, recurring, expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ProjectInvoicesPanel
              projectId={project.project_id}
              onFilesChange={setFinanceInvoiceFiles}
            />
            <RecurringInvoicesPanel
              projectId={project.project_id}
              onFilesChange={setFinanceRecurringFiles}
              onFeeChange={setFinanceRecurringFee}
            />
            <ExpensesPanel projectId={project.project_id} />
          </div>

          {/* Commission takes the whole row: five columns and three pool boxes */}
          <CommissionPanel projectId={project.project_id} isOwner={isOwner} />
        </TabsContent>
      </Tabs>

      {/* Edit project dialog */}
      <EditProjectDialog
        project={project}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["orgProjects"] });
          onProjectSaved?.();
        }}
      />

      {/* Delete project confirmation */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        noun="project"
        name={project.title}
        onConfirm={() => void doDeleteProject(project.project_id)}
      />

      {/* Delete recording confirmation */}
      <ConfirmDeleteDialog
        open={deleteRecordingTarget != null}
        onOpenChange={(v) => { if (!v) setDeleteRecordingTarget(null); }}
        noun="recording"
        name={deleteRecordingTarget?.fileName ?? ""}
        onConfirm={() => {
          if (!deleteRecordingTarget) return;
          deleteRecording.mutate({
            recordingId: deleteRecordingTarget.recordingId,
            meetingId: deleteRecordingTarget.meetingId,
          });
          setDeleteRecordingTarget(null);
        }}
      />

      {/* Transcript view dialog */}
      {transcriptViewContent != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setTranscriptViewContent(null)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              onClick={() => setTranscriptViewContent(null)}
              aria-label="Close"
            >
              <span aria-hidden className="text-lg leading-none">✕</span>
            </button>
            <h3 className="mb-3 text-sm font-semibold">Transcript</h3>
            <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans leading-relaxed">
              {transcriptViewContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

/* Local Stat — bordered hairline cell, matches _ui.tsx Stat shape. */
const Stat = ({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) => (
  <div className="bg-card px-4 py-3">
    <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
    <p className={`text-2xl font-semibold tracking-tight tabular-nums truncate ${accent ? "text-accent-ink" : ""}`}>
      {value}
    </p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
  </div>
);

// ─── Recording list sub-component for ProjectCommandCenter ──

interface ProjectRecordingListProps {
  meetingId: number;
  recordings: MeetingRecording[];
  onTranscribe: (recordingId: number) => Promise<{ jobId: number }>;
  onDelete: (recordingId: number, fileName: string) => void;
  onViewTranscript: (text: string) => void;
}

function ProjectRecordingList({
  recordings,
  onTranscribe,
  onDelete,
  onViewTranscript,
}: ProjectRecordingListProps) {
  const [transcribingIds, setTranscribingIds] = React.useState<Set<number>>(new Set());

  if (recordings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Recordings</p>
      {recordings.map((rec) => {
        const isRunning = transcribingIds.has(rec.recordingId);
        return (
          <div
            key={rec.recordingId}
            className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{rec.fileName}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {new Date(rec.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {rec.transcript ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onViewTranscript(rec.transcript!)}
                >
                  View transcript
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={isRunning || rec.jobId != null}
                  onClick={async () => {
                    setTranscribingIds((prev) => new Set(prev).add(rec.recordingId));
                    try {
                      await onTranscribe(rec.recordingId);
                    } finally {
                      setTranscribingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(rec.recordingId);
                        return next;
                      });
                    }
                  }}
                >
                  {isRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {isRunning ? "Starting…" : "Transcribe"}
                </Button>
              )}
              <button
                className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Delete recording"
                onClick={() => onDelete(rec.recordingId, rec.fileName)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProjectCommandCenter;
