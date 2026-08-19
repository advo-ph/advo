import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GitBranch,
  ExternalLink,
  GitCommitHorizontal,
  FolderOpen,
  FileText,
  FileSignature,
  Banknote,
  ListChecks,
  LayoutDashboard,
  Eye,
  Sparkles,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Upload,
  Copy,
  Check,
  Send,
  Trash2,
  Download,
  Mic,
  ChevronDown,
  ChevronUp,
  Plus,
  UserPlus,
  X,
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
import { formatCurrency } from "@/types/admin";
import type { MergedProject } from "@/hooks/useOrgProjects";
import {
  useAdminDeliverables,
  type DeliverableStatus,
} from "@/hooks/useAdminDeliverables";
import { useInvoices } from "@/hooks/useInvoices";
import { useContractReview, type FlagSeverity } from "@/hooks/useContractReview";
import { useProjectPreview } from "@/hooks/usePreviewLink";
import { useProjectAssets } from "@/hooks/useProjectAssets";
import { useMeeting, type ProposeTaskResult } from "@/hooks/useMeeting";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { MeetingTaskPreview } from "./MeetingTaskPreview";
import { isJuniorRole } from "@/lib/project-assign";
import { post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Panel, Empty, Dot } from "@/components/admin/_ui";
import AdminSignoff from "./AdminSignoff";

interface ProjectCommandCenterProps {
  project: MergedProject;
  onBack: () => void;
}

const deliverableStatus: Record<DeliverableStatus, { label: string; dot: string; icon: React.ElementType }> = {
  not_started: { label: "Not Started", dot: "bg-muted-foreground", icon: Circle },
  in_progress: { label: "In Progress", dot: "bg-blue-500", icon: Clock },
  review: { label: "In Review", dot: "bg-purple-500", icon: AlertCircle },
  completed: { label: "Completed", dot: "bg-green-500", icon: CheckCircle2 },
  blocked: { label: "Blocked", dot: "bg-red-500", icon: AlertCircle },
};

const invoiceStatusDot: Record<string, string> = {
  paid: "bg-green-500",
  unpaid: "bg-muted-foreground",
  overdue: "bg-red-500",
};

const verdictConfig: Record<string, { label: string; dot: string; text: string }> = {
  good_to_go: { label: "Good to go", dot: "bg-green-500", text: "text-green-500" },
  needs_work: { label: "Needs work", dot: "bg-amber-500", text: "text-amber-500" },
  high_risk: { label: "High risk", dot: "bg-red-500", text: "text-red-500" },
};

const severityConfig: Record<FlagSeverity, { dot: string }> = {
  green: { dot: "bg-green-500" },
  amber: { dot: "bg-amber-500" },
  red: { dot: "bg-red-500" },
};

