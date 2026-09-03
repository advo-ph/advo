import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/lib/error-text";

export interface SiteSection {
  section_id: string;
  label: string;
  visible_public: boolean;
  visible_client_portal: boolean;
  content: Record<string, unknown>;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSection(s: any): SiteSection {
  return {
    section_id: s.sectionId ?? s.section_id,
    label: s.label,
    visible_public: s.visiblePublic ?? s.visible_public ?? true,
    visible_client_portal: s.visibleClientPortal ?? s.visible_client_portal ?? true,
    content: s.content || {},
    updated_at: s.updatedAt ?? s.updated_at,
  };
}

async function fetchSections(): Promise<SiteSection[]> {
  const res = await get<unknown[]>("/api/content/sections");
  return (res.data || []).map(mapSection);
}

export function useSiteContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["siteContent"];

  const { data: sections = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchSections,
    staleTime: 2 * 60 * 1000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      sectionId,
      field,
      value,
    }: {
      sectionId: string;
      field: "visible_public" | "visible_client_portal";
      value: boolean;
    }) => {
      // Map to camelCase for API
      const apiField = field === "visible_public" ? "visiblePublic" : "visibleClientPortal";
      const res = await patch(`/api/content/sections/${sectionId}`, { [apiField]: value });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ sectionId, field, value }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<SiteSection[]>(queryKey);
      queryClient.setQueryData<SiteSection[]>(queryKey, (old) =>
        (old || []).map((s) =>
          s.section_id === sectionId ? { ...s, [field]: value } : s
        )
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({
        title: "Visibility not changed",
        description: errorText(err, "The section is still set the way it was. Try again."),
        variant: "destructive",
      });
    },
    // This toggle decides whether a section is visible on the public site. A
    // switch that shows "on" while the database says "off" is the worst version
    // of this bug, so it re-reads on every outcome.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const contentMutation = useMutation({
    mutationFn: async ({
      sectionId,
      content,
    }: {
      sectionId: string;
      content: Record<string, unknown>;
    }) => {
      const res = await patch(`/api/content/sections/${sectionId}`, { content });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async ({ sectionId, content }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<SiteSection[]>(queryKey);
      queryClient.setQueryData<SiteSection[]>(queryKey, (old) =>
        (old || []).map((s) =>
          s.section_id === sectionId ? { ...s, content } : s
        )
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({
        title: "Content not saved",
        description: errorText(err, "Your edits were not stored. Copy them before leaving the page."),
        variant: "destructive",
      });
    },
    onSuccess: () => toast({ title: "Content saved" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    sections,
    isLoading,
    toggle: (sectionId: string, field: "visible_public" | "visible_client_portal", value: boolean) =>
      toggleMutation.mutate({ sectionId, field, value }),
    updateContent: (sectionId: string, content: Record<string, unknown>) =>
      contentMutation.mutate({ sectionId, content }),
    /** Drives the disabled state and spinner on every Save button in Content Studio. */
    isSavingContent: contentMutation.isPending,
    getSection: (sectionId: string) => sections.find((s) => s.section_id === sectionId),
  };
}
