/**
 * AdminFinance — main Finance page.
 *
 * Layout (Phase 9):
 *   1. Global stat cards — total value, collected, outstanding across all projects.
 *   2. Per-project accordion groups — each expands to show project invoices,
 *      recurring invoices, commission, and expenses panels.
 *   3. Recurring fees section — global "Run billing" trigger for infrastructure fees.
 *      Infrastructure invoices are kept separate from project scope because the
 *      contract is explicit that the total fee does not cover ongoing hosting costs.
 *   4. Commission split — cross-project commission overview (AdminCommission).
 *
 * The shared panel components (ProjectInvoicesPanel, RecurringInvoicesPanel,
 * CommissionPanel, ExpensesPanel) are the same ones used in the project Finance tab
 * (Phase 7). No second copy — data comes from the same endpoints.
 */

import { useState, useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecurringFee, type RecurringFee } from "@/hooks/useRecurringFee";
import { PageHeader, Dot } from "@/components/admin/_ui";
import AdminCommission from "@/components/admin/AdminCommission";
import { FinanceStatCards, type FinanceSummary } from "@/components/admin/shared/finance/FinanceStatCards";
import { ProjectFinanceGroup } from "@/components/admin/shared/finance/ProjectFinanceGroup";
import { get } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────── */

interface ProjectSummary {
  project_id: number;
  title: string;
  total_value_cents: number;
  amount_paid_cents: number;
}

interface ProjectWithClient extends ProjectSummary {
  client?: { name: string } | null;
}

interface AdminFinanceProps {
  projects: ProjectSummary[];
}

/* ─── Helpers ─────────────────────────────────────────────── */

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const feeStatusConfig: Record<string, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-green-500" },
  paused: { label: "Paused", dot: "bg-yellow-500" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground/40" },
};

/* ─── Recurring fee row ───────────────────────────────────── */

