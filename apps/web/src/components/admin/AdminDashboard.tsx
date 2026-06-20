import { Link } from "react-router-dom";
import { Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import type {
  RecentActivity,
  UpcomingDeadline,
  Project,
  Client,
  Lead,
} from "@/types/admin";

interface AdminDashboardProps {
  projects: Project[];
  clients: Client[];
  leads: Lead[];
  formatCurrency: (cents: number) => string;
  recentActivity: RecentActivity[];
  upcomingDeadlines: UpcomingDeadline[];
  userName?: string;
  onNavigate?: (section: AdminSection) => void;
}

const STATUS_COLORS: Record<string, string> = {
  discovery: "hsl(210 80% 60%)",
  architecture: "hsl(260 70% 65%)",
  development: "hsl(30 85% 60%)",
  testing: "hsl(45 90% 60%)",
  shipped: "hsl(145 65% 50%)",
};

const STATUS_LABELS: Record<string, string> = {
  discovery: "Discovery",
  architecture: "Architecture",
  development: "Development",
  testing: "Testing",
  shipped: "Shipped",
};

const AdminDashboard = ({
  projects,
  clients,
  leads,
  formatCurrency,
  recentActivity,
  upcomingDeadlines,
  userName,
  onNavigate,
}: AdminDashboardProps) => {
  const activeProjects = projects.filter((p) => p.project_status !== "shipped");
  const shippedProjects = projects.filter((p) => p.project_status === "shipped");
  const totalPaid = projects.reduce((s, p) => s + p.amount_paid_cents, 0);
  const totalValue = projects.reduce((s, p) => s + p.total_value_cents, 0);
  const outstanding = totalValue - totalPaid;
  const collectionRate = totalValue > 0 ? Math.round((totalPaid / totalValue) * 100) : 0;

  const newLeads = leads.filter((l) => l.status === "new").length;
  const qualifiedLeads = leads.filter(
    (l) => l.status === "qualified" || l.status === "proposal_sent",
  ).length;
  const clientProjects = clients.reduce((s, c) => s + (c.projectCount || 0), 0);

  const pipelineByStatus = ["discovery", "architecture", "development", "testing", "shipped"].map(
    (s) => ({ status: s, count: projects.filter((p) => p.project_status === s).length }),
  );
  const maxCount = Math.max(1, ...pipelineByStatus.map((p) => p.count));

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const firstName = userName?.split("@")[0]?.split(".")[0] || "there";
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
          <span className="hidden sm:inline text-xs text-muted-foreground truncate">
            {displayName} · {today}
          </span>
        </div>
        <Button
          asChild
          size="sm"
          className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 shrink-0"
        >
          <Link to="/start">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      {/* Stat strip — one bordered row, hairline-separated cells */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg border border-border overflow-hidden">
        <Stat label="Active projects" value={String(activeProjects.length)} sub={`${shippedProjects.length} shipped`} />
        <Stat label="Collected" value={formatCurrency(totalPaid)} sub={`${collectionRate}% of ${formatCurrency(totalValue)}`} />
        <Stat label="Open leads" value={String(newLeads)} sub={`${qualifiedLeads} qualified`} />
        <Stat label="Clients" value={String(clients.length)} sub={`${clientProjects} projects`} />
      </div>

      {/* Pipeline + cash flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2" title="Pipeline" meta={`${projects.length} projects`}>
          <div className="p-4 space-y-2.5">
            {pipelineByStatus.map((stage) => (
              <div key={stage.status} className="flex items-center gap-3">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[stage.status] }}
                />
                <span className="text-sm w-24 shrink-0">{STATUS_LABELS[stage.status]}</span>
                <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(stage.count / maxCount) * 100}%`,
                      backgroundColor: STATUS_COLORS[stage.status],
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-5 text-right shrink-0 tabular-nums">
                  {stage.count}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Cash flow">
          <div className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Collected</span>
              <span className="text-sm font-semibold tracking-tight tabular-nums">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${collectionRate}%` }} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Outstanding</span>
              <span className="text-sm font-semibold tracking-tight tabular-nums">{formatCurrency(outstanding)}</span>
            </div>
            <div className="pt-3 mt-1 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Collection rate</span>
              <span className="text-sm font-semibold text-accent tabular-nums">{collectionRate}%</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Recent activity">
          {recentActivity.length === 0 ? (
            <Empty text="No recent activity" />
          ) : (
            <div className="divide-y divide-border">
              {recentActivity.slice(0, 6).map((a, i) => (
                <div key={i} className="px-4 py-2.5 flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{a.action}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.target} · {a.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Upcoming">
          {upcomingDeadlines.length === 0 ? (
            <Empty text="No upcoming deadlines" />
          ) : (
            <div className="divide-y divide-border">
              {upcomingDeadlines.slice(0, 6).map((d) => (
                <div key={d.deliverable_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.project_title}</p>
                  </div>
                  <span
                    className={`text-[11px] shrink-0 ${
                      d.is_urgent ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {d.due_date
                      ? new Date(d.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Latest leads" cta={{ label: "View all", onClick: () => onNavigate?.("leads") }}>
          {leads.length === 0 ? (
            <Empty text="No leads yet" />
          ) : (
            <div className="divide-y divide-border">
              {leads.slice(0, 6).map((l, i) => (
                <div key={l.lead_id || i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.company || l.project_type || "—"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(l.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

/* ───────────────────────────── Sub-components ───────────────────────────── */

const Stat = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <div className="bg-card px-4 py-3">
    <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
    <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
  </div>
);

const Panel = ({
  title,
  meta,
  cta,
  className,
  children,
}: {
  title: string;
  meta?: string;
  cta?: { label: string; onClick: () => void };
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={`border border-border rounded-lg bg-card ${className ?? ""}`}>
    <div className="flex items-center justify-between px-4 h-11 border-b border-border">
      <h2 className="text-sm font-medium">{title}</h2>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      {cta && (
        <button
          onClick={cta.onClick}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          {cta.label} <ArrowUpRight className="h-3 w-3" />
        </button>
      )}
    </div>
    {children}
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <p className="px-4 py-8 text-sm text-muted-foreground text-center">{text}</p>
);

export default AdminDashboard;
