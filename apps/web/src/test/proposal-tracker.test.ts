import { describe, it, expect } from "vitest";
import {
  isProposalStatus,
  proposalStageLabel,
  filterProposalLead,
  type ProposalStatus,
} from "@/lib/proposal-tracker";

describe("isProposalStatus", () => {
  it("accepts proposal-stage statuses", () => {
    expect(isProposalStatus("proposal_sent")).toBe(true);
    expect(isProposalStatus("closed_won")).toBe(true);
    expect(isProposalStatus("closed_lost")).toBe(true);
  });

  it("rejects pipeline statuses outside proposal stage", () => {
    expect(isProposalStatus("new")).toBe(false);
    expect(isProposalStatus("contacted")).toBe(false);
    expect(isProposalStatus("qualified")).toBe(false);
    expect(isProposalStatus("")).toBe(false);
    expect(isProposalStatus("unknown")).toBe(false);
  });
});

describe("proposalStageLabel", () => {
  it("returns human-readable stage labels", () => {
    const caseList: [ProposalStatus, string][] = [
      ["proposal_sent", "Proposal sent"],
      ["closed_won", "Won"],
      ["closed_lost", "Lost"],
    ];
    for (const [status, label] of caseList) {
      expect(proposalStageLabel(status)).toBe(label);
    }
  });
});

describe("filterProposalLead", () => {
  it("keeps only proposal-stage leads", () => {
    const lead = [
      { status: "new", email: "a@x.com" },
      { status: "proposal_sent", email: "b@x.com" },
      { status: "qualified", email: "c@x.com" },
      { status: "closed_won", email: "d@x.com" },
      { status: "contacted", email: "e@x.com" },
      { status: "closed_lost", email: "f@x.com" },
    ];
    const result = filterProposalLead(lead);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.email)).toEqual(["b@x.com", "d@x.com", "f@x.com"]);
  });

  it("returns empty array when none are proposal-stage", () => {
    expect(filterProposalLead([{ status: "new" }, { status: "contacted" }])).toEqual([]);
  });

  it("preserves extra fields on filtered items", () => {
    const lead = [
      { status: "proposal_sent" as const, company: "Acme", email: "a@acme.com", id: 1 },
    ];
    const result = filterProposalLead(lead);
    expect(result[0]).toEqual(lead[0]);
  });
});
