import { useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvoices, type Invoice, type InvoiceStatus } from "@/hooks/useInvoices";
import { useRecurringFee, type RecurringFee } from "@/hooks/useRecurringFee";
import { useExpense, type ExpenseInput } from "@/hooks/useExpense";
import { PageHeader, StatStrip, Stat, Empty, Dot } from "@/components/admin/_ui";
import InvoicePaymentLink from "@/components/admin/InvoicePaymentLink";
import AdminCommission from "@/components/admin/AdminCommission";

const EXPENSE_CATEGORIES = [
  "ai_usage",
  "media",
  "subscription",
  "outside_payment",
  "travel",
  "meals",
  "software",
  "hardware",
  "marketing",
  "office",
  "other",
] as const;

/* ─── Helpers ─────────────────────────────────────────────── */

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusConfig: Record<InvoiceStatus, { label: string; dot: string }> = {
  unpaid: { label: "Unpaid", dot: "bg-yellow-500" },
  paid: { label: "Paid", dot: "bg-green-500" },
  overdue: { label: "Overdue", dot: "bg-red-500" },
};

/* ─── Project with invoices ───────────────────────────────── */

interface ProjectSummary {
  project_id: number;
  title: string;
  total_value_cents: number;
  amount_paid_cents: number;
}

interface AdminFinanceProps {
  projects: ProjectSummary[];
}

/* ─── Create Invoice Form ─────────────────────────────────── */

