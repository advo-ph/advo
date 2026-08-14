import { describe, it, expect } from "vitest";
import {
  isProposalStatus,
  proposalStageLabel,
  filterProposal,
  proposalStageOrder,
  type ProposalStatus,
} from "@/lib/proposal-tracker";

describe("isProposalStatus", () => {
  it("accepts sent / opened / replied / signed", () => {
    expect(isProposalStatus("sent")).toBe(true);
    expect(isProposalStatus("opened")).toBe(true);
    expect(isProposalStatus("replied")).toBe(true);
    expect(isProposalStatus("signed")).toBe(true);
  });

  it("rejects statuses outside the proposal pipeline", () => {
    expect(isProposalStatus("new")).toBe(false);
    expect(isProposalStatus("proposal_sent")).toBe(false);
    expect(isProposalStatus("closed_won")).toBe(false);
    expect(isProposalStatus("")).toBe(false);
    expect(isProposalStatus("draft")).toBe(false);
  });
});

describe("proposalStageLabel", () => {
  it("returns human-readable stage labels", () => {
    const caseList: [ProposalStatus, string][] = [
      ["sent", "Sent"],
      ["opened", "Opened"],
      ["replied", "Replied"],
      ["signed", "Signed"],
    ];
    for (const [status, label] of caseList) {
      expect(proposalStageLabel(status)).toBe(label);
    }
  });
});

describe("filterProposal", () => {
  const proposal = [
    { status: "sent", title: "A" },
    { status: "opened", title: "B" },
    { status: "new", title: "skip" },
    { status: "replied", title: "C" },
    { status: "signed", title: "D" },
  ];

  it("keeps only pipeline statuses when filter is all", () => {
    const result = filterProposal(proposal);
    expect(result.map((row) => row.title)).toEqual(["A", "B", "C", "D"]);
  });

  it("filters to a single status", () => {
    expect(filterProposal(proposal, "opened").map((row) => row.title)).toEqual(["B"]);
    expect(filterProposal(proposal, "signed")).toHaveLength(1);
  });

  it("returns empty array when none match", () => {
    expect(filterProposal([{ status: "new" }], "sent")).toEqual([]);
  });
});

describe("proposalStageOrder", () => {
  it("orders sent → opened → replied → signed", () => {
    expect(proposalStageOrder("sent")).toBeLessThan(proposalStageOrder("opened"));
    expect(proposalStageOrder("opened")).toBeLessThan(proposalStageOrder("replied"));
    expect(proposalStageOrder("replied")).toBeLessThan(proposalStageOrder("signed"));
  });
});
