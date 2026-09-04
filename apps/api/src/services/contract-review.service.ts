/**
 * Contract review service.
 *
 * Two modes:
 * 1. reviewContract(text) — heuristic policy-presence check (legacy, used by the
 *    old paste-text review panel endpoint). Still exported so existing callers compile.
 * 2. extractContractText(filePath, mimeType) + reviewWithClaude(text) — used by
 *    the new contract file endpoints (GET /api/contracts/files/:id/review).
 *    Claude runs a short, plain-language review. Graceful fallback when the key is missing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
// @ts-expect-error -- pdf-parse has no bundled types; the default export works fine at runtime
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export type FlagSeverity = "red" | "amber" | "green";

export interface ContractFlag {
  policy: string;
  severity: FlagSeverity;
  present: boolean;
  note: string;
}

export interface ContractReview {
  verdict: "good_to_go" | "needs_work" | "high_risk";
  summary: string;
  flags: ContractFlag[];
  method: "heuristic" | "ai";
  disclaimer: string;
}

interface PolicyCheck {
  policy: string;
  check: (t: string) => { severity: FlagSeverity; present: boolean; note: string };
}

const has = (t: string, re: RegExp) => re.test(t);

const POLICIES: PolicyCheck[] = [
  {
    policy: "Payment schedule",
    check: (t) => {
      const mention = has(t, /down\s?payment|deposit|initial payment|mobilization fee|payment schedule|milestone|final payment|upon commissioning|shall pay/);
      const split = has(
        t,
        /\b(50|fifty)\s?(%|percent)|upon commissioning|upon (contract )?signing|final payment|upon final delivery/,
      );
      if (!mention)
        return {
          severity: "red",
          present: false,
          note: "No downpayment/milestone terms found. Policy: 50% on commissioning (witnessed signing), 50% on final delivery + Project Sign-off.",
        };
      if (split)
        return {
          severity: "green",
          present: true,
          note: "A milestone payment split is defined.",
        };
      return {
        severity: "amber",
        present: true,
        note: "Payment is mentioned but no clear 50/50 commissioning-and-delivery split was found. Policy: 50% on signing, 50% on delivery + sign-off.",
      };
    },
  },
  {
    policy: "Revisions",
    check: (t) => {
      const mention = has(t, /revision|round of (feedback|changes)|rounds of/);
      const cap = has(
        t,
        /\b(five|5)\b[^.\n]{0,30}\b(round|revision)|\b(round|revision)[^.\n]{0,20}\b(five|5)\b|per deliverable|sign[\s-]?off|no additional cost/,
      );
      if (!mention)
        return {
          severity: "red",
          present: false,
          note: "No revision terms found. Policy: 5 rounds per deliverable at no cost, all used before Project Sign-off, unused rounds invocable for 6 months after.",
        };
      if (cap)
        return {
          severity: "green",
          present: true,
          note: "A revision allowance is defined and tied to a terminating event.",
        };
      return {
        severity: "amber",
        present: true,
        note: "Revisions are mentioned but no allowance (e.g. 5 rounds per deliverable) or terminating event (Project Sign-off) was found.",
      };
    },
  },
  {
    policy: "Deemed approval",
    check: (t) => {
      const deemed = has(t, /deemed approv|deemed accept|automatically approved/);
      const window = has(
        t,
        /\b\d+\s?(business )?days?\b[^.\n]{0,40}(feedback|review|respon)|feedback[^.\n]{0,40}\b\d+\s?(business )?days?/,
      );
      if (deemed)
        return {
          severity: "green",
          present: true,
          note: "A deemed-approval mechanism is defined — this is what makes the revision allowance finite.",
        };
      if (window)
        return {
          severity: "amber",
          present: true,
          note: "A feedback window exists but client silence has no defined consequence. Policy: 15 business days, then a formal Notice of Pending Deemed Approval, then 15 further business days.",
        };
      return {
        severity: "red",
        present: false,
        note: "No feedback window or deemed-approval clause found. Without it the free revision allowance never closes, because sign-off never arrives.",
      };
    },
  },
  {
    policy: "Change orders",
    check: (t) => {
      const formal = has(t, /change[\s-]?order|written addendum|separate addendum/);
      const scope = has(
        t,
        /out[\s-]?of[\s-]?scope|new scope|additional (scope|work|feature|page|section)|scope change/,
      );
      if (formal)
        return {
          severity: "green",
          present: true,
          note: "A change-order / written-addendum process is defined for new scope.",
        };
      if (scope)
        return {
          severity: "amber",
          present: true,
          note: "Scope changes are referenced but no written addendum is required before work begins.",
        };
      return {
        severity: "red",
        present: false,
        note: "No change-order clause found. Policy: new scope (incl. competitor-inspired requests) needs a written addendum before work.",
      };
    },
  },
  {
    policy: "Late payment",
    check: (t) => {
      const interest = has(t, /interest|late fee|penalty|\b2\s?%|per month|pause work|suspend/);
      const terms = has(t, /net\s?\d+|due within \d+|within \d+ (business )?days|payable within/);
      if (interest)
        return {
          severity: "green",
          present: true,
          note: "Late-payment consequences (penalty / right to suspend) are defined.",
        };
      if (terms)
        return {
          severity: "amber",
          present: true,
          note: "Payment terms exist but no late-payment penalty or suspension right was found.",
        };
      return {
        severity: "red",
        present: false,
        note: "No late-payment terms found. Policy: payable in 7 business days; 2% per month from the 16th business day, computed daily; hosting suspendable after 15 days overdue.",
      };
    },
  },
  {
    policy: "IP & ownership",
    check: (t) => {
      const retain = has(t, /remain[^.\n]{0,40}property of|until full payment|retention of (title|ownership)/);
      const ip = has(t, /intellectual property|ownership|source code|portfolio/);
      if (retain)
        return {
          severity: "green",
          present: true,
          note: "IP is retained until full payment and transfers on final payment.",
        };
      if (ip)
        return {
          severity: "amber",
          present: true,
          note: "Ownership is referenced but IP retention until full payment was not clearly stated. Policy: ADVO retains all deliverables until paid in full; portfolio rights unless the client opts out in writing before final delivery.",
        };
      return {
        severity: "red",
        present: false,
        note: "No IP or ownership clause found. Policy: ADVO retains design files, source code, and deliverables until full payment; ownership transfers on final payment; ADVO keeps portfolio rights.",
      };
    },
  },
  {
    policy: "Continuity & termination",
    check: (t) => {
      const term = has(t, /terminat|rescind/);
      const continuity = has(t, /abandon|cure period|material breach|cease communication/);
      if (term && continuity)
        return {
          severity: "green",
          present: true,
          note: "Termination and non-abandonment obligations are both present.",
        };
      if (term || continuity)
        return {
          severity: "amber",
          present: true,
          note: "Termination or continuity is referenced but not both. Policy: 14-day cure period with cause; client pays % of completion on convenience cancellation; ADVO refunds uncommenced milestones and surrenders paid-for code.",
        };
      return {
        severity: "red",
        present: false,
        note: "No termination or non-abandonment clause found. Policy: 14-day cure with cause; % of completion payable on client cancellation; ADVO refunds uncommenced milestones.",
      };
    },
  },
  {
    policy: "Liability & fortuitous events",
    check: (t) => {
      const force = has(t, /fortuitous|force majeure|acts? of god|beyond (its |our |the )?reasonable control/);
      const liability = has(
        t,
        /liab|indirect (commercial )?loss|consequential|third[\s-]?party (service|provider|integration)/,
      );
      if (force && liability)
        return {
          severity: "green",
          present: true,
          note: "Force-majeure and limitation-of-liability protections are both present.",
        };
      if (force || liability)
        return {
          severity: "amber",
          present: true,
          note: "Only one of force majeure / limitation of liability was found. Policy needs both, plus a third-party dependency disclaimer.",
        };
      return {
        severity: "red",
        present: false,
        note: "No liability or fortuitous-events clause found. Policy: no liability for indirect commercial loss, third-party outages, or events beyond reasonable control.",
      };
    },
  },
];

function reviewHeuristic(text: string): ContractReview {
  const t = text.toLowerCase();
  const flags: ContractFlag[] = POLICIES.map((p) => {
    const r = p.check(t);
    return { policy: p.policy, severity: r.severity, present: r.present, note: r.note };
  });

  const reds = flags.filter((f) => f.severity === "red").length;
  const ambers = flags.filter((f) => f.severity === "amber").length;
  const greens = flags.filter((f) => f.severity === "green").length;

  let verdict: ContractReview["verdict"];
  if (reds >= 2) verdict = "high_risk";
  else if (reds === 1 || ambers >= 2) verdict = "needs_work";
  else verdict = "good_to_go";

  const summary = `${greens}/${POLICIES.length} ADVO protections addressed · ${ambers} partial · ${reds} missing. ${
    reds > 0
      ? "Close the missing clauses before sending — these are exactly what leaked revenue on past projects."
      : ambers > 0
        ? "Tighten the partial clauses, then it's good to go."
        : "Every policy area is addressed."
  }`;

  return {
    verdict,
    summary,
    flags,
    method: "heuristic",
    disclaimer:
      "Heuristic presence check against ADVO's own contract policy — not a legal review. Always have a lawyer review before signing.",
  };
}

// ---------------------------------------------------------------------------
// AI path (Claude). Activates only when ANTHROPIC_API_KEY is set; on any error
// or malformed output it returns null and reviewContract() uses the heuristic.
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You are a practical lawyer reviewing a website build contract for a small agency. Your job is to catch things that need fixing before the agency signs.

Keep it short. Return a bulleted list (plain text, no markdown headers) of things to fix or watch out for. Plain words — no legal jargon. Maximum 300 words.

Focus on these areas only if they are missing or clearly wrong:
- Missing scope definition (what is actually being built?)
- No change-order clause (what happens when the client asks for something new?)
- Payment terms missing or vague
- No IP assignment or ownership clause
- No limitation of liability
- No termination clause
- Delivery dates that look unrealistic or undefined

If the contract covers these adequately, say so in one sentence. Do not invent problems.`;

/**
 * Extract readable text from a contract file on disk.
 * Supports PDF and Word (.doc / .docx).
 */
