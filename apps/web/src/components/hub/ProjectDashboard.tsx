import { useState, useEffect, useRef } from "react";
import {
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  Loader2,
  FileEdit,
  FileText,
  Upload,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Receipt,
  Send,
  Mic,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useRequestPreview } from "@/hooks/usePreviewLink";
import { useProjectAssets } from "@/hooks/useProjectAssets";
import { useMeeting } from "@/hooks/useMeeting";
import { useChangeOrder } from "@/hooks/useChangeOrder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusStepper from "./StatusStepper";
import FundingBar from "./FundingBar";
import SignoffCard from "./SignoffCard";
import { Panel, Empty, Dot } from "@/components/admin/_ui";
import { formatManilaDate, isPastDue } from "@/lib/manila-time";
import { useGitHub } from "@/hooks/useGitHub";
import { cloudflare, DeploymentStatus } from "@/lib/cloudflare";
import { formatDistanceToNow } from "date-fns";
import type {
  ClientProject,
  Deliverable,
  DeliverableStatus,
  ClientInvoice,
  ClientInvoiceStatus,
} from "@/hooks/useClientData";

interface ProjectDashboardProps {
  project: ClientProject;
}

// Combined feed item type
interface FeedItem {
  id: string;
  type: "commit" | "update";
  title: string;
  body?: string;
  author: string;
  avatar_url?: string;
  date: string;
  sha?: string;
  html_url?: string;
}

const statusConfig: Record<
  DeliverableStatus,
  { label: string; dot: string; icon: React.ElementType; iconColor: string }
