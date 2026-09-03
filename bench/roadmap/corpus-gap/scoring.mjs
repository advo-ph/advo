#!/usr/bin/env node
/**
 * Corpus gaps — authored 2026-09-03, RED at authoring.
 *
 * The verifier for "fix all the gaps, and also ingest it to the platform". Each
 * check is a thing the platform can be asked over its own API, so the loop grinds
 * against prod (or whichever API ADVO_API_URL names), not against a claim.
 *
 *   ADVO_API_URL=https://api.advo.ph ADVO_EMAIL=... ADVO_PASSWORD=... node bench/roadmap/corpus-gap/scoring.mjs
 */
const API = (process.env.ADVO_API_URL || "http://127.0.0.1:6407").replace(/\/$/, "");
const EMAIL = process.env.ADVO_EMAIL || "admin@advo.ph";
const PASSWORD = process.env.ADVO_PASSWORD || "changeme";

const login = async () => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json.data?.accessToken) throw new Error(`login failed at ${API}`);
  return json.data.accessToken;
};
const token = await login();
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const get = async (path) => (await (await fetch(`${API}${path}`, { headers: h })).json()).data;
const post = async (path, body) => (await (await fetch(`${API}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) })).json()).data;

const project = await get("/api/projects");
const byTitle = (t) => project.find((p) => (p.title ?? "").toLowerCase() === t.toLowerCase());
const stat = await get("/api/corpus/stat");
const source = await get("/api/corpus/source");
const recurring = await get("/api/recurring-fee");
const felici = await post("/api/corpus/check", { claim: "Felici pays ₱3,000 a month for infrastructure" });
const vbe = byTitle("VBE Eye Center Website");
const vbeFeed = vbe?.repositoryName ? await get(`/api/github/repos/${encodeURIComponent(vbe.repositoryName)}/commits?limit=5`) : [];

const linked = project.filter((p) => p.repositoryName);
const feedCount = {};
for (const p of linked) feedCount[p.repositoryName] = ((await get(`/api/github/repos/${encodeURIComponent(p.repositoryName)}/commits?limit=200`)) ?? []).length;

const check = [
  {
    id: "vbe-repo-linked",
    title: "VBE Eye Center points at a repository that answers, wherever it lives",
    passed: Boolean(vbe?.repositoryName) && Array.isArray(vbeFeed) && vbeFeed.length > 0,
    expected: `VBE has repositoryName "${vbe?.repositoryName ?? "—"}" and ${Array.isArray(vbeFeed) ? vbeFeed.length : 0} commits in its feed. The source is CelestialBrain/vbeeyecenter, outside the org, so the feed must accept an owner-qualified name.`,
  },
  {
    id: "every-linked-repo-has-history",
    title: "Every project with a repository shows commit history to its client",
    passed: linked.length >= 6 && Object.values(feedCount).every((n) => n > 0),
    expected: `Linked: ${linked.length}; feeds: ${JSON.stringify(feedCount)}.`,
  },
  {
    id: "felici-sister-sites",
    title: "The four Felici sites in the 08/22 contract are four projects",
    passed: ["Felici Artisan Gelato", "Nokohi", "Flowers and Chocolates", "Felici Cafe"].every((t) => byTitle(t)),
    expected: "Nokohi, Flowers and Chocolates and Felici Cafe exist as projects under the same client as Felici Artisan Gelato.",
  },
  {
    id: "felici-contract-value",
    title: "Felici's project values match the signed contract",
    passed: (() => {
      const g = byTitle("Felici Artisan Gelato");
      return Boolean(g) && g.totalValueCents === 4_500_000 && g.amountPaidCents === 2_000_000;
    })(),
    expected: "Gelato site ₱45,000 with the ₱20,000 down payment recorded on it; the other three sites ₱45,000 each.",
  },
  {
    id: "recurring-fee-contracted",
    title: "Every contracted recurring fee has a row",
    passed: Array.isArray(recurring) && recurring.length >= 3 && recurring.some((r) => r.amountCents === 400_000) && recurring.some((r) => r.amountCents === 300_000) && recurring.some((r) => r.amountCents === 500_000),
    expected: `Found ${Array.isArray(recurring) ? recurring.length : 0}. Need FourlinQ app ₱3,000/month, Felici ₱4,000/month, FourlinQ website ₱5,000/year.`,
  },
  {
    id: "superseded-fact-stays-quiet",
    title: "A number a newer contract replaced no longer answers as live",
    passed: felici?.verdict !== "supported" || felici?.match.every((m) => m.superseded === true || m.claim.includes("4,000") || m.claim.includes("4000")),
    expected: `"Felici pays ₱3,000 a month" → ${felici?.verdict} (contested ${felici?.isContested}). July's ₱3,000 must be marked superseded by August's ₱4,000.`,
  },
  {
    id: "repo-knowledge-ingested",
    title: "What ADVO shipped, read from the client repositories, is in the corpus",
    passed: Array.isArray(source) && source.filter((s) => s.kind === "local_file").length >= 4,
    expected: `local_file sources: ${Array.isArray(source) ? source.filter((s) => s.kind === "local_file").length : 0}. The case studies (features with proof paths) belong in the corpus as facts.`,
  },
  {
    id: "corpus-loaded",
    title: "The first pass is on this database",
    passed: Number(stat?.source_count ?? 0) >= 28 && Number(stat?.fact_count ?? 0) >= 700,
    expected: `sources ${stat?.source_count}, facts ${stat?.fact_count}.`,
  },
];

const passed = check.every((c) => c.passed);
console.log(JSON.stringify({ benchmark: "corpus-gap", api: API, date: "2026-09-03", passed, counts: { passed: check.filter((c) => c.passed).length, failed: check.filter((c) => !c.passed).length, total: check.length }, checks: check }, null, 2));
process.exit(passed ? 0 : 1);
