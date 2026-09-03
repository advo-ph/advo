#!/usr/bin/env node
/**
 * corpus-verify — a human can review pricing facts and mark them trusted in a pass.
 *
 * 825 facts, none verified by a person, is the gap this closes. A reviewer needs to
 * filter to the facts that matter (pricing, contract terms) and the ones nobody has
 * checked yet, then confirm or reject them in bulk. This bench creates a bench source
 * with unverified pricing facts, filters the unverified queue, bulk-verifies, checks
 * the count moved, then deletes what it made. Exit 0 only when every check passes.
 *
 *   node bench/roadmap/corpus-verify/scoring.mjs
 *   ADVO_API_URL=https://api.advo.ph node bench/roadmap/corpus-verify/scoring.mjs
 */
const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
const EMAIL = process.env.ADVO_EMAIL || "admin@advo.ph";
const PASSWORD = process.env.ADVO_PASSWORD || "changeme";
const EXTERNAL = "bench-verify-source";

let token = null;
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, data: json?.data ?? null, error: json?.error ?? null };
};

const checks = [];
const check = (id, passed, expected, actual) => checks.push({ id, passed: Boolean(passed), expected, actual });

const cleanup = async () => {
  const source = (await call("GET", "/api/corpus/source")).data ?? [];
  for (const s of source) {
    if ((s.external_id ?? s.externalId) === EXTERNAL) await call("DELETE", `/api/corpus/source/${s.corpus_source_id ?? s.corpusSourceId}`);
  }
};

const main = async () => {
  const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (!login.data?.accessToken) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.error)}`);
  token = login.data.accessToken;
  await cleanup();

  const ingest = await call("POST", "/api/corpus/ingest/json", {
    source: { kind: "text", externalId: EXTERNAL, title: "Bench verify source", occurredAt: "2026-08-01T00:00:00.000Z" },
    fact: [
      { claim: "Bench verify: the website fee is ₱90,000.00.", category: "pricing", quote: "₱90,000.00", basis: "document", confidence: 0.9 },
      { claim: "Bench verify: the downpayment is ₱30,000.00.", category: "pricing", quote: "₱30,000.00", basis: "document", confidence: 0.9 },
      { claim: "Bench verify: revisions are 4 rounds.", category: "contract_term", quote: "4 rounds", basis: "document", confidence: 0.9 },
      { claim: "Bench verify: the client likes blue.", category: "brand", quote: "blue", basis: "ai_note", confidence: 0.5 },
    ],
  });
  const sourceId = ingest.data?.corpusSourceId;
  check("bench-ingest", ingest.status === 201 && sourceId, "the bench source ingests", `${ingest.status} ${JSON.stringify(ingest.error ?? "")}`);

  try {
    const factOf = async (query) => (await call("GET", `/api/corpus/fact?${query}&limit=500`)).data ?? [];
    const mine = (list) => list.filter((f) => f.corpus_source_id === sourceId);

    // ── The unverified pricing queue holds this source's two pricing facts ──
    const unverifiedPricing = mine(await factOf("category=pricing&verified=false"));
    check(
      "filter-unverified-pricing",
      unverifiedPricing.length === 2 && unverifiedPricing.every((f) => !f.is_verified),
      "filtering to unverified pricing facts finds exactly the two bench pricing facts",
      `${unverifiedPricing.length} found`,
    );

    // ── Bulk-verify them in one call ──
    const ids = unverifiedPricing.map((f) => f.corpus_fact_id);
    const bulk = await call("POST", "/api/corpus/fact/verify", { corpusFactId: ids, isVerified: true });
    check(
      "bulk-verify",
      bulk.status === 200 && bulk.data?.updated === 2,
      "one call verifies both, reporting how many it changed",
      `${bulk.status}; updated ${bulk.data?.updated}`,
    );

    // ── They leave the unverified queue; the verified filter finds them ──
    const stillUnverified = mine(await factOf("category=pricing&verified=false"));
    const nowVerified = mine(await factOf("category=pricing&verified=true"));
    check(
      "queue-drains",
      stillUnverified.length === 0 && nowVerified.length === 2 && nowVerified.every((f) => f.is_verified),
      "the two facts leave the unverified queue and appear as verified",
      `unverified ${stillUnverified.length}, verified ${nowVerified.length}`,
    );

    // ── Rejecting (isVerified false) puts one back ──
    const reject = await call("POST", "/api/corpus/fact/verify", { corpusFactId: [ids[0]], isVerified: false });
    const backInQueue = mine(await factOf("category=pricing&verified=false"));
    check(
      "bulk-unverify",
      reject.status === 200 && reject.data?.updated === 1 && backInQueue.length === 1 && backInQueue[0].corpus_fact_id === ids[0],
      "unverifying a fact returns it to the queue",
      `${reject.status}; back in queue ${backInQueue.length}`,
    );

    // ── The contract-term fact is untouched by a pricing pass ──
    const term = mine(await factOf("category=contract_term&verified=false"));
    check("category-scoped", term.length === 1, "verifying pricing did not touch the contract-term fact", `${term.length} unverified contract terms`);
  } finally {
    await cleanup();
  }

  const passed = checks.filter((c) => c.passed).length;
  const out = { bench: "corpus-verify", api: API, passed: passed === checks.length, counts: { passed, failed: checks.length - passed, total: checks.length }, checks };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.passed ? 0 : 1);
};

main().catch((err) => { console.error(err); process.exit(2); });