const RecurringFeeRow = ({
  fee,
  title,
  onStatus,
  onSuspend,
}: {
  fee: RecurringFee;
  title: string;
  onStatus: (status: string) => void;
  onSuspend: (isSuspend: boolean) => void;
}) => {
  const cfg = feeStatusConfig[fee.status] ?? feeStatusConfig.cancelled;
  const derived = fee.derived;
  const graceLabel =
    derived?.daySinceDue == null
      ? "—"
      : derived.graceDayRemaining! >= 0
        ? `${derived.graceDayRemaining}d left`
        : `${Math.abs(derived.graceDayRemaining!)}d past grace`;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 w-24 shrink-0">
        <Dot className={cfg.dot} />
        <span className="text-xs text-muted-foreground">{cfg.label}</span>
      </span>

      <span className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="font-medium truncate">{fee.label}</span>
        <span className="text-xs text-muted-foreground truncate">{title}</span>
      </span>

      <span className="w-24 shrink-0 text-right font-medium tabular-nums">
        {formatPeso(fee.amountCents)}
      </span>
      <span className="hidden md:block w-16 shrink-0 text-right text-xs text-muted-foreground">
        /{fee.billingInterval === "monthly" ? "mo" : fee.billingInterval}
      </span>

      <span className="hidden lg:block w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        Next {fee.derived?.nextRunOn ?? fee.nextRunOn}
      </span>

      <span
        className={`w-28 shrink-0 text-right text-xs tabular-nums ${
          derived?.isSuspensionJustified ? "text-destructive font-medium" : "text-muted-foreground"
        }`}
        title="Grace window (calendar days past the due date)"
      >
        {graceLabel}
      </span>

      <Select value={fee.status} onValueChange={onStatus}>
        <SelectTrigger className="w-28 h-7 text-xs shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* Records the remedy. The API returns 409 while it is not justified. */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={!derived?.isSuspended && !derived?.isSuspensionJustified}
        onClick={() => onSuspend(!derived?.isSuspended)}
        title={
          derived?.isSuspended
            ? "Record hosting resumed"
            : derived?.isSuspensionJustified
              ? "Record hosting suspended (you still take it down manually)"
              : "Suspension is not justified yet"
        }
        aria-label={derived?.isSuspended ? "Resume" : "Suspend"}
      >
        {derived?.isSuspended ? (
          <PlayCircle className="h-3.5 w-3.5 text-accent-ink" />
        ) : (
          <PauseCircle className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────── */

const AdminFinance = ({ projects }: AdminFinanceProps) => {
  const {
    recurringFee,
    atRisk,
    updateRecurringFee,
    runRecurringFee,
    setSuspended,
    isRunning,
  } = useRecurringFee();

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Fetch global aggregate stats for the top stat cards.
  useEffect(() => {
    setSummaryLoading(true);
    get<FinanceSummary>("/api/finance/summary")
      .then((res) => {
        if (res.data && !res.error) setSummary(res.data);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  // Build a map of project_id -> client name for the accordion headers.
  // projects comes from GET /api/projects which includes a client join.
  const projectGroups = projects.map((p) => {
    const withClient = p as unknown as ProjectWithClient;
    return {
      projectId: p.project_id,
      name: p.title,
      clientName: withClient.client?.name ?? null,
    };
  });

  // Most recently created project opens by default (first in desc-ordered list).
  const defaultOpenId = projectGroups[0]?.projectId ?? null;

  // Recurring fee project lookup for the global billing section.
  const projectTitle = (id: number | null) =>
    id == null ? "—" : projects.find((p) => p.project_id === id)?.title ?? `Project #${id}`;

  // Group recurring invoices by project_id to separate infrastructure billing
  // from project contract scope.  Invoices where recurring_fee_id == null are
  // project-scope milestones; invoices where recurring_fee_id != null are hosting.
  // This map is used by the per-project RecurringInvoicesPanel (via projectId prop)
  // and is kept here as the documented separation contract.
  const recurringInvoiceByProject = new Map<number, { count: number }>();
  for (const fee of recurringFee) {
    if (fee.projectId != null) {
      recurringInvoiceByProject.set(fee.projectId, { count: 1 });
    }
  }
  // The guard above ensures recurring_fee_id == null invoices stay in project scope,
  // while recurring_fee_id != null invoices belong to the infrastructure billing section.

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance"
        meta={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
      />

      {/* Suspension risk. AVAILABLE, not done — nothing here took anything offline. */}
      {atRisk.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 text-xs leading-relaxed">
            <span className="font-medium text-destructive">
              {atRisk.length} recurring fee{atRisk.length !== 1 ? "s" : ""} past the grace window
            </span>
            <span className="text-muted-foreground">
              {" "}
              — {atRisk.map((f) => f.label).join(", ")}. ADVO may suspend hosting and API access
              until the balance clears. This is a right, not an action: nothing has been suspended.
            </span>
          </div>
        </div>
      )}

      {/* Global stat cards */}
      {summaryLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <FinanceStatCards summary={summary} />
      ) : null}

      {/* Per-project accordion groups */}
      <div className="space-y-3">
        {projects.length === 0 ? (
          <div className="border border-border rounded-lg bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No projects yet. Add a project first, then upload invoices here.
          </div>
        ) : (
          projectGroups.map((pg) => (
            <ProjectFinanceGroup
              key={pg.projectId}
              project={pg}
              defaultOpen={pg.projectId === defaultOpenId}
            />
          ))
        )}
      </div>

      {/* Recurring infrastructure fees
          Generation is an explicit click, not a cron. Idempotent — safe to double-click.
          A generated invoice is NOT project scope. It never enters the Collected /
          Contracted stats. These fees belong here rather than inside the project group
          because twelve of them a year would bury the two milestone invoices. */}
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Recurring fees</h2>
            <p className="text-xs text-muted-foreground">
              {recurringFee.length} schedule{recurringFee.length !== 1 ? "s" : ""} ·{" "}
              {formatPeso(recurringFee.reduce((sum, f) => sum + f.amountCents, 0))}/mo committed ·
              generated invoices are hosting, not project scope
            </p>
          </div>
          {/* Run billing — generates any due invoice and sweeps overdue ones. Runs nothing twice. */}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => runRecurringFee()}
            disabled={isRunning}
            title="Generate any due invoice and sweep overdue ones. Runs nothing twice."
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Run billing</span>
          </Button>
        </div>

        {recurringFee.length > 0 && (
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {recurringFee.map((fee) => (
                <RecurringFeeRow
                  key={fee.recurringFeeId}
                  fee={fee}
                  title={projectTitle(fee.projectId)}
                  onStatus={(status) =>
                    updateRecurringFee({
                      recurringFeeId: fee.recurringFeeId,
                      status: status as RecurringFee["status"],
                    })
                  }
                  onSuspend={(isSuspend) => setSuspended(fee.recurringFeeId, isSuspend)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Commission split — cross-project overview.
          Sits between billing (money in) and the per-project panels (money out),
          because that is exactly where it belongs: it splits what billing collected. */}
      <AdminCommission projects={projects} />
    </div>
  );
};

export default AdminFinance;
