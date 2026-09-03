/**
 * The corpus — ingestion, extraction, fact-check, templates (migration 027).
 *
 * Three ways a fact gets in, in descending order of trust:
 *   1. A curated bundle (the JSON the ingestion pass writes under data/corpus/):
 *      claims with verbatim quotes and timestamps, produced by an agent that read
 *      the whole transcript. basis = transcript | document | ai_note.
 *   2. Claude, when ANTHROPIC_API_KEY is set. Same shape, produced live from a
 *      pasted text or a Plaud share. The model is CORPUS_EXTRACT_MODEL, so the
 *      first massive pass can run on Opus and the steady state on something
 *      cheaper without touching code.
 *   3. A regex heuristic, when there is no key. It keeps sentences that carry
 *      money, percentages, dates or commitment verbs, and marks them
 *      basis = heuristic at confidence 0.3. Honest about being a guess.
 *
 * Fact-check is Postgres full-text over claim + quote, ranked. The verdict it
 * returns is a HEURISTIC over numbers in the claim versus numbers in the
 * matches — it says "supported / conflicting / unknown" and shows its work; it
 * never asserts truth the sources do not carry.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  corpusAction,
  corpusFact,
  corpusSource,
  corpusTemplate,
  corpusTerm,
  lead,
  project,
} from "../db/schema.js";

export const SOURCE_KIND = ["plaud", "drive_doc", "local_file", "web", "text"] as const;
export const FACT_BASIS = ["transcript", "document", "ai_note", "heuristic", "human"] as const;
export const FACT_CATEGORY = [
  "pricing",
  "contract_term",
  "scope",
  "timeline",
  "commitment",
  "decision",
  "contact",
  "brand",
  "process",
  "risk",
  "client_need",
  "product",
  "identity",
] as const;
export const TEMPLATE_KIND = [
  "contract",
  "proposal",
  "signoff",
  "addendum",
  "pitch_deck",
  "campaign",
  "brand",
  "invoice",
  "minutes",
  "other",
] as const;

export type SourceKind = (typeof SOURCE_KIND)[number];
export type FactBasis = (typeof FACT_BASIS)[number];
export type FactCategory = (typeof FACT_CATEGORY)[number];

export interface IngestSource {
  kind: SourceKind;
  externalId: string;
  url?: string | null;
  title: string;
  documentKind?: string | null;
  occurredAt?: string | Date | null;
  durationSecond?: number | null;
  language?: string | null;
  summary?: string | null;
  projectId?: number | null;
  clientId?: number | null;
  leadName?: string | null;
  meta?: Record<string, unknown>;
}
export interface IngestFact {
  claim: string;
  category: string;
  quote?: string | null;
  locator?: string | null;
  speaker?: string | null;
  basis: FactBasis;
  confidence: number;
  occurredAt?: string | Date | null;
  projectId?: number | null;
}
export interface IngestTerm {
  name: string;
  value: string | number;
  unit?: string | null;
  quote?: string | null;
}
export interface IngestAction {
  description: string;
  ownerName?: string | null;
  dueAt?: string | Date | null;
  locator?: string | null;
  basis?: FactBasis;
  projectId?: number | null;
}
export interface IngestBundle {
  source: IngestSource;
  fact?: IngestFact[];
  term?: IngestTerm[];
  action?: IngestAction[];
}

const asDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
const categoryOf = (c: string): FactCategory =>
  (FACT_CATEGORY as readonly string[]).includes(c) ? (c as FactCategory) : "process";

/**
 * Resolve a lead by name, creating one if the corpus names an organisation the pipeline
 * has never seen. A prospect that exists only in a recording is still a prospect.
 */
async function resolveLeadId(leadName: string | null | undefined): Promise<number | null> {
  const name = leadName?.trim();
  if (!name) return null;
  const d = db();
  const [existing] = await d
    .select({ leadId: lead.leadId })
    .from(lead)
    .where(sql`lower(${lead.company}) = lower(${name}) or lower(${lead.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.leadId;
  const [created] = await d
    .insert(lead)
    .values({
      name,
      company: name,
      // A lead row needs an address; the corpus does not know one. This placeholder is
      // obviously fake on purpose, so nobody mails it.
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@corpus.invalid`,
      description: "Created by corpus ingestion from a recording or document that named this organisation.",
      status: "new",
    })
    .returning({ leadId: lead.leadId });
  return created?.leadId ?? null;
}

/**
 * A bundle written against one database's project ids may be loaded into another
 * (the curated pass maps to prod ids; a laptop has its own). An id that does not
 * exist here is dropped to null and remembered in meta, rather than failing the
 * whole source on a foreign key.
 */
async function existingProjectId(candidate: (number | null | undefined)[]): Promise<Set<number>> {
  const wanted = [...new Set(candidate.filter((n): n is number => typeof n === "number"))];
  if (wanted.length === 0) return new Set();
  const row = await db()
    .select({ projectId: project.projectId })
    .from(project)
    .where(sql`${project.projectId} in ${wanted}`);
  return new Set(row.map((r) => r.projectId));
}

