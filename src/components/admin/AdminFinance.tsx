import { useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

/* ─── Helpers ─────────────────────────────────────────────── */

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusConfig: Record<
  InvoiceStatus,
  { label: string; color: string; badgeClass: string }
> = {
  unpaid: {
    label: "Unpaid",
    color: "text-yellow-500",
    badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  },
  paid: {
    label: "Paid",
    color: "text-green-500",
    badgeClass: "bg-green-500/10 text-green-500 border-green-500/30",
  },
  overdue: {
    label: "Overdue",
    color: "text-red-500",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
  },
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
    <div className="flex items-center gap-2 pt-3 border-t border-border">
      <Input
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1"
      />
      <Input
        placeholder="Amount (₱)"
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28"
      />
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-36"
      />
      <Button size="sm" onClick={handleSubmit} disabled={isCreating || !label || !amount}>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Finance</h1>
        <p className="text-muted-foreground">Revenue, invoices, and payments</p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Total Revenue
              </p>
              <p className="text-xl font-bold text-green-500">
                {formatPeso(totalRevenue)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Outstanding
              </p>
              <p className="text-xl font-bold text-yellow-500">
                {formatPeso(outstandingCents)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Overdue
              </p>
              <p className="text-xl font-bold text-red-500">
                {overdueInvoices.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Project-grouped invoices */}
      <div className="space-y-3">
        {projects.map((project, index) => {
          const projectInvoices = invoicesByProject.get(project.project_id) || [];
          const isExpanded = expandedProject === project.project_id;
          const paidPct =
            project.total_value_cents > 0
              ? (project.amount_paid_cents / project.total_value_cents) * 100
              : 0;

          return (
            <motion.div
              key={project.project_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="bg-card border border-border rounded-xl shadow-card overflow-hidden"
            >
              {/* Project header */}
              <button
                onClick={() =>
                  setExpandedProject(isExpanded ? null : project.project_id)
                }
                className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-sm text-left">{project.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatPeso(project.amount_paid_cents)} /{" "}
                        {formatPeso(project.total_value_cents)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {projectInvoices.length} invoice
                        {projectInvoices.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Mini progress bar */}
                  <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden hidden md:block">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${Math.min(paidPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                    {Math.round(paidPct)}%
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded: invoice rows + create form */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {projectInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      No invoices for this project
                    </p>
                  ) : (
                    projectInvoices.map((inv) => {
                      const cfg = statusConfig[inv.status];
                      return (
                        <div
                          key={inv.invoice_id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${cfg.badgeClass}`}
                            >
                              {cfg.label}
                            </Badge>
                            <span className="text-sm font-medium">
                              {inv.label}
                            </span>
                            {inv.due_date && (
                              <span className="text-xs text-muted-foreground">
                                Due:{" "}
                                {new Date(inv.due_date).toLocaleDateString(
                                  "en-US",
                                  { month: "short", day: "numeric", year: "numeric" }
                                )}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-medium">
                              {formatPeso(inv.amount_cents)}
                            </span>

                            {/* Status toggle */}
                            <Select
                              value={inv.status}
                              onValueChange={(val: string) =>
                                toggleStatus({
                                  invoiceId: inv.invoice_id,
                                  status: val as InvoiceStatus,
                                })
                              }
                            >
                              <SelectTrigger className="w-24 h-7 text-xs">
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
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => deleteInvoice(inv.invoice_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <CreateInvoiceForm
                    projectId={project.project_id}
                    onCreate={createInvoice}
                    isCreating={isCreating}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminFinance;
