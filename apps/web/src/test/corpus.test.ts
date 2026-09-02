/**
 * @vitest-environment node
 *
 * Corpus — the pure parts (migration 027): the heuristic extractor that runs when
 * there is no model key, the number normaliser the fact-check verdict rests on,
 * and template rendering. Live ingestion and search are covered against the
 * running API in the second block, which skips when it is down.
 */
import { describe, expect, it } from "vitest";
import {
  extractHeuristic,
  numberIn,
  placeholderOf,
  renderTemplate,
} from "../../../api/src/services/corpus.service.js";
import { API, skipWhenApiDown } from "./live-api.js";

describe("corpus — numberIn", () => {
  it("normalises pesos, percentages and unit words to bare digits", () => {
    expect(numberIn("₱3,000.00 per month")).toEqual(["3000"]);
    expect(numberIn("50% down")).toEqual(["50"]);
    expect(numberIn("50 percent down")).toEqual(["50"]);
    expect(numberIn("₱125k for all six")).toEqual(["125000"]);
  });
  it("keeps a single digit only when a unit follows it", () => {
    expect(numberIn("5 rounds of revisions")).toEqual(["5"]);
    expect(numberIn("the 3 of us met")).toEqual([]);
  });
  it("keeps a meaningful fraction and drops trailing zeros", () => {
    expect(numberIn("₱2,959.82")).toEqual(["2959.82"]);
    expect(numberIn("₱4,000.00")).toEqual(["4000"]);
  });
});

describe("corpus — heuristic extractor", () => {
  const text = [
    "The client agreed to a monthly infrastructure fee of ₱3,000.00 billed on the 1st.",
    "Gelo will send the revised timeline by Friday.",
    "Each deliverable permits up to 5 rounds of revisions.",
    "We had a nice lunch and talked about the weather for a while.",
  ].join(" ");

  it("keeps sentences that carry money, counts or commitments and marks them as guesses", () => {
    const out = extractHeuristic(text, "2026-09-03");
    expect(out.method).toBe("heuristic");
    expect(out.fact.map((f) => f.basis)).toEqual(out.fact.map(() => "heuristic"));
    expect(out.fact.every((f) => f.confidence === 0.3)).toBe(true);
    expect(out.fact.some((f) => f.claim.includes("₱3,000.00"))).toBe(true);
    expect(out.fact.some((f) => f.claim.includes("5 rounds"))).toBe(true);
    expect(out.fact.some((f) => f.claim.includes("weather"))).toBe(false);
  });

  it("routes a bare commitment to an action and reads the owner off the front of it", () => {
    const out = extractHeuristic(text);
    const action = out.action.find((a) => a.description.includes("revised timeline"));
    expect(action).toBeDefined();
    expect(action?.ownerName).toBe("Gelo");
  });

  it("classifies by content", () => {
    const out = extractHeuristic(text);
    const fee = out.fact.find((f) => f.claim.includes("infrastructure fee"));
    const round = out.fact.find((f) => f.claim.includes("rounds"));
    expect(fee?.category).toBe("pricing");
    expect(round?.category).toBe("contract_term");
  });

  it("strips transcript timestamps and speaker labels before judging a line", () => {
    const out = extractHeuristic("`12:04` Speaker 1 — The total fee is ₱200,000.00 for four sites.");
    expect(out.fact[0]?.claim).toBe("The total fee is ₱200,000.00 for four sites.");
  });
});

describe("corpus — templates", () => {
  const body = "Contract between {{client_name}} and ADVO dated {{date}}. Fee {{total_fee}}. Again, {{client_name}}.";
  it("lists each placeholder once", () => {
    expect(placeholderOf(body)).toEqual(["client_name", "date", "total_fee"]);
  });
  it("fills what it is given and reports what it is not, without erasing the slot", () => {
    const out = renderTemplate(body, { client_name: "FourlinQ", date: "08/20/2026" });
    expect(out.text).toContain("between FourlinQ and ADVO dated 08/20/2026");
    expect(out.text).toContain("Fee {{total_fee}}");
    expect(out.missing).toEqual(["total_fee"]);
  });
});

describe.skipIf(skipWhenApiDown)("corpus — live ingest and check", () => {
  const login = async () => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@advo.ph", password: "changeme" }),
    });
    return (await res.json()).data.accessToken as string;
  };
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };

  it("ingests a bundle idempotently, then finds it, conflicts on the wrong number, supports the right one", async () => {
    const token = await login();
    const bundle = {
      source: { kind: "text", externalId: "vitest-corpus-1", title: "Vitest corpus fixture", occurredAt: "2026-09-03" },
      fact: [
        { claim: "The Vitest fixture infrastructure fee is ₱7,777.00 per month.", category: "pricing", quote: "₱7,777.00 per month", basis: "document", confidence: 0.9 },
      ],
      action: [{ description: "Vitest fixture: send the fixture invoice", ownerName: "Gelo" }],
    };
    const first = await call(token, "POST", "/api/corpus/ingest/json", bundle);
    expect(first.status).toBe(201);
    const second = await call(token, "POST", "/api/corpus/ingest/json", bundle);
    expect(second.json.data.corpusSourceId).toBe(first.json.data.corpusSourceId);

    const wrong = await call(token, "POST", "/api/corpus/check", { claim: "the Vitest fixture infrastructure fee is ₱8,888 per month" });
    expect(wrong.json.data.verdict).toBe("conflicting");
    const right = await call(token, "POST", "/api/corpus/check", { claim: "the Vitest fixture infrastructure fee is 7777 pesos monthly" });
    expect(right.json.data.verdict).toBe("supported");

    const action = await call(token, "GET", "/api/corpus/action?status=open");
    const row = (action.json.data as { corpus_action_id: number; description: string }[]).find((a) => a.description.startsWith("Vitest fixture"));
    expect(row).toBeDefined();
    const done = await call(token, "PATCH", `/api/corpus/action/${row!.corpus_action_id}`, { status: "done", resolutionNote: "sent" });
    expect(done.json.data.status).toBe("done");
    expect(done.json.data.resolvedAt).toBeTruthy();
  });

  it("refuses a client session", async () => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "client@advo.ph", password: "changeme" }),
    });
    const token = (await res.json()).data?.accessToken as string | undefined;
    if (!token) return;
    const stat = await call(token, "GET", "/api/corpus/stat");
    expect(stat.status).toBe(403);
  });
});
