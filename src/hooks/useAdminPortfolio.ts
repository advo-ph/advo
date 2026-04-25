import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface CaseStudy {
  overview?: string;
  challenge?: string;
  solution?: string;
  results?: string[];
  github_url?: string;
}

export interface PortfolioProject {
  portfolio_project_id: number;
  title: string;
  slug: string | null;
  description: string | null;
  preview_url: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  tech_stack: string[] | null;
  is_featured: boolean;
  display_order: number;
  case_study: CaseStudy | null;
  created_at: string;
}

function mapPortfolio(p: Record<string, unknown>): PortfolioProject {
  return {
    portfolio_project_id: (p.portfolioProjectId ?? p.portfolio_project_id) as number,
    title: p.title as string,
    slug: (p.slug as string) || null,
    description: (p.description as string) || null,
    preview_url: (p.previewUrl ?? p.preview_url ?? null) as string | null,
    image_url: (p.imageUrl ?? p.image_url ?? null) as string | null,
    image_urls: (p.imageUrls ?? p.image_urls ?? null) as string[] | null,
    tech_stack: (p.techStack ?? p.tech_stack ?? null) as string[] | null,
    is_featured: Boolean(p.isFeatured ?? p.is_featured),
    display_order: Number(p.displayOrder ?? p.display_order ?? 0),
    case_study: (p.caseStudy ?? p.case_study ?? null) as CaseStudy | null,
    created_at: (p.createdAt ?? p.created_at) as string,
  };
}

export interface PortfolioInput {
  title: string;
  slug?: string;
  description?: string;
  preview_url?: string;
  image_url?: string;
  image_urls?: string[];
  tech_stack?: string[];
  is_featured?: boolean;
  display_order?: number;
  case_study?: CaseStudy | null;
}

// Convert snake_case input → camelCase API payload
function toApiPayload(input: PortfolioInput) {
  return {
    title: input.title,
    slug: input.slug,
    description: input.description || undefined,
    previewUrl: input.preview_url || undefined,
    imageUrl: input.image_url || undefined,
    imageUrls: input.image_urls,
    techStack: input.tech_stack,
    isFeatured: input.is_featured,
    displayOrder: input.display_order,
    caseStudy: input.case_study || undefined,
  };
}

const QUERY_KEY = ["adminPortfolio"];

async function fetchPortfolio(): Promise<PortfolioProject[]> {
  const res = await get<Record<string, unknown>[]>("/api/content/portfolio");
  return (res.data || []).map(mapPortfolio);
}

export function useAdminPortfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPortfolio,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: PortfolioInput) => {
      const res = await post<Record<string, unknown>>(
        "/api/content/portfolio",
        toApiPayload(input),
      );
      if (res.error) throw new Error(res.error);
      return mapPortfolio(res.data!);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<PortfolioProject[]>(QUERY_KEY, (old = []) => [
        ...old,
        created,
      ]);
      toast({ title: "Created", description: `${created.title} added to portfolio` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PortfolioInput }) => {
      const res = await patch<Record<string, unknown>>(
        `/api/content/portfolio/${id}`,
        toApiPayload(input),
      );
      if (res.error) throw new Error(res.error);
      return mapPortfolio(res.data!);
    },
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<PortfolioProject[]>(QUERY_KEY);
      queryClient.setQueryData<PortfolioProject[]>(QUERY_KEY, (old = []) =>
        old.map((p) =>
          p.portfolio_project_id === id ? { ...p, ...mapPortfolio(toApiPayload(input) as Record<string, unknown>) } : p,
        ),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: (updated) => {
      // Replace optimistic with server-truth
      queryClient.setQueryData<PortfolioProject[]>(QUERY_KEY, (old = []) =>
        old.map((p) => (p.portfolio_project_id === updated.portfolio_project_id ? updated : p)),
      );
      toast({ title: "Updated", description: `${updated.title} updated` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await del(`/api/content/portfolio/${id}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<PortfolioProject[]>(QUERY_KEY);
      const removed = prev?.find((p) => p.portfolio_project_id === id);
      queryClient.setQueryData<PortfolioProject[]>(QUERY_KEY, (old = []) =>
        old.filter((p) => p.portfolio_project_id !== id),
      );
      return { prev, removed };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: (_data, _id, ctx) => {
      toast({ title: "Deleted", description: `${ctx?.removed?.title || "Project"} removed` });
    },
  });

  return {
    projects,
    isLoading,
    createPortfolio: createMutation.mutateAsync,
    updatePortfolio: (id: number, input: PortfolioInput) =>
      updateMutation.mutateAsync({ id, input }),
    deletePortfolio: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
