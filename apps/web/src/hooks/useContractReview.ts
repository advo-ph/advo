import { useMutation } from "@tanstack/react-query";
import { post } from "@/lib/api";

export type FlagSeverity = "red" | "amber" | "green";

export interface ContractFlag {
  policy: string;
  severity: FlagSeverity;
  present: boolean;
  note: string;
}

export interface ContractReview {
  verdict: "good_to_go" | "needs_work" | "high_risk";
  summary: string;
  flags: ContractFlag[];
  method: string;
  disclaimer: string;
}

export function useContractReview() {
  const mutation = useMutation({
    mutationFn: async (contractText: string): Promise<ContractReview> => {
      const res = await post<ContractReview>("/api/contracts/review", { contractText });
      if (res.error || !res.data) throw new Error(res.error || "Review failed");
      return res.data;
    },
  });

  return {
    review: mutation.mutateAsync,
    result: mutation.data ?? null,
    isReviewing: mutation.isPending,
    error: mutation.error ? (mutation.error as Error).message : null,
    reset: mutation.reset,
  };
}