/** Upsert the source and REPLACE its facts, terms and actions. Idempotent per (kind, externalId). */
export async function ingestBundle(bundle: IngestBundle, userId: number | null) {
  const d = db();
  const known = await existingProjectId([
    bundle.source.projectId,
    ...(bundle.fact ?? []).map((f) => f.projectId),
    ...(bundle.action ?? []).map((a) => a.projectId),
  ]);
  const keep = (id: number | null | undefined) => (typeof id === "number" && known.has(id) ? id : null);
  const s: IngestSource = {
    ...bundle.source,
    projectId: keep(bundle.source.projectId),
    meta: {
      ...(bundle.source.meta ?? {}),
      ...(typeof bundle.source.projectId === "number" && !known.has(bundle.source.projectId)
        ? { unresolvedProjectId: bundle.source.projectId }
        : {}),
    },
  };
  const leadId = await resolveLeadId(s.leadName);
  const values = {
    kind: s.kind,
    externalId: s.externalId,
    url: s.url ?? null,
    title: s.title.slice(0, 500),
    documentKind: s.documentKind ?? null,
    occurredAt: asDate(s.occurredAt),
    durationSecond: s.durationSecond ?? null,
    language: s.language ?? null,
    summary: s.summary ?? null,
    projectId: s.projectId ?? null,
    clientId: s.clientId ?? null,
    leadId,
    leadName: s.leadName ?? null,
    meta: s.meta ?? {},
    ingestedBy: userId,
    updatedAt: new Date(),
  };
  const [row] = await d
    .insert(corpusSource)
    .values(values)
    .onConflictDoUpdate({ target: [corpusSource.kind, corpusSource.externalId], set: values })
    .returning();
  const sourceId = row.corpusSourceId;

  await d.delete(corpusAction).where(eq(corpusAction.corpusSourceId, sourceId));
  await d.delete(corpusTerm).where(eq(corpusTerm.corpusSourceId, sourceId));
  await d.delete(corpusFact).where(eq(corpusFact.corpusSourceId, sourceId));

  const fact = bundle.fact ?? [];
  if (fact.length > 0) {
    await d.insert(corpusFact).values(
      fact
        .filter((f) => f.claim?.trim())
        .map((f) => ({
          corpusSourceId: sourceId,
          claim: f.claim.trim(),
          category: categoryOf(f.category),
          quote: f.quote?.slice(0, 2000) ?? null,
          locator: f.locator?.slice(0, 120) ?? null,
          speaker: f.speaker?.slice(0, 120) ?? null,
          basis: (FACT_BASIS as readonly string[]).includes(f.basis) ? f.basis : "ai_note",
          confidence: clamp01(f.confidence).toFixed(2),
          occurredAt: asDate(f.occurredAt) ?? asDate(s.occurredAt),
          projectId: keep(f.projectId) ?? s.projectId ?? null,
        })),
    );
  }
  const term = bundle.term ?? [];
  if (term.length > 0) {
    await d.insert(corpusTerm).values(
      term
        .filter((t) => t.name?.trim())
        .map((t) => ({
          corpusSourceId: sourceId,
          name: t.name.trim().slice(0, 80),
          value: String(t.value).slice(0, 255),
          unit: t.unit ?? null,
          quote: t.quote ?? null,
        })),
    );
  }
  const action = bundle.action ?? [];
  if (action.length > 0) {
    await d.insert(corpusAction).values(
      action
        .filter((a) => a.description?.trim())
        .map((a) => ({
          corpusSourceId: sourceId,
          description: a.description.trim(),
          ownerName: a.ownerName?.slice(0, 120) ?? null,
          projectId: keep(a.projectId) ?? s.projectId ?? null,
          dueAt: asDate(a.dueAt),
          locator: a.locator?.slice(0, 120) ?? null,
          basis: a.basis && (FACT_BASIS as readonly string[]).includes(a.basis) ? a.basis : "transcript",
        })),
    );
  }
  return {
    corpusSourceId: sourceId,
    factCount: fact.length,
    termCount: term.length,
    actionCount: action.length,
    leadId,
  };
}

// ─── Extraction ──────────────────────────────────────

export interface Extraction {
  method: "ai" | "heuristic";
  fact: IngestFact[];
  action: IngestAction[];
  term: IngestTerm[];
  summary: string | null;
}

/** Term names a discount is written under; the supersede and fact-check passes read them. */
export const DISCOUNT_TERM = ["discount_pct", "discount_cents", "discount_reason", "list_fee_cents"] as const;

/**
 * A discount is a fact about a price, not a new price. Whatever the extractor (AI or
 * regex) makes of the sentences, the typed terms are read here, deterministically:
 * "10% referral discount on the ₱200,000.00 fee" gives discount_pct 10, list_fee_cents
 * 20000000 and discount_reason "referral". A peso discount ("less ₱20,000") gives
 * discount_cents. Only the first discount in a text is typed; the rest stay facts.
 */
export function discountTermIn(text: string): IngestTerm[] {
  const out: IngestTerm[] = [];
  const pct = text.match(/(\d{1,2}(?:\.\d+)?)\s?(?:%|percent)\s+(?:([a-z-]+)\s+)?discount/i);
  const peso = text.match(/(?:discount|less|waive[sd]?|deduct(?:ed|s)?)\s+(?:of\s+)?(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/i);
  if (pct) {
    out.push({ name: "discount_pct", value: pct[1], unit: "%", quote: pct[0] });
    if (pct[2] && !/^(?:a|an|the|flat|full|total)$/i.test(pct[2])) out.push({ name: "discount_reason", value: pct[2].toLowerCase(), unit: null, quote: pct[0] });
  } else if (peso) {
    out.push({ name: "discount_cents", value: String(Number(peso[1].replace(/,/g, "")) * 100), unit: "cents", quote: peso[0] });
  }
  if (out.length === 0) return out;
  const reason = text.match(/discount\b[^.]*\bbecause\s+([^.]{4,80})/i);
  if (reason && !out.some((t) => t.name === "discount_reason")) out.push({ name: "discount_reason", value: reason[1].trim(), unit: null, quote: reason[0] });
  // The list price is the figure the discount is taken from: "on the ₱200,000.00 fee",
  // "of the ₱200,000 contract", or the first money figure before the word discount.
  const list =
    text.match(/discount\s+(?:on|off|of|from)\s+(?:the\s+)?(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})+|\d{4,})/i) ??
    text.match(/(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?[^.]{0,80}?\bdiscount/i);
  if (list) out.push({ name: "list_fee_cents", value: String(Number(list[1].replace(/,/g, "")) * 100), unit: "cents", quote: list[0].slice(0, 200) });
  return out;
}

