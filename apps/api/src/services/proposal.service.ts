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

/**
 * Drop-in clauses from docs/CONTRACTS.md — draft, not legally binding.
 *
 * Reconciled 2026-08-19 against the contract ADVO is actually sending clients
 * (50/50 milestones, 5 free rounds per deliverable, 15+15 business-day deemed
 * approval, 2%/month late penalty, IP retained until full payment). The prior
 * text — 40%/₱30,000 downpayment floor, 2 rounds per phase billed hourly —
 * described terms ADVO does not offer, so the generator was emitting them.
 *
 * These are still DRAFT and still need legal review before binding use; the
 * live contract went out ahead of that review. Do not soften the banner.
 */
export const CONTRACT_CLAUSE: ProposalClause[] = [
  {
    clause_code: "payment_schedule",
    title: "Payment schedule",
    body: "Client shall pay fifty percent (50%) of the Total Project Value upon commissioning, being the signing of this Agreement in the presence of a witness, and the remaining fifty percent (50%) upon final delivery of the deliverables and formal Client sign-off (or deemed approval as provided in the Revisions clause). Payments are strictly non-refundable once the corresponding milestone has been approved and signed off. Invoices are payable within seven (7) business days of issuance. Ongoing hosting and infrastructure are billed separately from the Total Project Value.",
  },
  {
    clause_code: "revision",
    title: "Revisions",
    body: "Each deliverable includes up to five (5) rounds of revisions at no additional cost. All revisions must be utilized prior to the signing of the Project Sign-off document. Where included revision rounds remain unused as of final delivery, the Client may still invoke them, within the scope originally agreed, for a period of six (6) months following the signing of the Project Sign-off document. Adjustments requested thereafter fall strictly under the thirty (30) day bug-fixing warranty or a separate maintenance agreement.",
  },
  {
    clause_code: "deemed_approval",
    title: "Feedback window & deemed approval",
    body: "If the Client fails to provide feedback within fifteen (15) business days of a review delivery, ADVO shall issue a formal Notice of Pending Deemed Approval. If no response is received within fifteen (15) subsequent business days of that Notice, the revision shall be deemed approved and finalized. Separately, delays caused by the Client — including late assets, delayed feedback, or no response within ten (10) calendar days — automatically extend the delivery timeline by the equivalent number of days without penalty to ADVO.",
  },
  {
    clause_code: "change_order",
    title: "Change orders",
    body: "Any addition, removal, or substantive modification of scope outside the agreed Statement of Work constitutes a Change Order. New modules, redesigns, structural adjustments, or feature additions require a written addendum executed before work begins. Each Change Order will be documented in writing by ADVO with: (a) a description of the change; (b) the impact on price (PHP); (c) the impact on timeline; and (d) any dependent changes. No work will commence on a Change Order until the Client confirms the foregoing in writing (email reply or signed addendum). Designs, features, or capabilities observed at third-party vendors or competitor sites that the Client wishes to incorporate after work has begun are governed by this Change Order process.",
  },
  {
    clause_code: "late_payment",
    title: "Late payment",
    body: "Invoices are payable within seven (7) business days of issuance. Unpaid balances remaining after fifteen (15) business days from the date of issuance, commencing strictly on the sixteenth (16th) business day, shall incur a penalty fee of two percent (2%) per month, calculated daily until fully settled, or the maximum rate permitted by Philippine law, whichever is lower. Where a recurring infrastructure fee remains unpaid fifteen (15) days past its due date, ADVO reserves the right to suspend server hosting and API access until the balance is cleared, and shall not be held liable for data loss or business interruption resulting from that suspension.",
  },
  {
    clause_code: "intellectual_property",
    title: "Intellectual property & ownership",
    body: "All design files, source code, and deliverables remain the exclusive property of ADVO until full payment is received, and the Client has no right to publish or use any deliverable until the corresponding payment clears. Upon receipt of final payment, full ownership of all deliverables, including source files and codebases, transfers to the Client. Client-provided product shots, establishment photographs, and brand materials are licensed to ADVO on a limited basis solely for the purpose of building the deliverables. All private organizational data remains accessible only to the Client and strictly confidential. ADVO retains the right to display completed work in its portfolio and marketing materials unless the Client requests otherwise in writing before final delivery.",
  },
  {
    clause_code: "non_abandonment",
    title: "Non-abandonment & project continuity",
    body: "ADVO shall not unilaterally abandon or deprioritize the project without prior written notice and a mutually agreed revised timeline. The Client shall not cease communication, withhold payment, or engage a third party to replicate or replace ADVO's work while the project is active and any payment remains outstanding; doing so constitutes a material breach of this Agreement.",
  },
  {
    clause_code: "termination",
    title: "Termination",
    body: "With cause: either party may rescind this Agreement for legitimate cause by written notice, allowing a fourteen (14) day cure period to resolve the issue, and the Client remains liable for the financial value of all work completed up to the date of termination. Without cause, by the Client: upon cancellation mid-project for convenience, the Client shall compensate ADVO for the exact percentage of project completion achieved as of the cancellation date, and shall fully reimburse any non-refundable third-party integrations purchased for the project. Without cause, by ADVO: ADVO shall fully refund any advanced milestone for which work has not yet commenced, and shall surrender all paid-for code assets to the Client in their current state.",
  },
  {
    clause_code: "warranty_liability",
    title: "Warranty & limitation of liability",
    body: "ADVO provides a thirty (30) day warranty following launch to correct bugs or defects resulting from development, at no additional cost. While ADVO commits to exercising professional diligence in project execution, it shall not be held liable for indirect commercial losses, third-party service interruptions, or events arising from forces beyond its reasonable control. Interruptions, pricing changes, or breaking changes originating with third-party providers relied upon by the deliverables do not constitute a defect under this warranty.",
  },
  {
    // FORWARD STANDARD, not a reconstruction. The fortuitous-events clause in the
    // one client contract on file is truncated mid-sentence ("In such circumstances,
    // performance..."), so what that client actually received is unknown. The final
    // sentence below is ADVO's own chosen wording for NEW proposals and must not be
    // read as evidence of what any existing client agreed to.
    // See docs/CONTRACTS.md Policy 8 and its Open Questions entry.
    clause_code: "fortuitous_event",
    title: "Fortuitous events",
    body: "Neither party shall be held legally responsible for delays, defects, or failure to perform obligations under this Agreement resulting from fortuitous events, including acts of God, national connectivity outages, changes to regional regulations, and prolonged server outages beyond the reasonable control of the developer. In such circumstances, performance of the affected obligations is suspended for the duration of the event and the delivery timeline is extended by the equivalent number of days.",
  },
];

