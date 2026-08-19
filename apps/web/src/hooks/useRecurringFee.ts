import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/**
 * /api/recurring-fee — the recurring infrastructure fee (migration 017).
 *
 * Two things this hook must never do:
 *
 *   1. Recompute a grace window in the browser. Every field under `derived` is computed
 *      server-side against the Asia/Manila billing calendar, so /admin and any later
 *      client-facing view can never disagree about when a window closes.
 *   2. Treat suspension as automatic. `isSuspensionJustified` says the contractual
 *      remedy is AVAILABLE. Invoking it is an explicit admin action (`suspend`), and the
 *      API returns 409 if the predicate is false.
 *
 * Money is integer CENTS on the wire. Divide by 100 exactly once, at render time.
 */

export type RecurringFeeStatus = "active" | "paused" | "cancelled";
export type BillingInterval = "monthly" | "quarterly" | "annual";

/** Computed server-side. Nothing here is stored in the database. */
export interface RecurringFeeDerived {
  isSuspensionJustified: boolean;
  isSuspended: boolean;
  unsettledInvoiceCount: number;
  outstandingCents: number;
  daySinceDue: number | null;
  graceDayRemaining: number | null;
  nextRunOn: string;
  lastGeneratedOn: string | null;
}

export interface RecurringFee {
  recurringFeeId: number;
  projectId: number;
  label: string;
  /** Integer CENTS. FourlinQ = 300000 (PHP 3,000.00). */
  amountCents: number;
  billingInterval: BillingInterval;
  billingDayOfMonth: number;
  graceDayCount: number;
  status: RecurringFeeStatus;
  startsOn: string;
  endsOn: string | null;
  nextRunOn: string;
  lastGeneratedOn: string | null;
  isSuspensionEnabled: boolean;
  suspendedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  derived: RecurringFeeDerived;
}

export interface RecurringFeeInput {
  projectId: number;
  label: string;
  amountCents: number;
  billingInterval?: BillingInterval;
  billingDayOfMonth?: number;
  graceDayCount?: number;
  startsOn: string;
  endsOn?: string | null;
  isSuspensionEnabled?: boolean;
  note?: string | null;
}

export interface RunResult {
  generatedInvoiceId: number[];
  sweptCount: number;
  skippedCount: number;
  isComplete: boolean;
}

export function useRecurringFee() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["recurring-fee"];

  const { data: recurringFee = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await get<RecurringFee[]>("/api/recurring-fee");
      return res.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // A tick mints real invoice rows, so the invoice list is stale too.
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: RecurringFeeInput) => {
      const res = await post<RecurringFee>("/api/recurring-fee", payload);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Recurring fee created" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      recurringFeeId,
      ...payload
    }: Partial<RecurringFeeInput> & { recurringFeeId: number; status?: RecurringFeeStatus }) => {
      const res = await patch(`/api/recurring-fee/${recurringFeeId}`, payload);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Recurring fee updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (recurringFeeId: number) => {
      const res = await del(`/api/recurring-fee/${recurringFeeId}`);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      // The schedule goes; the invoices it already raised stay.
      toast({ title: "Recurring fee deleted", description: "Generated invoices were kept." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  /** Generation + overdue sweep. Idempotent — a double-click bills nothing twice. */
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await post<RunResult>("/api/recurring-fee/run", {});
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (result) => {
      invalidate();
      toast({
        title: `${result?.generatedInvoiceId.length ?? 0} invoice generated`,
        description: `${result?.skippedCount ?? 0} already billed · ${result?.sweptCount ?? 0} swept overdue`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Run failed", description: err.message, variant: "destructive" }),
  });

  /** Records the contractual remedy. The API returns 409 when it is not yet justified. */
  const suspendMutation = useMutation({
    mutationFn: async ({ recurringFeeId, isSuspend }: { recurringFeeId: number; isSuspend: boolean }) => {
      const path = `/api/recurring-fee/${recurringFeeId}/${isSuspend ? "suspend" : "resume"}`;
      const res = await post(path, {});
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Suspension state recorded",
        description: "Hosting and API access are taken down manually — nothing was automated.",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Not permitted", description: err.message, variant: "destructive" }),
  });

  const atRisk = recurringFee.filter((f) => f.derived?.isSuspensionJustified);

  return {
    recurringFee,
    atRisk,
    isLoading,
    createRecurringFee: createMutation.mutate,
    updateRecurringFee: updateMutation.mutate,
    deleteRecurringFee: deleteMutation.mutate,
    runRecurringFee: runMutation.mutate,
    setSuspended: (recurringFeeId: number, isSuspend: boolean) =>
      suspendMutation.mutate({ recurringFeeId, isSuspend }),
    isCreating: createMutation.isPending,
    isRunning: runMutation.isPending,
  };
}