const MONEY = /₱\s?[\d,]+(?:\.\d+)?|\b(?:php|pesos?)\s?[\d,]+/i;
const NUMBERISH = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?%|\b\d{1,2}[:.]\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d+\s?(?:days?|weeks?|months?|years?|rounds?)\b/i;
const COMMIT = /\b(?:will|agreed?|must|shall|deadline|due|by (?:mon|tue|wed|thu|fri|sat|sun|next)|commit|deliver|send|follow ?up|kailangan|dapat|ipapadala|gagawin)\b/i;

const guessCategory = (line: string): FactCategory => {
  if (MONEY.test(line) || /\bfee|price|cost|invoice|payment|down ?payment|discount|waive/i.test(line)) return "pricing";
  if (/\bround|revision|deemed|penalt|terminat|ownership|warranty\b/i.test(line)) return "contract_term";
  if (/\bdeadline|week|month|timeline|launch|deliver(?:y|ed)?\b/i.test(line)) return "timeline";
  if (/\bscope|feature|page|module|system|app\b/i.test(line)) return "scope";
  if (/\bemail|phone|contact|@\b/i.test(line)) return "contact";
  if (COMMIT.test(line)) return "commitment";
  return "process";
};

/** Sentences with a number, money, or a commitment verb. Marked as the guess it is. */
export function extractHeuristic(text: string, occurredAt?: string | Date | null): Extraction {
  const line = text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z₱\d])/)
    .map((l) => l.replace(/^`?\d{1,2}:\d{2}`?\s*[^—]*—\s*/, "").trim())
    .filter((l) => l.length >= 24 && l.length <= 400);
  const fact: IngestFact[] = [];
  const action: IngestAction[] = [];
  const seen = new Set<string>();
  for (const l of line) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    const hasNumber = MONEY.test(l) || NUMBERISH.test(l);
    const hasCommit = COMMIT.test(l);
    if (!hasNumber && !hasCommit) continue;
    seen.add(key);
    if (hasCommit && !hasNumber && /\b(?:will|ipapadala|gagawin|send|follow ?up)\b/i.test(l)) {
      const owner = l.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:will|shall|to)\b/);
      action.push({ description: l, ownerName: owner?.[1] ?? null, basis: "heuristic" });
      continue;
    }
    fact.push({
      claim: l,
      category: guessCategory(l),
      quote: l,
      basis: "heuristic",
      confidence: 0.3,
      occurredAt: occurredAt ?? null,
    });
    if (fact.length >= 60) break;
  }
  return { method: "heuristic", fact, action: action.slice(0, 30), term: discountTermIn(text), summary: null };
}

const AI_SYSTEM = `You extract a fact corpus from a transcript or document for ADVO, a Philippine software agency.
Return ONLY JSON: {"summary": string, "fact": [...], "action": [...]}.
fact item: {"claim": one declarative checkable sentence, "category": one of ${FACT_CATEGORY.join("|")}, "quote": verbatim passage <=300 chars, "locator": "m:ss" timestamp if the text has them else the heading, "speaker": label or null, "basis": "transcript" if the quote is in the text else "ai_note", "confidence": 0..1}
action item: {"description": imperative one line, "ownerName": person or "ADVO" or "client" or null, "dueAt": ISO date or null, "locator": "m:ss" or null}
Rules: prefer money, dates, scope, commitments, named contacts. Keep Taglish verbatim in quotes. Never invent a number that is not in the text. 8 to 40 facts.
A discount is a fact about a price, not a new price: when the text grants one, state the list price, the discount (percent or amount, and why) and the charged price as separate pricing claims.`;

export async function extractWithAI(text: string, occurredAt?: string | Date | null): Promise<Extraction | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.CORPUS_EXTRACT_MODEL || "claude-opus-5",
      max_tokens: 12000,
      output_config: { effort: "medium" },
      system: AI_SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 120_000) }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(raw) as { summary?: string; fact?: IngestFact[]; action?: IngestAction[] };
    return {
      method: "ai",
      summary: parsed.summary ?? null,
      fact: (parsed.fact ?? []).map((f) => ({ ...f, occurredAt: f.occurredAt ?? occurredAt ?? null })),
      action: parsed.action ?? [],
      term: discountTermIn(text),
    };
  } catch (err) {
    console.error("[corpus] AI extraction failed; falling back to heuristic:", err);
    return null;
  }
}

export async function extract(text: string, occurredAt?: string | Date | null): Promise<Extraction> {
  return (await extractWithAI(text, occurredAt)) ?? extractHeuristic(text, occurredAt);
}

// ─── Fact-check ──────────────────────────────────────

export interface CheckMatch {
  corpusFactId: number;
  claim: string;
  quote: string | null;
  locator: string | null;
  basis: string;
  confidence: number;
  isVerified: boolean;
  occurredAt: string | null;
  projectId: number | null;
  rank: number;
  source: { corpusSourceId: number; kind: string; title: string; url: string | null };
  sharesEveryNumber: boolean;
  /** Pointed at a newer fact by supersession; shown, never counted as support. */
  superseded: boolean;
}

