/**
 * Plaud resilience — the API surviving its own background work.
 *
 * Covers the three lane items:
 *   A1  the poll issues no outbound request when there is nothing usable to
 *       poll with, and the listing is bounded rather than limit=99999
 *   A2  Ask Plaud retries a connection reset with bounded backoff, never a 4xx
 *   A3  captured errors are redacted and bounded, so a public /api/health
 *       can carry them
 *
 * The network is stubbed throughout — no test here reaches Plaud.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  askPlaud,
  AskClientError,
  isResetError,
  jsonFromAskAnswer,
  parseAskStream,
} from "../../../api/src/services/plaud-ask.service";
import {
  clearTokenDead,
  isTokenUsable,
  markTokenDead,
  plaudAuthState,
} from "../../../api/src/services/plaud.service";
import { syncPlaudFolder } from "../../../api/src/services/plaud-poll.service";
import {
  errorCount,
  recentError,
  recordError,
  redactMessage,
  resetErrorCapture,
} from "../../../api/src/utils/error-capture";

const FAKE_TOKEN = "test-plaud-token-not-a-secret";

/** An SSE body shaped like a real Ask answer stream. */
const ASK_STREAM = [
  "event: answer",
  'data: {"content":"{\\"task\\":[{\\"title\\":\\"Ship the hub\\","}',
  "event: answer",
  'data: {"content":"\\"description\\":\\"Publish it.\\",\\"suggestedSkill\\":\\"frontend\\",\\"owner\\":\\"Prince\\"}]}"}',
  "event: reference",
  'data: {"start_time":1000,"end_time":2000}',
  "",
].join("\n");

function resetError(code: string): Error {
  const err = new TypeError("fetch failed");
  (err as unknown as { cause: { code: string } }).cause = { code };
  return err;
}