export async function extractContractText(filePath: string, mimeType: string): Promise<string> {
  const WORD_TYPES = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (mimeType === "application/pdf") {
    const buffer = await readFile(filePath);
    const result = await pdfParse(buffer) as { text: string };
    return result.text;
  }

  if (WORD_TYPES.includes(mimeType)) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
}

/**
 * Run a short, plain-language AI review of a contract text string.
 * Returns the review text on success, or a human-readable error message when
 * the API key is missing or the call fails — never throws.
 */
export async function reviewWithClaude(text: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "AI review is not configured on this server. Have someone review the contract manually.";
  }
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      system: AI_SYSTEM,
      messages: [
        { role: "user", content: `Review this contract:\n\n${text.slice(0, 60_000)}` },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return "The AI returned an unexpected response. Review the contract manually.";
    }
    return block.text.trim();
  } catch (err) {
    console.error("[contract-review] AI review failed:", err);
    return "The AI review failed. Check the server logs and try again.";
  }
}

// ---------------------------------------------------------------------------
// Legacy heuristic path — kept for the old POST /api/contracts/review endpoint.
// ---------------------------------------------------------------------------

const VALID_VERDICTS = new Set<ContractReview["verdict"]>(["good_to_go", "needs_work", "high_risk"]);
const VALID_SEVERITIES = new Set<FlagSeverity>(["red", "amber", "green"]);

