import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/**
 * /api/expense — Phase 8 rework.
 *
 * receipt_url and isReimbursable are removed (migration 032).
 * expenseType:        'development_expenses' | 'general_expenses'
 * expensePaidStatus:  'paid' | 'unpaid'
 * teamMemberId:       links an expense to a specific team member.
 */

export type ExpenseType = "development_expenses" | "general_expenses";
export type ExpensePaidStatus = "paid" | "unpaid";

export interface Expense {
  expenseId: number;
  projectId: number | null;
  teamMemberId: number | null;
  memberName: string | null;
  purpose: string;
  amountCents: number;
  expenseType: ExpenseType;
  expensePaidStatus: ExpensePaidStatus;
  category: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  projectId?: number | null;
  teamMemberId?: number | null;
  purpose: string;
  amountCents: number;
  expenseType?: ExpenseType;
  expensePaidStatus?: ExpensePaidStatus;
}

export interface ExpenseUpdateInput {
  purpose?: string;
  amountCents?: number;
  expenseType?: ExpenseType;
  expensePaidStatus?: ExpensePaidStatus;
  teamMemberId?: number | null;
}

const QUERY_KEY = ["expense"];

export function useExpense(projectId?: number) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const queryKey = projectId !== undefined ? [...QUERY_KEY, projectId] : QUERY_KEY;

  const { data: expense = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const url = projectId !== undefined ? `/api/expense?projectId=${projectId}` : "/api/expense";
      const res = await get<Expense[]>(url);
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const onErr = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const r = await post<Expense>("/api/expense", input);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Expense logged" });
    },
    onError: onErr,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ expenseId, ...input }: ExpenseUpdateInput & { expenseId: number }) => {
      const r = await patch(`/api/expense/${expenseId}`, input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Expense updated" });
    },
    onError: onErr,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await del(`/api/expense/${id}`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Expense deleted" });
    },
    onError: onErr,
  });

  return {
    expense,
    isLoading,
    createExpense: createMutation.mutateAsync,
    updateExpense: updateMutation.mutateAsync,
    deleteExpense: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
