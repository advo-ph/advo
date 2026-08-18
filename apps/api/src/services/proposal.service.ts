import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { lead, proposal } from "../db/schema.js";
import {
  describeLeadSignal,
  extractLeadSignal,
  leadTextForSignal,
  type LeadSignal,
} from "./lead-signal.service.js";

export type ProposalStatus = "sent" | "opened" | "replied" | "signed";

/** How the body copy was written. `template` is the always-available path. */
export type ProposalMethod = "template" | "ai";

export type ProposalClause = {
  clause_code: string;
  title: string;
  body: string;
};

/** Drop-in clauses from docs/CONTRACTS.md — draft, not legally binding. */
export const CONTRACT_CLAUSE: ProposalClause[] = [
  {
    clause_code: "downpayment",
    title: "Downpayment",
    body: "Client shall pay a non-refundable downpayment of forty percent (40%) of the Total Project Value, or thirty thousand Philippine pesos (₱30,000), whichever is higher, before any design or development work begins. The downpayment secures ADVO's scheduling, discovery work, initial design, and reservation of team capacity for this engagement.",
  },
  {
    clause_code: "revision",
    title: "Revision limits",
    body: "Each phase of work — Discovery, Design, and Build — includes two (2) revision rounds. One revision round means a single batched feedback list, delivered by the Client within five (5) business days of the corresponding deliverable's preview. Feedback delivered after the 5-day window constitutes a new revision round. Revisions beyond the included rounds are billed at ADVO's then-current hourly rate, in fifteen (15) minute increments, minimum one (1) hour per round.",
  },
  {
    clause_code: "change_order",
    title: "Change orders",
    body: "Any addition, removal, or substantive modification of scope outside the agreed Statement of Work constitutes a Change Order. Each Change Order will be documented in writing by ADVO with: (a) a description of the change; (b) the impact on price (PHP); (c) the impact on timeline; and (d) any dependent changes. No work will commence on a Change Order until the Client confirms the foregoing in writing (email reply or signed addendum). Discoveries of designs, features, or capabilities at third-party vendors or competitor sites that the Client wishes to incorporate after work has begun are governed by this Change Order process.",
  },
  {
    clause_code: "late_payment",
    title: "Late payment",
    body: "Invoices are due within fifteen (15) days of issue. Amounts unpaid after thirty (30) days accrue interest at the lower of two percent (2%) per month or the maximum rate permitted by Philippine law. ADVO may pause work on the engagement at any time after Day 30 of an unpaid invoice and shall not be liable for resulting timeline impact.",
  },
  {
    clause_code: "termination",
    title: "Termination",
    body: "Either party may terminate this engagement for convenience with fifteen (15) days' written notice. On termination: (a) the Client pays for all completed work and work-in-progress at the agreed rate, prorated to the termination date; (b) ADVO delivers all completed deliverables; (c) the downpayment is non-refundable; (d) any unbilled change orders already accepted by the Client remain payable.",
  },
];

const FLOOR_CENTS = 30_000_00; // ₱30,000
const DEFAULT_VALUE_CENTS = 80_000_00; // ₱80,000 when budget is missing

export function downpaymentCents(totalValueCents: number): number {
  const forty = Math.round(Math.max(0, totalValueCents) * 0.4);
  return Math.max(forty, FLOOR_CENTS);
}