const DEFAULT_VALUE_CENTS = 80_000_00; // ₱80,000 when budget is missing

/**
 * Downpayment due on commissioning: 50% of the Total Project Value.
 *
 * The former 40%-or-₱30,000-floor rule is retired — at the tier sizes ADVO
 * actually sells, 50% of a smaller engagement lands below ₱30,000, so the
 * floor and the offered 50/50 split could not both hold. See docs/CONTRACTS.md
 * "What was superseded".
 */
export function downpaymentCents(totalValueCents: number): number {
  return Math.round(Math.max(0, totalValueCents) * 0.5);
}

/** Final payment due on delivery + sign-off — the remaining half. */
export function finalPaymentCents(totalValueCents: number): number {
  return Math.max(0, totalValueCents) - downpaymentCents(totalValueCents);
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
  const finalPayment = finalPaymentCents(total);
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
    <tr><th>Downpayment (50%)</th><td>${peso(downpayment)} · due on commissioning, witnessed signing</td></tr>
    <tr><th>Final payment (50%)</th><td>${peso(finalPayment)} · due on final delivery + Project Sign-off</td></tr>
    <tr><th>Revision allowance</th><td>5 rounds per deliverable, included — usable until Project Sign-off, unused rounds for 6 months after</td></tr>
    <tr><th>Feedback window</th><td>15 business days, then a Notice of Pending Deemed Approval and 15 more</td></tr>
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
  const finalPayment = finalPaymentCents(total);
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
    <tr><th>Downpayment (50%)</th><td>${peso(downpayment)} · due on commissioning, witnessed signing</td></tr>
    <tr><th>Final payment (50%)</th><td>${peso(finalPayment)} · due on final delivery + Project Sign-off</td></tr>
    <tr><th>Revision allowance</th><td>5 rounds per deliverable, included — usable until Project Sign-off, unused rounds for 6 months after</td></tr>
    <tr><th>Feedback window</th><td>15 business days, then a Notice of Pending Deemed Approval and 15 more</td></tr>
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
