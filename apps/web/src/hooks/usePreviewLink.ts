import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { post, get } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/lib/error-text";

export interface PreviewLink {
  url: string;
  expiresAt: string;
  ttlMinutes: number;
}

export interface PreviewRequest {
  activityId: number;
  userId: number | null;
  createdAt: string;
}

/** One key, defined once, so the writer and the reader cannot drift apart. */
const previewRequestKey = (projectId: number) => ["previewRequests", projectId];

// Admin/team: generate an expiring "Show Client Now" link + see client requests.
export function useProjectPreview(projectId: number) {
  const qc = useQueryClient();

  const linkMutation = useMutation({
    mutationFn: async (): Promise<PreviewLink> => {
      const res = await post<PreviewLink>(`/api/projects/${projectId}/preview-link`, {});
      if (res.error || !res.data) throw new Error(res.error || "Could not generate a link");
      return res.data;
    },
    // Generating a link is logged server-side against the same project activity
    // the request list reads from. Without this the list below stays on
    // whatever it fetched when the panel first mounted.
    onSettled: () => qc.invalidateQueries({ queryKey: previewRequestKey(projectId) }),
  });

  const { data: requests = [] } = useQuery({
    queryKey: previewRequestKey(projectId),
    queryFn: async () => {
      const res = await get<PreviewRequest[]>(`/api/projects/${projectId}/preview-requests`);
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  return {
    generateLink: linkMutation.mutateAsync,
    link: linkMutation.data ?? null,
    isGenerating: linkMutation.isPending,
    error: linkMutation.error ? (linkMutation.error as Error).message : null,
    requests,
  };
}

// Client (or team): request a fresh preview from the Hub.
export function useRequestPreview() {
  const { toast } = useToast();
  // This POST is the thing that CREATES the rows `useProjectPreview` lists, and
  // it had no query client at all. A client would press "Request preview", get a
  // success toast, and the team's request list would show nothing until someone
  // reloaded the page.
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await post(`/api/projects/${projectId}/preview-request`, {});
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () =>
      toast({ title: "Preview requested", description: "The ADVO team has been notified." }),
    onError: (e: Error) =>
      toast({
        title: "Preview not requested",
        description: errorText(e, "The team was not notified. Try again."),
        variant: "destructive",
      }),
    onSettled: (_data, _err, projectId) =>
      qc.invalidateQueries({ queryKey: previewRequestKey(projectId) }),
  });
  return { requestPreview: mutation.mutateAsync, isRequesting: mutation.isPending };
}
