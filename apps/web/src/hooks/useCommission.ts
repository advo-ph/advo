import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/**
 * /api/commission — the 55/35/10 commission split (migration 018, defaults updated by 030).
 *
 * Three things this hook must never do:
 *
 *   1. Recompute a split in the browser. Every peso figure arrives under
 *      `computedAmountCents` / `derived`, allocated server-side by one largest-remainder
 *      allocator. A second implementation in the UI would eventually disagree with the
 *      record by a centavo, in front of the people being paid.
 *   2. Read the percentages from a constant. They come off the PLAN ROW (developerBps,
 *      staffBps, …) because they are snapshotted per project — a finalized plan keeps
 *      paying what it promised even after the structure is renegotiated.
 *   3. Draw the finalize button from its own guesswork. `derived.blocker` is the
 *      server's list of reasons it would refuse, and the API re-derives the same list in
 *      the write path, so the UI can only ever be a mirror of the gate.
 *
 * Money is integer CENTS on the wire. Divide by 100 exactly once, at render time.
 */

export type CommissionStatus = "draft" | "finalized" | "void";

export type CommissionRole =
  | "main_developer"
  | "assistant_developer"
  | "creatives_developer"
  | "lead_partnerships"
  | "referral"
  | "marketing"
  | "accounting"
  | "management"
  | "company";

export interface CommissionShare {
  commissionShareId: number;
  commissionPlanId: number;
  /** Null for exactly one row per plan: the company reserve. */
  teamMemberId: number | null;
  role: CommissionRole;
  /** Relative weight within the role's pool — 60/40 and 6000/4000 allocate identically. */
  contributionBps: number;
  isAgreed: boolean;
  agreedAt: string | null;
  /** Frozen at finalize. Null while the plan is draft — read computedAmountCents instead. */
  amountCents: number | null;
  /** Derived on read while draft; the frozen amountCents once finalized. */
  computedAmountCents: number;
  pool: "developer" | "staff" | "company";
  memberName: string | null;
  note: string | null;
}

/** Computed server-side. Nothing here is stored. */
export interface CommissionDerived {
  basisCents: number;
  developerPoolCents: number;
  staffPoolCents: number;
  companyCents: number;
  staffRolePoolCents: {
    lead_partnerships: number;
    referral: number;
    marketing: number;
    accounting: number;
    management: number;
  };
  /** Cents belonging to a role nobody holds. Must be 0 before the plan can be finalized. */
  unallocatedCents: number;
  allocatedCents: number;
  isAgreedComplete: boolean;
  isProjectComplete: boolean;
  isFinalizeReady: boolean;
  /** The server's reasons for refusing finalize, verbatim. */
  blocker: string[];
}

export interface CommissionPlan {
  commissionPlanId: number;
  projectId: number;
  projectTitle: string | null;
  /** Integer CENTS being split. */
  basisCents: number;
  basisNote: string | null;
  /** Basis points, snapshotted per plan. 5500 = 55%. */
  developerBps: number;
  staffBps: number;
  companyBps: number;
  referralBps: number;
  marketingBps: number;
  accountingBps: number;
  managementBps: number;
  status: CommissionStatus;
  finalizedAt: string | null;
  finalizedBy: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  share: CommissionShare[];
  derived: CommissionDerived;
}

export interface CommissionPlanInput {
  projectId: number;
  basisCents?: number;
  basisNote?: string | null;
  note?: string | null;
}

export interface CommissionShareInput {
  teamMemberId: number;
  role: CommissionRole;
  contributionBps?: number;
  note?: string | null;
}