const CreateInvoiceForm = ({
  projectId,
  onCreate,
  isCreating,
}: {
  projectId: number;
  onCreate: (data: Omit<Invoice, "invoice_id" | "created_at" | "paid_at">) => void;
  isCreating: boolean;
}) => {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = () => {
    if (!label || !amount) return;
    onCreate({
      project_id: projectId,
      label,
      amount_cents: Math.round(parseFloat(amount) * 100),
      status: "unpaid" as InvoiceStatus,
      due_date: dueDate || null,
      notes: null,
    });
    setLabel("");
    setAmount("");
    setDueDate("");
  };

  return (
    <div className="flex items-center gap-2 px-3 h-12 border-t border-border">
      <Input
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1 h-8"
      />
      <Input
        placeholder="Amount (₱)"
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28 h-8 tabular-nums"
      />
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-36 h-8"
      />
      <Button size="sm" className="h-8" onClick={handleSubmit} disabled={isCreating || !label || !amount}>
        {isCreating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};

/* ─── Expense create form ─────────────────────────────────── */

const CreateExpenseForm = ({
  projects,
  onCreate,
  isCreating,
}: {
  projects: ProjectSummary[];
  onCreate: (input: ExpenseInput) => Promise<unknown>;
  isCreating: boolean;
}) => {
  const [purpose, setPurpose] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [amount, setAmount] = useState("");
  const [location, setLocation] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [projectId, setProjectId] = useState<string>("none");

  const handleSubmit = async () => {
    if (!purpose.trim() || !authorizedBy.trim() || !amount) return;
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) return;
    try {
      await onCreate({
        purpose: purpose.trim(),
        authorizedBy: authorizedBy.trim(),
        amountCents,
        location: location.trim() || null,
        receiptUrl: receiptUrl.trim() || null,
        category,
        projectId: projectId === "none" ? null : Number(projectId),
      });
      setPurpose("");
      setAuthorizedBy("");
      setAmount("");
      setLocation("");
      setReceiptUrl("");
      setCategory("other");
      setProjectId("none");
    } catch {
      // Hook surfaces the toast.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-3 border-t border-border bg-secondary/10">
      <Input
        placeholder="Purpose"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        className="flex-1 min-w-[140px] h-8"
      />
      <Input
        placeholder="Authorized by"
        value={authorizedBy}
        onChange={(e) => setAuthorizedBy(e.target.value)}
        className="w-36 h-8"
      />
      <Input
        placeholder="Amount (₱)"
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28 h-8 tabular-nums"
      />
      <Input
        placeholder="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-32 h-8"
      />
      <Input
        placeholder="Receipt URL"
        value={receiptUrl}
        onChange={(e) => setReceiptUrl(e.target.value)}
        className="w-40 h-8"
      />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPENSE_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={projectId} onValueChange={setProjectId}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="Project" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No project</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.project_id} value={String(p.project_id)}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8"
        onClick={handleSubmit}
        disabled={isCreating || !purpose.trim() || !authorizedBy.trim() || !amount}
      >
        {isCreating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};

/* ─── Recurring infrastructure fee ────────────────── */
//
// The FourlinQ MOA commits the client to PHP 3,000.00/month for hosting, database
// maintenance and domain renewal, billed on the 1st, suspendable after 15 days unpaid.
//
// Two rules this UI must not break:
//   * A generated invoice is NOT project scope. It never enters the Collected /
//     Contracted stats, and it is listed here rather than inside the project group.
//   * "At risk" means the contractual remedy is AVAILABLE, not that anything happened.
//     Suspending is an explicit click, and the API refuses it while unjustified.

const feeStatusConfig: Record<string, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-green-500" },
  paused: { label: "Paused", dot: "bg-yellow-500" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground/40" },
};

const CreateRecurringFeeForm = ({
  projects,
  onCreate,
  isCreating,
}: {
  projects: ProjectSummary[];
  onCreate: (input: {
    projectId: number;
    label: string;
    amountCents: number;
    startsOn: string;
    billingDayOfMonth?: number;
    graceDayCount?: number;
  }) => void;
  isCreating: boolean;
}) => {
  const [projectId, setProjectId] = useState("");
  const [label, setLabel] = useState("Monthly Infrastructure Fee");
  const [amount, setAmount] = useState("3000");
  const [startsOn, setStartsOn] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [graceDay, setGraceDay] = useState("15");

  const handleSubmit = () => {
    if (!projectId || !label.trim() || !amount || !startsOn) return;
    onCreate({
      projectId: Number(projectId),
      label: label.trim(),
      // Integer CENTS. This is the only place a peso string becomes cents.
      amountCents: Math.round(parseFloat(amount) * 100),
      startsOn,
      billingDayOfMonth: Number(dayOfMonth) || 1,
      graceDayCount: Number(graceDay),
    });
    setStartsOn("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-border bg-secondary/20">
      <Select value={projectId} onValueChange={setProjectId}>
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue placeholder="Project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.project_id} value={String(p.project_id)}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-52 h-8"
      />
      <Input
        placeholder="Amount"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24 h-8"
      />
      <Input
        type="date"
        aria-label="Starts on"
        value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)}
        className="w-36 h-8"
      />
      <Input
        type="number"
        min={1}
        max={28}
        aria-label="Billing day of month"
        title="Billing day of month (1–28)"
        value={dayOfMonth}
        onChange={(e) => setDayOfMonth(e.target.value)}
        className="w-16 h-8"
      />
      <Input
        type="number"
        min={0}
        aria-label="Grace days"
        title="Grace days before suspension is justified"
        value={graceDay}
        onChange={(e) => setGraceDay(e.target.value)}
        className="w-16 h-8"
      />
      <Button
        size="sm"
        className="h-8"
        onClick={handleSubmit}
        disabled={isCreating || !projectId || !label.trim() || !amount || !startsOn}
      >
        {isCreating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
};

const RecurringFeeRow = ({
  fee,
  title,
  onStatus,
  onSuspend,
  onDelete,
}: {
  fee: RecurringFee;
  title: string;
  onStatus: (status: string) => void;
  onSuspend: (isSuspend: boolean) => void;
  onDelete: () => void;
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

      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {formatPeso(derived?.outstandingCents ?? 0)} out
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
          <PlayCircle className="h-3.5 w-3.5 text-accent" />
        ) : (
          <PauseCircle className="h-3.5 w-3.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onDelete}
        aria-label="Delete recurring fee"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────── */

const AdminFinance = ({ projects }: AdminFinanceProps) => {
  const { invoices, isLoading, createInvoice, toggleStatus, deleteInvoice, isCreating } =
    useInvoices();
  const {
    expense,
    isLoading: expenseLoading,
    createExpense,
    deleteExpense,
    isCreating: isCreatingExpense,
  } = useExpense();
  const {
    recurringFee,
    atRisk,
    createRecurringFee,
    updateRecurringFee,
    deleteRecurringFee,
    runRecurringFee,
    setSuspended,
    isCreating: isCreatingFee,
    isRunning,
  } = useRecurringFee();
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Summary stats
  const totalRevenue = projects.reduce((sum, p) => sum + p.amount_paid_cents, 0);
  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const outstandingCents = [...unpaidInvoices, ...overdueInvoices].reduce(
    (sum, i) => sum + i.amount_cents,
    0
  );
  const expenseTotalCents = expense.reduce((sum, e) => sum + e.amountCents, 0);
  const reimbursableCount = expense.filter((e) => e.isReimbursable).length;

  // Group invoices by project_id — SPLIT by origin.
  //
  // Recurring infrastructure invoices are deliberately kept out of the project group:
  // twelve of them a year would bury the two milestone invoices, and the contract is
  // explicit that the Total Fee "does not cover the ongoing costs". They belong to the
  // Recurring fees block below, not to project scope.
  const invoicesByProject = new Map<number, Invoice[]>();
  const recurringInvoiceByProject = new Map<number, Invoice[]>();
  for (const inv of invoices) {
    const target = inv.recurring_fee_id == null ? invoicesByProject : recurringInvoiceByProject;
    const existing = target.get(inv.project_id) || [];
    existing.push(inv);
    target.set(inv.project_id, existing);
  }

  if (isLoading || expenseLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalContracted = projects.reduce((sum, p) => sum + p.total_value_cents, 0);
  const collectionRate =
    totalContracted > 0 ? Math.round((totalRevenue / totalContracted) * 100) : 0;

  const projectTitle = (id: number | null) =>
    id == null ? "—" : projects.find((p) => p.project_id === id)?.title ?? `Project #${id}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance"
        meta={`${projects.length} project${projects.length !== 1 ? "s" : ""} · ${invoices.length} invoice${invoices.length !== 1 ? "s" : ""} · ${expense.length} expense${expense.length !== 1 ? "s" : ""}`}
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

      {/* Summary strip */}
      <StatStrip>
        <Stat
          label="Collected"
          value={formatPeso(totalRevenue)}
          sub={`${collectionRate}% of ${formatPeso(totalContracted)}`}
          accent
        />
        <Stat label="Outstanding" value={formatPeso(outstandingCents)} sub={`${unpaidInvoices.length} unpaid`} />
        <Stat label="Overdue" value={String(overdueInvoices.length)} sub="invoices" />
        <Stat label="Contracted" value={formatPeso(totalContracted)} sub={`${projects.length} projects`} />
      </StatStrip>

      {/* Project-grouped invoices */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          <span className="flex-1 min-w-0">Project</span>
          <span className="hidden md:block w-44 shrink-0 text-right">Collected / Total</span>
          <span className="w-14 shrink-0 text-right">Paid</span>
          <span className="w-16 shrink-0 text-right">Invoices</span>
          <span className="w-4 shrink-0" />
        </div>

        <div className="divide-y divide-border">
          {projects.map((project) => {
            const projectInvoices = invoicesByProject.get(project.project_id) || [];
            const isExpanded = expandedProject === project.project_id;
            const paidPct =
              project.total_value_cents > 0
                ? (project.amount_paid_cents / project.total_value_cents) * 100
                : 0;

            return (
              <div key={project.project_id}>
                {/* Project header */}
                <button
                  onClick={() =>
                    setExpandedProject(isExpanded ? null : project.project_id)
                  }
                  className="w-full flex items-center gap-3 px-3 h-11 text-sm hover:bg-secondary/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 font-medium truncate text-left">{project.title}</span>

                  <span className="hidden md:block w-44 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {formatPeso(project.amount_paid_cents)} / {formatPeso(project.total_value_cents)}
                  </span>

                  <span className="w-14 shrink-0 flex items-center justify-end gap-2">
                    <span className="hidden lg:block w-12 h-1 bg-secondary rounded-full overflow-hidden">
                      <span
                        className="block h-full bg-accent rounded-full"
                        style={{ width: `${Math.min(paidPct, 100)}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                      {Math.round(paidPct)}%
                    </span>
                  </span>

                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {projectInvoices.length}
                  </span>

                  <span className="w-4 shrink-0 flex justify-end text-muted-foreground">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {/* Expanded: invoice rows + create form */}
                {isExpanded && (
                  <div className="bg-secondary/20 border-t border-border">
                    {projectInvoices.length === 0 ? (
                      <Empty text="No invoices for this project" />
                    ) : (
                      <div className="divide-y divide-border">
                        {projectInvoices.map((inv) => {
                          const cfg = statusConfig[inv.status];
                          return (
                            <div
                              key={inv.invoice_id}
                              className="flex items-center gap-3 px-3 h-11"
                            >
                              <span className="flex items-center gap-1.5 w-24 shrink-0">
                                <Dot className={cfg.dot} />
                                <span className="text-xs text-muted-foreground">{cfg.label}</span>
                              </span>
                              <span className="flex-1 min-w-0 flex items-baseline gap-2">
                                <span className="text-sm font-medium truncate">{inv.label}</span>
                                {inv.due_date && (
                                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                    Due{" "}
                                    {new Date(inv.due_date).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                )}
                              </span>

                              <span className="text-sm font-medium tabular-nums shrink-0">
                                {formatPeso(inv.amount_cents)}
                              </span>

                              {/* Status toggle */}
                              <Select
                                value={inv.status}
                                onValueChange={(val: string) =>
                                  toggleStatus(inv.invoice_id, val as InvoiceStatus)
                                }
                              >
                                <SelectTrigger className="w-24 h-7 text-xs shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unpaid">Unpaid</SelectItem>
                                  <SelectItem value="paid">Paid</SelectItem>
                                  <SelectItem value="overdue">Overdue</SelectItem>
                                </SelectContent>
                              </Select>

                              {/* Migration 022's entire user-facing surface. With the
                                  default manual rail this records the collectable and
                                  returns NO url — which is a success, not a failure,
                                  and is reported as one. Absent on a paid invoice: the
                                  API refuses with 409, and a button that exists only to
                                  fail is a button people press. */}
                              <InvoicePaymentLink
                                invoiceId={inv.invoice_id}
                                status={inv.status}
                              />

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => deleteInvoice(inv.invoice_id)}
                                aria-label="Delete invoice"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Echo: infrastructure invoices exist but are NOT project scope. */}
                    {(recurringInvoiceByProject.get(project.project_id)?.length ?? 0) > 0 && (
                      <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
                        {recurringInvoiceByProject.get(project.project_id)!.length} infrastructure
                        invoice ·{" "}
                        {formatPeso(
                          recurringInvoiceByProject
                            .get(project.project_id)!
                            .filter((i) => i.status !== "paid")
                            .reduce((sum, i) => sum + i.amount_cents, 0),
                        )}{" "}
                        outstanding — billed by a recurring fee, excluded from this project&apos;s
                        contract value. See Recurring fees below.
                      </div>
                    )}

                    <CreateInvoiceForm
                      projectId={project.project_id}
                      onCreate={createInvoice}
                      isCreating={isCreating}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recurring infrastructure fees */}
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
          {/* Generation is an explicit click, not a cron. Idempotent — safe to double-click. */}
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

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {recurringFee.length === 0 ? (
            <Empty text="No recurring fee scheduled" />
          ) : (
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
                  onDelete={() => deleteRecurringFee(fee.recurringFeeId)}
                />
              ))}
            </div>
          )}

          <CreateRecurringFeeForm
            projects={projects}
            onCreate={createRecurringFee}
            isCreating={isCreatingFee}
          />
        </div>
      </div>

      {/* Commission split — how the money that landed is divided (migration 018).
          Sits between billing (money in) and expenses (money out), because that is
          exactly where it belongs: it splits what billing collected. */}
      <AdminCommission projects={projects} />

      {/* Expenses section */}
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Expenses</h2>
            <p className="text-xs text-muted-foreground">
              {formatPeso(expenseTotalCents)} logged · {reimbursableCount} reimbursable
              (receipt on file)
            </p>
          </div>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            <span className="w-24 shrink-0">Category</span>
            <span className="flex-1 min-w-0">Purpose</span>
            <span className="hidden md:block w-28 shrink-0">Authorized</span>
            <span className="hidden lg:block w-28 shrink-0">Location</span>
            <span className="hidden xl:block w-32 shrink-0">Project</span>
            <span className="w-20 shrink-0 text-right">Amount</span>
            <span className="w-16 shrink-0 text-center">Receipt</span>
            <span className="w-8 shrink-0" />
          </div>

          {expense.length === 0 ? (
            <Empty text="No expenses logged yet" />
          ) : (
            <div className="divide-y divide-border">
              {expense.map((row) => (
                <div key={row.expenseId} className="flex items-center gap-3 px-3 h-11 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground capitalize">
                    {row.category}
                  </span>
                  <span className="flex-1 min-w-0 font-medium truncate">{row.purpose}</span>
                  <span className="hidden md:block w-28 shrink-0 text-xs text-muted-foreground truncate">
                    {row.authorizedBy}
                  </span>
                  <span className="hidden lg:block w-28 shrink-0 text-xs text-muted-foreground truncate">
                    {row.location || "—"}
                  </span>
                  <span className="hidden xl:block w-32 shrink-0 text-xs text-muted-foreground truncate">
                    {projectTitle(row.projectId)}
                  </span>
                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                    {formatPeso(row.amountCents)}
                  </span>
                  <span className="w-16 shrink-0 flex items-center justify-center">
                    {row.isReimbursable && row.receiptUrl ? (
                      <a
                        href={row.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                        title="View receipt"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Dot className="bg-muted-foreground/40" />
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteExpense(row.expenseId)}
                    aria-label="Delete expense"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <CreateExpenseForm
            projects={projects}
            onCreate={createExpense}
            isCreating={isCreatingExpense}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminFinance;
