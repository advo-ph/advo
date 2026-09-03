#!/usr/bin/env node
/**
 * corpus-proposal — assemble a client's current, trusted numbers into a draft,
 * and refuse when the sources disagree.
 *
 * The payoff of the corpus: given a project, gather the live (non-superseded) terms,
 * apply the discount recorded on the project, and fill a template — but only when the
 * numbers agree. Two documents that disagree on the fee must produce a "contested"
 * refusal, not a confident wrong draft, until supersession picks the newer one.
 *
 * Creates a bench project, a template, and two disagreeing documents; drives the
 * resolver through contested → superseded → rendered; deletes what it made.
 *
 *   node bench/roadmap/corpus-proposal/scoring.mjs
 *   ADVO_API_URL=https://api.advo.ph node bench/roadmap/corpus-proposal/scoring.mjs
 */
const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
const EMAIL = process.env.ADVO_EMAIL || "admin@advo.ph";
const PASSWORD = process.env.ADVO_PASSWORD || "changeme";
const EX = { old: "bench-proposal-old", now: "bench-proposal-now" };
const TEMPLATE_NAME = "Bench proposal template";

let token = null;
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, data: json?.data ?? null, error: json?.error ?? null };
};

const checks = [];
const check = (id, passed, expected, actual) => checks.push({ id, passed: Boolean(passed), expected, actual });

const cleanup = async (projectId, templateId) => {
  const source = (await call("GET", "/api/corpus/source")).data ?? [];
  for (const s of source) {
    if (Object.values(EX).includes(s.external_id ?? s.externalId)) await call("DELETE", `/api/corpus/source/${s.corpus_source_id ?? s.corpusSourceId}`);
  }
  if (templateId) await call("DELETE", `/api/corpus/template/${templateId}`);
  const project = (await call("GET", "/api/projects")).data ?? [];
  for (const p of project) {
    const id = p.projectId ?? p.project_id;
    if (p.title === "Bench — proposal" && id !== projectId) await call("DELETE", `/api/projects/${id}`);
  }
  if (projectId) await call("DELETE", `/api/projects/${projectId}`);
};

const main = async () => {
  const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (!login.data?.accessToken) throw new Error(`login failed: ${login.status}`);
  token = login.data.accessToken;

  const client = (await call("GET", "/api/clients")).data ?? [];
  const clientId = client[0]?.clientId ?? client[0]?.client_id;
  if (!clientId) throw new Error("no client");
  const created = await call("POST", "/api/projects", { clientId, title: "Bench — proposal", projectStatus: "discovery", totalValueCents: 18_000_000, listValueCents: 20_000_000, discountCents: 2_000_000, discountReason: "referral" });
  const projectId = created.data?.projectId ?? created.data?.project_id;
  let templateId = null;

  try {
    const tpl = await call("POST", "/api/corpus/template", {
      kind: "proposal",
      name: TEMPLATE_NAME,
      body: "Proposal for {{client_name}}. Total fee: {{total_fee}}. Downpayment: {{downpayment}}. Revisions: {{revision_round_count}} rounds. Discount: {{discount}} ({{discount_reason}}).",
    });
    templateId = tpl.data?.template?.corpusTemplateId ?? tpl.data?.corpusTemplateId;
    check("template", tpl.status === 201 || tpl.status === 200, "bench template created", `${tpl.status}`);

    // Two documents disagree on the fee: July ₱150,000 / 4 rounds, August ₱200,000 / 3 rounds.
    await call("POST", "/api/corpus/ingest/json", {
      source: { kind: "drive_doc", externalId: EX.old, title: "Bench old contract", documentKind: "contract", occurredAt: "2026-07-01T00:00:00.000Z", projectId },
      fact: [{ claim: "The total fee is ₱150,000.00.", category: "pricing", quote: "₱150,000.00", basis: "document", confidence: 0.9 }],
      term: [{ name: "total_fee_cents", value: 15_000_000, unit: "cents" }, { name: "revision_round_count", value: 4, unit: "rounds" }],
    });
    await call("POST", "/api/corpus/ingest/json", {
      source: { kind: "drive_doc", externalId: EX.now, title: "Bench new contract", documentKind: "contract", occurredAt: "2026-08-01T00:00:00.000Z", projectId },
      fact: [
        { claim: "The total fee is ₱200,000.00.", category: "pricing", quote: "₱200,000.00", basis: "document", confidence: 0.95 },
        { claim: "The downpayment is ₱20,000.00.", category: "pricing", quote: "₱20,000.00", basis: "document", confidence: 0.95 },
      ],
      term: [{ name: "total_fee_cents", value: 20_000_000, unit: "cents" }, { name: "downpayment_cents", value: 2_000_000, unit: "cents" }, { name: "revision_round_count", value: 3, unit: "rounds" }],
    });

    // ── Before supersession: the fee is contested, and the resolver refuses to draft ──
    const contested = (await call("POST", "/api/corpus/proposal", { projectId, corpusTemplateId: templateId })).data ?? {};
    check(
      "refuses-when-contested",
      Array.isArray(contested.contested) && contested.contested.some((c) => c.name === "total_fee_cents") && contested.draft == null,
      "total_fee_cents is contested (₱150k vs ₱200k) and no draft is produced",
      `contested ${JSON.stringify(contested.contested?.map((c) => c.name))}; draft ${contested.draft == null ? "null" : "present"}`,
    );

    // ── Supersession picks the newer document ──
    await call("POST", "/api/corpus/supersede");
    const resolved = (await call("POST", "/api/corpus/proposal", { projectId, corpusTemplateId: templateId })).data ?? {};
    check(
      "resolves-after-supersede",
      (resolved.contested ?? []).length === 0 && resolved.draft,
      "with the older fee superseded, nothing is contested and a draft is produced",
      `contested ${(resolved.contested ?? []).length}; draft ${resolved.draft ? "present" : "null"}`,
    );
    check(
      "draft-carries-current-numbers",
      resolved.draft && /200,000/.test(resolved.draft) && /20,000/.test(resolved.draft) && /3 rounds/.test(resolved.draft) && !/150,000/.test(resolved.draft) && !/\{\{total_fee\}\}/.test(resolved.draft),
      "the draft has the current fee, downpayment and 3 rounds, not the superseded fee or an unfilled slot",
      `${(resolved.draft ?? "").slice(0, 200)}`,
    );
    check(
      "applies-discount",
      resolved.discount && resolved.discount.discountCents === 2_000_000 && /referral/.test(resolved.draft ?? ""),
      "the project's discount is resolved and named in the draft",
      `discount ${JSON.stringify(resolved.discount ?? null)}`,
    );
    check(
      "reports-missing-and-provenance",
      Array.isArray(resolved.missing) && Array.isArray(resolved.resolved) && resolved.resolved.some((r) => r.name === "total_fee_cents" && /Bench new contract/.test(r.sourceTitle ?? "")),
      "resolved terms cite the source they came from; unfilled placeholders are listed",
      `resolved ${resolved.resolved?.length}; missing ${JSON.stringify(resolved.missing)}`,
    );
  } finally {
    await cleanup(projectId, templateId);
  }

  const passed = checks.filter((c) => c.passed).length;
  const out = { bench: "corpus-proposal", api: API, passed: passed === checks.length, counts: { passed, failed: checks.length - passed, total: checks.length }, checks };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.passed ? 0 : 1);
};

main().catch((err) => { console.error(err); process.exit(2); });
