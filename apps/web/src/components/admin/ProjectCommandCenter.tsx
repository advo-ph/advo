import { useState, useRef } from "react";
import { motion } from "framer-motion";
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
  Eye,
  Sparkles,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Upload,
  Copy,
  Check,
  Send,
  Trash2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

interface ProjectCommandCenterProps {
  project: MergedProject;
  onBack: () => void;
}

const deliverableStatus: Record<DeliverableStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "Not Started", color: "bg-secondary text-muted-foreground", icon: Circle },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  review: { label: "In Review", color: "bg-purple-500/10 text-purple-500", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-500", icon: CheckCircle2 },
  blocked: { label: "Blocked", color: "bg-red-500/10 text-red-500", icon: AlertCircle },
};

const invoiceStatusColor: Record<string, string> = {
  paid: "bg-green-500/10 text-green-500",
  unpaid: "bg-secondary text-muted-foreground",
  overdue: "bg-red-500/10 text-red-500",
};

const verdictConfig: Record<string, { label: string; color: string }> = {
  good_to_go: { label: "Good to go", color: "bg-green-500/10 text-green-500" },
  needs_work: { label: "Needs work", color: "bg-amber-500/10 text-amber-500" },
  high_risk: { label: "High risk", color: "bg-red-500/10 text-red-500" },
};

const severityConfig: Record<FlagSeverity, { color: string; icon: React.ElementType }> = {
  green: { color: "text-green-500", icon: CheckCircle2 },
  amber: { color: "text-amber-500", icon: AlertTriangle },
  red: { color: "text-red-500", icon: XCircle },
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
    {children}
  </p>
);