> = {
  todo: {
    label: "To do",
    dot: "bg-muted-foreground",
    icon: Circle,
    iconColor: "text-muted-foreground",
  },
  ongoing: {
    label: "Ongoing",
    dot: "bg-blue-500",
    icon: Clock,
    iconColor: "text-blue-400",
  },
  review: {
    label: "For Review",
    dot: "bg-purple-500",
    icon: AlertCircle,
    iconColor: "text-purple-400",
  },
  finished: {
    label: "Finished",
    dot: "bg-green-500",
    icon: CheckCircle2,
    iconColor: "text-green-400",
  },
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const ProjectDashboard = ({ project }: ProjectDashboardProps) => {
  const {
    commits,
    techStack,
    branches,
    currentBranch,
    openPRs,
    isLoading,
    refetch,
    setBranch,
  } = useGitHub(project.repository_name || null);

  const { requestPreview, isRequesting } = useRequestPreview();
  const {
    assets: projectAsset,
    uploadFile,
    isUploading,
    isLoading: isAssetLoading,
  } = useProjectAssets(project.project_id);
  const {
    meeting: projectMeeting,
    isLoading: isMeetingLoading,
  } = useMeeting(project.project_id);
  const {
    changeOrder: projectChangeOrder,
    isLoading: isChangeOrderLoading,
    fileChangeOrder,
    isFiling,
  } = useChangeOrder(project.project_id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);
  const [scope, setScope] = useState("");
  const [reason, setReason] = useState("");

  // Safe defaults for optional nested arrays
  const deliverables = project.deliverables || [];
  const invoices = project.invoices || [];
  const assets = project.assets || [];
  const contacts = project.contacts || [];
  const updates = project.updates || [];
  // Client materials = document assets from the project drive query
  const material = projectAsset.filter((a) => a.asset_type === "document");

  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);

  // Fetch Cloudflare Pages deployment status
  useEffect(() => {
    const fetchDeployment = async () => {
      if (project.preview_url) {
        const projectName = cloudflare.extractProjectName(project.preview_url);
        if (projectName) {
          const dep = await cloudflare.getLatestDeployment(projectName);
          setDeployment(dep);
        }
      }
    };
    fetchDeployment();
  }, [project.preview_url]);

  // Use GitHub-detected tech stack if available, fallback to DB
  const safeTechStack = techStack || [];
  const safeCommits = commits || [];
  const safeBranches = branches || [];
  const safeOpenPRs = openPRs || 0;
  const displayTechStack =
    safeTechStack.length > 0 ? safeTechStack.map((t) => t.name) : (project.tech_stack || []);

  // Merge GitHub commits and DB progress updates into a single feed
  const buildFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];

    // Add GitHub commits
    safeCommits.forEach((commit) => {
      items.push({
        id: `commit-${commit.sha}`,
        type: "commit",
        title: commit.message,
        author: commit.author.name,
        avatar_url: commit.author.avatar_url,
        date: commit.author.date,
        sha: commit.sha,
        html_url: commit.html_url,
      });
    });

    // Add DB progress updates (manual updates from admin)
    (project.updates || []).forEach((update) => {
      items.push({
        id: `update-${update.progress_update_id}`,
        type: "update",
        title: update.update_title,
        body: update.update_body,
        author: "ADVO Team",
        date: update.created_at,
        sha: update.commit_sha_reference,
      });
    });

    // Sort by date descending
    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return items.slice(0, 10);
  };

  const feed = buildFeed();

  // Deliverable stats
  const totalDeliverables = deliverables.length;
  const completedDeliverables = deliverables.filter(
    (d) => d.status === "finished"
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{project.title}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}

          {/* Tech Stack - Auto-detected from GitHub */}
          {displayTechStack.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {displayTechStack.map((tech) => (
                <span
                  key={tech}
                  className="px-2 py-0.5 rounded-md border border-border text-xs text-muted-foreground"
                >
                  {tech}
                </span>
              ))}
              {safeTechStack.length > 0 && (
                <span className="text-xs text-muted-foreground/70">Auto-detected</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {project.repository_name && (
            <a
              href={`https://github.com/advo-ph/${project.repository_name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {project.repository_name}
            </a>
          )}
          {safeOpenPRs > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">
              <GitPullRequest className="h-3 w-3" />
              {safeOpenPRs} open PR{safeOpenPRs > 1 ? "s" : ""}
            </span>
          )}
          {project.preview_url && (
            <a
              href={project.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            >
              {deployment && (
                <span>{cloudflare.getStatusBadge(deployment.state).icon}</span>
              )}
              Live preview
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => requestPreview(project.project_id)}
            disabled={isRequesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {isRequesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Request a preview
          </button>
        </div>
      </div>

      {/* Status Stepper */}
      <Panel title="Project status">
        <div className="p-4">
          <StatusStepper
            currentStatus={
              project.project_status as
                | "discovery"
                | "architecture"
                | "development"
                | "testing"
                | "shipped"
            }
          />
        </div>
      </Panel>

      {/* Live preview — sandboxed iframe when preview_url is set */}
      {project.preview_url && (
        <Panel
          title="Live preview"
          meta={
            deployment
              ? `${cloudflare.getStatusBadge(deployment.state).icon} ${cloudflare.getStatusBadge(deployment.state).label}`
              : undefined
          }
          action={
            <a
              href={project.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Open in new tab
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          }
        >
          <div className="relative w-full aspect-[16/10] bg-secondary/30 overflow-hidden rounded-b-lg">
            <iframe
              src={project.preview_url}
              title={`${project.title} live preview`}
              className="absolute inset-0 h-full w-full border-0 bg-background"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        </Panel>
      )}

      {/* Grid: Funding + Deliverables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FundingBar
          totalCents={project.total_value_cents}
          paidCents={project.amount_paid_cents}
        />

        {/* Deliverables Tracker */}
        <Panel
          title="Deliverables"
          meta={totalDeliverables > 0 ? `${completedDeliverables}/${totalDeliverables} done` : undefined}
        >
          {totalDeliverables === 0 ? (
            <Empty text="No deliverables yet" />
          ) : (
            <div>
              {/* Progress bar */}
              <div className="px-4 pt-4">
                <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{
                      width: `${
                        totalDeliverables > 0
                          ? (completedDeliverables / totalDeliverables) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Deliverable list */}
              <div className="mt-3 divide-y divide-border max-h-64 overflow-y-auto">
                {deliverables.map((d) => {
                  const cfg = statusConfig[d.status];
                  const StatusIcon = cfg.icon;
                  // This is the CLIENT's view of ADVO's work. Comparing instants marked
                  // a deliverable overdue at 08:00 on the morning it was due, so clients
                  // saw "Overdue" against work that still had the whole day to run. The
                  // comparison is on Manila calendar dates, and the date is rendered in
                  // Manila too, so a client abroad sees ADVO's dates and not their own.
                  const overdue = isPastDue(d.due_date) && d.status !== "finished";

                  return (
                    <div
                      key={d.deliverable_id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <StatusIcon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            d.status === "finished"
                              ? "line-through text-muted-foreground"
                              : ""
                          }`}
                        >
                          {d.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {d.team_member && (
                            <div className="flex items-center gap-1">
                              <Avatar className="h-4 w-4">
                                <AvatarImage
                                  src={d.team_member.avatar_url || undefined}
                                />
                                <AvatarFallback className="text-[8px]">
                                  {getInitials(d.team_member.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">
                                {d.team_member.name}
                              </span>
                            </div>
                          )}
                          {d.due_date && (
                            <span
                              className={`text-xs ${
                                overdue ? "text-red-400" : "text-muted-foreground"
                              }`}
                            >
                              {overdue ? "Overdue · " : ""}
                              {formatManilaDate(d.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <Dot className={cfg.dot} />
                        <span className="text-xs text-muted-foreground">{cfg.label}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Project Sign-off — the CLIENT-FACING final-delivery document.
          Never deliverable.verified_at, which is internal team QA. */}
      <SignoffCard projectId={project.project_id} />

      {/* Invoices */}
      {invoices.length > 0 && (
        <Panel
          title="Invoices"
          meta={`${invoices.filter((i) => i.status === "paid").length}/${invoices.length} paid`}
        >
          <div className="divide-y divide-border">
            {invoices.map((inv) => {
              const isPaid = inv.status === "paid";
              const isOverdue = inv.status === "overdue";
              const statusColor = isPaid
                ? "bg-green-500"
                : isOverdue
                ? "bg-red-500"
                : "bg-yellow-500";
              return (
                <div
                  key={inv.invoice_id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Receipt
                      className={`h-4 w-4 shrink-0 ${
                        isPaid
                          ? "text-green-400"
                          : isOverdue
                          ? "text-red-400"
                          : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-sm truncate ${
                        isPaid ? "text-muted-foreground" : ""
                      }`}
                    >
                      {inv.label}
                    </span>
                    {inv.due_date && (
                      <span
                        className={`text-xs shrink-0 ${
                          isOverdue ? "text-red-400" : "text-muted-foreground"
                        }`}
                      >
                        Due{" "}
                        {new Date(inv.due_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium tabular-nums">
                      ₱{(inv.amount_cents / 100).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1.5 w-20 justify-end">
                      <Dot className={statusColor} />
                      <span className="text-xs text-muted-foreground">
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Contract */}
      <Panel title="Contract">
        <div className="p-4">
          {project.contract_url ? (
            <a
              href={project.contract_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            >
              <FileEdit className="h-3.5 w-3.5" />
              View contract
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              Contract pending
            </div>
          )}
        </div>
      </Panel>

      {/* Change order — CONTRACTS.md policy 3. Client files; team lists via GET. */}
      <Panel
        title="Change order"
        meta={
          projectChangeOrder.length > 0
            ? `${projectChangeOrder.length} filed`
            : undefined
        }
      >
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            New scope (a new page, feature, or something you saw on another site)
            needs a written change order. Revisions to existing work stay on the
            included rounds. The team will reply with price and timeline; work
            does not start until you confirm.
          </p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const nextScope = scope.trim();
              const nextReason = reason.trim();
              if (!nextScope || !nextReason) return;
              await fileChangeOrder({
                projectId: project.project_id,
                scope: nextScope,
                reason: nextReason,
              });
              setScope("");
              setReason("");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="change-order-scope" className="text-xs">
                Scope
              </Label>
              <Textarea
                id="change-order-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="What is new: page, feature, or behavior not in the original spec."
                rows={3}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="change-order-reason" className="text-xs">
                Reason
              </Label>
              <Textarea
                id="change-order-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why you want it. Example: saw it on another site."
                rows={3}
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={isFiling || !scope.trim() || !reason.trim()}
              className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isFiling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileEdit className="mr-2 h-4 w-4" />
              )}
              File change order
            </Button>
          </form>
          {isChangeOrderLoading && projectChangeOrder.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading change orders…
            </div>
          ) : projectChangeOrder.length === 0 ? (
            <Empty text="No change orders filed yet." />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {projectChangeOrder.map((row) => (
                <li key={row.changeOrderId} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium capitalize text-muted-foreground">
                      {row.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(row.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm">{row.scope}</p>
                  <p className="text-xs text-muted-foreground">{row.reason}</p>
                  {row.priceCents != null && (
                    <p className="text-xs tabular-nums">
                      ₱{(row.priceCents / 100).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                      {row.timelineNote ? ` · ${row.timelineNote}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* Client materials — upload documents for the project */}
      <Panel
        title="Your materials"
        meta={material.length > 0 ? `${material.length} file${material.length === 1 ? "" : "s"}` : undefined}
        action={
          <Button
            size="sm"
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
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
            if (f) void uploadFile(f, undefined, "document");
            e.target.value = "";
          }}
        />
        <div className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Share brand assets, briefs, contracts, and other materials with the ADVO team (≤25 MB).
          </p>
          {isAssetLoading && material.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading files…
            </div>
          ) : material.length === 0 ? (
            <Empty text="No materials yet. Upload a file to share with your team." icon={FileText} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {material.map((a) => (
                <li key={a.asset_id} className="flex items-center gap-3 px-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium hover:text-accent"
                    >
                      {a.caption || a.url.split("/").pop() || "Document"}
                    </a>
                    {a.uploaded_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(a.uploaded_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* Meeting MoM — expandable transcripts for this project */}
      <Panel
        title="Meeting minutes"
        meta={
          isMeetingLoading
            ? "loading…"
            : projectMeeting.length > 0
              ? `${projectMeeting.length} MoM`
              : undefined
        }
      >
        <div className="p-4">
          {isMeetingLoading && projectMeeting.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading meetings…
            </div>
          ) : projectMeeting.length === 0 ? (
            <Empty text="No meeting minutes yet. Your ADVO team will share MoMs here." icon={Mic} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {projectMeeting.map((m) => {
                const isOpen = expandedMeetingId === m.meetingId;
                const preview = (m.summary ?? m.transcript ?? "").replace(/\s+/g, " ").trim();
                return (
                  <li key={m.meetingId}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMeetingId(isOpen ? null : m.meetingId)
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                    >
                      <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(m.recordedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        {!isOpen && preview && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {preview}
                          </p>
                        )}
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-border bg-secondary/20 px-3 py-3">
                        {m.summary?.trim() && (
                          <div className="whitespace-pre-wrap text-sm text-foreground/90">
                            {m.summary}
                          </div>
                        )}
                        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-foreground/90">
                          {m.transcript}
                        </pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>

      {/* Progress Photos */}
      {assets.filter((a) => a.asset_type === "progress_photo").length > 0 && (
        <Panel title="Progress photos">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets
              .filter((a) => a.asset_type === "progress_photo")
              .map((asset) => (
                <a
                  key={asset.project_asset_id}
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block overflow-hidden rounded-md border border-border hover:border-accent/50 transition-colors"
                >
                  <div className="aspect-video bg-secondary/50 overflow-hidden">
                    <img
                      src={asset.url}
                      alt={asset.caption || "Progress photo"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-2">
                    {asset.caption && (
                      <p className="text-xs font-medium truncate">{asset.caption}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(asset.uploaded_at || "").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </a>
              ))}
          </div>
        </Panel>
      )}

      {/* Contact — Assigned Team Members */}
      {contacts.length > 0 && (
        <Panel title="Your team">
          <div className="divide-y divide-border">
            {contacts.map((contact) => (
              <div
                key={contact.team_member_id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={contact.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {contact.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{contact.role}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Email
                    </a>
                  )}
                  {contact.linkedin_url && (
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Engineering Feed */}
      <Panel
        title="Engineering feed"
        action={
          <div className="flex items-center gap-2">
            {/* Branch Selector */}
            {safeBranches.length > 0 && (
              <Select value={currentBranch} onValueChange={setBranch}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <GitBranch className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {safeBranches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name} className="text-xs">
                      {branch.name}
                      {branch.protected && (
                        <span className="ml-2 text-muted-foreground">🔒</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {project.repository_name && (
              <Button
                variant="ghost"
                size="sm"
                onClick={refetch}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : feed.length > 0 ? (
          <div className="divide-y divide-border">
            {feed.slice(0, 5).map((item) => (
              <div key={item.id} className="flex gap-3 px-4 py-3 group">
                <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0 bg-secondary">
                  {item.type === "commit" && item.avatar_url ? (
                    <img
                      src={item.avatar_url}
                      alt={item.author}
                      className="w-full h-full object-cover"
                    />
                  ) : item.type === "update" ? (
                    <FileEdit className="h-3 w-3 text-accent" />
                  ) : (
                    <GitCommit className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {item.sha && (
                      <span className="text-xs text-accent tabular-nums bg-accent/10 px-1.5 py-0.5 rounded">
                        {item.sha}
                      </span>
                    )}
                    {item.type === "update" && (
                      <span className="text-xs text-accent">Update</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.date), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {item.html_url ? (
                    <a
                      href={item.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm hover:text-accent transition-colors"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span className="font-medium text-sm">{item.title}</span>
                  )}
                  {item.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {item.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">by {item.author}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No updates yet" />
        )}

        {(safeCommits.length > 0 || deployment) && (
          <div className="px-4 h-9 border-t border-border flex items-center gap-3">
            {safeCommits.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                <GitCommit className="h-3 w-3" />
                Live from GitHub
              </span>
            )}
            {deployment && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {cloudflare.getStatusBadge(deployment.state).icon} CF:{" "}
                {cloudflare.getStatusBadge(deployment.state).label}
              </span>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default ProjectDashboard;
