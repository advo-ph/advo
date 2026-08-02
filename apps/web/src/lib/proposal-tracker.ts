/**
 * Proposal-stage lead filter helpers.
 * Uses existing lead.status values — no separate proposal table/migration.
 */

export type ProposalStatus = "proposal_sent" | "closed_won" | "closed_lost";

const PROPOSAL_STATUS = new Set<string>([
  "proposal_sent",
  "closed_won",
  "closed_lost",
]);

const STAGE_LABEL: Record<ProposalStatus, string> = {
  proposal_sent: "Proposal sent",
  closed_won: "Won",
  closed_lost: "Lost",
};

export function isProposalStatus(status: string): status is ProposalStatus {
  return PROPOSAL_STATUS.has(status);
}

export function proposalStageLabel(status: ProposalStatus): string {
  return STAGE_LABEL[status];
}

/** Filter to proposal-stage leads (proposal_sent | closed_won | closed_lost). */
export function filterProposalLead<T extends { status: string }>(lead: T[]): T[] {
  return lead.filter((item) => isProposalStatus(item.status));
}
