import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/** Mirrors /api/change-order row (drizzle camelCase). */
export interface ChangeOrder {
  changeOrderId: number;
  projectId: number;
  scope: string;
  reason: string;
  status: string;
  priceCents: number | null;
  timelineNote: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeOrderInput {
  projectId: number;
  scope: string;
  reason: string;
}

const QUERY_KEY = ["change-order"];

/** List + file change orders. Optional projectId scopes GET (?projectId=). */
export function useChangeOrder(projectId?: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const queryKey =
    projectId != null ? [...QUERY_KEY, projectId] : [...QUERY_KEY, "all"];

  const { data: changeOrder = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const path =
        projectId != null
          ? `/api/change-order?projectId=${projectId}`
          : "/api/change-order";
      const res = await get<ChangeOrder[]>(path);
      return res.data || [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: ChangeOrderInput) => {
      const r = await post<ChangeOrder>("/api/change-order", input);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({
        title: "Change order filed",
        description: "The ADVO team can see it. Work waits until they quote and you confirm.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return {
    changeOrder,
    isLoading,
    fileChangeOrder: createMutation.mutateAsync,
    isFiling: createMutation.isPending,
  };
}