interface RawAIReview {
  verdict?: string;
  summary?: string;
  flags?: Array<{ policy?: string; severity?: string; present?: boolean; note?: string }>;
}

async function reviewWithClaudeLegacy(text: string): Promise<ContractReview | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const LEGACY_AI_SYSTEM = `You are a contract risk reviewer for ADVO, a Philippine web/design agency. Review the supplied contract or statement of work against ADVO's own contract policy and surface red flags.

ADVO's eight policy areas:
1. Payment schedule — 50% on commissioning, 50% on final delivery + sign-off.
2. Revisions — 5 rounds per deliverable at no additional cost.
3. Deemed approval — 15 business days to give feedback, then 15 more days of silence deems it approved.
4. Change orders — new scope requires a written addendum before work begins.
5. Late payment — 2% per month from the 16th business day.
6. IP & ownership — deliverables stay ADVO's until paid in full.
7. Continuity & termination — 14-day cure period; % of completion payable on cancellation.
8. Liability & fortuitous events — no liability for indirect losses or third-party outages.

Respond with ONLY a JSON object:
{"verdict":"good_to_go|needs_work|high_risk","summary":"<one or two sentences>","flags":[{"policy":"<area name>","severity":"red|amber|green","present":true|false,"note":"<note>"}]}

Verdict rule: "high_risk" if two or more reds; "needs_work" if exactly one red or two or more ambers; otherwise "good_to_go". Include all eight policy areas.`;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { effort: "medium" },
      system: LEGACY_AI_SYSTEM,
      messages: [
        { role: "user", content: `Review this contract / SOW:\n\n${text.slice(0, 100_000)}` },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;

    const raw = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(raw) as RawAIReview;

    if (!parsed.verdict || !VALID_VERDICTS.has(parsed.verdict as ContractReview["verdict"])) return null;
    if (!Array.isArray(parsed.flags)) return null;

    const flags: ContractFlag[] = parsed.flags
      .filter((f) => f && typeof f.severity === "string" && VALID_SEVERITIES.has(f.severity as FlagSeverity))
      .map((f) => ({
        policy: String(f.policy ?? "Policy"),
        severity: f.severity as FlagSeverity,
        present: Boolean(f.present),
        note: String(f.note ?? ""),
      }));
    if (flags.length < POLICIES.length) {
      return null;
    }

    return {
      verdict: parsed.verdict as ContractReview["verdict"],
      summary: String(parsed.summary ?? ""),
      flags,
      method: "ai",
      disclaimer:
        "AI-assisted review against ADVO's contract policy — a first-pass aid, not a legal review. Always have a lawyer review before signing.",
    };
  } catch (err) {
    console.error("[contract-review] Legacy AI path failed:", err);
    return null;
  }
}

/**
 * Review a contract / SOW (legacy heuristic + AI path).
 * Used by the old POST /api/contracts/review endpoint.
 */
export async function reviewContract(text: string): Promise<ContractReview> {
  const ai = await reviewWithClaudeLegacy(text);
  if (ai) return ai;
  return reviewHeuristic(text);
}