export function parseBudgetCents(budget: string | null | undefined): number | null {
  if (!budget) return null;
  const compact = budget.replace(/,/g, "").trim().toLowerCase();
  const match = compact.match(/(\d+(?:\.\d+)?)(\s*k)?/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const pesos = match[2] ? amount * 1000 : amount;
  return Math.round(pesos * 100);
}

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ProposalLeadField = {
  name: string;
  email: string;
  company?: string | null;
  projectType?: string | null;
  budget?: string | null;
  description?: string | null;
  /** Scraper audit tags ("outdated system; paper-based"). Signal input only. */
  notes?: string | null;
};

export function fillProposalTemplate(
  field: ProposalLeadField,
  valueCents = DEFAULT_VALUE_CENTS,
): { title: string; bodyHtml: string; clause: ProposalClause[]; valueCents: number } {
  const total = valueCents > 0 ? valueCents : DEFAULT_VALUE_CENTS;
  const downpayment = downpaymentCents(total);
  const company = field.company?.trim() || field.name;
  const title = `ADVO proposal — ${company}`;

  const clauseHtml = CONTRACT_CLAUSE.map(
    (item) => `
      <section>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.body)}</p>
      </section>`,
  ).join("");

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; max-width: 720px; margin: 48px auto; padding: 0 24px; line-height: 1.55; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 28px 0 8px; }
    .meta { color: #555; font-size: 14px; }
    .banner { background: #fff6e8; border: 1px solid #f0d9a8; padding: 12px 14px; font-size: 13px; margin: 20px 0 28px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; font-size: 14px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
    th { width: 36%; color: #555; font-weight: 500; }
  </style>
</head>
<body>
  <h1>Project proposal</h1>
  <p class="meta">ADVO · advo.ph · template-fill (not AI-generated)</p>
  <div class="banner">
    <strong>Draft — not legally binding.</strong> Clauses below are from CONTRACTS.md and need legal review before a signed engagement.
  </div>
  <table>
    <tr><th>Prepared for</th><td>${escapeHtml(field.name)}${field.company ? ` · ${escapeHtml(field.company)}` : ""}</td></tr>
    <tr><th>Email</th><td>${escapeHtml(field.email)}</td></tr>
    <tr><th>Project type</th><td>${escapeHtml(field.projectType || "—")}</td></tr>
    <tr><th>Quoted budget</th><td>${escapeHtml(field.budget || "—")}</td></tr>
    <tr><th>Total project value</th><td>${peso(total)}</td></tr>
    <tr><th>Downpayment due</th><td>${peso(downpayment)} (40% or ₱30,000 floor)</td></tr>
    <tr><th>Revision allowance</th><td>2 rounds per phase (Discovery, Design, Build)</td></tr>
  </table>
  ${field.description ? `<section><h2>Notes from the lead</h2><p>${escapeHtml(field.description)}</p></section>` : ""}
  ${clauseHtml}
</body>
</html>`;

  return {
    title,
    bodyHtml,
    clause: CONTRACT_CLAUSE,
    valueCents: total,
  };
}

// ---------------------------------------------------------------------------
// AI path (Claude). Writes the *body copy* from this lead's own scraped
// signals — its digital / design / performance score, industry, and budget —
// instead of the same template with the name swapped. The CONTRACTS.md clauses
// and the money table are rendered by us, never by the model: that text is
// draft legal language and must not be paraphrased.
//
// Activates only when ANTHROPIC_API_KEY is set. On a missing key, any API
// error, or malformed output it returns null and generateProposal() falls back
// to fillProposalTemplate() unchanged.
// ---------------------------------------------------------------------------

export type ProposalSection = {
  heading: string;
  body: string;
};

const AI_SYSTEM = `You are a proposal writer for ADVO, a Philippine web/design agency that builds systems for small and mid-sized local businesses (clinics, retail, food service, construction).

You will be given the scraped audit signals for ONE prospect: its industry, its digital / design / performance scores (0-100, lower is worse), how old its current system is, its quoted budget, and the notes from the outreach dump. Write the body copy of a proposal addressed to that specific prospect.

Rules:
1. Argue from the supplied numbers and notes. Name the actual score or finding when you use it ("your site scores 22/100 on digital presence"). Never invent a score, statistic, client name, award, or case study that was not supplied.
2. If a signal is missing, write around it. Do not guess a value and do not say "N/A".
3. Peso amounts, downpayment terms, revision limits, and contract clauses are rendered separately — do NOT restate them, quote figures for them, or promise any price.
4. No timeline commitments in weeks or months, and no headcount promises.
5. Plain professional English. Filipino business context is fine. No emoji, no exclamation marks, no "unlock/leverage/revolutionize" filler.
6. Each section body is 2-4 sentences of prose. No markdown, no bullet lists, no HTML.

Respond with ONLY a JSON object (no prose, no markdown code fences) of exactly this shape:
{"section":[{"heading":"<3-6 words>","body":"<2-4 sentences>"}]}

Produce 3 to 5 sections in this order: (a) what the audit found for this prospect, (b) what ADVO proposes to build for a business of this type, (c) what changes operationally once it ships, and optionally (d) why the scope is bounded the way it is.`;

/** Prompt input — only the scraped facts, so the model cannot invent numbers. */
function aiUserPrompt(field: ProposalLeadField, signal: LeadSignal): string {
  const line: string[] = [];
  line.push(`Prospect: ${field.company?.trim() || field.name}`);
  line.push(`Industry (inferred): ${signal.industry ?? "unknown"}`);
  line.push(`Service requested: ${field.projectType || "unspecified"}`);
  line.push(
    `Digital presence score: ${signal.digitalScore === null ? "unknown" : `${signal.digitalScore}/100`}`,
  );
  line.push(
    `Design score: ${signal.designScore === null ? "unknown" : `${signal.designScore}/100`}`,
  );
  line.push(
    `Performance score: ${signal.performanceScore === null ? "unknown" : `${signal.performanceScore}/100`}`,
  );
  line.push(
    `Current system age: ${signal.systemAgeYear === null ? "unknown" : `about ${signal.systemAgeYear} years`}`,
  );
  line.push(
    `Has a website: ${signal.hasWebsite === null ? "unknown" : signal.hasWebsite ? "yes" : "no"}`,
  );
  line.push(`Already on a modern platform: ${signal.hasModernStack ? "yes" : "no"}`);
  line.push(`Quoted budget (context only — do not restate): ${field.budget || "unspecified"}`);
  line.push(
    `Audit findings: ${signal.evidence.length > 0 ? signal.evidence.join("; ") : "none recorded"}`,
  );
  line.push(`Outreach notes: ${field.description?.trim() || "none"}`);

  return `Write the proposal body copy for this prospect.\n\n${line.join("\n")}`;
}

interface RawAiProposal {
  section?: Array<{ heading?: unknown; body?: unknown }>;
}

/** Trim and bound a model string so one runaway field cannot blow up the doc. */
function aiText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function writeSectionWithClaude(
  field: ProposalLeadField,
  signal: LeadSignal,
): Promise<ProposalSection[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: AI_SYSTEM,
      messages: [{ role: "user", content: aiUserPrompt(field, signal) }],
    });

    const block = res.content.find((item) => item.type === "text");
    if (!block || block.type !== "text") return null;

    const raw = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(raw) as RawAiProposal;
    if (!Array.isArray(parsed.section)) return null;

    const section: ProposalSection[] = parsed.section
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        heading: aiText(item.heading, 120),
        body: aiText(item.body, 1600),
      }))
      .filter((item) => item.heading.length > 0 && item.body.length > 0)
      .slice(0, 6);

    return section.length >= 2 ? section : null;
  } catch (err) {
    console.error("[proposal] AI path failed; falling back to template fill:", err);
    return null;
  }
}

/** Same document shell as the template fill, with AI-written narrative. */
export function renderAiProposal(
  field: ProposalLeadField,
  signal: LeadSignal,
  section: ProposalSection[],
  valueCents = DEFAULT_VALUE_CENTS,
): { title: string; bodyHtml: string; clause: ProposalClause[]; valueCents: number } {
  const total = valueCents > 0 ? valueCents : DEFAULT_VALUE_CENTS;
  const downpayment = downpaymentCents(total);
  const company = field.company?.trim() || field.name;
  const title = `ADVO proposal — ${company}`;

  const narrativeHtml = section
    .map(
      (item) => `
      <section>
        <h2>${escapeHtml(item.heading)}</h2>
        <p>${escapeHtml(item.body)}</p>
      </section>`,
    )
    .join("");

  const clauseHtml = CONTRACT_CLAUSE.map(
    (item) => `
      <section>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.body)}</p>
      </section>`,
  ).join("");

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; max-width: 720px; margin: 48px auto; padding: 0 24px; line-height: 1.55; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 28px 0 8px; }
    .meta { color: #555; font-size: 14px; }
    .banner { background: #fff6e8; border: 1px solid #f0d9a8; padding: 12px 14px; font-size: 13px; margin: 20px 0 28px; }
    .signal { background: #f4f7fb; border: 1px solid #d7e2ef; padding: 10px 14px; font-size: 13px; margin: 0 0 24px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; font-size: 14px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
    th { width: 36%; color: #555; font-weight: 500; }
  </style>
</head>
<body>
  <h1>Project proposal</h1>
  <p class="meta">ADVO · advo.ph · AI-written body copy (Claude) from this lead's scraped signals</p>
  <div class="banner">
    <strong>Draft — not legally binding.</strong> Clauses below are from CONTRACTS.md and need legal review before a signed engagement. Narrative sections are AI-generated from scraped audit data — check every claim before sending.
  </div>
  <table>
    <tr><th>Prepared for</th><td>${escapeHtml(field.name)}${field.company ? ` · ${escapeHtml(field.company)}` : ""}</td></tr>
    <tr><th>Email</th><td>${escapeHtml(field.email)}</td></tr>
    <tr><th>Project type</th><td>${escapeHtml(field.projectType || "—")}</td></tr>
    <tr><th>Quoted budget</th><td>${escapeHtml(field.budget || "—")}</td></tr>
    <tr><th>Total project value</th><td>${peso(total)}</td></tr>
    <tr><th>Downpayment due</th><td>${peso(downpayment)} (40% or ₱30,000 floor)</td></tr>
    <tr><th>Revision allowance</th><td>2 rounds per phase (Discovery, Design, Build)</td></tr>
  </table>
  <div class="signal"><strong>Scraped signal used:</strong> ${escapeHtml(describeLeadSignal(signal))}</div>
  ${narrativeHtml}
  ${clauseHtml}
</body>
</html>`;

  return { title, bodyHtml, clause: CONTRACT_CLAUSE, valueCents: total };
}

/**
 * Build the proposal document for a lead. DB-free so it is directly testable.
 *
 * Claude writes the body copy when ANTHROPIC_API_KEY is set (`method: "ai"`);
 * otherwise — and on any AI error or malformed output — the existing template
 * fill runs unchanged (`method: "template"`).
 */
export async function buildProposal(
  field: ProposalLeadField,
  valueCents = DEFAULT_VALUE_CENTS,
): Promise<{
  title: string;
  bodyHtml: string;
  clause: ProposalClause[];
  valueCents: number;
  method: ProposalMethod;
  signal: LeadSignal;
}> {
  const signal = extractLeadSignal(leadTextForSignal(field));
  const section = await writeSectionWithClaude(field, signal);

  if (section) {
    return { ...renderAiProposal(field, signal, section, valueCents), method: "ai", signal };
  }
  return { ...fillProposalTemplate(field, valueCents), method: "template", signal };
}

export async function listProposal() {
  return db()
    .select({
      proposalId: proposal.proposalId,
      leadId: proposal.leadId,
      title: proposal.title,
      status: proposal.status,
      valueCents: proposal.valueCents,
      method: proposal.method,
      sentAt: proposal.sentAt,
      openedAt: proposal.openedAt,
      repliedAt: proposal.repliedAt,
      signedAt: proposal.signedAt,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      leadName: lead.name,
      leadEmail: lead.email,
      leadCompany: lead.company,
    })
    .from(proposal)
    .innerJoin(lead, eq(proposal.leadId, lead.leadId))
    .orderBy(desc(proposal.createdAt));
}

export async function getProposal(proposalId: number) {
  const [row] = await db()
    .select()
    .from(proposal)
    .where(eq(proposal.proposalId, proposalId))
    .limit(1);
  return row ?? null;
}

export async function generateProposal(leadId: number, valueCents?: number) {
  const [existing] = await db().select().from(lead).where(eq(lead.leadId, leadId)).limit(1);
  if (!existing) throw new HTTPException(404, { message: "Lead not found" });

  const parsed = valueCents && valueCents > 0 ? valueCents : parseBudgetCents(existing.budget);
  const built = await buildProposal(
    {
      name: existing.name,
      email: existing.email,
      company: existing.company,
      projectType: existing.projectType,
      budget: existing.budget,
      description: existing.description,
      notes: existing.notes,
    },
    parsed ?? DEFAULT_VALUE_CENTS,
  );

  const now = new Date();
  const [created] = await db()
    .insert(proposal)
    .values({
      leadId,
      title: built.title,
      bodyHtml: built.bodyHtml,
      status: "sent",
      valueCents: built.valueCents,
      clause: built.clause,
      method: built.method,
      sentAt: now,
    })
    .returning();

  await db().update(lead).set({ status: "proposal_sent" }).where(eq(lead.leadId, leadId));

  return created;
}

export async function updateProposalStatus(proposalId: number, status: ProposalStatus) {
  const existing = await getProposal(proposalId);
  if (!existing) throw new HTTPException(404, { message: "Proposal not found" });

  const now = new Date();
  const patch: {
    status: ProposalStatus;
    updatedAt: Date;
    sentAt?: Date;
    openedAt?: Date;
    repliedAt?: Date;
    signedAt?: Date;
  } = { status, updatedAt: now };

  if (status === "sent") patch.sentAt = existing.sentAt ?? now;
  if (status === "opened") {
    patch.sentAt = existing.sentAt ?? now;
    patch.openedAt = existing.openedAt ?? now;
  }
  if (status === "replied") {
    patch.sentAt = existing.sentAt ?? now;
    patch.openedAt = existing.openedAt ?? now;
    patch.repliedAt = existing.repliedAt ?? now;
  }
  if (status === "signed") {
    patch.sentAt = existing.sentAt ?? now;
    patch.openedAt = existing.openedAt ?? now;
    patch.repliedAt = existing.repliedAt ?? now;
    patch.signedAt = existing.signedAt ?? now;
  }

  const [updated] = await db()
    .update(proposal)
    .set(patch)
    .where(eq(proposal.proposalId, proposalId))
    .returning();

  return updated;
}
