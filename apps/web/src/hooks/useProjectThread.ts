import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/** Mirrors /api/project-message (migration 026). */
export interface ProjectMessage {
  projectMessageId: number;
  projectId: number;
  authorUserId: number;
  authorRole: "client" | "team" | "admin";
  authorName: string;
  body: string;
  isReadByTeam: boolean;
  isReadByClient: boolean;
  createdAt: string;
}

export interface ProjectUnread {
  projectId: number;
  unreadCount: number;
}

const QUERY_KEY = ["project-message"];

/**
 * One project's thread. Polls every 20 seconds while mounted: a client and the
 * team are rarely on the page at the same moment, so a websocket would be
 * machinery for a case that does not happen; a poll is enough and survives a
 * flaky connection on a phone.
 */
export function useProjectThread(projectId: number | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryKey = [...QUERY_KEY, projectId];

  const { data: message = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await get<ProjectMessage[]>(`/api/project-message?projectId=${projectId}`);
      return res.data || [];
    },
    enabled: Boolean(user) && projectId != null,
    refetchInterval: 20_000,
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const res = await post<ProjectMessage>("/api/project-message", { projectId, body });
      if (res.error || !res.data) throw new Error(res.error || "Could not send");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast({ title: "Not sent", description: e.message, variant: "destructive" }),
  });

  const markRead = useMutation({
    mutationFn: async () => {
      await post("/api/project-message/read", { projectId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY, "unread"] });
    },
  });

  return {
    message,
    isLoading,
    send: send.mutateAsync,
    isSending: send.isPending,
    markRead: markRead.mutate,
  };
}

/** Unread counts per project for the caller's side, for badges. */
export function useProjectUnread() {
  const { user } = useAuth();
  const { data: unread = [] } = useQuery({
    queryKey: [...QUERY_KEY, "unread"],
    queryFn: async () => {
      const res = await get<ProjectUnread[]>("/api/project-message/unread");
      return res.data || [];
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const total = unread.reduce((sum, row) => sum + row.unreadCount, 0);
  return { unread, total };
}
