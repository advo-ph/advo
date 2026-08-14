import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

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

/** Client-safe fields from GET /api/contracts/mine (no notes / value). */
export interface ClientContract {
  contractId: number;
  title: string;
  status: string;
  contractType: string;
  signedAt: string | null;
  documentUrl: string | null;
  projectId: number | null;
}

const QUERY_KEY = ["contracts"];
const MINE_QUERY_KEY = ["contract", "mine"];

/** Hub: signed contracts for the logged-in client (or all for team). */
export function useMyContracts() {
  const { user } = useAuth();

  const { data: contract = [], isLoading } = useQuery({
    queryKey: [...MINE_QUERY_KEY, user?.id],
    queryFn: async () => {
      const res = await get<ClientContract[]>("/api/contracts/mine");
      return res.data || [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  return { contract, isLoading };
}

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: MINE_QUERY_KEY });
  };
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
