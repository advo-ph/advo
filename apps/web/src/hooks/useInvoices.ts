import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/lib/error-text";
import { triggerNotification } from "@/lib/notifications";

export type InvoiceStatus = "unpaid" | "paid" | "overdue";

export interface Invoice {
  invoice_id: number;
  project_id: number;
  amount_cents: number;
  label: string;
  status: InvoiceStatus;
  due_date?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  /**
   * Migration 017. Null = an ordinary one-shot milestone invoice. Non-null = generated
   * by a recurring infrastructure fee, which is explicitly NOT project scope — the
   * contract states the Total Fee "does not cover the ongoing costs". Keep these out of
   * contract-value and collection aggregates, or every project inflates monthly.
   */
  recurring_fee_id?: number | null;
  period_start_on?: string | null;
  created_at: string;
  project?: { title: string; client_id: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvoice(i: any): Invoice {
  return {
    invoice_id: i.invoiceId ?? i.invoice_id,
    project_id: i.projectId ?? i.project_id,
    amount_cents: i.amountCents ?? i.amount_cents,
    label: i.label,
    status: i.status,
    due_date: i.dueDate ?? i.due_date,
    paid_at: i.paidAt ?? i.paid_at,
    notes: i.notes,
    recurring_fee_id: i.recurringFeeId ?? i.recurring_fee_id ?? null,
    period_start_on: i.periodStartOn ?? i.period_start_on ?? null,
    created_at: i.createdAt ?? i.created_at,
    project: i.project
      ? { title: i.project.title, client_id: i.project.clientId ?? i.project.client_id }
      : undefined,
  };
}

async function fetchInvoices(): Promise<Invoice[]> {
  const res = await get<unknown[]>("/api/invoices");
  return (res.data || []).map(mapInvoice);
}

export function useInvoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["invoices"];

  const { data: invoices = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchInvoices,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      project_id: number;
      amount_cents: number;
      label: string;
      due_date?: string;
      notes?: string;
    }) => {
      const res = await post<unknown>("/api/invoices", {
        projectId: payload.project_id,
        amountCents: payload.amount_cents,
        label: payload.label,
        dueDate: payload.due_date,
        notes: payload.notes,
      });
      if (res.error) throw new Error(res.error);
      return mapInvoice(res.data);
    },
    onSuccess: async (newInvoice) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Invoice created" });

      if (!newInvoice.project?.client_id) return;

      // The invoice is already saved, so a failed notification is not a failed
      // create and must not be reported as one. It is still worth saying: the
      // admin's next assumption is that the client has been told, and if this
      // failed nobody has told them.
      const notified = await triggerNotification({
        client_id: newInvoice.project.client_id,
        project_id: newInvoice.project_id,
        title: `New invoice: ${newInvoice.label}`,
        body: `An invoice for ₱${(newInvoice.amount_cents / 100).toFixed(2)} has been issued.`,
        type: "invoice_issued",
      });

      if (!notified.ok) {
        toast({
          title: "Invoice saved, client not notified",
          description: `${notified.error}. Send them the invoice another way.`,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      // Show what the server said. Now that Postgres constraint violations map
      // to real statuses and real sentences, "Failed to create invoice" would
      // be throwing away the only useful part of the response.
      toast({
        title: "Invoice not created",
        description: errorText(err, "The invoice was not saved. Try again."),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: number; status: string }) => {
      const res = await patch(`/api/invoices/${invoiceId}`, { status });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ invoiceId, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Invoice[]>(queryKey);
      // Only `status` is guessed, because only `status` is something we actually
      // know. `paid_at` used to be filled in here with `new Date()` off the
      // BROWSER's clock while the server wrote its own, so the UI displayed a
      // payment timestamp that had never been in the database and did not match
      // the one that was. A wrong number shown confidently is worse than a
      // stale one: the real value arrives via onSettled a moment later.
      queryClient.setQueryData<Invoice[]>(queryKey, (old) =>
        (old || []).map((i) =>
          i.invoice_id === invoiceId ? { ...i, status: status as Invoice["status"] } : i
        )
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({
        title: "Invoice not updated",
        description: errorText(err, "The status was not saved. Try again."),
        variant: "destructive",
      });
    },
    onSuccess: () => toast({ title: "Invoice updated" }),
    // Re-read the server whether it worked or not. Success replaces the guess
    // with the truth (including the real paid_at); failure replaces the
    // rolled-back copy with whatever the server actually holds.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await del(`/api/invoices/${invoiceId}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (invoiceId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Invoice[]>(queryKey);
      queryClient.setQueryData<Invoice[]>(queryKey, (old) =>
        (old || []).filter((i) => i.invoice_id !== invoiceId)
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({
        title: "Invoice not deleted",
        description: errorText(err, "The invoice is still there. Try again."),
        variant: "destructive",
      });
    },
    onSuccess: () => toast({ title: "Invoice deleted" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    invoices,
    isLoading,
    createInvoice: createMutation.mutate,
    toggleStatus: (invoiceId: number, status: string) => statusMutation.mutate({ invoiceId, status }),
    deleteInvoice: (invoiceId: number) => deleteMutation.mutate(invoiceId),
    isCreating: createMutation.isPending,
  };
}
