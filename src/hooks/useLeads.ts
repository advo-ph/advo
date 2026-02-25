import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal_sent"
  | "closed_won"
  | "closed_lost";

export interface LeadRow {
  lead_id: number;
  name: string;
  email: string;
  company: string | null;
  project_type: string | null;
  budget: string | null;
  description: string | null;
  submitted_at: string;
  status: LeadStatus;
  assigned_to: number | null;
  notes: string | null;
}

export interface TeamMemberOption {
  team_member_id: number;
  name: string;
}

/* ─── Query Functions ─────────────────────────────────────── */

interface LeadsData {
  leads: LeadRow[];
  teamMembers: TeamMemberOption[];
}

async function fetchLeadsData(): Promise<LeadsData> {
  const [leadRes, memberRes] = await Promise.all([
    supabase
      .from("lead")
      .select("*")
      .order("submitted_at", { ascending: false }),
    supabase.from("team_member").select("team_member_id, name").order("name"),
  ]);

  if (leadRes.error) throw new Error(leadRes.error.message);

  return {
    leads: (leadRes.data || []) as unknown as LeadRow[],
    teamMembers: (memberRes.data || []) as TeamMemberOption[],
  };
}

/* ─── Hook ───────────────────────────────────────────────── */

export function useLeads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["leads"];

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLeadsData,
  });

  const leads = data?.leads ?? [];
  const teamMembers = data?.teamMembers ?? [];

  /* ─── Update Status (optimistic) ────────────────────────── */

  const statusMutation = useMutation({
    mutationFn: async ({
      leadId,
      status,
    }: {
      leadId: number;
      status: LeadStatus;
    }) => {
      const { error } = await supabase
        .from("lead")
        .update({ status } as Record<string, unknown>)
        .eq("lead_id", leadId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ leadId, status }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<LeadsData>(QUERY_KEY);

      queryClient.setQueryData<LeadsData>(QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              leads: old.leads.map((l) =>
                l.lead_id === leadId ? { ...l, status } : l
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  /* ─── Update Notes (optimistic) ─────────────────────────── */

  const notesMutation = useMutation({
    mutationFn: async ({
      leadId,
      notes,
    }: {
      leadId: number;
      notes: string;
    }) => {
      const { error } = await supabase
        .from("lead")
        .update({ notes } as Record<string, unknown>)
        .eq("lead_id", leadId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ leadId, notes }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<LeadsData>(QUERY_KEY);

      queryClient.setQueryData<LeadsData>(QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              leads: old.leads.map((l) =>
                l.lead_id === leadId ? { ...l, notes } : l
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Notes updated" });
    },
  });

  /* ─── Assign To (optimistic) ────────────────────────────── */

  const assignMutation = useMutation({
    mutationFn: async ({
      leadId,
      assignedTo,
    }: {
      leadId: number;
      assignedTo: number | null;
    }) => {
      const { error } = await supabase
        .from("lead")
        .update({ assigned_to: assignedTo } as Record<string, unknown>)
        .eq("lead_id", leadId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ leadId, assignedTo }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<LeadsData>(QUERY_KEY);

      queryClient.setQueryData<LeadsData>(QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              leads: old.leads.map((l) =>
                l.lead_id === leadId ? { ...l, assigned_to: assignedTo } : l
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast({ title: "Error", description: "Failed to assign", variant: "destructive" });
    },
  });

  /* ─── Delete Lead ───────────────────────────────────────── */

  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const { error } = await supabase
        .from("lead")
        .delete()
        .eq("lead_id", leadId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (leadId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<LeadsData>(QUERY_KEY);

      queryClient.setQueryData<LeadsData>(QUERY_KEY, (old) =>
        old
          ? { ...old, leads: old.leads.filter((l) => l.lead_id !== leadId) }
          : old
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast({ title: "Error", description: "Failed to delete lead", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Lead removed" });
    },
  });

  return {
    leads,
    teamMembers,
    isLoading,
    updateStatus: statusMutation.mutate,
    updateNotes: notesMutation.mutate,
    assignTo: assignMutation.mutate,
    deleteLead: deleteMutation.mutate,
  };
}
