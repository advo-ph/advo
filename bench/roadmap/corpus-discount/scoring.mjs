#!/usr/bin/env node
/**
 * corpus-discount — a discount is a fact about a price, not a new price.
 *
 * Runs against a live API (ADVO_API_URL, default the local one), creates a bench
 * project and three bench sources, exercises supersession, fact-check, extraction
 * and the project row, then deletes everything it made. Exit 0 only when every
 * check passes. Same admin login the loader uses (ADVO_EMAIL / ADVO_PASSWORD).
 *
 *   node bench/roadmap/corpus-discount/scoring.mjs
 *   ADVO_API_URL=https://api.advo.ph node bench/roadmap/corpus-discount/scoring.mjs
 */
const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
const EMAIL = process.env.ADVO_EMAIL || "admin@advo.ph";
const PASSWORD = process.env.ADVO_PASSWORD || "changeme";

const CLIENT_A = "Bench Discount Client";
const CLIENT_B = "Bench Arith Client";
const CLIENT_C = "Bench Text Client";
const EXTERNAL = { contract: "bench-discount-contract", addendum: "bench-discount-addendum", arith: "bench-discount-arith", text: "bench-discount-text" };

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
const peso = (cents) => `₱${(cents / 100).toLocaleString("en-PH")}`;

const cleanup = async (projectId) => {
  const source = (await call("GET", "/api/corpus/source")).data ?? [];
  for (const s of source) {
    if (Object.values(EXTERNAL).includes(s.external_id ?? s.externalId)) await call("DELETE", `/api/corpus/source/${s.corpus_source_id ?? s.corpusSourceId}`);
  }
  const project = (await call("GET", "/api/projects")).data ?? [];
  for (const p of project) {
    const id = p.projectId ?? p.project_id;
    if (p.title === "Bench — discount" && id !== projectId) await call("DELETE", `/api/projects/${id}`);
  }
  if (projectId) await call("DELETE", `/api/projects/${projectId}`);
};