/**
 * Numbers that matter for agreement: peso amounts, percentages, day/round/month
 * counts. Normalised to bare digits so "50%" and "50 percent" agree and "₱3,000.00"
 * and "3000" agree. A lone single digit only counts when a unit word follows it
 * ("5 rounds" yes, "the 3 of us" no), which keeps ordinary prose out of the verdict.
 */
export function numberIn(text: string): string[] {
  const out = new Set<string>();
  const re = /₱?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|percent|k\b|rounds?|days?|weeks?|months?|years?|pesos?|php)?/gi;
  for (const m of text.matchAll(re)) {
    const digits = m[1].replace(/,/g, "");
    const fraction = m[2] && /[1-9]/.test(m[2]) ? `.${m[2].replace(/0+$/, "")}` : "";
    const unit = m[3]?.toLowerCase();
    if (digits.length === 1 && !unit) continue;
    out.add(unit === "k" ? `${digits}000` : `${digits}${fraction}`);
  }
  return [...out];
}

/**
 * Numbers are what a claim is usually wrong ABOUT, so they must not be required
 * search terms: "the infra fee is ₱4,000" has to find the fact that says ₱3,000.
 * Words are searched (all of them first, any of them as a fallback); the numbers
 * are compared afterwards, which is what produces the "conflicting" verdict.
 */
const wordQuery = (claim: string) =>
  claim
    .replace(/₱?\s?\d[\d,]*(?:\.\d+)?\s?%?/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 12);

export async function checkClaim(claim: string, limit = 10) {
  const d = db();
  const q = claim.trim();
  const word = wordQuery(q);
  const select = (tsquery: ReturnType<typeof sql>) =>
    d.execute(sql`
    select f.corpus_fact_id, f.claim, f.quote, f.locator, f.basis, f.confidence, f.is_verified,
           f.occurred_at, f.project_id, f.superseded_by_fact_id,
           s.corpus_source_id, s.kind, s.title, s.url,
           ts_rank(f.search, ${tsquery}) as rank
    from corpus_fact f
    join corpus_source s on s.corpus_source_id = f.corpus_source_id
    where f.search @@ ${tsquery}
    order by rank desc, f.confidence desc
    limit ${limit * 5}
  `);
  const wanted = numberIn(q);
  // Names in the claim — a client, a product, a person — read as capitalised words
  // that are not sentence-initial stopwords. A wide result is kept to matches that
  // name what the claim names, so "Felici pays ..." is answered by Felici's sources
  // and not by whichever fact shares the word "month".
  const name = [...q.matchAll(/\b([A-Z][\p{L}\p{N}-]{2,})\b/gu)]
    .map((m) => m[1].toLowerCase())
    .filter((w) => !["the", "our", "their", "this", "that", "each", "every", "does", "will"].includes(w));
  const narrowByName = (list: Record<string, unknown>[]) => {
    if (name.length === 0) return list;
    const narrowed = list.filter((r) => {
      const hay = `${r.claim ?? ""} ${r.quote ?? ""} ${r.title ?? ""}`.toLowerCase();
      return name.some((n) => hay.includes(n));
    });
    return narrowed.length > 0 ? narrowed : list;
  };
  const carriesEvery = (r: Record<string, unknown>) => {
    const have = numberIn(`${r.claim ?? ""} ${r.quote ?? ""}`);
    return wanted.every((n) => have.includes(n));
  };
  let row: Record<string, unknown>[] = [];
  if (word.length > 0) {
    const anyOf = word.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).join(" | ");
    row = (await select(sql`plainto_tsquery('english', ${word.join(" ")})`)) as unknown as Record<string, unknown>[];
    if (row.length === 0) {
      row = narrowByName((await select(sql`to_tsquery('english', ${anyOf})`)) as unknown as Record<string, unknown>[]);
    }
    // Only a real figure (four digits or more) is worth rescuing: "60" or "3 rounds"
    // occur in too many unrelated lines to be evidence of anything.
    const figure = wanted.filter((n) => n.replace(/\D/g, "").length >= 4);
    if (figure.length > 0 && !row.some(carriesEvery)) {
      // The words matched, but no match carries the claim's figure. The figure may sit
      // in a fact that does not repeat the client's name ("The ₱200,000 total fee covers
      // design and development"): look once more for any-word matches that carry it,
      // and put them first, so a true claim is not called conflicting for the phrasing.
      // The figure is searched as text here (digits with optional thousands
      // separators, on its own digit boundary), since the word index deliberately
      // carries no numbers.
      const digitPattern = figure.map((n) => n.replace(/\./g, "\\.").split("").join(",?")).join("|");
      const pattern = `(^|[^0-9,.])(${digitPattern})([^0-9,]|,[^0-9]|$)`;
      const byNumber = (await d.execute(sql`
        select f.corpus_fact_id, f.claim, f.quote, f.locator, f.basis, f.confidence, f.is_verified,
               f.occurred_at, f.project_id, f.superseded_by_fact_id,
               s.corpus_source_id, s.kind, s.title, s.url,
               0.0 as rank
        from corpus_fact f
        join corpus_source s on s.corpus_source_id = f.corpus_source_id
        where (f.claim || ' ' || coalesce(f.quote, '')) ~ ${pattern}
        order by f.confidence desc
        limit ${limit * 5}
      `)) as unknown as Record<string, unknown>[];
      const rescue = narrowByName(byNumber)
        .filter(carriesEvery)
        .filter((r) => !row.some((x) => x.corpus_fact_id === r.corpus_fact_id));
      row = [...rescue, ...row];
    }
  }
  const match: CheckMatch[] = row.slice(0, limit).map((r) => {
    const have = numberIn(`${r.claim ?? ""} ${r.quote ?? ""}`);
    return {
      corpusFactId: Number(r.corpus_fact_id),
      claim: String(r.claim),
      quote: (r.quote as string | null) ?? null,
      locator: (r.locator as string | null) ?? null,
      basis: String(r.basis),
      confidence: Number(r.confidence),
      isVerified: Boolean(r.is_verified),
      occurredAt: r.occurred_at ? new Date(r.occurred_at as string).toISOString() : null,
      projectId: (r.project_id as number | null) ?? null,
      rank: Number(r.rank),
      source: {
        corpusSourceId: Number(r.corpus_source_id),
        kind: String(r.kind),
        title: String(r.title),
        url: (r.url as string | null) ?? null,
      },
      sharesEveryNumber: wanted.length > 0 && wanted.every((n) => have.includes(n)),
      superseded: r.superseded_by_fact_id != null,
    };
  });
  // A heuristic verdict, shown with its reasons. It is not a truth oracle: "supported"
  // means a source carries every number the claim carries; "conflicting" means the
  // sources found carry numbers and none of them agree; "unknown" means nothing to
  // compare against. Confidence and basis ride along so the reader can weigh them.
  let verdict: "supported" | "conflicting" | "unknown" = "unknown";
  const carriesNumber = (m: CheckMatch) => numberIn(`${m.claim} ${m.quote ?? ""}`).length > 0;
  const live = match.filter((m) => !m.superseded);
  if (live.length > 0) {
    if (wanted.length === 0) verdict = "supported";
    else if (live.some((m) => m.sharesEveryNumber)) verdict = "supported";
    else if (live.some(carriesNumber)) verdict = "conflicting";
  } else if (match.length > 0 && wanted.length > 0 && match.some((m) => m.sharesEveryNumber)) {
    // Only a superseded fact agrees: the claim was true once and is not any more.
    verdict = "conflicting";
  }
  // "Supported" by one source while another source carries a different number is the
  // shape a superseded contract takes (Felici: ₱3,000 in July, ₱4,000 in August). Say so,
  // and let the reader see both dates, rather than answering with the first hit.
  // Only a strong match can contest: a weakly related fact that happens to carry a
  // number (a site fee next to a total fee) is not a disagreement about this claim.
  const topRank = live[0]?.rank ?? 0;
  const isContested =
    verdict === "supported" &&
    wanted.length > 0 &&
    live.some((m) => !m.sharesEveryNumber && carriesNumber(m) && m.rank >= topRank * 0.6);
  // A discount is a fact about a price. "Client pays ₱270,000" may appear in no
  // sentence when the proposal says "₱300,000 with a 10% discount"; the arithmetic is
  // the evidence, and it is shown as such.
  let discount: CheckDiscount | null = null;
  const figure = wanted.filter((n) => n.replace(/\D/g, "").length >= 4);
  if (verdict !== "supported" && figure.length > 0) {
    discount = await discountExplaining(figure, name);
    if (discount) verdict = "supported";
  }
  return { claim: q, numberInClaim: wanted, verdict, isContested, match, discount };
}

