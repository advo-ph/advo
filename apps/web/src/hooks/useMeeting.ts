import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// Mirrors /api/meeting row (drizzle camelCase).
export interface Meeting {
  meetingId: number;
  projectId: number;
  title: string;
  recordedAt: string;
  transcript: string;
  plaudShareKey: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingInput {
  projectId: number;
  title: string;
  recordedAt: string;
  transcript: string;
  plaudShareKey?: string | null;
}

/** Response from POST /api/meeting/:id/generate-task */
export interface GenerateTaskResult {
  deliverable: Array<{
    deliverableId: number;
    projectId: number;
    title: string;
    description: string | null;
    status: string;
  }>;
  method: "ai" | "heuristic";
  meetingId: number;
  projectId: number;
}

const QUERY_KEY = ["meeting"];

/** List meetings. Optional projectId scopes the query (?projectId=). */
export function useMeeting(projectId?: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const queryKey =
    projectId != null ? [...QUERY_KEY, projectId] : [...QUERY_KEY, "all"];

  const { data: meeting = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const path =
        projectId != null
          ? `/api/meeting?projectId=${projectId}`
          : "/api/meeting";
      const res = await get<Meeting[]>(path);
      return res.data || [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
  const onErr = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: MeetingInput) => {
      const r = await post("/api/meeting", input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Meeting recorded" });
    },
    onError: onErr,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: number;
      input: Partial<MeetingInput>;
    }) => {
      const r = await patch(`/api/meeting/${id}`, input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Meeting updated" });
    },
    onError: onErr,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await del(`/api/meeting/${id}`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Meeting deleted" });
    },
    onError: onErr,
  });

  const generateTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await post<GenerateTaskResult>(`/api/meeting/${id}/generate-task`);
      if (r.error) throw new Error(r.error);
      if (!r.data?.deliverable?.length) {
        throw new Error("No tasks generated from transcript");
      }
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["adminDeliverables"] });
      qc.invalidateQueries({ queryKey: ["deliverables"] });
      const n = data.deliverable.length;
      toast({
        title: `${n} task${n === 1 ? "" : "s"} created`,
        description: `Via ${data.method === "ai" ? "Claude" : "heuristic"} · project #${data.projectId}`,
      });
    },
    onError: onErr,
  });

  return {
    meeting,
    isLoading,
    createMeeting: createMutation.mutateAsync,
    updateMeeting: (id: number, input: Partial<MeetingInput>) =>
      updateMutation.mutateAsync({ id, input }),
    deleteMeeting: deleteMutation.mutateAsync,
    generateTask: generateTaskMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isGeneratingTask: generateTaskMutation.isPending,
  };
}