const main = async () => {
  const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (!login.data?.accessToken) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.error)}`);
  token = login.data.accessToken;
  await cleanup(null);

  const client = (await call("GET", "/api/clients")).data ?? [];
  const clientId = client[0]?.clientId ?? client[0]?.client_id;
  if (!clientId) throw new Error("no client to hang the bench project on");
  const created = await call("POST", "/api/projects", { clientId, title: "Bench — discount", projectStatus: "discovery", totalValueCents: 18_000_000 });
  const projectId = created.data?.projectId ?? created.data?.project_id;
  if (!projectId) throw new Error(`project create failed: ${created.status} ${JSON.stringify(created.error)}`);

  try {
    // ── The project row carries the deal, list price and discount apart ──
    const patched = await call("PATCH", `/api/projects/${projectId}`, { listValueCents: 20_000_000, discountCents: 2_000_000, discountReason: "referral" });
    const got = (await call("GET", `/api/projects/${projectId}`)).data ?? {};
    check(
      "project-discount-field",
      patched.status === 200 && got.listValueCents === 20_000_000 && got.discountCents === 2_000_000 && got.discountReason === "referral" && got.totalValueCents === 18_000_000,
      "PATCH accepts listValueCents / discountCents / discountReason; GET returns them; totalValueCents stays the charged figure",
      `PATCH ${patched.status}; list ${got.listValueCents} discount ${got.discountCents} reason ${got.discountReason} total ${got.totalValueCents}`,
    );
    const bad = await call("PATCH", `/api/projects/${projectId}`, { listValueCents: 10_000_000, discountCents: 2_000_000 });
    check("project-discount-arithmetic", bad.status === 400, "list − discount ≠ total is refused with 400", `status ${bad.status}`);

    // ── Two documents on one project: the second carries a discount ──
    const contract = await call("POST", "/api/corpus/ingest/json", {
      source: { kind: "drive_doc", externalId: EXTERNAL.contract, title: "Bench contract", documentKind: "contract", occurredAt: "2026-07-01T00:00:00.000Z", projectId },
      fact: [
        { claim: `The total fee for the ${CLIENT_A} website is ₱200,000.00.`, category: "pricing", quote: "Total fee: ₱200,000.00", basis: "document", confidence: 0.95 },
        { claim: `${CLIENT_A} revisions are limited to 5 rounds per deliverable.`, category: "contract_term", quote: "5 rounds", basis: "document", confidence: 0.95 },
      ],
      term: [{ name: "total_fee_cents", value: 20_000_000, unit: "cents" }, { name: "revision_round_count", value: 5, unit: "rounds" }],
    });
    const addendum = await call("POST", "/api/corpus/ingest/json", {
      source: { kind: "drive_doc", externalId: EXTERNAL.addendum, title: "Bench addendum", documentKind: "addendum", occurredAt: "2026-08-01T00:00:00.000Z", projectId },
      fact: [
        { claim: `ADVO grants a 10% referral discount on the ₱200,000.00 fee, so ${CLIENT_A} pays ₱180,000.00.`, category: "pricing", quote: "10% referral discount", basis: "document", confidence: 0.95 },
        { claim: `${CLIENT_A} revisions are limited to 3 rounds per deliverable.`, category: "contract_term", quote: "3 rounds", basis: "document", confidence: 0.95 },
      ],
      term: [
        { name: "list_fee_cents", value: 20_000_000, unit: "cents" },
        { name: "discount_pct", value: 10, unit: "%" },
        { name: "discount_reason", value: "referral" },
        { name: "total_fee_cents", value: 18_000_000, unit: "cents" },
        { name: "revision_round_count", value: 3, unit: "rounds" },
      ],
    });
    check("bench-ingest", contract.status === 201 && addendum.status === 201, "both bench documents ingest", `${contract.status} ${addendum.status} ${JSON.stringify(contract.error ?? addendum.error ?? "")}`);

    const sup = await call("POST", "/api/corpus/supersede");
    const contractSource = (await call("GET", `/api/corpus/source/${contract.data?.corpusSourceId}`)).data ?? {};
    const factOf = (re) => (contractSource.fact ?? []).find((f) => re.test(f.claim));
    const listFact = factOf(/200,000/);
    const roundFact = factOf(/5 rounds/);
    check(
      "discount-does-not-supersede-list-price",
      sup.status === 200 && listFact && listFact.supersededByFactId == null,
      "the contract's ₱200,000 stays live: the addendum's ₱180,000 is the same price after a discount",
      `supersede ${sup.status}; list fact superseded_by ${listFact?.supersededByFactId ?? "(fact missing)"}`,
    );
    check(
      "scope-term-superseded",
      roundFact && roundFact.supersededByFactId != null,
      "the contract's 5 rounds is superseded by the addendum's 3 rounds (a non-money term)",
      `round fact superseded_by ${roundFact?.supersededByFactId ?? "(fact missing)"}`,
    );

    // ── Fact-check reads the discount ──
    const charged = (await call("POST", "/api/corpus/check", { claim: `${CLIENT_A} pays ₱180,000` })).data ?? {};
    check("check-charged-figure", charged.verdict === "supported", "the charged figure is supported", `${charged.verdict}`);
    const list = (await call("POST", "/api/corpus/check", { claim: `The ${CLIENT_A} contract is ₱200,000` })).data ?? {};
    check("check-list-price", list.verdict === "supported", "the list price is supported, not contested by its own discounted figure", `${list.verdict} contested ${list.isContested}`);

    const arith = await call("POST", "/api/corpus/ingest/json", {
      source: { kind: "drive_doc", externalId: EXTERNAL.arith, title: "Bench arith proposal", documentKind: "proposal", occurredAt: "2026-08-15T00:00:00.000Z", projectId },
      fact: [{ claim: `The ${CLIENT_B} fee is ₱300,000.00 with a 10% early-payment discount.`, category: "pricing", quote: "₱300,000.00, 10% discount", basis: "document", confidence: 0.9 }],
      term: [{ name: "list_fee_cents", value: 30_000_000, unit: "cents" }, { name: "discount_pct", value: 10, unit: "%" }],
    });
    const derived = (await call("POST", "/api/corpus/check", { claim: `${CLIENT_B} pays ₱270,000` })).data ?? {};
    check(
      "check-derived-from-discount",
      arith.status === 201 && derived.verdict === "supported" && derived.discount && /270,000/.test(derived.discount.explanation ?? ""),
      "₱270,000 is supported by ₱300,000 less 10%, with the arithmetic shown",
      `${derived.verdict}; discount ${JSON.stringify(derived.discount ?? null)}`,
    );

    // ── Extraction reads a discount out of text ──
    const text = await call("POST", "/api/corpus/ingest/text", {
      title: "Bench discount note",
      kind: "text",
      externalId: EXTERNAL.text,
      occurredAt: "2026-08-20T00:00:00.000Z",
      projectId,
      text: `Payment terms for ${CLIENT_C}. ADVO grants a 10% discount on the ₱200,000.00 fee because the client referred another business, so ${CLIENT_C} pays ₱180,000.00 in total. The balance is due within 15 days of sign-off.`,
    });
    const textSource = (await call("GET", `/api/corpus/source/${text.data?.corpusSourceId}`)).data ?? {};
    const discountFact = (textSource.fact ?? []).find((f) => /discount/i.test(f.claim));
    const discountTerm = (textSource.term ?? []).find((t) => t.name === "discount_pct");
    check(
      "extraction-reads-discount",
      text.status === 201 && discountFact && discountTerm && String(discountTerm.value) === "10",
      "a pasted note yields a discount fact and a discount_pct term of 10, by AI or by heuristic",
      `${text.status} method ${text.data?.method}; fact ${discountFact ? "yes" : "no"}; term ${JSON.stringify(discountTerm ?? null)}`,
    );
  } finally {
    await cleanup(projectId);
  }

  const passed = checks.filter((c) => c.passed).length;
  const out = { bench: "corpus-discount", api: API, passed: passed === checks.length, counts: { passed, failed: checks.length - passed, total: checks.length }, checks };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.passed ? 0 : 1);
};

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