export interface CheckDiscount {
  corpusSourceId: number;
  sourceTitle: string;
  listCents: number;
  discountPct: number | null;
  discountCents: number;
  derivedCents: number;
  reason: string | null;
  explanation: string;
}

/**
 * Every source carrying a list price and a discount, narrowed to the names the claim
 * uses, with list − discount worked out. The first whose derived figure is one the
 * claim carries explains the claim.
 */
async function discountExplaining(figure: string[], name: string[]): Promise<CheckDiscount | null> {
  const d = db();
  const row = (await d.execute(sql`
    select t.corpus_source_id, s.title, t.name, t.value
    from corpus_term t
    join corpus_source s on s.corpus_source_id = t.corpus_source_id
    where t.name in ('list_fee_cents', 'discount_pct', 'discount_cents', 'discount_reason')
  `)) as unknown as { corpus_source_id: number; title: string; name: string; value: string }[];
  const bySource = new Map<number, { title: string; term: Record<string, string> }>();
  for (const r of row) {
    const id = Number(r.corpus_source_id);
    const entry = bySource.get(id) ?? { title: r.title, term: {} };
    entry.term[r.name] = r.value;
    bySource.set(id, entry);
  }
  for (const [corpusSourceId, { title, term }] of bySource) {
    const listCents = Number(term.list_fee_cents);
    if (!Number.isFinite(listCents) || listCents <= 0) continue;
    const discountPct = term.discount_pct != null ? Number(term.discount_pct) : null;
    const discountCents = term.discount_cents != null ? Number(term.discount_cents) : discountPct != null ? Math.round((listCents * discountPct) / 100) : 0;
    if (discountCents <= 0) continue;
    const derivedCents = listCents - discountCents;
    const derivedPeso = String(derivedCents / 100).replace(/\.0+$/, "");
    if (!figure.includes(derivedPeso)) continue;
    if (name.length > 0) {
      const fact = (await d.execute(sql`select claim from corpus_fact where corpus_source_id = ${corpusSourceId}`)) as unknown as { claim: string }[];
      const hay = `${title} ${fact.map((f) => f.claim).join(" ")}`.toLowerCase();
      if (!name.some((n) => hay.includes(n))) continue;
    }
    const peso = (c: number) => `₱${(c / 100).toLocaleString("en-PH")}`;
    return {
      corpusSourceId,
      sourceTitle: title,
      listCents,
      discountPct,
      discountCents,
      derivedCents,
      reason: term.discount_reason ?? null,
      explanation: `${peso(listCents)} less ${discountPct != null ? `${discountPct}%` : peso(discountCents)}${term.discount_reason ? ` (${term.discount_reason})` : ""} = ${peso(derivedCents)}, per ${title}`,
    };
  }
  return null;
}

