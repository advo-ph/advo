import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface SocialPost {
  social_post_id: number;
  platform: string;
  content: string;
  image_url: string | null;
  scheduled_for: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

function mapPost(p: Record<string, unknown>): SocialPost {
  return {
    social_post_id: (p.socialPostId ?? p.social_post_id) as number,
    platform: p.platform as string,
    content: p.content as string,
    image_url: (p.imageUrl ?? p.image_url ?? null) as string | null,
    scheduled_for: (p.scheduledFor ?? p.scheduled_for ?? null) as string | null,
    is_published: Boolean(p.isPublished ?? p.is_published),
    published_at: (p.publishedAt ?? p.published_at ?? null) as string | null,
    created_at: (p.createdAt ?? p.created_at) as string,
  };
}

export interface SocialPostInput {
  platform: string;
  content: string;
  image_url?: string;
  scheduled_for?: string;
}

function toApiPayload(input: SocialPostInput) {
  return {
    platform: input.platform,
    content: input.content,
    imageUrl: input.image_url || undefined,
    scheduledFor: input.scheduled_for || undefined,
  };
}

const QUERY_KEY = ["adminSocial"];

async function fetchPosts(): Promise<SocialPost[]> {
  const res = await get<Record<string, unknown>[]>("/api/content/social");
  return (res.data || []).map(mapPost);
}

export function useAdminSocial() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPosts,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: SocialPostInput) => {
      const res = await post<Record<string, unknown>>(
        "/api/content/social",
        toApiPayload(input),
      );
      if (res.error) throw new Error(res.error);
      return mapPost(res.data!);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<SocialPost[]>(QUERY_KEY, (old = []) => [...old, created]);
      toast({ title: "Created", description: "Post scheduled successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: SocialPostInput }) => {
      const res = await patch<Record<string, unknown>>(
        `/api/content/social/${id}`,
        toApiPayload(input),
      );
      if (res.error) throw new Error(res.error);
      return mapPost(res.data!);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SocialPost[]>(QUERY_KEY, (old = []) =>
        old.map((p) => (p.social_post_id === updated.social_post_id ? updated : p)),
      );
      toast({ title: "Updated", description: "Post updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await del(`/api/content/social/${id}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<SocialPost[]>(QUERY_KEY);
      queryClient.setQueryData<SocialPost[]>(QUERY_KEY, (old = []) =>
        old.filter((p) => p.social_post_id !== id),
      );
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Deleted", description: "Post removed" }),
  });

  return {
    posts,
    isLoading,
    createPost: createMutation.mutateAsync,
    updatePost: (id: number, input: SocialPostInput) =>
      updateMutation.mutateAsync({ id, input }),
    deletePost: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
