import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SiteSection {
  section_id: string;
  label: string;
  visible_public: boolean;
  visible_client_portal: boolean;
  content: Record<string, unknown> | null;
  updated_at: string;
}

/* ─── Query Function ─────────────────────────────────────── */

async function fetchSections(): Promise<SiteSection[]> {
  const { data, error } = await supabase
    .from("site_content")
    .select("*")
    .order("section_id");

  if (error) throw new Error(error.message);
  return (data as unknown as SiteSection[]) || [];
}

/* ─── Hook ───────────────────────────────────────────────── */

export function useSiteContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["siteContent"];

  const {
    data: sections = [],
    isLoading,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSections,
  });

  /* ─── Toggle Mutation (optimistic) ──────────────────────── */

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
      const { error } = await supabase
        .from("site_content")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("section_id", sectionId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ sectionId, field, value }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<SiteSection[]>(QUERY_KEY);

      queryClient.setQueryData<SiteSection[]>(QUERY_KEY, (old) =>
        (old || []).map((sec) =>
          sec.section_id === sectionId ? { ...sec, [field]: value } : sec
        )
      );

      return { previous };
    },
    onError: (_error, { sectionId, field }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast({
        title: "Failed to update",
        description: `Could not toggle ${field} for ${sectionId}`,
        variant: "destructive",
      });
    },
  });

  /* ─── Content Update Mutation (optimistic) ──────────────── */

  const contentMutation = useMutation({
    mutationFn: async ({
      sectionId,
      content,
    }: {
      sectionId: string;
      content: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("site_content")
        .update({
          content: content as unknown as string,
          updated_at: new Date().toISOString(),
        })
        .eq("section_id", sectionId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ sectionId, content }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<SiteSection[]>(QUERY_KEY);

      queryClient.setQueryData<SiteSection[]>(QUERY_KEY, (old) =>
        (old || []).map((sec) =>
          sec.section_id === sectionId ? { ...sec, content } : sec
        )
      );

      return { previous };
    },
    onError: (_error, { sectionId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast({
        title: "Failed to save content",
        description: `Could not update content for ${sectionId}`,
        variant: "destructive",
      });
    },
    onSuccess: (_data, { sectionId }) => {
      toast({ title: "Saved", description: `${sectionId} content updated` });
    },
  });

  /* ─── Public API ────────────────────────────────────────── */

  const toggle = (
    sectionId: string,
    field: "visible_public" | "visible_client_portal",
    value: boolean
  ) => {
    toggleMutation.mutate({ sectionId, field, value });
  };

  const updateContent = (
    sectionId: string,
    content: Record<string, unknown>
  ) => {
    contentMutation.mutate({ sectionId, content });
  };

  const getSection = (sectionId: string) =>
    sections.find((s) => s.section_id === sectionId);

  return { sections, isLoading, toggle, updateContent, getSection };
}