// ─── Reads and updates ───────────────────────────────

export async function listSource(filter: { kind?: string; projectId?: number } = {}) {
  const d = db();
  const where = [];
  if (filter.kind) where.push(eq(corpusSource.kind, filter.kind));
  if (filter.projectId) where.push(eq(corpusSource.projectId, filter.projectId));
  const row = await d.execute(sql`
    select s.*,
      (select count(*) from corpus_fact f where f.corpus_source_id = s.corpus_source_id) as fact_count,
      (select count(*) from corpus_action a where a.corpus_source_id = s.corpus_source_id and a.status = 'open') as open_action_count
    from corpus_source s
    ${where.length ? sql`where ${and(...where)}` : sql``}
    order by s.occurred_at desc nulls last, s.corpus_source_id desc
  `);
  return row as unknown as Record<string, unknown>[];
}

export async function deleteSource(corpusSourceId: number): Promise<boolean> {
  const d = db();
  const [row] = await d.select({ id: corpusSource.corpusSourceId }).from(corpusSource).where(eq(corpusSource.corpusSourceId, corpusSourceId));
  if (!row) return false;
  await d.execute(sql`
    update corpus_fact set superseded_by_fact_id = null
    where superseded_by_fact_id in (select corpus_fact_id from corpus_fact where corpus_source_id = ${corpusSourceId})
  `);
  await d.delete(corpusSource).where(eq(corpusSource.corpusSourceId, corpusSourceId));
  return true;
}

export async function getSource(corpusSourceId: number) {
  const d = db();
  const [source] = await d.select().from(corpusSource).where(eq(corpusSource.corpusSourceId, corpusSourceId));
  if (!source) return null;
  const fact = await d
    .select()
    .from(corpusFact)
    .where(eq(corpusFact.corpusSourceId, corpusSourceId))
    .orderBy(corpusFact.corpusFactId);
  const term = await d.select().from(corpusTerm).where(eq(corpusTerm.corpusSourceId, corpusSourceId));
  const action = await d.select().from(corpusAction).where(eq(corpusAction.corpusSourceId, corpusSourceId));
  return { ...source, fact, term, action };
}

export async function listFact(filter: { q?: string; projectId?: number; category?: string; limit?: number }) {
  const d = db();
  const limit = Math.min(filter.limit ?? 100, 500);
  const cond = [];
  if (filter.projectId) cond.push(sql`f.project_id = ${filter.projectId}`);
  if (filter.category) cond.push(sql`f.category = ${filter.category}`);
  if (filter.q?.trim()) cond.push(sql`f.search @@ websearch_to_tsquery('english', ${filter.q.trim()})`);
  const row = await d.execute(sql`
    select f.*, s.kind as source_kind, s.title as source_title, s.url as source_url
    from corpus_fact f join corpus_source s on s.corpus_source_id = f.corpus_source_id
    ${cond.length ? sql`where ${sql.join(cond, sql` and `)}` : sql``}
    order by f.occurred_at desc nulls last, f.corpus_fact_id desc
    limit ${limit}
  `);
  return row as unknown as Record<string, unknown>[];
}

export async function verifyFact(corpusFactId: number, userId: number, isVerified: boolean) {
  const d = db();
  const [row] = await d
    .update(corpusFact)
    .set(
      isVerified
        ? { isVerified: true, verifiedBy: userId, verifiedAt: new Date() }
        : { isVerified: false, verifiedBy: null, verifiedAt: null },
    )
    .where(eq(corpusFact.corpusFactId, corpusFactId))
    .returning();
  return row ?? null;
}

export async function supersedeFact(corpusFactId: number, byFactId: number) {
  const d = db();
  const [row] = await d
    .update(corpusFact)
    .set({ supersededByFactId: byFactId })
    .where(eq(corpusFact.corpusFactId, corpusFactId))
    .returning();
  return row ?? null;
}

export async function listTerm(name?: string) {
  const d = db();
  const row = await d.execute(sql`
    select t.*, s.title as source_title, s.occurred_at, s.project_id
    from corpus_term t join corpus_source s on s.corpus_source_id = t.corpus_source_id
    ${name ? sql`where t.name = ${name}` : sql``}
    order by t.name, s.occurred_at desc nulls last
  `);
  return row as unknown as Record<string, unknown>[];
}

export async function listAction(filter: { status?: string; projectId?: number; ownerName?: string } = {}) {
  const d = db();
  const cond = [];
  if (filter.status) cond.push(sql`a.status = ${filter.status}`);
  if (filter.projectId) cond.push(sql`a.project_id = ${filter.projectId}`);
  if (filter.ownerName) cond.push(sql`lower(a.owner_name) = lower(${filter.ownerName})`);
  const row = await d.execute(sql`
    select a.*, s.title as source_title, s.url as source_url, s.occurred_at as source_occurred_at
    from corpus_action a join corpus_source s on s.corpus_source_id = a.corpus_source_id
    ${cond.length ? sql`where ${sql.join(cond, sql` and `)}` : sql``}
    order by (a.status = 'open') desc, a.due_at asc nulls last, s.occurred_at desc nulls last
    limit 500
  `);
  return row as unknown as Record<string, unknown>[];
}

