/**
 * Ask channel's AI path — mocked Anthropic SDK, no live key.
 *
 * `askWithAI` lives in the API service. Vitest aliases @anthropic-ai/sdk to
 * anthropic-sdk.stub.ts (vitest.config.ts) so this never needs a live key,
 * same pattern as contract-ai.test.ts.
 *
 * Covers the bugs fixed in this pass:
 *   - no ANTHROPIC_API_KEY -> reason "no_key" (was: generic null, same message
 *     as every other failure)
 *   - SDK/model error, or JSON that never parses -> reason "error" (now a
 *     different, distinguishable outcome from "no_key")
 *   - prose wrapped around the JSON ("Sure, here you go:\n{...}\nHope that
 *     helps!") now still parses, instead of silently falling back
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askWithAI } from "../../../api/src/services/chat.service";
import { createMessage } from "./anthropic-sdk.stub";

const SNAPSHOT = { project: [], meeting: [], event: [] };

function stubAiText(text: string) {
  createMessage.mockResolvedValue({ content: [{ type: "text", text }] });
}

describe("Ask channel AI path (askWithAI)", () => {
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

  it("reports reason 'no_key' when ANTHROPIC_API_KEY is unset, without calling the SDK", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const outcome = await askWithAI("what's open?", SNAPSHOT);

    expect(outcome).toEqual({ ok: false, reason: "no_key" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns ok:true with the parsed reply on a clean JSON response", async () => {
    stubAiText(JSON.stringify({ reply: "Three projects are open." }));

    const outcome = await askWithAI("what's open?", SNAPSHOT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reply.reply).toBe("Three projects are open.");
  });

  it("strips markdown fences from the SDK payload", async () => {
    stubAiText("```json\n" + JSON.stringify({ reply: "Fenced but fine." }) + "\n```");

    const outcome = await askWithAI("q", SNAPSHOT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reply.reply).toBe("Fenced but fine.");
  });

  it("extracts JSON wrapped in prose instead of failing (the bug this fix targets)", async () => {
    stubAiText('Sure, here you go:\n{"reply": "Still answers correctly."}\nHope that helps!');

    const outcome = await askWithAI("q", SNAPSHOT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reply.reply).toBe("Still answers correctly.");
  });

  it("reports reason 'error' (not 'no_key') when the model output never parses as JSON", async () => {
    stubAiText("not json at all, no braces either");

    const outcome = await askWithAI("q", SNAPSHOT);

    expect(outcome).toEqual({ ok: false, reason: "error" });
  });

  it("reports reason 'error' when the SDK call throws", async () => {
    createMessage.mockRejectedValue(new Error("anthropic down"));

    const outcome = await askWithAI("q", SNAPSHOT);

    expect(outcome).toEqual({ ok: false, reason: "error" });
  });

  it("carries parsed options through for a follow-up button turn", async () => {
    stubAiText(JSON.stringify({ reply: "Pick one.", options: [{ id: "a", label: "A" }] }));

    const outcome = await askWithAI("q", SNAPSHOT);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reply.options).toEqual([{ id: "a", label: "A" }]);
  });
});
