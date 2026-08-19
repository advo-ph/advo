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
    policy: "Payment schedule",
    severity: "green",
    present: true,
    note: "50/50 milestone split named.",
  },
  {
    policy: "Revisions",
    severity: "green",
    present: true,
    note: "Five rounds per deliverable.",
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
    note: "2% per month + suspension right.",
  },
  {
    policy: "Termination",
    severity: "green",
    present: true,
    note: "14-day cure period.",
  },
  {
    policy: "Intellectual property",
    severity: "green",
    present: true,
    note: "IP retained until full payment, transfers on final payment.",
  },
  {
    policy: "Non-abandonment",
    severity: "amber",
    present: true,
    note: "Continuity named, no third-party replication clause.",
  },
  {
    policy: "Warranty and liability",
    severity: "green",
    present: true,
    note: "30-day warranty; indirect loss excluded.",
  },
];

/**
 * A partial answer: the model returned only the first five policies and silently
 * dropped IP, non-abandonment and warranty. Scoring this as a whole review is the
 * exact failure the completeness gate exists to stop.
 */
const AI_FLAG_INCOMPLETE = AI_FLAG.slice(0, 5);

const AI_BODY = {
  verdict: "needs_work",
  summary: "Most policy areas are solid; tighten change orders.",
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
    // Tracks the fixture rather than a magic number: the AI path only survives the
    // completeness gate when it answers for every policy, so this length IS the
    // policy count. Adding a policy to the service must fail here until the
    // fixture covers it.
    expect(review.flags).toHaveLength(AI_FLAG.length);
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

  it("falls back to heuristic when the AI answers only some of the policies", async () => {
    // The regression this pins: a model that drops IP retention, non-abandonment
    // and warranty used to yield five greens, zero reds, and a good_to_go verdict
    // on a contract with no IP clause at all. An incomplete review must not be
    // scored as a whole one.
    stubAiText(
      JSON.stringify({
        verdict: "good_to_go",
        summary: "Everything checks out.",
        flags: AI_FLAG_INCOMPLETE,
      }),
    );

    const review = await reviewContract(SILENT_CONTRACT);

    expect(review.method).toBe("heuristic");
    expect(review.verdict).not.toBe("good_to_go");
    // The heuristic scores every policy, so the silent contract stays high risk.
    expect(review.verdict).toBe("high_risk");
    expect(review.flags.length).toBeGreaterThan(AI_FLAG_INCOMPLETE.length);
  });

  it("skips the SDK when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const review = await reviewContract(SILENT_CONTRACT);

    expect(createMessage).not.toHaveBeenCalled();
    expect(review.method).toBe("heuristic");
  });
});
