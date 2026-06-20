import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Mirrors the /api/contracts row (drizzle returns camelCase keys).
export interface Contract {
  contractId: number;
  clientId: number;
  projectId: number | null;
  title: string;
  contractType: string;
  status: string;
  valueCents: number;
  signedAt: string | null;
  expiresAt: string | null;
  documentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractInput {
  clientId: number;
  projectId?: number | null;
  title: string;
  contractType: string;
  status: string;
  valueCents: number;
  signedAt?: string | null;
  expiresAt?: string | null;
  documentUrl?: string | null;
  notes?: string | null;
}

const QUERY_KEY = ["contracts"];

export function useContracts() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await get<Contract[]>("/api/contracts");
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const onErr = (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: ContractInput) => {
      const r = await post("/api/contracts", input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contract added" });
    },
    onError: onErr,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: Partial<ContractInput> }) => {
      const r = await patch(`/api/contracts/${id}`, input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contract updated" });
    },
    onError: onErr,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await del(`/api/contracts/${id}`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contract deleted" });
    },
    onError: onErr,
  });

  return {
    contracts,
    isLoading,
    createContract: createMutation.mutateAsync,
    updateContract: (id: number, input: Partial<ContractInput>) =>
      updateMutation.mutateAsync({ id, input }),
    deleteContract: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
