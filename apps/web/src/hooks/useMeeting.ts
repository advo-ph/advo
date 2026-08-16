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
  summary: string | null;
  plaudFileId: string | null;
  plaudShareKey: string | null;
  isVisibleClient: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingInput {
  projectId: number;
  title: string;
  recordedAt: string;
  transcript: string;
  summary?: string | null;
  plaudFileId?: string | null;
  plaudShareKey?: string | null;
  isVisibleClient?: boolean;
}

export interface PlaudFile {
  fileId: string;
  name: string;
  startAt: string | null;
  durationMillisecond: number | null;
}

export interface ImportPlaudInput {
  projectId: number;
  fileId?: string;
  shareUrl?: string;
}

export interface ProposedTask {
  title: string;
  description: string;
  suggestedSkill: string;
  assignedTo: number | null;
  assigneeName: string | null;
  ownerRaw: string | null;
  projectId: number | null;
}

export type TaskMethod = "ai" | "heuristic" | "note";

/** Response from POST /api/meeting/:id/propose-task */
export interface ProposeTaskResult {
  task: ProposedTask[];
  method: TaskMethod;
  meetingId: number;
  projectId: number;
}

/** Response from POST /api/meeting/:id/generate-task */
export interface GenerateTaskResult {
  deliverable: Array<{
    deliverableId: number;
    projectId: number;
    title: string;
    description: string | null;
    status: string;
    assignedTo: number | null;
  }>;
  task?: ProposedTask[];
  method: TaskMethod;
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
    onSuccess: (_data, vars) => {
      invalidate();
      toast({
        title:
          vars.input.isVisibleClient === true
            ? "Published to client"
            : vars.input.isVisibleClient === false
              ? "Unpublished"
              : "Meeting updated",
      });
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

  const importMutation = useMutation({
    mutationFn: async (input: ImportPlaudInput) => {
      const r = await post<{ meeting: Meeting; created: boolean }>("/api/meeting/import", input);
      if (r.error) throw new Error(r.error);
      if (!r.data?.meeting) throw new Error("Import returned no meeting");
      return r.data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: data.created ? "Imported from Plaud" : "Updated from Plaud",
        description: data.meeting.title,
      });
    },
    onError: onErr,
  });

  const proposeTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await post<ProposeTaskResult>(`/api/meeting/${id}/propose-task`, {});
      if (r.error) throw new Error(r.error);
      if (!r.data?.task?.length) {
        throw new Error("No tasks generated from transcript");
      }
      return r.data;
    },
    onError: onErr,
  });

  const generateTaskMutation = useMutation({
    mutationFn: async (input: {
      id: number;
      task?: ProposedTask[];
      method?: TaskMethod;
    }) => {
      const r = await post<GenerateTaskResult>(`/api/meeting/${input.id}/generate-task`, {
        task: input.task,
        method: input.method,
      });
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
      const via =
        data.method === "ai" ? "Claude" : data.method === "note" ? "Plaud note" : "heuristic";
      const assigned = data.deliverable.filter((d) => d.assignedTo != null).length;
      toast({
        title: `${n} deliverable${n === 1 ? "" : "s"} created`,
        description: `Via ${via} · ${assigned} assigned · project #${data.projectId}`,
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
    importPlaudMeeting: importMutation.mutateAsync,
    proposeTask: proposeTaskMutation.mutateAsync,
    generateTask: (id: number, task?: ProposedTask[], method?: TaskMethod) =>
      generateTaskMutation.mutateAsync({ id, task, method }),
    isSaving: createMutation.isPending || updateMutation.isPending,
    isImporting: importMutation.isPending,
    isGeneratingTask: generateTaskMutation.isPending || proposeTaskMutation.isPending,
  };
}

export interface PlaudSyncStatus {
  isEnabled: boolean;
  isRunning: boolean;
  intervalSecond: number;
  lastSyncAt: string | null;
  lastError: string | null;
  importedCount: number;
  skippedCount: number;
  seenCount: number;
  importedMeetingId: number[];
}

export function usePlaudSync() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: status = null, isLoading } = useQuery({
    queryKey: ["plaud-sync"],
    queryFn: async () => {
      const res = await get<PlaudSyncStatus>("/api/meeting/plaud/status");
      if (res.error) throw new Error(res.error);
      return res.data ?? null;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await post<PlaudSyncStatus>("/api/meeting/plaud/sync", {});
      if (r.error) throw new Error(r.error);
      if (!r.data) throw new Error("Sync returned no status");
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plaud-sync"] });
      qc.invalidateQueries({ queryKey: ["meeting"] });
      qc.invalidateQueries({ queryKey: ["plaud-file"] });
      toast({
        title: data.importedCount
          ? `Imported ${data.importedCount} new recording${data.importedCount === 1 ? "" : "s"}`
          : "Plaud folder is up to date",
        description: data.lastError ?? `${data.seenCount} ADVO file${data.seenCount === 1 ? "" : "s"} seen`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Plaud sync failed", description: e.message, variant: "destructive" }),
  });

  return {
    status,
    isLoading,
    syncNow: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
  };
}

/** List Plaud recordings. Default query is the ADVO folder name. */
export function usePlaudFile(query = "advo", enabled = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plaud-file", query],
    queryFn: async () => {
      const res = await get<{ file: PlaudFile[] }>(
        `/api/meeting/plaud?query=${encodeURIComponent(query)}`,
      );
      if (res.error) throw new Error(res.error);
      return res.data?.file ?? [];
    },
    enabled: !!user && enabled,
    staleTime: 30 * 1000,
  });
}
