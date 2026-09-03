import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type DeliverableStatus =
  | "todo"
  | "ongoing"
  | "review"
  | "finished";

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
  attachment_url: string | null;
  comment_count: number;
  has_unread_comments: boolean;
}

export interface DeliverableInput {
  project_id: number;
  title: string;
  description?: string;
  assigned_to?: number | null;
  status: DeliverableStatus;
  priority: number;
  due_date?: string | null;
  attachment_url?: string | null;
}

export interface DeliverableComment {
  commentId: number;
  body: string;
  authorName: string;
  createdAt: string;
}

function mapDeliverable(t: Record<string, unknown>): Deliverable {
  return {
    deliverable_id: (t.deliverableId ?? t.deliverable_id) as number,
    project_id: (t.projectId ?? t.project_id) as number,
    title: t.title as string,
    description: (t.description ?? undefined) as string | undefined,
    status: ((t.status as DeliverableStatus) || "todo") as DeliverableStatus,
    priority: (t.priority as number) || 0,
    due_date: (t.dueDate ?? t.due_date ?? null) as string | null,
    verified_at: (t.verifiedAt ?? t.verified_at ?? null) as string | null,
    assigned_to: (t.assignedTo ?? t.assigned_to ?? null) as number | null,
    project: t.project as { title: string } | undefined,
    assignee: (t.assignee ?? t.team_member) as DeliverableAssignee | undefined,
    attachment_url: (t.attachmentUrl ?? t.attachment_url ?? null) as string | null,
    comment_count: ((t.commentCount ?? t.comment_count ?? 0) as number),
    has_unread_comments: ((t.hasUnreadComments ?? t.has_unread_comments ?? false) as boolean),
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
    ...(input.attachment_url !== undefined ? { attachmentUrl: input.attachment_url } : {}),
  };
}

const QUERY_KEY = ["adminDeliverables"];

interface FetchResult {
  deliverables: Deliverable[];
  viewerTeamMemberId: number | null;
}

async function fetchDeliverables(): Promise<FetchResult> {
  const res = await get<{ deliverables: Record<string, unknown>[]; viewerTeamMemberId: number | null }>("/api/deliverables");
  const payload = res.data;
  return {
    deliverables: (payload?.deliverables || []).map(mapDeliverable),
    viewerTeamMemberId: payload?.viewerTeamMemberId ?? null,
  };
}

// ─── Comments query ───────────────────────────────────────────────────────────

/** Fetch comments for a specific deliverable. Pass null to disable. */
export function useDeliverableComments(id: number | null) {
  return useQuery({
    queryKey: ["deliverableComments", id],
    queryFn: async () => {
      const res = await get<{ comments: DeliverableComment[] }>(`/api/deliverables/${id}/comments`);
      if (res.error) throw new Error(res.error);
      return res.data?.comments ?? [];
    },
    enabled: id !== null,
    staleTime: 30 * 1000,
  });
}

export function useAdminDeliverables() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDeliverables,
    staleTime: 2 * 60 * 1000,
  });

  const deliverables = data?.deliverables ?? [];
  const viewerTeamMemberId = data?.viewerTeamMemberId ?? null;

  /**
   * A deliverable with a due date IS a calendar event — GET /api/calendar derives one
   * from every row. The two pages therefore cannot hold independent caches: creating a
   * deliverable on this page used to leave the Calendar showing the world before it.
   *
   * The calendar key is ["calendar", from, to], one entry per month viewed, so this
   * invalidates by prefix rather than naming a range.
   */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  // Refetch the joined list (project + assignee) — POST/PATCH return only the
  // bare row, so we re-pull rather than reconstruct the joins client-side.
  const createMutation = useMutation({
    mutationFn: async (input: DeliverableInput) => {
      const res = await post<Record<string, unknown>>("/api/deliverables", toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      invalidateAll();
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
      invalidateAll();
      toast({ title: "Updated", description: "Deliverable updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Quick inline status change — optimistic, patches status (and optionally attachmentUrl).
  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      extra,
    }: {
      id: number;
      status: DeliverableStatus;
      extra?: { attachmentUrl?: string | null };
    }) => {
      const res = await patch(`/api/deliverables/${id}`, { status, ...extra });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<FetchResult>(QUERY_KEY);
      queryClient.setQueryData<FetchResult>(QUERY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          deliverables: old.deliverables.map((d) => (d.deliverable_id === id ? { ...d, status } : d)),
        };
      });
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    // The optimistic patch sets `status` and nothing else, but the server also writes
    // completed_at on the transition. Without this refetch the UI kept showing the row
    // as it guessed it, never as it is, and completed_at was invisible forever.
    onSettled: () => invalidateAll(),
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
      const prev = queryClient.getQueryData<FetchResult>(QUERY_KEY);
      queryClient.setQueryData<FetchResult>(QUERY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          deliverables: old.deliverables.map((d) =>
            d.deliverable_id === id
              ? { ...d, verified_at: verified ? new Date().toISOString() : null }
              : d,
          ),
        };
      });
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
    onSettled: () => invalidateAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await del(`/api/deliverables/${id}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<FetchResult>(QUERY_KEY);
      queryClient.setQueryData<FetchResult>(QUERY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          deliverables: old.deliverables.filter((d) => d.deliverable_id !== id),
        };
      });
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Deleted", description: "Deliverable removed" }),
    onSettled: () => invalidateAll(),
  });

  // Add a comment — server moves task back to ongoing.
  const addCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const res = await post(`/api/deliverables/${id}/comments`, { body });
      if (res.error) throw new Error(res.error as string);
    },
    onSuccess: (_data, { id }) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["deliverableComments", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Mark comments read.
  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await post(`/api/deliverables/${id}/comments/read`);
      if (res.error) throw new Error(res.error as string);
    },
    onSuccess: (_data, id) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["deliverableComments", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return {
    deliverables,
    viewerTeamMemberId,
    isLoading,
    createDeliverable: createMutation.mutateAsync,
    updateDeliverable: (id: number, input: DeliverableInput) =>
      updateMutation.mutateAsync({ id, input }),
    updateStatus: (
      id: number,
      status: DeliverableStatus,
      extra?: { attachmentUrl?: string | null },
    ) => statusMutation.mutateAsync({ id, status, extra }),
    /** Set or clear verified_at (team QA). Does not change status. */
    setVerified: (id: number, verified: boolean) =>
      verifyMutation.mutateAsync({ id, verified }),
    deleteDeliverable: deleteMutation.mutateAsync,
    addComment: (id: number, body: string) => addCommentMutation.mutateAsync({ id, body }),
    markCommentsRead: (id: number) => markReadMutation.mutateAsync(id),
    isSaving: createMutation.isPending || updateMutation.isPending,
    isAddingComment: addCommentMutation.isPending,
    isMarkingRead: markReadMutation.isPending,
  };
}