const ProjectCommandCenter = ({ project, onBack }: ProjectCommandCenterProps) => {
  const { deliverables } = useAdminDeliverables();
  const { invoices } = useInvoices();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Projects
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{project.title}</h1>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${
                  project.project_status === "shipped" ? "border-accent/30 text-accent" : ""
                }`}
              >
                {project.project_status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {project.client?.company_name || project.client?.contact_email || "No client"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                <span className="text-accent">{formatCurrency(project.amount_paid_cents)}</span>
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
                  className="flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Live preview
                </a>
              )}
            </div>
          </div>

          {/* Flagship action — jumps to the Dev & Deploy panel */}
          <Button
            onClick={() => setTab("dev")}
            className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Eye className="mr-2 h-4 w-4" /> Show Client Now
          </Button>
        </div>
      </div>

      {/* Panels */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-secondary/50">
          <TabsTrigger value="overview"><LayoutDashboard className="mr-1.5 h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="deliverables"><ListChecks className="mr-1.5 h-4 w-4" /> Deliverables</TabsTrigger>
          <TabsTrigger value="files"><FolderOpen className="mr-1.5 h-4 w-4" /> Files</TabsTrigger>
          <TabsTrigger value="dev"><GitCommitHorizontal className="mr-1.5 h-4 w-4" /> Dev &amp; Deploy</TabsTrigger>
          <TabsTrigger value="contracts"><FileText className="mr-1.5 h-4 w-4" /> Contracts</TabsTrigger>
          <TabsTrigger value="finance"><Banknote className="mr-1.5 h-4 w-4" /> Finance</TabsTrigger>
        </TabsList>

        {/* ── Overview (real) ── */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "Paid", value: `${paidPct}%`, sub: formatCurrency(project.amount_paid_cents) },
              { label: "Outstanding", value: formatCurrency(outstanding), sub: `${projInvoices.length} invoices` },
              { label: "Open deliverables", value: String(openDeliverables), sub: `${projDeliverables.length} total` },
              { label: "Stage", value: project.project_status, sub: "pipeline" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 truncate text-xl font-semibold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>Payment progress</SectionLabel>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(paidPct, 100)}%` }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-full bg-accent"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatCurrency(project.amount_paid_cents)} of {formatCurrency(project.total_value_cents)} collected
            </p>
          </div>

          {project.description && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel>Brief</SectionLabel>
              <p className="text-sm text-foreground/90">{project.description}</p>
            </div>
          )}

          {project.tech_stack.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel>Tech stack</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {project.tech_stack.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Deliverables (real) ── */}
        <TabsContent value="deliverables" className="space-y-3 pt-4">
          {projDeliverables.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No deliverables on this project yet. Add them from the Deliverables section.
            </div>
          ) : (
            projDeliverables.map((d) => {
              const s = deliverableStatus[d.status];
              const Icon = s.icon;
              return (
                <div key={d.deliverable_id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.assignee?.name || "Unassigned"}
                      {d.due_date && ` · due ${new Date(d.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </p>
                  </div>
                  <Badge className={`${s.color} shrink-0 gap-1`}>
                    <Icon className="h-3 w-3" /> {s.label}
                  </Badge>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ── Files (Project Drive) ── */}
        <TabsContent value="files" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <SectionLabel>Project Drive</SectionLabel>
              <p className="text-sm text-muted-foreground">
                Designs, documents, and deliverable assets — one place per project. Images, PDFs, video (≤25 MB).
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 rounded-full"
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
          </div>

          {assets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
              <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No files yet. Upload designs, documents, or deliverable assets.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((a) => (
                <div key={a.asset_id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                    {isImageAsset(a) ? (
                      <img src={a.url} alt={a.caption || "asset"} className="h-32 w-full object-cover" />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center bg-secondary/40">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                  </a>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.caption || a.url.split("/").pop()}</p>
                      {a.uploaded_at && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label="Open file"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => deleteAsset(a.asset_id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
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
        </TabsContent>

        {/* ── Dev & Deploy (partial real + scaffold) ── */}
        <TabsContent value="dev" className="space-y-4 pt-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>Repository</SectionLabel>
            {project.repository_name ? (
              <div className="space-y-2 text-sm">
                <a
                  href={`https://github.com/advo-ph/${project.repository_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-accent hover:underline"
                >
                  <GitBranch className="h-4 w-4" /> advo-ph/{project.repository_name}
                </a>
                {latestCommit ? (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <GitCommitHorizontal className="h-4 w-4" />
                    <span className="font-mono text-xs">{latestCommit.sha.slice(0, 7)}</span>
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

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <SectionLabel>Show Client Now</SectionLabel>
              <p className="text-sm text-muted-foreground">
                Generate a private, expiring link to this project's live preview — instant to share, auto-expires
                (~20 min). Host-agnostic: it points at whatever preview URL is set (Vercel / Cloudflare / here.now / VPS).
              </p>
            </div>

            {!project.preview_url ? (
              <p className="text-sm text-muted-foreground">
                Set a <span className="font-medium">Preview URL</span> on the project (Edit) to enable this.
              </p>
            ) : (
              <>
                <Button onClick={() => generateLink()} disabled={isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  Generate preview link
                </Button>
                {previewError && <p className="text-sm text-destructive">{previewError}</p>}
                {previewLink && (
                  <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-xs text-accent">{previewLink.url}</code>
                      <Button size="sm" variant="outline" onClick={copyPreview} aria-label="Copy link">
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
                <SectionLabel>Client requests</SectionLabel>
                <ul className="space-y-1">
                  {previewRequests.slice(0, 3).map((r) => (
                    <li key={r.activityId} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Send className="h-3.5 w-3.5 text-accent" />
                      Client requested a preview ·{" "}
                      {new Date(r.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Contracts (partial real + scaffold) ── */}
        <TabsContent value="contracts" className="space-y-4 pt-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>Agreement</SectionLabel>
            {project.contract_url ? (
              <a
                href={project.contract_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <FileText className="h-4 w-4" /> Open contract
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No contract linked yet.</p>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div>
              <SectionLabel>Red-flag review</SectionLabel>
              <p className="text-sm text-muted-foreground">
                Paste the contract or SOW text to check it against ADVO's policy — downpayment floor, revision cap,
                change orders, late payment, termination. Catches the exact gaps that leaked revenue on past projects.
              </p>
            </div>

            <Textarea
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
              placeholder="Paste the contract / SOW text here…"
              rows={6}
              className="font-mono text-xs"
            />

            <div className="flex items-center gap-2">
              <Button
                onClick={() => review(contractText)}
                disabled={isReviewing || contractText.trim().length < 20}
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
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={`${verdictConfig[contractReview.verdict]?.color} text-sm`}>
                    {verdictConfig[contractReview.verdict]?.label}
                  </Badge>
                  <p className="flex-1 text-sm text-muted-foreground">{contractReview.summary}</p>
                </div>

                <div className="space-y-2">
                  {contractReview.flags.map((f) => {
                    const sev = severityConfig[f.severity];
                    const SevIcon = sev.icon;
                    return (
                      <div
                        key={f.policy}
                        className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3"
                      >
                        <SevIcon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.color}`} />
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
        </TabsContent>

        {/* ── Finance (real) ── */}
        <TabsContent value="finance" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Total value", value: formatCurrency(project.total_value_cents) },
              { label: "Collected", value: formatCurrency(project.amount_paid_cents) },
              { label: "Outstanding", value: formatCurrency(outstanding) },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-xl font-semibold">{k.value}</p>
              </div>
            ))}
          </div>

          <div>
            <SectionLabel>Invoices</SectionLabel>
            {projInvoices.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No invoices for this project yet. Create them in the Finance section.
              </div>
            ) : (
              <div className="space-y-2">
                {projInvoices.map((inv) => (
                  <div key={inv.invoice_id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{inv.label}</p>
                      {inv.due_date && (
                        <p className="text-xs text-muted-foreground">
                          due {new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium">{formatCurrency(inv.amount_cents)}</span>
                      <Badge className={`${invoiceStatusColor[inv.status] || ""} capitalize`}>{inv.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProjectCommandCenter;
