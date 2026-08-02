import { useMutation, useQuery } from "@tanstack/react-query";
import { post, get } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface PreviewLink {
  url: string;
  /** Pretty frontend path, e.g. `/p/<token>` (optional for older API responses). */
  publicPath?: string;
  expiresAt: string;
  ttlMinutes: number;
}

export interface PreviewRequest {
  activityId: number;
  userId: number | null;
  createdAt: string;
}

// Admin/team: generate an expiring "Show Client Now" link + see client requests.
export function useProjectPreview(projectId: number) {
  const linkMutation = useMutation({
    mutationFn: async (): Promise<PreviewLink> => {
      const res = await post<PreviewLink>(`/api/projects/${projectId}/preview-link`, {});
      if (res.error || !res.data) throw new Error(res.error || "Could not generate a link");
      return res.data;
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["previewRequests", projectId],
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
  const mutation = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await post(`/api/projects/${projectId}/preview-request`, {});
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () =>
      toast({ title: "Preview requested", description: "The ADVO team has been notified." }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return { requestPreview: mutation.mutateAsync, isRequesting: mutation.isPending };
}
