import { motion } from "framer-motion";
import {
  FolderKanban,
  Users,
  Inbox,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  Sparkles,
  Plus,
  Activity,
  Clock,
  CircleDot,
} from "lucide-react";
import { Link } from "react-router-dom";
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

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const AdminDashboard = ({
  projects,
  clients,
  leads,
  formatCurrency,
  recentActivity,
  upcomingDeadlines,
  userName,
}: AdminDashboardProps) => {
  // Derive metrics
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

  // Status breakdown for pipeline
  const pipelineByStatus = ["discovery", "architecture", "development", "testing", "shipped"].map(
    (s) => ({
      status: s,
      count: projects.filter((p) => p.project_status === s).length,
    }),
  );
  const maxCount = Math.max(1, ...pipelineByStatus.map((p) => p.count));

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const firstName = userName?.split("@")[0]?.split(".")[0] || "there";
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="space-y-8">
      {/* Greeting + Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"
      >
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            {today}
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">
            {greeting()}, {displayName}.
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening at ADVO today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/start"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-full text-sm font-medium hover:bg-accent/90 btn-press"
          >
            <Plus className="h-4 w-4" /> New Project
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-full text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
            <Sparkles className="h-4 w-4" /> Quick action
          </button>
        </div>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          delay={0}
          label="Active Projects"
          value={String(activeProjects.length)}
          sub={`${shippedProjects.length} shipped`}
          icon={FolderKanban}
        />
        <KpiCard
          delay={0.05}
          label="Revenue Collected"
          value={formatCurrency(totalPaid)}
          sub={`${collectionRate}% of ${formatCurrency(totalValue)} billed`}
          icon={TrendingUp}
          accent
        />
        <KpiCard
          delay={0.1}
          label="Open Leads"
          value={String(newLeads)}
          sub={`${qualifiedLeads} qualified`}
          icon={Inbox}
        />
        <KpiCard
          delay={0.15}
          label="Active Clients"
          value={String(clients.length)}
          sub={`${clients.reduce((s, c) => s + (c.projectCount || 0), 0)} projects total`}
          icon={Users}
        />
      </div>

      {/* Middle — Pipeline + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Project Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-3 p-6 bg-card border border-border rounded-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Pipeline
              </p>
              <h3 className="text-lg font-semibold">Projects by stage</h3>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {projects.length} total
            </span>
          </div>
          <div className="space-y-4">
            {pipelineByStatus.map((stage) => (
              <div key={stage.status}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[stage.status] }}
                    />
                    <span className="text-sm">
                      {STATUS_LABELS[stage.status]}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    {stage.count}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(stage.count / maxCount) * 100}%`,
                      backgroundColor: STATUS_COLORS[stage.status],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Revenue summary */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl flex flex-col"
        >
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Cash Flow
          </p>
          <h3 className="text-lg font-semibold mb-5">Revenue snapshot</h3>

          <div className="space-y-5 flex-1">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted-foreground">Collected</span>
                <span className="text-xl font-semibold tracking-tight">
                  {formatCurrency(totalPaid)}
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${collectionRate}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-muted-foreground">Outstanding</span>
                <span className="text-xl font-semibold tracking-tight">
                  {formatCurrency(outstanding)}
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-muted-foreground/40 rounded-full"
                  style={{ width: `${100 - collectionRate}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-border flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Collection Rate
            </span>
            <span className="text-xl font-semibold text-accent">
              {collectionRate}%
            </span>
          </div>
        </motion.div>
      </div>

      {/* Bottom — 3 column feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FeedCard
          delay={0.3}
          label="Activity"
          title="Recent updates"
          icon={Activity}
          empty={recentActivity.length === 0}
          emptyText="No recent activity"
        >
          {recentActivity.slice(0, 6).map((a, i) => (
            <div key={i} className="flex items-start gap-3 pb-3 last:pb-0">
              <CircleDot className="h-3 w-3 text-accent mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{a.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {a.target} · {a.time}
                </p>
              </div>
            </div>
          ))}
        </FeedCard>

        <FeedCard
          delay={0.35}
          label="Upcoming"
          title="Deadlines"
          icon={Calendar}
          empty={upcomingDeadlines.length === 0}
          emptyText="No upcoming deadlines"
        >
          {upcomingDeadlines.slice(0, 5).map((d) => (
            <div
              key={d.deliverable_id}
              className="flex items-center justify-between gap-3 pb-3 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {d.project_title}
                </p>
              </div>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${
                  d.is_urgent
                    ? "bg-destructive/10 text-destructive"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {d.due_date
                  ? new Date(d.due_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "No date"}
              </span>
            </div>
          ))}
        </FeedCard>

        <FeedCard
          delay={0.4}
          label="Leads"
          title="Latest inquiries"
          icon={Inbox}
          empty={leads.length === 0}
          emptyText="No leads yet"
          cta={{ label: "View all", href: "#leads" }}
        >
          {leads.slice(0, 5).map((l, i) => (
            <div
              key={l.lead_id || i}
              className="flex items-start gap-3 pb-3 last:pb-0"
            >
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-medium shrink-0">
                {l.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {l.company || l.project_type || "—"}
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
                <Clock className="inline h-2.5 w-2.5 mr-1" />
                {new Date(l.submitted_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
        </FeedCard>
      </div>
    </div>
  );
};

/* ───────────────────────────── Sub-components ───────────────────────────── */

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  delay?: number;
  accent?: boolean;
}

const KpiCard = ({ label, value, sub, icon: Icon, delay = 0, accent }: KpiCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="group relative p-5 bg-card border border-border rounded-2xl hover:border-foreground/30 transition-colors"
  >
    <div className="flex items-center justify-between mb-4">
      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          accent ? "bg-accent/15" : "bg-secondary"
        }`}
      >
        <Icon
          className={`h-4 w-4 ${accent ? "text-accent" : "text-muted-foreground"}`}
        />
      </div>
    </div>
    <p className="text-3xl font-semibold tracking-tight mb-1">{value}</p>
    <p className="text-xs text-muted-foreground">{sub}</p>
  </motion.div>
);

interface FeedCardProps {
  label: string;
  title: string;
  icon: React.ElementType;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
  delay?: number;
  cta?: { label: string; href: string };
}

const FeedCard = ({
  label,
  title,
  icon: Icon,
  empty,
  emptyText,
  children,
  delay = 0,
  cta,
}: FeedCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="p-5 bg-card border border-border rounded-2xl"
  >
    <div className="flex items-center justify-between mb-5">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
          {label}
        </p>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {cta ? (
        <a
          href={cta.href}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          {cta.label} <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : (
        <Icon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
    {empty ? (
      <div className="py-8 text-center">
        <Icon className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      </div>
    ) : (
      <div className="space-y-3">{children}</div>
    )}
  </motion.div>
);

export default AdminDashboard;
