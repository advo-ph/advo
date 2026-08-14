/**
 * Proposal pipeline helpers — sent / opened / replied / signed.
 */

export type ProposalStatus = "sent" | "opened" | "replied" | "signed";

const PROPOSAL_STATUS = new Set<string>(["sent", "opened", "replied", "signed"]);

const STAGE_LABEL: Record<ProposalStatus, string> = {
  sent: "Sent",
  opened: "Opened",
  replied: "Replied",
  signed: "Signed",
};

const STAGE_ORDER: ProposalStatus[] = ["sent", "opened", "replied", "signed"];

export function isProposalStatus(status: string): status is ProposalStatus {
  return PROPOSAL_STATUS.has(status);
}

export function proposalStageLabel(status: ProposalStatus): string {
  return STAGE_LABEL[status];
}

/** Filter a proposal list by status. `all` (default) keeps every row. */
export function filterProposal<T extends { status: string }>(
  proposal: T[],
  status: ProposalStatus | "all" = "all",
): T[] {
  if (status === "all") return proposal.filter((item) => isProposalStatus(item.status));
  return proposal.filter((item) => item.status === status);
}

export function proposalStageOrder(status: ProposalStatus): number {
  return STAGE_ORDER.indexOf(status);
}
