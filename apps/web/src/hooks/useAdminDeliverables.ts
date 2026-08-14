import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type DeliverableStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed"
  | "blocked";

export interface DeliverableAssignee {
  team_member_id: number;
  name: string;
  role: string;
  avatar_url?: string;
}

export interface Deliverable {
  deliverable_id: number;
  project_id: number;
  assigned_to: number | null;
  title: string;
  description?: string;
  status: DeliverableStatus;
  priority: number;
  due_date?: string | null;
  /** ISO timestamp when team verified; null/undefined = unverified. */
  verified_at?: string | null;
  project?: { title: string };
  assignee?: DeliverableAssignee;
}

export interface DeliverableInput {
  project_id: number;
  title: string;
  description?: string;
  assigned_to?: number | null;
  status: DeliverableStatus;
  priority: number;
  due_date?: string | null;
}

function mapDeliverable(t: Record<string, unknown>): Deliverable {
  return {
    deliverable_id: (t.deliverableId ?? t.deliverable_id) as number,
    project_id: (t.projectId ?? t.project_id) as number,
    title: t.title as string,
    description: (t.description ?? undefined) as string | undefined,
    status: ((t.status as DeliverableStatus) || "not_started") as DeliverableStatus,
    priority: (t.priority as number) || 0,
    due_date: (t.dueDate ?? t.due_date ?? null) as string | null,
    verified_at: (t.verifiedAt ?? t.verified_at ?? null) as string | null,
    assigned_to: (t.assignedTo ?? t.assigned_to ?? null) as number | null,
    project: t.project as { title: string } | undefined,
    assignee: (t.assignee ?? t.team_member) as DeliverableAssignee | undefined,
  };
}

// camelCase for the API (Zod silently drops snake_case fields).
function toApiPayload(input: DeliverableInput) {
  return {
    projectId: input.project_id,
    title: input.title,
    description: input.description || null,
    assignedTo: input.assigned_to ?? null,
    status: input.status,
    priority: input.priority,
    dueDate: input.due_date || null,
  };
}

const QUERY_KEY = ["adminDeliverables"];

async function fetchDeliverables(): Promise<Deliverable[]> {
  const res = await get<Record<string, unknown>[]>("/api/deliverables");
  return (res.data || []).map(mapDeliverable);
}

export function useAdminDeliverables() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDeliverables,
    staleTime: 2 * 60 * 1000,
  });

  // Refetch the joined list (project + assignee) — POST/PATCH return only the
  // bare row, so we re-pull rather than reconstruct the joins client-side.
  const createMutation = useMutation({
    mutationFn: async (input: DeliverableInput) => {
      const res = await post<Record<string, unknown>>("/api/deliverables", toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Created", description: "Deliverable added" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: DeliverableInput }) => {
      const res = await patch<Record<string, unknown>>(`/api/deliverables/${id}`, toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Updated", description: "Deliverable updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Quick inline status change — optimistic, patches only the status.
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: DeliverableStatus }) => {
      const res = await patch(`/api/deliverables/${id}`, { status });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<Deliverable[]>(QUERY_KEY);
      queryClient.setQueryData<Deliverable[]>(QUERY_KEY, (old = []) =>
        old.map((d) => (d.deliverable_id === id ? { ...d, status } : d)),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Team QA verify / unverify — sets or clears verified_at only.
  const verifyMutation = useMutation({
    mutationFn: async ({ id, verified }: { id: number; verified: boolean }) => {
      const res = await patch(`/api/deliverables/${id}`, {
        verifiedAt: verified ? new Date().toISOString() : null,
      });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ id, verified }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<Deliverable[]>(QUERY_KEY);
      queryClient.setQueryData<Deliverable[]>(QUERY_KEY, (old = []) =>
        old.map((d) =>
          d.deliverable_id === id
            ? { ...d, verified_at: verified ? new Date().toISOString() : null }
            : d,
        ),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: (_data, { verified }) =>
      toast({
        title: verified ? "Verified" : "Verification cleared",
        description: verified ? "Deliverable marked verified" : "Deliverable unverified",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await del(`/api/deliverables/${id}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<Deliverable[]>(QUERY_KEY);
      queryClient.setQueryData<Deliverable[]>(QUERY_KEY, (old = []) =>
        old.filter((d) => d.deliverable_id !== id),
      );
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Deleted", description: "Deliverable removed" }),
  });

  return {
    deliverables,
    isLoading,
    createDeliverable: createMutation.mutateAsync,
    updateDeliverable: (id: number, input: DeliverableInput) =>
      updateMutation.mutateAsync({ id, input }),
    updateStatus: (id: number, status: DeliverableStatus) =>
      statusMutation.mutateAsync({ id, status }),
    /** Set or clear verified_at (team QA). Does not change status. */
    setVerified: (id: number, verified: boolean) =>
      verifyMutation.mutateAsync({ id, verified }),
    deleteDeliverable: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