function okResponse(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

function statusResponse(status: number): Response {
  return { ok: false, status, text: async () => "" } as unknown as Response;
}

describe("Ask Plaud stream parsing", () => {
  it("concatenates answer events and collects reference windows", () => {
    const parsed = parseAskStream(ASK_STREAM);

    expect(parsed.answer).toContain("Ship the hub");
    expect(parsed.reference).toEqual([{ startMs: 1000, endMs: 2000 }]);
  });

  it("pulls the task JSON out of the streamed answer", () => {
    const parsed = parseAskStream(ASK_STREAM);
    const json = jsonFromAskAnswer(parsed.answer) as { task: { title: string }[] };

    expect(json.task).toHaveLength(1);
    expect(json.task[0].title).toBe("Ship the hub");
  });
});

describe("isResetError", () => {
  it("treats transport faults as retryable", () => {
    for (const code of ["ECONNRESET", "ENOBUFS", "ETIMEDOUT", "UND_ERR_SOCKET"]) {
      expect(isResetError(resetError(code))).toBe(true);
    }
  });

  it("never treats a 4xx as retryable", () => {
    expect(isResetError(new AskClientError(401, "stale jwt"))).toBe(false);
    expect(isResetError(new AskClientError(404, "no such file"))).toBe(false);
  });
});

describe("askPlaud retry on reset", () => {
  const previousToken = process.env.PLAUD_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.PLAUD_TOKEN = FAKE_TOKEN;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (previousToken === undefined) delete process.env.PLAUD_TOKEN;
    else process.env.PLAUD_TOKEN = previousToken;
  });

  it("retries a reset and succeeds on a later attempt", async () => {
    fetchMock
      .mockRejectedValueOnce(resetError("ECONNRESET"))
      .mockRejectedValueOnce(resetError("ENOBUFS"))
      .mockResolvedValueOnce(okResponse(ASK_STREAM));

    const answer = await askPlaud({ fileId: "file-1", question: "extract deliverable" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(answer.answer).toContain("Ship the hub");
  });

  it("stops at a bounded attempt cap instead of retrying forever", async () => {
    fetchMock.mockRejectedValue(resetError("ECONNRESET"));

    await expect(askPlaud({ fileId: "file-1", question: "q" })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx — the server already gave its verdict", async () => {
    fetchMock.mockResolvedValue(statusResponse(401));

    await expect(askPlaud({ fileId: "file-1", question: "q" })).rejects.toBeInstanceOf(
      AskClientError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404", async () => {
    fetchMock.mockResolvedValue(statusResponse(404));

    await expect(askPlaud({ fileId: "missing", question: "q" })).rejects.toBeInstanceOf(
      AskClientError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes no request at all when Plaud auth is unconfigured", async () => {
    delete process.env.PLAUD_TOKEN;
    process.env.PLAUD_AUTH_FILE = "C:/nonexistent/plaud-auth.json";

    await expect(askPlaud({ fileId: "file-1", question: "q" })).rejects.toThrow(
      /not configured/i,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.PLAUD_AUTH_FILE;
  });
});

describe("Plaud token liveness gate", () => {
  const previousToken = process.env.PLAUD_TOKEN;

  beforeEach(() => {
    process.env.PLAUD_TOKEN = FAKE_TOKEN;
    clearTokenDead();
  });

  afterEach(() => {
    clearTokenDead();
    if (previousToken === undefined) delete process.env.PLAUD_TOKEN;
    else process.env.PLAUD_TOKEN = previousToken;
  });

  it("counts a configured token as usable until it is rejected", () => {
    expect(isTokenUsable()).toBe(true);

    markTokenDead("workspace token rejected (status -419) and cannot be reminted");

    expect(isTokenUsable()).toBe(false);
    expect(plaudAuthState().isConfigured).toBe(true);
    expect(plaudAuthState().deadReason).toMatch(/-419/);
  });

  it("never exposes the token value in its reported state", () => {
    const state = JSON.stringify(plaudAuthState());

    expect(state).not.toContain(FAKE_TOKEN);
  });
});

describe("poller suppression", () => {
  const previousToken = process.env.PLAUD_TOKEN;
  const previousFile = process.env.PLAUD_AUTH_FILE;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.PLAUD_TOKEN;
    process.env.PLAUD_AUTH_FILE = "C:/nonexistent/plaud-auth.json";
    clearTokenDead();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokenDead();
    if (previousToken === undefined) delete process.env.PLAUD_TOKEN;
    else process.env.PLAUD_TOKEN = previousToken;
    if (previousFile === undefined) delete process.env.PLAUD_AUTH_FILE;
    else process.env.PLAUD_AUTH_FILE = previousFile;
  });

  it("issues no outbound request when no token is configured", async () => {
    const status = await syncPlaudFolder();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(status.isSuppressed).toBe(true);
    expect(status.suppressedReason).toMatch(/not configured/i);
  });

  it("issues no outbound request after the token is latched dead", async () => {
    process.env.PLAUD_TOKEN = FAKE_TOKEN;
    markTokenDead("workspace token rejected (status -419) and cannot be reminted");

    const status = await syncPlaudFolder();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(status.isSuppressed).toBe(true);
    expect(status.suppressedReason).toMatch(/-419/);
  });

  it("reports poller state without leaking a token value", async () => {
    process.env.PLAUD_TOKEN = FAKE_TOKEN;
    markTokenDead("rejected");

    const status = JSON.stringify(await syncPlaudFolder());

    expect(status).not.toContain(FAKE_TOKEN);
  });
});

describe("error capture for public health", () => {
  beforeEach(() => {
    resetErrorCapture();
  });

  it("redacts credentials out of a captured message", () => {
    expect(redactMessage("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).not.toContain(
      "eyJhbGciOiJIUzI1NiJ9",
    );
    expect(redactMessage("GET /file?token=super-secret-value&x=1")).not.toContain(
      "super-secret-value",
    );
    expect(redactMessage("connect postgresql://user:pw@host/db failed")).not.toContain("pw@host");
    expect(redactMessage("key sk-abcdef0123456789 rejected")).not.toContain("sk-abcdef0123456789");
  });

  it("keeps the ring bounded and carries no stack", () => {
    for (let i = 0; i < 50; i += 1) recordError("plaud-poll", new Error(`boom ${i}`));

    const recent = recentError(5);

    expect(errorCount()).toBe(50);
    expect(recent).toHaveLength(5);
    expect(recent[0].message).toBe("boom 49");
    for (const one of recent) {
      expect(Object.keys(one).sort()).toEqual(["at", "message", "scope"]);
    }
  });

  it("clamps a very long message", () => {
    recordError("http", new Error("x".repeat(5000)));

    expect(recentError(1)[0].message.length).toBeLessThanOrEqual(200);
  });
});
