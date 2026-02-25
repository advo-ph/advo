import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  Loader2,
  FileEdit,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  { label: string; color: string; icon: React.ElementType }
> = {
  not_started: {
    label: "Not Started",
    color: "bg-secondary text-muted-foreground",
    icon: Circle,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-500/10 text-blue-500",
    icon: Clock,
  },
  review: {
    label: "In Review",
    color: "bg-purple-500/10 text-purple-500",
    icon: AlertCircle,
  },
  completed: {
    label: "Completed",
    color: "bg-green-500/10 text-green-500",
    icon: CheckCircle2,
  },
  blocked: {
    label: "Blocked",
    color: "bg-red-500/10 text-red-500",
    icon: AlertCircle,
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
  const displayTechStack =
    techStack.length > 0 ? techStack.map((t) => t.name) : project.tech_stack;

  // Merge GitHub commits and DB progress updates into a single feed
  const buildFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];

    // Add GitHub commits
    commits.forEach((commit) => {
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
    project.progress_update.forEach((update) => {
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
  const totalDeliverables = project.deliverables.length;
  const completedDeliverables = project.deliverables.filter(
    (d) => d.status === "completed"
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {project.title}
          </h1>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}

          {/* Tech Stack - Auto-detected from GitHub */}
          {displayTechStack.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {displayTechStack.map((tech) => (
                <Badge key={tech} variant="outline" className="font-mono text-xs">
                  {tech}
                </Badge>
              ))}
              {techStack.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs text-green-500 border-green-500/30"
                >
                  Auto-detected
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {project.repository_name && (
            <Button
              variant="outline"
              size="sm"
              className="font-mono"
              asChild
            >
              <a
                href={`https://github.com/advo-ph/${project.repository_name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitBranch className="h-4 w-4 mr-2" />
                {project.repository_name}
              </a>
            </Button>
          )}
          {openPRs > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <GitPullRequest className="h-3 w-3" />
              {openPRs} open PR{openPRs > 1 ? "s" : ""}
            </Badge>
          )}
          {project.preview_url && (
            <Button size="sm" asChild>
              <a
                href={project.preview_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {deployment && (
                  <span className="mr-2">
                    {cloudflare.getStatusBadge(deployment.state).icon}
                  </span>
                )}
                Live Preview
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Status Stepper */}
      <div className="p-6 bg-card border border-border rounded-xl shadow-card">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">
          Project Status
        </span>
        <StatusStepper currentStatus={project.project_status} />
      </div>

      {/* Grid: Funding + Deliverables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FundingBar
          totalCents={project.total_value_cents}
          paidCents={project.amount_paid_cents}
        />

        {/* Deliverables Tracker */}
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Deliverables
            </span>
            {totalDeliverables > 0 && (
              <Badge variant="outline" className="text-xs">
                {completedDeliverables}/{totalDeliverables} done
              </Badge>
            )}
          </div>

          {totalDeliverables === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deliverables yet
            </p>
          ) : (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
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

              {/* Deliverable list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {project.deliverables.map((d) => {
                  const cfg = statusConfig[d.status];
                  const StatusIcon = cfg.icon;
                  const isPastDue =
                    d.due_date &&
                    new Date(d.due_date) < new Date() &&
                    d.status !== "completed";

                  return (
                    <div
                      key={d.deliverable_id}
                      className="flex items-center gap-3 py-2"
                    >
                      <StatusIcon
                        className={`h-4 w-4 flex-shrink-0 ${
                          d.status === "completed"
                            ? "text-green-500"
                            : d.status === "blocked"
                            ? "text-red-500"
                            : d.status === "in_progress"
                            ? "text-blue-500"
                            : "text-muted-foreground"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            d.status === "completed"
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
                                isPastDue
                                  ? "text-red-500"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {isPastDue ? "Overdue · " : ""}
                              {new Date(d.due_date).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" }
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoices */}
      {project.invoices.length > 0 && (
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Invoices
            </span>
            <Badge variant="outline" className="text-xs">
              {project.invoices.filter((i) => i.status === "paid").length}/
              {project.invoices.length} paid
            </Badge>
          </div>
          <div className="space-y-2">
            {project.invoices.map((inv) => {
              const isPaid = inv.status === "paid";
              const isOverdue = inv.status === "overdue";
              return (
                <div
                  key={inv.invoice_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-3">
                    <Receipt
                      className={`h-4 w-4 ${
                        isPaid
                          ? "text-green-500"
                          : isOverdue
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`}
                    />
                    <span className={`text-sm font-medium ${
                      isPaid ? "text-muted-foreground" : ""
                    }`}>
                      {inv.label}
                    </span>
                    {inv.due_date && (
                      <span className={`text-xs ${
                        isOverdue ? "text-red-500" : "text-muted-foreground"
                      }`}>
                        Due:{" "}
                        {new Date(inv.due_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-medium">
                      ₱{(inv.amount_cents / 100).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        isPaid
                          ? "bg-green-500/10 text-green-500 border-green-500/30"
                          : isOverdue
                          ? "bg-red-500/10 text-red-500 border-red-500/30"
                          : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                      }`}
                    >
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contract */}
      <div className="p-6 bg-card border border-border rounded-xl shadow-card">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">
          Contract
        </span>
        {project.contract_url ? (
          <a
            href={project.contract_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            <FileEdit className="h-4 w-4" />
            View Contract
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            Contract pending
          </div>
        )}
      </div>

      {/* Progress Photos */}
      {project.assets.filter((a) => a.asset_type === "progress_photo").length > 0 && (
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">
            Progress Photos
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {project.assets
              .filter((a) => a.asset_type === "progress_photo")
              .map((asset) => (
                <a
                  key={asset.project_asset_id}
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block overflow-hidden rounded-lg border border-border hover:border-accent/50 transition-colors"
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
                      {new Date(asset.uploaded_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Contact — Assigned Team Members */}
      {project.contacts.length > 0 && (
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">
            Your Team
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.contacts.map((contact) => (
              <div
                key={contact.team_member_id}
                className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg"
              >
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={contact.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-accent">
                      {contact.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.role}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-[10px] text-accent hover:underline"
                      >
                        {contact.email}
                      </a>
                    )}
                    {contact.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-accent hover:underline"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engineering Feed */}
      <div className="p-6 bg-card border border-border rounded-xl shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Engineering Feed
            </span>

            {/* Branch Selector */}
            {branches.length > 0 && (
              <Select value={currentBranch} onValueChange={setBranch}>
                <SelectTrigger className="w-[140px] h-8 text-xs font-mono">
                  <GitBranch className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem
                      key={branch.name}
                      value={branch.name}
                      className="font-mono text-xs"
                    >
                      {branch.name}
                      {branch.protected && (
                        <span className="ml-2 text-muted-foreground">🔒</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

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

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feed.length > 0 ? (
            feed.slice(0, 5).map((item) => (
              <div key={item.id} className="flex gap-3 group">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
                      item.type === "update" ? "bg-accent/20" : "bg-secondary"
                    }`}
                  >
                    {item.type === "commit" && item.avatar_url ? (
                      <img
                        src={item.avatar_url}
                        alt={item.author}
                        className="w-full h-full object-cover"
                      />
                    ) : item.type === "update" ? (
                      <FileEdit className="h-4 w-4 text-accent" />
                    ) : (
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="w-px flex-1 bg-border mt-2" />
                </div>
                <div className="pb-4 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {item.sha && (
                      <code className="text-xs text-accent font-mono bg-accent/10 px-1.5 py-0.5 rounded">
                        {item.sha}
                      </code>
                    )}
                    {item.type === "update" && (
                      <Badge
                        variant="outline"
                        className="text-xs text-accent border-accent/30"
                      >
                        Update
                      </Badge>
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
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    by {item.author}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No updates yet
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
          {commits.length > 0 && (
            <Badge
              variant="outline"
              className="text-xs text-green-500 border-green-500/30"
            >
              <GitCommit className="h-3 w-3 mr-1" />
              Live from GitHub
            </Badge>
          )}
          {deployment && (
            <Badge
              variant="outline"
              className={`text-xs ${
                cloudflare.getStatusBadge(deployment.state).color
              }`}
            >
              {cloudflare.getStatusBadge(deployment.state).icon} CF:{" "}
              {cloudflare.getStatusBadge(deployment.state).label}
            </Badge>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectDashboard;
