import { useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
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
import { PageHeader, StatStrip, Stat, Empty, Dot } from "@/components/admin/_ui";

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

/* ─── Main Component ──────────────────────────────────────── */

const AdminFinance = ({ projects }: AdminFinanceProps) => {
  const { invoices, isLoading, createInvoice, toggleStatus, deleteInvoice, isCreating } =
    useInvoices();
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Summary stats
  const totalRevenue = projects.reduce((sum, p) => sum + p.amount_paid_cents, 0);
  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const outstandingCents = [...unpaidInvoices, ...overdueInvoices].reduce(
    (sum, i) => sum + i.amount_cents,
    0
  );

  // Group invoices by project_id
  const invoicesByProject = new Map<number, Invoice[]>();
  for (const inv of invoices) {
    const existing = invoicesByProject.get(inv.project_id) || [];
    existing.push(inv);
    invoicesByProject.set(inv.project_id, existing);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalContracted = projects.reduce((sum, p) => sum + p.total_value_cents, 0);
  const collectionRate =
    totalContracted > 0 ? Math.round((totalRevenue / totalContracted) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance"
        meta={`${projects.length} project${projects.length !== 1 ? "s" : ""} · ${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}`}
      />

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
    </div>
  );
};

export default AdminFinance;
