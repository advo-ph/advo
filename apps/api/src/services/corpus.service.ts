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
  summary: string | null;
}

const MONEY = /₱\s?[\d,]+(?:\.\d+)?|\b(?:php|pesos?)\s?[\d,]+/i;
const NUMBERISH = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?%|\b\d{1,2}[:.]\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d+\s?(?:days?|weeks?|months?|years?|rounds?)\b/i;
const COMMIT = /\b(?:will|agreed?|must|shall|deadline|due|by (?:mon|tue|wed|thu|fri|sat|sun|next)|commit|deliver|send|follow ?up|kailangan|dapat|ipapadala|gagawin)\b/i;

const guessCategory = (line: string): FactCategory => {
  if (MONEY.test(line) || /\bfee|price|cost|invoice|payment|down ?payment\b/i.test(line)) return "pricing";
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
  return { method: "heuristic", fact, action: action.slice(0, 30), summary: null };
}

const AI_SYSTEM = `You extract a fact corpus from a transcript or document for ADVO, a Philippine software agency.
Return ONLY JSON: {"summary": string, "fact": [...], "action": [...]}.
fact item: {"claim": one declarative checkable sentence, "category": one of ${FACT_CATEGORY.join("|")}, "quote": verbatim passage <=300 chars, "locator": "m:ss" timestamp if the text has them else the heading, "speaker": label or null, "basis": "transcript" if the quote is in the text else "ai_note", "confidence": 0..1}
action item: {"description": imperative one line, "ownerName": person or "ADVO" or "client" or null, "dueAt": ISO date or null, "locator": "m:ss" or null}
Rules: prefer money, dates, scope, commitments, named contacts. Keep Taglish verbatim in quotes. Never invent a number that is not in the text. 8 to 40 facts.`;

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
    limit ${limit}
  `);
  let row: unknown = [];
  if (word.length > 0) {
    row = await select(sql`plainto_tsquery('english', ${word.join(" ")})`);
    if ((row as unknown[]).length === 0) {
      const anyOf = word.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).join(" | ");
      row = await select(sql`to_tsquery('english', ${anyOf})`);
    }
  }
  const wanted = numberIn(q);
  const match: CheckMatch[] = (row as unknown as Record<string, unknown>[]).map((r) => {
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
    };
  });
  // A heuristic verdict, shown with its reasons. It is not a truth oracle: "supported"
  // means a source carries every number the claim carries; "conflicting" means the
  // sources found carry numbers and none of them agree; "unknown" means nothing to
  // compare against. Confidence and basis ride along so the reader can weigh them.
  let verdict: "supported" | "conflicting" | "unknown" = "unknown";
  const carriesNumber = (m: CheckMatch) => numberIn(`${m.claim} ${m.quote ?? ""}`).length > 0;
  if (match.length > 0) {
    if (wanted.length === 0) verdict = "supported";
    else if (match.some((m) => m.sharesEveryNumber)) verdict = "supported";
    else if (match.some(carriesNumber)) verdict = "conflicting";
  }
  // "Supported" by one source while another source carries a different number is the
  // shape a superseded contract takes (Felici: ₱3,000 in July, ₱4,000 in August). Say so,
  // and let the reader see both dates, rather than answering with the first hit.
  const isContested = verdict === "supported" && wanted.length > 0 && match.some((m) => !m.sharesEveryNumber && carriesNumber(m));
  return { claim: q, numberInClaim: wanted, verdict, isContested, match };
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
