/**
 * ExpensesPanel — Phase 8 implementation.
 *
 * Columns: Category | Person | Purpose | Amount.
 * Add Expense popup: member picker, type (auto from role, switchable), paid/unpaid, purpose, amount.
 * Integrates with the Commission panel: development expenses appear as "Development Expenses" rows.
 *
 * receipt_url, isReimbursable, Authorized, Location, Receipt, Project columns are gone.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Panel } from "@/components/admin/_ui";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { useExpense, type Expense, type ExpenseType } from "@/hooks/useExpense";
import { get } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectMember {
  assignmentId: number;
  teamMemberId: number;
  name: string;
  projectRole: string;
}

interface ExpensesPanelProps {
  projectId: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const DEV_ROLES = new Set([
  "main_developer",
  "lead_developer",
  "assistant_developer",
  "creatives_developer",
]);

function expenseTypeFromRole(projectRole: string): ExpenseType {
  return DEV_ROLES.has(projectRole) ? "development_expenses" : "general_expenses";
}

function categoryLabel(expenseType: ExpenseType): string {
  return expenseType === "development_expenses" ? "Development" : "General";
}

// ─── Add Expense popup ────────────────────────────────────────────────────────

const AddExpenseDialog = ({
  open,
  onOpenChange,
  projectMembers,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectMembers: ProjectMember[];
  onAdd: (input: {
    teamMemberId: number | null;
    purpose: string;
    amountCents: number;
    expenseType: ExpenseType;
    expensePaidStatus: "paid" | "unpaid";
  }) => Promise<unknown>;
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [expenseType, setExpenseType] = useState<ExpenseType>("general_expenses");
  const [paidStatus, setPaidStatus] = useState<"paid" | "unpaid">("unpaid");
  const [purpose, setPurpose] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-set expense type based on selected member's role.
  useEffect(() => {
    if (!selectedMemberId) return;
    const member = projectMembers.find((m) => String(m.teamMemberId) === selectedMemberId);
    if (member) {
      setExpenseType(expenseTypeFromRole(member.projectRole));
    }
  }, [selectedMemberId, projectMembers]);

  const reset = () => {
    setSelectedMemberId("");
    setExpenseType("general_expenses");
    setPaidStatus("unpaid");
    setPurpose("");
    setAmountStr("");
  };

  const handleConfirm = async () => {
    const amountCents = Math.round(Number(amountStr || "0") * 100);
    if (!purpose.trim() || amountCents <= 0) return;
    setSubmitting(true);
    try {
      await onAdd({
        teamMemberId: selectedMemberId ? Number(selectedMemberId) : null,
        purpose: purpose.trim(),
        amountCents,
        expenseType,
        expensePaidStatus: paidStatus,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Member */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Team member</p>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {projectMembers.map((m) => (
                  <SelectItem key={m.teamMemberId} value={String(m.teamMemberId)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Type</p>
            <Select
              value={expenseType}
              onValueChange={(v) => setExpenseType(v as ExpenseType)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="development_expenses">Development Expenses</SelectItem>
                <SelectItem value="general_expenses">General Expenses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Paid / Unpaid */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={paidStatus === "unpaid" ? "secondary" : "outline"}
                className="flex-1 h-9 text-sm"
                onClick={() => setPaidStatus("unpaid")}
                type="button"
              >
                Unpaid
              </Button>
              <Button
                size="sm"
                variant={paidStatus === "paid" ? "secondary" : "outline"}
                className="flex-1 h-9 text-sm"
                onClick={() => setPaidStatus("paid")}
                type="button"
              >
                Paid
              </Button>
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">What is this for?</p>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Higgsfield Video Generation Subscription"
              className="h-9 text-sm"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Amount</p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">₱</span>
              <Input
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="h-9 text-sm tabular-nums"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            disabled={!purpose.trim() || !amountStr || submitting}
            onClick={handleConfirm}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ExpensesPanel({ projectId }: ExpensesPanelProps) {
  const { expense, isLoading, createExpense, deleteExpense } = useExpense(projectId);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    get<ProjectMember[]>(`/api/projects/${projectId}/members`)
      .then((res) => { if (res.data) setProjectMembers(res.data); })
      .catch(() => {});
  }, [projectId]);

  const deleteTarget = expense.find((e) => e.expenseId === deleteId);

  if (isLoading) {
    return (
      <Panel title="Expenses">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </Panel>
    );
  }

  // Sits beside the panel title, matching every other Finance-tab panel action.
  const addButton = (
    <Button
      size="sm"
      onClick={() => setAddOpen(true)}
    >
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Add expense
    </Button>
  );

  return (
    <Panel title="Expenses" action={addButton}>
      {/* List */}
      {expense.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">No expenses logged.</div>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-3 h-8 border-y border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="w-24 shrink-0">Category</span>
            <span className="w-36 shrink-0">Person</span>
            <span className="flex-1 min-w-0">Purpose</span>
            <span className="w-24 shrink-0 text-right">Amount</span>
            <span className="w-7 shrink-0" />
          </div>

          <div className="divide-y divide-border">
            {expense.map((e) => (
              <div key={e.expenseId} className="flex items-center gap-3 px-3 h-10 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {categoryLabel(e.expenseType)}
                </span>
                <span className="w-36 shrink-0 truncate text-sm">
                  {e.memberName ?? "—"}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
                  {e.purpose}
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-sm font-medium">
                  {formatPeso(e.amountCents)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setDeleteId(e.expenseId)}
                  aria-label="Delete expense"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <AddExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectMembers={projectMembers}
        onAdd={async (input) => {
          await createExpense({ ...input, projectId });
        }}
      />

      <ConfirmDeleteDialog
        open={deleteId !== null}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        onConfirm={() => {
          if (deleteId !== null) {
            deleteExpense(deleteId);
            setDeleteId(null);
          }
        }}
        name={deleteTarget?.purpose}
        noun="expense"
      />
    </Panel>
  );
}

export default ExpensesPanel;