const TABS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "deliverables", label: "Deliverables", icon: ListChecks },
  { value: "files", label: "Files", icon: FolderOpen },
  { value: "dev", label: "Dev & Deploy", icon: GitCommitHorizontal },
  { value: "contracts", label: "Contracts", icon: FileText },
  { value: "signoff", label: "Sign-off", icon: FileSignature },
  { value: "meetings", label: "Meetings", icon: Mic },
  { value: "finance", label: "Finance", icon: Banknote },
];

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const ProjectCommandCenter = ({ project, onBack }: ProjectCommandCenterProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { deliverables } = useAdminDeliverables();
  const { invoices } = useInvoices();
  const { activeMembers: teamMember } = useAdminTeam();
  const { review, result: contractReview, isReviewing, error: reviewError, reset: resetReview } = useContractReview();
  const [contractText, setContractText] = useState("");
  const {
    generateLink,
    link: previewLink,
    isGenerating,
    error: previewError,
    requests: previewRequests,
  } = useProjectPreview(project.project_id);
  const { assets, uploadFile, deleteAsset, isUploading } = useProjectAssets(project.project_id);
  const {
    meeting: projectMeeting,
    isLoading: meetingLoading,
    createMeeting,
    deleteMeeting,
    generateTask,
    proposeTask,
    importPlaudMeeting,
    isSaving: isSavingMeeting,
    isImporting,
    isGeneratingTask,
  } = useMeeting(project.project_id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);
  const [generatingMeetingId, setGeneratingMeetingId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<ProposeTaskResult | null>(null);
  const [isConfirmingTask, setIsConfirmingTask] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingRecordedAt, setMeetingRecordedAt] = useState("");
  const [meetingTranscript, setMeetingTranscript] = useState("");
  const [meetingPlaudKey, setMeetingPlaudKey] = useState("");
  const [meetingImportRef, setMeetingImportRef] = useState("");

  const [assignedId, setAssignedId] = useState<number[]>(project.team_member_id ?? []);
  const [addMemberId, setAddMemberId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    setAssignedId(project.team_member_id ?? []);
  }, [project.project_id, project.team_member_id]);

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

  const copyPreview = () => {
    if (!previewLink) return;
    navigator.clipboard?.writeText(previewLink.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const projDeliverables = deliverables.filter((d) => d.project_id === project.project_id);
  const projInvoices = invoices.filter((i) => i.project_id === project.project_id);

  const paidPct =
    project.total_value_cents > 0
      ? Math.round((project.amount_paid_cents / project.total_value_cents) * 100)
      : 0;
  const outstanding = project.total_value_cents - project.amount_paid_cents;
  const openDeliverables = projDeliverables.filter((d) => d.status !== "completed").length;
  const latestCommit = project.commits?.[0];

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

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
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

          {/* Flagship CTA — jumps to the Dev & Deploy panel */}
          <Button
            onClick={() => setTab("dev")}
            className="shrink-0 rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Eye className="mr-2 h-4 w-4" /> Show Client Now
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              <Icon className="mr-1.5 h-4 w-4" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview (real) ── */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg border border-border overflow-hidden">
            <Stat label="Paid" value={`${paidPct}%`} sub={formatCurrency(project.amount_paid_cents)} accent />
            <Stat label="Outstanding" value={formatCurrency(outstanding)} sub={`${projInvoices.length} invoices`} />
            <Stat label="Open deliverables" value={String(openDeliverables)} sub={`${projDeliverables.length} total`} />
            <Stat label="Stage" value={project.project_status} sub="pipeline" />
          </div>

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

          {project.description && (
            <Panel title="Brief">
              <p className="p-4 text-sm text-foreground/90">{project.description}</p>
            </Panel>
          )}

          {project.tech_stack.length > 0 && (
            <Panel title="Tech stack">
              <div className="flex flex-wrap gap-1.5 p-4">
                {project.tech_stack.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Team" meta={`${assignedMember.length} assigned`}>
            <div className="p-4 space-y-3">
              {assignedMember.length === 0 ? (
                <p className="text-sm text-muted-foreground">No junior assigned yet.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {assignedMember.map((m) => (
                    <div
                      key={m.team_member_id}
                      className="flex items-center justify-between gap-3 px-3 h-11"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.role}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        disabled={isAssigning}
                        onClick={() => handleUnassign(m.team_member_id)}
                        aria-label={`Remove ${m.name}`}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={addMemberId} onValueChange={setAddMemberId}>
                  <SelectTrigger className="h-9 sm:flex-1">
                    <SelectValue placeholder="Assign a junior…" />
                  </SelectTrigger>
                  <SelectContent>
                    {juniorOption.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No juniors available
                      </SelectItem>
                    ) : (
                      juniorOption.map((m) => (
                        <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
                          {m.name} · {m.role}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={!addMemberId || addMemberId === "__none" || isAssigning}
                  onClick={handleAssign}
                >
                  {isAssigning ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1.5" />
                  )}
                  Assign
                </Button>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* ── Deliverables (real) ── */}
        <TabsContent value="deliverables" className="pt-4">
          <Panel title="Deliverables" meta={`${projDeliverables.length} total`}>
            {projDeliverables.length === 0 ? (
              <Empty text="No deliverables on this project yet. Add them from the Deliverables section." />
            ) : (
              <div className="divide-y divide-border">
                {projDeliverables.map((d) => {
                  const s = deliverableStatus[d.status];
                  return (
                    <div key={d.deliverable_id} className="flex items-center justify-between gap-4 px-4 h-11">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {d.assignee?.name || "Unassigned"}
                          {d.due_date && ` · due ${shortDate(d.due_date)}`}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Dot className={s.dot} /> {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ── Files (Project Drive) ── */}
        <TabsContent value="files" className="pt-4">
          <Panel
            title="Project Drive"
            meta={assets.length > 0 ? `${assets.length} files` : undefined}
            action={
              <Button
                size="sm"
                className="h-8 rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
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
              <p className="mb-3 text-xs text-muted-foreground">
                Designs, documents, and deliverable assets — one place per project. Images, PDFs, video (≤25 MB).
              </p>

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

        {/* ── Dev & Deploy (partial real + scaffold) ── */}
        <TabsContent value="dev" className="space-y-4 pt-4">
          <Panel title="Repository">
            <div className="p-4">
              {project.repository_name ? (
                <div className="space-y-2 text-sm">
                  <a
                    href={`https://github.com/advo-ph/${project.repository_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <GitBranch className="h-4 w-4" /> advo-ph/{project.repository_name}
                  </a>
                  {latestCommit ? (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <GitCommitHorizontal className="h-4 w-4" />
                      <span className="text-xs tabular-nums">{latestCommit.sha.slice(0, 7)}</span>
                      <span className="truncate">{latestCommit.message}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">No recent commits cached.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No GitHub repo linked. Add one in project settings.</p>
              )}
            </div>
          </Panel>

          <Panel title="Show Client Now">
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                Generate a private, expiring link to this project's live preview — instant to share, auto-expires
                (~20 min). Host-agnostic: it points at whatever preview URL is set (Vercel / Cloudflare / here.now / VPS).
              </p>

              {!project.preview_url ? (
                <p className="text-sm text-muted-foreground">
                  Set a <span className="font-medium text-foreground">Preview URL</span> on the project (Edit) to enable this.
                </p>
              ) : (
                <>
                  <Button
                    onClick={() => generateLink()}
                    disabled={isGenerating}
                    className="rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Generate preview link
                  </Button>
                  {previewError && <p className="text-sm text-destructive">{previewError}</p>}
                  {previewLink && (
                    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-xs text-accent tabular-nums">{previewLink.url}</span>
                        <Button size="sm" variant="outline" className="h-8" onClick={copyPreview} aria-label="Copy link">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expires in {previewLink.ttlMinutes} min — share it with the client now.
                      </p>
                    </div>
                  )}
                </>
              )}

              {previewRequests.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Client requests</p>
                  <div className="divide-y divide-border">
                    {previewRequests.slice(0, 3).map((r) => (
                      <div key={r.activityId} className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Send className="h-3.5 w-3.5 shrink-0 text-accent" />
                        Client requested a preview ·{" "}
                        {new Date(r.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </TabsContent>

        {/* ── Contracts (partial real + scaffold) ── */}
        <TabsContent value="contracts" className="space-y-4 pt-4">
          <Panel title="Agreement">
            <div className="p-4">
              {project.contract_url ? (
                <a
                  href={project.contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FileText className="h-4 w-4" /> Open contract
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">No contract linked yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="Red-flag review">
            <div className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                Paste the contract or SOW text to check it against ADVO's policy — downpayment floor, revision cap,
                change orders, late payment, termination. Catches the exact gaps that leaked revenue on past projects.
              </p>

              <Textarea
                value={contractText}
                onChange={(e) => setContractText(e.target.value)}
                placeholder="Paste the contract / SOW text here…"
                rows={6}
                className="text-xs"
              />

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => review(contractText)}
                  disabled={isReviewing || contractText.trim().length < 20}
                  className="rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {isReviewing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Check contract
                </Button>
                {(contractReview || reviewError) && (
                  <Button variant="ghost" onClick={resetReview}>
                    Clear
                  </Button>
                )}
              </div>

              {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}

              {contractReview && (
                <div className="space-y-3 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                        verdictConfig[contractReview.verdict]?.text ?? ""
                      }`}
                    >
                      <Dot className={verdictConfig[contractReview.verdict]?.dot ?? "bg-muted-foreground"} />
                      {verdictConfig[contractReview.verdict]?.label}
                    </span>
                    <p className="flex-1 text-sm text-muted-foreground">{contractReview.summary}</p>
                  </div>

                  <div className="divide-y divide-border rounded-md border border-border">
                    {contractReview.flags.map((f) => {
                      const sev = severityConfig[f.severity];
                      return (
                        <div key={f.policy} className="flex items-start gap-2.5 px-3 py-2.5">
                          <span className="mt-1.5">
                            <Dot className={sev.dot} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{f.policy}</p>
                            <p className="text-xs text-muted-foreground">{f.note}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted-foreground/70">{contractReview.disclaimer}</p>
                </div>
              )}
            </div>
          </Panel>
        </TabsContent>

        {/* ── Meetings (MoM) ── */}
        {/* ── Sign-off (client-facing final delivery; NOT deliverable.verified_at) ── */}
        <TabsContent value="signoff" className="space-y-4 pt-4">
          <AdminSignoff projectId={project.project_id} />
        </TabsContent>

        <TabsContent value="meetings" className="pt-4">
          <Panel
            title="Meeting minutes"
            meta={
              meetingLoading
                ? "loading…"
                : `${projectMeeting.length} MoM record${projectMeeting.length === 1 ? "" : "s"}`
            }
            action={
              <Button
                size="sm"
                className="h-8 rounded-md bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => setShowMeetingForm((v) => !v)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {showMeetingForm ? "Cancel" : "Add MoM"}
              </Button>
            }
          >
            {showMeetingForm && (
              <div className="space-y-2 border-b border-border p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Plaud file id or share URL"
                    value={meetingImportRef}
                    onChange={(e) => setMeetingImportRef(e.target.value)}
                    className="h-9"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0"
                    disabled={isImporting || !meetingImportRef.trim()}
                    onClick={async () => {
                      const ref = meetingImportRef.trim();
                      const isFile = /^[a-f0-9]{24,64}$/i.test(ref);
                      try {
                        const result = await importPlaudMeeting({
                          projectId: project.project_id,
                          fileId: isFile ? ref : undefined,
                          shareUrl: isFile ? undefined : ref,
                        });
                        setMeetingImportRef("");
                        setShowMeetingForm(false);
                        if (result.meeting?.meetingId) {
                          setProposal(await proposeTask(result.meeting.meetingId));
                        }
                      } catch {
                        /* toast from hook */
                      }
                    }}
                  >
                    {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                  </Button>
                </div>
                <Input
                  placeholder="Title"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="h-9"
                />
                <Input
                  type="datetime-local"
                  value={meetingRecordedAt}
                  onChange={(e) => setMeetingRecordedAt(e.target.value)}
                  className="h-9"
                />
                <Textarea
                  placeholder="Paste transcript / MoM notes…"
                  value={meetingTranscript}
                  onChange={(e) => setMeetingTranscript(e.target.value)}
                  className="min-h-[120px] text-sm"
                />
                <Input
                  placeholder="Plaud share key (optional)"
                  value={meetingPlaudKey}
                  onChange={(e) => setMeetingPlaudKey(e.target.value)}
                  className="h-9"
                />
                <Button
                  size="sm"
                  className="h-8 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={
                    isSavingMeeting ||
                    !meetingTitle.trim() ||
                    !meetingRecordedAt ||
                    !meetingTranscript.trim()
                  }
                  onClick={async () => {
                    try {
                      await createMeeting({
                        projectId: project.project_id,
                        title: meetingTitle.trim(),
                        recordedAt: new Date(meetingRecordedAt).toISOString(),
                        transcript: meetingTranscript.trim(),
                        plaudShareKey: meetingPlaudKey.trim() || null,
                      });
                      setMeetingTitle("");
                      setMeetingRecordedAt("");
                      setMeetingTranscript("");
                      setMeetingPlaudKey("");
                      setShowMeetingForm(false);
                    } catch {
                      // toast from hook
                    }
                  }}
                >
                  {isSavingMeeting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save MoM
                </Button>
              </div>
            )}
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
                        onClick={() =>
                          setExpandedMeetingId(isOpen ? null : m.meetingId)
                        }
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

        {/* ── Finance (real) ── */}
        <TabsContent value="finance" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg border border-border overflow-hidden">
            <Stat label="Total value" value={formatCurrency(project.total_value_cents)} />
            <Stat label="Collected" value={formatCurrency(project.amount_paid_cents)} />
            <Stat label="Outstanding" value={formatCurrency(outstanding)} />
          </div>

          <Panel title="Invoices" meta={projInvoices.length > 0 ? `${projInvoices.length} total` : undefined}>
            {projInvoices.length === 0 ? (
              <Empty text="No invoices for this project yet. Create them in the Finance section." />
            ) : (
              <div className="divide-y divide-border">
                {projInvoices.map((inv) => (
                  <div key={inv.invoice_id} className="flex items-center justify-between gap-4 px-4 h-11">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{inv.label}</p>
                      {inv.due_date && (
                        <p className="text-xs text-muted-foreground">
                          due {new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(inv.amount_cents)}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
                        <Dot className={invoiceStatusDot[inv.status] || "bg-muted-foreground"} />
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
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
    <p className={`text-2xl font-semibold tracking-tight tabular-nums truncate ${accent ? "text-accent" : ""}`}>
      {value}
    </p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
  </div>
);

export default ProjectCommandCenter;
