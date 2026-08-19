import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/**
 * /api/project-signoff — the CLIENT-FACING final-delivery document.
 *
 * Never conflate this with `deliverable.verifiedAt`, which is internal team QA.
 * Nothing in this hook reads or renders verifiedAt.
 *
 * Every clock in the `derived` block is computed server-side by one shared helper,
 * so /hub and /admin can never disagree about when a window closes. Do not
 * recompute a due date or a window end in the browser.
 */

export interface SignoffDerived {
  paymentDueAt: string | null;
  revisionWindowEndsAt: string | null;
  freeRevisionUsedCount: number;
  freeRevisionRemainingCount: number;
  isFreeRevisionOpen: boolean;
  isRevisionWindowOpen: boolean;
  isPaymentOverdue: boolean;
}

/** Mirrors the project_signoff row (drizzle camelCase). */
export interface ProjectSignoff {
  projectSignoffId: number;
  projectId: number;
  contractId: number | null;
  invoiceId: number | null;
  title: string;
  scopeSummary: string;
  status: string;
  /** Integer CENTS. Divide by 100 exactly once, at render time. */
  finalPaymentCents: number;
  paymentDueDayCount: number;
  revisionWindowMonthCount: number;
  freeRevisionTotalCount: number;
  documentUrl: string | null;
  issuedAt: string | null;
  signedAt: string | null;
  signedBy: number | null;
  signedName: string | null;
  signedMethod: string;
  signedIp: string | null;
  signedUserAgent: string | null;
  /** Team-only — absent on the client read path. */
  note?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
  derived: SignoffDerived;
}

export interface SignoffRevision {
  signoffRevisionId: number;
  projectSignoffId: number;
  deliverableId: number | null;
  roundNumber: number;
  note: string;
  isPostSignoff: boolean;
  requestedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignoffDetail extends ProjectSignoff {
  revision: SignoffRevision[];
}

export interface SignoffInput {
  projectId: number;
  title: string;
  scopeSummary: string;
  /** Integer CENTS — multiply pesos by 100 exactly once, in the form. */
  finalPaymentCents: number;
  contractId?: number | null;
  paymentDueDayCount?: number;
  revisionWindowMonthCount?: number;
  freeRevisionTotalCount?: number;
  documentUrl?: string | null;
  note?: string | null;
}

const QUERY_KEY = ["project-signoff"];

/** Peso display for an integer-cents amount. The ONLY place we divide by 100. */
export function formatPeso(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function useProjectSignoff(projectId?: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const queryKey = projectId != null ? [...QUERY_KEY, projectId] : [...QUERY_KEY, "all"];

  const { data: signoff = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const path =
        projectId != null
          ? `/api/project-signoff?projectId=${projectId}`
          : "/api/project-signoff";
      const res = await get<ProjectSignoff[]>(path);
      return res.data || [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["client-data"] });
  };

  const fail = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: SignoffInput) => {
      const r = await post<ProjectSignoff>("/api/project-signoff", input);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Sign-off drafted", description: "Issue it when the build is ready." });
    },
    onError: fail,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Partial<SignoffInput>) => {
      const r = await patch<ProjectSignoff>(`/api/project-signoff/${id}`, body);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => invalidate(),
    onError: fail,
  });

  const issueMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await post<ProjectSignoff>(`/api/project-signoff/${id}/issue`);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Issued to the client",
        description: "It is now waiting for signature in their hub.",
      });
    },
    onError: fail,
  });

  const signMutation = useMutation({
    mutationFn: async ({
      id,
      signedName,
      signedMethod,
    }: {
      id: number;
      signedName: string;
      signedMethod?: "client" | "deemed" | "offline";
    }) => {
      const r = await post<ProjectSignoff>(`/api/project-signoff/${id}/sign`, {
        signedName,
        isAgree: true,
        signedMethod,
      });
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (row) => {
      invalidate();
      toast({
        title: "Sign-off recorded",
        description: row?.derived?.paymentDueAt
          ? `Final payment of ${formatPeso(row.finalPaymentCents)} is due ${new Date(
              row.derived.paymentDueAt,
            ).toLocaleDateString()}.`
          : "Final delivery is recorded.",
      });
    },
    onError: fail,
  });

  const revisionMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const r = await post<{ revision: SignoffRevision; derived: SignoffDerived }>(
        `/api/project-signoff/${id}/revision`,
        { note },
      );
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (res) => {
      invalidate();
      toast({
        title: `Revision round ${res?.revision?.roundNumber ?? ""} logged`,
        description: `${res?.derived?.freeRevisionRemainingCount ?? 0} complementary rounds left.`,
      });
    },
    onError: fail,
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await post<ProjectSignoff>(`/api/project-signoff/${id}/void`, { reason });
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Sign-off voided" });
    },
    onError: fail,
  });

  return {
    signoff,
    isLoading,
    createSignoff: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateSignoff: updateMutation.mutateAsync,
    issueSignoff: issueMutation.mutateAsync,
    isIssuing: issueMutation.isPending,
    signSignoff: signMutation.mutateAsync,
    isSigning: signMutation.isPending,
    requestRevision: revisionMutation.mutateAsync,
    isRequestingRevision: revisionMutation.isPending,
    voidSignoff: voidMutation.mutateAsync,
  };
}

/** One sign-off plus its revision ledger. */
export function useSignoffDetail(signoffId?: number | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...QUERY_KEY, "detail", signoffId],
    queryFn: async () => {
      const r = await get<SignoffDetail>(`/api/project-signoff/${signoffId}`);
      return r.data;
    },
    enabled: !!user && signoffId != null,
    staleTime: 60 * 1000,
  });
}