export function useCommission(projectId?: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = projectId !== undefined ? ["commission", projectId] : ["commission"];

  const { data: commissionPlan = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const url = projectId !== undefined
        ? `/api/commission?projectId=${projectId}`
        : "/api/commission";
      const res = await get<CommissionPlan[]>(url);
      return res.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["commission"] });

  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (payload: CommissionPlanInput) => {
      const res = await post<CommissionPlan>("/api/commission", payload);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: fail("Could not draft the plan"),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (commissionPlanId: number) => {
      const res = await del(`/api/commission/${commissionPlanId}`);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => invalidate(),
    onError: fail("Could not delete the plan"),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({
      commissionPlanId,
      ...payload
    }: Partial<CommissionPlanInput> & { commissionPlanId: number }) => {
      const res = await patch(`/api/commission/${commissionPlanId}`, payload);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => invalidate(),
    onError: fail("Could not update the plan"),
  });

  const addShareMutation = useMutation({
    mutationFn: async ({
      commissionPlanId,
      ...payload
    }: CommissionShareInput & { commissionPlanId: number }) => {
      const res = await post(`/api/commission/${commissionPlanId}/share`, payload);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Added to the split", description: "Contribution still to be agreed." });
    },
    onError: fail("Could not add that share"),
  });

  /**
   * Changing the WEIGHT resets agreement on that row, server-side — nobody stays signed
   * off on a figure they never saw.
   */
  const updateShareMutation = useMutation({
    mutationFn: async ({
      commissionShareId,
      ...payload
    }: { commissionShareId: number; contributionBps?: number; isAgreed?: boolean }) => {
      const res = await patch(`/api/commission/share/${commissionShareId}`, payload);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => invalidate(),
    onError: fail("Could not update that share"),
  });

  const removeShareMutation = useMutation({
    mutationFn: async (commissionShareId: number) => {
      const res = await del(`/api/commission/share/${commissionShareId}`);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => invalidate(),
    onError: fail("Could not remove that share"),
  });

  const setTierMutation = useMutation({
    mutationFn: async ({
      commissionShareId,
      tierLabel,
    }: { commissionShareId: number; tierLabel: string }) => {
      const res = await post(`/api/commission/share/${commissionShareId}/tier`, { tierLabel });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => invalidate(),
    onError: fail("Could not set tier"),
  });

  const seedMutation = useMutation({
    mutationFn: async (commissionPlanId: number) => {
      const res = await post<{ seeded: unknown[]; unassigned: unknown[] }>(
        `/api/commission/${commissionPlanId}/seed`,
        {},
      );
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (result) => {
      invalidate();
      toast({
        title: `${result?.seeded.length ?? 0} developer slot proposed`,
        description: "Suggested from project access. Contributions are still to be agreed.",
      });
    },
    onError: fail("Could not seed from project access"),
  });

  /** Freezes the split. 409 with the blocker list when the gate refuses. */
  const finalizeMutation = useMutation({
    mutationFn: async (commissionPlanId: number) => {
      const res = await post(`/api/commission/${commissionPlanId}/finalize`, {});
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Commission plan finalized",
        description: "Amounts are frozen. Paying them out is a separate, manual act.",
      });
    },
    onError: fail("Cannot finalize yet"),
  });

  const voidMutation = useMutation({
    mutationFn: async ({ commissionPlanId, reason }: { commissionPlanId: number; reason: string }) => {
      const res = await post(`/api/commission/${commissionPlanId}/void`, { reason });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Commission plan voided" });
    },
    onError: fail("Could not void the plan"),
  });

  return {
    commissionPlan,
    isLoading,
    createCommissionPlan: createMutation.mutate,
    deleteCommissionPlan: deletePlanMutation.mutate,
    updateCommissionPlan: updatePlanMutation.mutate,
    addCommissionShare: addShareMutation.mutate,
    updateCommissionShare: updateShareMutation.mutate,
    removeCommissionShare: removeShareMutation.mutate,
    setTier: setTierMutation.mutate,
    seedFromProjectAccess: seedMutation.mutate,
    finalizeCommissionPlan: finalizeMutation.mutate,
    voidCommissionPlan: voidMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deletePlanMutation.isPending,
    isFinalizing: finalizeMutation.isPending,
  };
}