export async function updateAction(
  corpusActionId: number,
  patch: { status?: "open" | "done" | "dropped"; resolutionNote?: string | null; ownerTeamMemberId?: number | null; dueAt?: string | null; ownerName?: string | null },
) {
  const d = db();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status) {
    set.status = patch.status;
    set.resolvedAt = patch.status === "open" ? null : new Date();
  }
  if (patch.resolutionNote !== undefined) set.resolutionNote = patch.resolutionNote;
  if (patch.ownerTeamMemberId !== undefined) set.ownerTeamMemberId = patch.ownerTeamMemberId;
  if (patch.ownerName !== undefined) set.ownerName = patch.ownerName;
  if (patch.dueAt !== undefined) set.dueAt = asDate(patch.dueAt);
  const [row] = await d.update(corpusAction).set(set).where(eq(corpusAction.corpusActionId, corpusActionId)).returning();
  return row ?? null;
}

// ─── Templates ───────────────────────────────────────

export const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function placeholderOf(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Fill {{name}} slots. Unfilled ones are returned, not silently left in the document. */
export function renderTemplate(body: string, value: Record<string, string | number | null | undefined>) {
  const missing: string[] = [];
  const text = body.replace(PLACEHOLDER, (_, key: string) => {
    const v = value[key];
    if (v === undefined || v === null || v === "") {
      missing.push(key);
      return `{{${key}}}`;
    }
    return String(v);
  });
  return { text, missing: [...new Set(missing)] };
}

export async function listTemplate(kind?: string) {
  const d = db();
  return d
    .select()
    .from(corpusTemplate)
    .where(kind ? and(eq(corpusTemplate.kind, kind), eq(corpusTemplate.isActive, true)) : eq(corpusTemplate.isActive, true))
    .orderBy(corpusTemplate.kind, corpusTemplate.name, desc(corpusTemplate.version));
}

export async function getTemplate(corpusTemplateId: number) {
  const d = db();
  const [row] = await d.select().from(corpusTemplate).where(eq(corpusTemplate.corpusTemplateId, corpusTemplateId));
  return row ?? null;
}

/** A new version per (kind, name); the previous version stays, deactivated. */
export async function upsertTemplate(
  input: { kind: string; name: string; body: string; sourceExternalId?: string | null; sourceKind?: string | null },
  userId: number | null,
) {
  const d = db();
  const kind = (TEMPLATE_KIND as readonly string[]).includes(input.kind) ? input.kind : "other";
  let corpusSourceId: number | null = null;
  if (input.sourceExternalId) {
    const [s] = await d
      .select({ id: corpusSource.corpusSourceId })
      .from(corpusSource)
      .where(
        input.sourceKind
          ? and(eq(corpusSource.externalId, input.sourceExternalId), eq(corpusSource.kind, input.sourceKind))
          : eq(corpusSource.externalId, input.sourceExternalId),
      )
      .limit(1);
    corpusSourceId = s?.id ?? null;
  }
  const prior = await d
    .select({ id: corpusTemplate.corpusTemplateId, version: corpusTemplate.version, body: corpusTemplate.body })
    .from(corpusTemplate)
    .where(and(eq(corpusTemplate.kind, kind), eq(corpusTemplate.name, input.name)))
    .orderBy(desc(corpusTemplate.version))
    .limit(1);
  if (prior[0] && prior[0].body === input.body) {
    const [same] = await d.select().from(corpusTemplate).where(eq(corpusTemplate.corpusTemplateId, prior[0].id));
    return { template: same, isNew: false };
  }
  if (prior[0]) {
    await d.update(corpusTemplate).set({ isActive: false }).where(eq(corpusTemplate.corpusTemplateId, prior[0].id));
  }
  const [row] = await d
    .insert(corpusTemplate)
    .values({
      kind,
      name: input.name.slice(0, 255),
      body: input.body,
      placeholder: placeholderOf(input.body),
      corpusSourceId,
      version: (prior[0]?.version ?? 0) + 1,
      createdBy: userId,
    })
    .returning();
  return { template: row, isNew: true };
}

/**
 * Auto-supersession between documents of the same project.
 *
 * Two contracts for one project rarely agree on every number: Felici went from
 * ₱48,000 and ₱3,000/month in July to ₱200,000 and ₱4,000/month in August. Both
 * documents are in the corpus, both are true about their own date, and only one
 * is the deal today. For every (project, term name) that appears in more than one
 * contract/proposal/addendum with different values, the facts in the older source
 * that carry the older value are pointed at a fact in the newest source that
 * carries the newer value. Nothing is deleted; fact-check keeps showing the old
 * line, marked superseded, and stops counting it as support.
 */
export async function supersedeByNewerDocument(): Promise<{ supersededCount: number; pair: { projectId: number; term: string; older: string; newer: string }[] }> {
  const d = db();
  const row = (await d.execute(sql`
    select t.name, t.value, t.unit, t.corpus_source_id, s.project_id, s.occurred_at, s.title
    from corpus_term t
    join corpus_source s on s.corpus_source_id = t.corpus_source_id
    where s.project_id is not null
      and s.document_kind in ('contract', 'proposal', 'addendum')
      and s.occurred_at is not null
    order by s.project_id, t.name, s.occurred_at desc
  `)) as unknown as { name: string; value: string; unit: string | null; corpus_source_id: number; project_id: number; occurred_at: string; title: string }[];

  const group = new Map<string, typeof row>();
  for (const r of row) {
    const key = `${r.project_id}::${r.name}`;
    group.set(key, [...(group.get(key) ?? []), r]);
  }
  // A term stored in centavos is written in pesos in the prose ("₱3,000.00" for
  // 300000), so a cents term matches on either spelling. Anything else matches on
  // its own digits.
  const termDigit = (value: string, unit: string | null): string[] => {
    const own = numberIn(value);
    if (unit === "cents" && /^\d+$/.test(value)) {
      const peso = String(Number(value) / 100).replace(/\.0+$/, "");
      return [...new Set([...own, peso])];
    }
    // A count ("5" rounds, "3" rounds) is a single digit numberIn() ignores in prose;
    // as a term value it is the whole value, so it matches "5 rounds" in a fact.
    if (/^\d+(?:\.\d+)?$/.test(value)) return [...new Set([...own, value])];
    return own;
  };
  // A document that carries a discount term is pricing the same deal lower, not
  // replacing the list price: its money terms do not supersede the older document's.
  const discounted = new Set(
    ((await d.execute(sql`
      select distinct corpus_source_id from corpus_term
      where name in ('discount_pct', 'discount_cents')
    `)) as unknown as { corpus_source_id: number }[]).map((r) => Number(r.corpus_source_id)),
  );
  const factOf = async (sourceId: number) =>
    (await d.execute(sql`
      select corpus_fact_id, claim, quote, superseded_by_fact_id from corpus_fact
      where corpus_source_id = ${sourceId} order by corpus_fact_id
    `)) as unknown as { corpus_fact_id: number; claim: string; quote: string | null; superseded_by_fact_id: number | null }[];
  const carries = (f: { claim: string; quote: string | null }, digit: string[]) => {
    const have = numberIn(`${f.claim} ${f.quote ?? ""}`);
    return digit.some((n) => have.includes(n));
  };

  let supersededCount = 0;
  const pair: { projectId: number; term: string; older: string; newer: string }[] = [];
  const factCache = new Map<number, Awaited<ReturnType<typeof factOf>>>();
  const cached = async (id: number) => {
    if (!factCache.has(id)) factCache.set(id, await factOf(id));
    return factCache.get(id)!;
  };
  for (const [, list] of group) {
    const newest = list[0];
    for (const older of list.slice(1)) {
      if (older.value === newest.value || older.corpus_source_id === newest.corpus_source_id) continue;
      if (discounted.has(Number(newest.corpus_source_id)) && /_cents$/.test(newest.name)) continue;
      const olderDigit = termDigit(older.value, (older as { unit?: string | null }).unit ?? null);
      const newerDigit = termDigit(newest.value, (newest as { unit?: string | null }).unit ?? null);
      if (olderDigit.length === 0 || newerDigit.length === 0) continue;
      // Shared digits (a 15-day grace in both) are not a change of value.
      if (olderDigit.some((n) => newerDigit.includes(n))) continue;
      const successorFact = (await cached(newest.corpus_source_id)).find((f) => carries(f, newerDigit));
      if (!successorFact) continue;
      let hit = 0;
      for (const f of await cached(older.corpus_source_id)) {
        if (f.superseded_by_fact_id != null || !carries(f, olderDigit)) continue;
        await d.execute(sql`update corpus_fact set superseded_by_fact_id = ${successorFact.corpus_fact_id} where corpus_fact_id = ${f.corpus_fact_id}`);
        f.superseded_by_fact_id = successorFact.corpus_fact_id;
        hit += 1;
      }
      // The same figure spoken on a recording before the newer contract is the same
      // superseded deal: a consultation that priced the site at ₱3,000 a month is not a
      // live source once the signed contract says ₱4,000. Only money and term facts, only
      // on this project, only dated before the newer document.
      const spoken = (await d.execute(sql`
        select f.corpus_fact_id, f.claim, f.quote from corpus_fact f
        join corpus_source s on s.corpus_source_id = f.corpus_source_id
        where s.project_id = ${newest.project_id}
          and s.corpus_source_id <> ${newest.corpus_source_id}
          and s.corpus_source_id <> ${older.corpus_source_id}
          and s.occurred_at < ${newest.occurred_at}
          and f.category in ('pricing', 'contract_term', 'commitment', 'decision')
          and f.superseded_by_fact_id is null
      `)) as unknown as { corpus_fact_id: number; claim: string; quote: string | null }[];
      for (const f of spoken) {
        if (!carries(f, olderDigit)) continue;
        await d.execute(sql`update corpus_fact set superseded_by_fact_id = ${successorFact.corpus_fact_id} where corpus_fact_id = ${f.corpus_fact_id}`);
        hit += 1;
      }
      supersededCount += hit;
      pair.push({ projectId: newest.project_id, term: newest.name, older: `${older.title} (${older.value})`, newer: `${newest.title} (${newest.value})` });
    }
  }
  return { supersededCount, pair };
}

export async function corpusStat() {
  const d = db();
  const row = await d.execute(sql`
    select
      (select count(*) from corpus_source) as source_count,
      (select count(*) from corpus_fact) as fact_count,
      (select count(*) from corpus_fact where is_verified) as verified_fact_count,
      (select count(*) from corpus_action where status = 'open') as open_action_count,
      (select count(*) from corpus_action where status = 'open' and due_at < now()) as overdue_action_count,
      (select count(*) from corpus_template where is_active) as template_count,
      (select count(*) from corpus_term) as term_count
  `);
  const r = (row as unknown as Record<string, unknown>[])[0];
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
}
