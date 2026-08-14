import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Mirrors /api/expense row (drizzle camelCase + derived isReimbursable).
export interface Expense {
  expenseId: number;
  projectId: number | null;
  purpose: string;
  authorizedBy: string;
  amountCents: number;
  location: string | null;
  receiptUrl: string | null;
  category: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  /** Derived: receipt_url is not null — never a free-floating stored flag. */
  isReimbursable: boolean;
}

export interface ExpenseInput {
  projectId?: number | null;
  purpose: string;
  authorizedBy: string;
  amountCents: number;
  location?: string | null;
  receiptUrl?: string | null;
  category?: string;
}

const QUERY_KEY = ["expense"];

export function useExpense() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: expense = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await get<Expense[]>("/api/expense");
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const onErr = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const r = await post("/api/expense", input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Expense logged" });
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
    deleteExpense: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
