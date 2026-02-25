import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { triggerNotification } from "@/lib/notifications";

export type InvoiceStatus = "unpaid" | "paid" | "overdue";

export interface Invoice {
  invoice_id: number;
  project_id: number;
  amount_cents: number;
  label: string;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

/* ─── Query Function ─────────────────────────────────────── */

async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoice")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Invoice[]) || [];
}

/* ─── Hook ───────────────────────────────────────────────── */

export function useInvoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["invoices"];

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchInvoices,
  });

  /* ─── Create Invoice ────────────────────────────────────── */

  const createMutation = useMutation({
    mutationFn: async (
      payload: Omit<Invoice, "invoice_id" | "created_at" | "paid_at">
    ) => {
      const { data, error } = await supabase
        .from("invoice")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Invoice;
    },
    onSuccess: async (newInvoice) => {
      queryClient.setQueryData<Invoice[]>(QUERY_KEY, (old) => [
        newInvoice,
        ...(old || []),
      ]);
      toast({ title: "Created", description: `Invoice "${newInvoice.label}" created` });

      // Fire-and-forget: notify client about new invoice
      const { data: project } = await supabase
        .from("project")
        .select("client_id, title")
        .eq("project_id", newInvoice.project_id)
        .single();

      if (project?.client_id) {
        triggerNotification({
          client_id: project.client_id,
          project_id: newInvoice.project_id,
          title: `Invoice: ${newInvoice.label}`,
          body: `A new invoice for ₱${(newInvoice.amount_cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })} has been issued for ${project.title}.`,
          type: "invoice_issued",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  /* ─── Toggle Status (optimistic) ────────────────────────── */

  const statusMutation = useMutation({
    mutationFn: async ({
      invoiceId,
      status,
    }: {
      invoiceId: number;
      status: InvoiceStatus;
    }) => {
      const payload: Record<string, unknown> = { status };
      if (status === "paid") {
        payload.paid_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("invoice")
        .update(payload)
        .eq("invoice_id", invoiceId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ invoiceId, status }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Invoice[]>(QUERY_KEY);

      queryClient.setQueryData<Invoice[]>(QUERY_KEY, (old) =>
        (old || []).map((inv) =>
          inv.invoice_id === invoiceId
            ? {
                ...inv,
                status,
                paid_at: status === "paid" ? new Date().toISOString() : inv.paid_at,
              }
            : inv
        )
      );

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast({
        title: "Error",
        description: "Failed to update invoice status",
        variant: "destructive",
      });
    },
  });

  /* ─── Delete Invoice (optimistic) ───────────────────────── */

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const { error } = await supabase
        .from("invoice")
        .delete()
        .eq("invoice_id", invoiceId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (invoiceId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Invoice[]>(QUERY_KEY);

      queryClient.setQueryData<Invoice[]>(QUERY_KEY, (old) =>
        (old || []).filter((inv) => inv.invoice_id !== invoiceId)
      );

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast({
        title: "Error",
        description: "Failed to delete invoice",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Invoice removed" });
    },
  });

  return {
    invoices,
    isLoading,
    createInvoice: createMutation.mutate,
    toggleStatus: statusMutation.mutate,
    deleteInvoice: deleteMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
