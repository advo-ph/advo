import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal_sent"
  | "closed_won"
  | "closed_lost";

interface Lead {
  lead_id: number;
  name: string;
  email: string;
  company: string;
  project_type: string;
  budget: string;
  description: string;
  submitted_at: string;
  status: LeadStatus;
  assigned_to: number | null;
  notes: string | null;
}

interface TeamMemberOption {
  team_member_id: number;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(l: any): Lead {
  return {
    lead_id: l.leadId ?? l.lead_id,
    name: l.name,
    email: l.email,
    company: l.company,
    project_type: l.projectType ?? l.project_type,
    budget: l.budget,
    description: l.description,
    submitted_at: l.submittedAt ?? l.submitted_at,
    status: l.status,
    assigned_to: l.assignedTo ?? l.assigned_to,
    notes: l.notes,
  };
}

interface LeadsData {
  leads: Lead[];
  teamMembers: TeamMemberOption[];
}

async function fetchLeadsData(): Promise<LeadsData> {
  const [leadsRes, teamRes] = await Promise.all([
    get<unknown[]>("/api/leads"),
    get<unknown[]>("/api/team"),
  ]);

  return {
    leads: (leadsRes.data || []).map(mapLead),
    teamMembers: (teamRes.data || [])
      .filter((t: Record<string, unknown>) => Boolean(t.isActive ?? t.is_active ?? true))
      .map((t: Record<string, unknown>) => ({
        team_member_id: (t.teamMemberId ?? t.team_member_id) as number,
        name: t.name as string,
      })),
  };
}

export function useLeads() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["leads"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: fetchLeadsData,
    staleTime: 2 * 60 * 1000,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: number; status: string }) => {
      const res = await patch(`/api/leads/${leadId}`, { status });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ leadId, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<LeadsData>(queryKey);
      queryClient.setQueryData<LeadsData>(queryKey, (old) =>
        old ? { ...old, leads: old.leads.map((l) => (l.lead_id === leadId ? { ...l, status: status as LeadStatus } : l)) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Status updated" }),
  });

  const notesMutation = useMutation({
    mutationFn: async ({ leadId, notes }: { leadId: number; notes: string }) => {
      const res = await patch(`/api/leads/${leadId}`, { notes });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ leadId, notes }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<LeadsData>(queryKey);
      queryClient.setQueryData<LeadsData>(queryKey, (old) =>
        old ? { ...old, leads: old.leads.map((l) => (l.lead_id === leadId ? { ...l, notes } : l)) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Notes saved" }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ leadId, assignedTo }: { leadId: number; assignedTo: number | null }) => {
      const res = await patch(`/api/leads/${leadId}`, { assignedTo });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ leadId, assignedTo }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<LeadsData>(queryKey);
      queryClient.setQueryData<LeadsData>(queryKey, (old) =>
        old
          ? { ...old, leads: old.leads.map((l) => (l.lead_id === leadId ? { ...l, assigned_to: assignedTo } : l)) }
          : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Error", description: "Failed to assign", variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Lead assigned" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await del(`/api/leads/${leadId}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (leadId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<LeadsData>(queryKey);
      queryClient.setQueryData<LeadsData>(queryKey, (old) =>
        old ? { ...old, leads: old.leads.filter((l) => l.lead_id !== leadId) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Error", description: "Failed to delete lead", variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Lead deleted" }),
  });

  return {
    leads: data?.leads || [],
    teamMembers: data?.teamMembers || [],
    isLoading,
    updateStatus: (leadId: number, status: string) => statusMutation.mutate({ leadId, status }),
    updateNotes: (leadId: number, notes: string) => notesMutation.mutate({ leadId, notes }),
    assignTo: (leadId: number, assignedTo: number | null) => assignMutation.mutate({ leadId, assignedTo }),
    deleteLead: (leadId: number) => deleteMutation.mutate(leadId),
  };
}
