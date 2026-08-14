/**
 * Contract review AI path — mocked Anthropic SDK, no live key.
 *
 * reviewContract() lives in the API service. Vitest aliases
 * @anthropic-ai/sdk to anthropic-sdk.stub.ts so this never needs a live key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewContract } from "../../../api/src/services/contract-review.service";
import { createMessage } from "./anthropic-sdk.stub";

const SILENT_CONTRACT =
  "This agreement is between ADVO and the Client for a website build. The total cost is one hundred thousand pesos. Work begins when both parties agree.";

const AI_FLAG = [
  {
    policy: "Downpayment floor",
    severity: "green",
    present: true,
    note: "40% downpayment named.",
  },
  {
    policy: "Revision limits",
    severity: "green",
    present: true,
    note: "Two rounds per phase.",
  },
  {
    policy: "Change orders",
    severity: "amber",
    present: true,
    note: "Scope change mentioned, no signed form.",
  },
  {
    policy: "Late payment",
    severity: "green",
    present: true,
    note: "2% interest + pause.",
  },
  {
    policy: "Termination",
    severity: "green",
    present: true,
    note: "15-day notice.",
  },
];

const AI_BODY = {
  verdict: "needs_work",
  summary: "Four of five policies are solid; tighten change orders.",
  flags: AI_FLAG,
};

function stubAiText(text: string) {
  createMessage.mockResolvedValue({
    content: [{ type: "text", text }],
  });
}

describe("contract review AI path", () => {
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

  it("returns method ai when the mocked SDK yields a valid review", async () => {
    stubAiText(JSON.stringify(AI_BODY));

    const review = await reviewContract("A long enough contract text for the AI path.");

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(review.method).toBe("ai");
    expect(review.verdict).toBe("needs_work");
    expect(review.summary).toContain("change orders");
    expect(review.flags).toHaveLength(5);
    expect(review.disclaimer).toMatch(/AI-assisted/);
  });

  it("strips markdown fences from the SDK payload", async () => {
    stubAiText("```json\n" + JSON.stringify(AI_BODY) + "\n```");

    const review = await reviewContract("Fenced model output still counts as AI.");

    expect(review.method).toBe("ai");
    expect(review.verdict).toBe("needs_work");
  });

  it("falls back to heuristic when the SDK throws", async () => {
    createMessage.mockRejectedValue(new Error("anthropic down"));

    const review = await reviewContract(SILENT_CONTRACT);

    expect(review.method).toBe("heuristic");
    expect(review.verdict).toBe("high_risk");
  });

  it("falls back to heuristic when the SDK returns malformed JSON", async () => {
    stubAiText("not-json");

    const review = await reviewContract(SILENT_CONTRACT);

    expect(review.method).toBe("heuristic");
    expect(review.verdict).toBe("high_risk");
  });

  it("skips the SDK when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const review = await reviewContract(SILENT_CONTRACT);

    expect(createMessage).not.toHaveBeenCalled();
    expect(review.method).toBe("heuristic");
  });
});
