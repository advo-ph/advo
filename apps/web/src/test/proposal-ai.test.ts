/**
 * Proposal AI generation — mocked Anthropic SDK, no live key.
 *
 * buildProposal() lives in the API service. Vitest aliases @anthropic-ai/sdk
 * to anthropic-sdk.stub.ts so this never needs a live key.
 *
 * The contract under test: with a key, the body copy is written from the lead's
 * own scraped signals (method "ai"); without one — or on any AI error — the
 * existing template fill runs unchanged (method "template").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProposal,
  fillProposalTemplate,
} from "../../../api/src/services/proposal.service";
import { createMessage } from "./anthropic-sdk.stub";

const LEAD = {
  name: "Makati Smile Center",
  email: "hello@makatismile.example.com",
  company: "Makati Smile Center",
  projectType: "clinic-website",
  budget: "₱120,000",
  description: "Legacy paper-based appointment book. 12 year old system. Digital score 22.",
  notes: "outdated system; paper-based",
};

const AI_SECTION = [
  {
    heading: "What the audit found",
    body: "Your digital presence scores 22 out of 100. Appointments still run through a paper book.",
  },
  {
    heading: "What we propose to build",
    body: "A booking-first clinic site with an intake form that writes to one shared schedule.",
  },
  {
    heading: "What changes once it ships",
    body: "Front desk stops re-keying appointments and patients can book without calling.",
  },
];

function stubAiText(text: string) {
  createMessage.mockResolvedValue({ content: [{ type: "text", text }] });
}

describe("proposal AI generation", () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    createMessage.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it("returns method ai and renders the model's sections", async () => {
    stubAiText(JSON.stringify({ section: AI_SECTION }));

    const built = await buildProposal(LEAD, 120_000_00);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(built.method).toBe("ai");
    expect(built.bodyHtml).toContain("What the audit found");
    expect(built.bodyHtml).toContain("22 out of 100");
    expect(built.bodyHtml).toContain("AI-written body copy");
  });

  it("sends this lead's scraped signals to the model, not a generic prompt", async () => {
    stubAiText(JSON.stringify({ section: AI_SECTION }));

    await buildProposal(LEAD);

    const prompt = String(createMessage.mock.calls[0][0].messages[0].content);
    expect(prompt).toContain("Makati Smile Center");
    expect(prompt).toContain("22/100");
    expect(prompt).toContain("dental clinic");
    expect(prompt).toContain("about 12 years");
  });

  it("keeps the CONTRACTS.md clauses verbatim in the AI document", async () => {
    stubAiText(JSON.stringify({ section: AI_SECTION }));

    const built = await buildProposal(LEAD);

    expect(built.clause.map((item) => item.clause_code)).toEqual([
      "downpayment",
      "revision",
      "change_order",
      "late_payment",
      "termination",
    ]);
    expect(built.bodyHtml).toContain("two (2) revision rounds");
    expect(built.bodyHtml).toContain("thirty thousand Philippine pesos");
  });

  it("strips markdown fences from the SDK payload", async () => {
    stubAiText("```json\n" + JSON.stringify({ section: AI_SECTION }) + "\n```");

    const built = await buildProposal(LEAD);

    expect(built.method).toBe("ai");
    expect(built.bodyHtml).toContain("What we propose to build");
  });

  it("falls back to the template fill when the SDK throws", async () => {
    createMessage.mockRejectedValue(new Error("anthropic down"));

    const built = await buildProposal(LEAD, 120_000_00);

    expect(built.method).toBe("template");
    expect(built.bodyHtml).toBe(fillProposalTemplate(LEAD, 120_000_00).bodyHtml);
  });

  it("falls back to the template fill on malformed JSON", async () => {
    stubAiText("not-json");

    const built = await buildProposal(LEAD);

    expect(built.method).toBe("template");
    expect(built.bodyHtml).toContain("template-fill (not AI-generated)");
  });

  it("falls back when the model returns too few usable sections", async () => {
    stubAiText(JSON.stringify({ section: [{ heading: "Only one", body: "Not enough." }] }));

    const built = await buildProposal(LEAD);

    expect(built.method).toBe("template");
  });

  it("skips the SDK entirely when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const built = await buildProposal(LEAD, 120_000_00);

    expect(createMessage).not.toHaveBeenCalled();
    expect(built.method).toBe("template");
    // The pre-existing template path must be byte-identical.
    expect(built.bodyHtml).toBe(fillProposalTemplate(LEAD, 120_000_00).bodyHtml);
    expect(built.title).toBe("ADVO proposal — Makati Smile Center");
  });

  it("escapes model output instead of trusting it as HTML", async () => {
    stubAiText(
      JSON.stringify({
        section: [
          { heading: "Findings", body: "<script>alert(1)</script> and a \"quote\"." },
          { heading: "Proposal", body: "Build the booking flow." },
        ],
      }),
    );

    const built = await buildProposal(LEAD);

    expect(built.method).toBe("ai");
    expect(built.bodyHtml).not.toContain("<script>");
    expect(built.bodyHtml).toContain("&lt;script&gt;");
  });
});
