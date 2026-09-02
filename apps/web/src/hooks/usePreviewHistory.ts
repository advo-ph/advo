import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** Mirrors preview_link (migration 026). */
export interface PreviewLinkRow {
  previewLinkId: number;
  projectId: number;
  url: string;
  issuedByUserId: number | null;
  issuedAt: string;
  expiresAt: string | null;
  note: string | null;
}

/** Every preview link ever minted for a project, newest first. */
export function usePreviewHistory(projectId: number | null) {
  const { user } = useAuth();
  const { data: previewLink = [], isLoading } = useQuery({
    queryKey: ["preview-link", projectId],
    queryFn: async () => {
      const res = await get<PreviewLinkRow[]>(`/api/projects/${projectId}/preview-link`);
      return res.data || [];
    },
    enabled: Boolean(user) && projectId != null,
    staleTime: 60 * 1000,
  });
  return { previewLink, isLoading };
}
