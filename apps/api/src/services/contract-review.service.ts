/**
 * Contract red-flag review — heuristic policy-presence check.
 *
 * Scans contract / SOW text for whether each of ADVO's contract policies
 * (docs/CONTRACTS.md) is even addressed. This catches the exact failure that
 * leaked revenue on Fourlinq + Felici: the contract was *silent* on
 * downpayment floor, revision caps, and change orders.
 *
 * If ANTHROPIC_API_KEY is set, reviewContract() runs a Claude review first and
 * falls back to this heuristic on any error, invalid output, or missing key.
 * The heuristic is a presence check, NOT legal analysis.
 */
import Anthropic from "@anthropic-ai/sdk";

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

const AI_SYSTEM = `You are a contract risk reviewer for ADVO, a Philippine web/design agency. Review the supplied contract or statement of work against ADVO's own contract policy and surface red flags.

ADVO's eight policy areas (reconciled 2026-08-19 against the contract ADVO actually sends; still draft, still pending legal review):
1. Payment schedule — 50% of the Total Project Value on commissioning (signing, with a witness present) and 50% on final delivery plus formal Project Sign-off or deemed approval. Non-refundable once a milestone is approved and signed off. Invoices payable within 7 business days. There is NO peso floor and no 40% rule; flag either as outdated.
2. Revisions — 5 rounds per deliverable at no additional cost, all of which must be used before the Project Sign-off document is signed. There is NO hourly overage rate. Unused rounds remain invocable within the original scope for 6 months after sign-off; anything later falls under the 30-day warranty or a maintenance agreement.
3. Deemed approval — the client has 15 business days to give feedback on a review delivery; on expiry ADVO issues a formal Notice of Pending Deemed Approval, and 15 further business days of silence deems the revision approved. Separately, client-caused delay or no response within 10 calendar days extends the timeline day-for-day.
4. Change orders — new modules, redesigns, structural adjustments, or feature additions (including competitor-inspired requests mid-build) require a written addendum executed before work begins.
5. Late payment — invoices payable within 7 business days; balances unpaid after 15 business days incur 2% per month from the 16th business day, calculated daily; an unpaid recurring infrastructure fee lets ADVO suspend hosting and API access after 15 days.
6. IP & ownership — all design files, source code, and deliverables remain ADVO's property until full payment, then transfer in full; client assets are licensed to ADVO only for the build; ADVO retains portfolio rights unless the client objects in writing before final delivery.
7. Continuity & termination — neither party may abandon the project; termination with cause needs written notice plus a 14-day cure period; client cancellation for convenience is payable at the exact percentage of completion plus non-refundable third-party integrations; ADVO terminating without cause refunds uncommenced milestones and surrenders paid-for code.
8. Liability & fortuitous events — a 30-day post-launch bug warranty; no liability for indirect commercial losses, third-party service interruptions, or fortuitous events beyond reasonable control.

For EACH of the eight areas, assign a severity:
- "green" = adequately addressed
- "amber" = present but weak, ambiguous, or below policy (e.g. a downpayment is named but below the 50% milestone, or revisions are capped with no deemed-approval mechanism to close them)
- "red" = missing or clearly inadequate

Respond with ONLY a JSON object (no prose, no markdown code fences) of exactly this shape:
{"verdict":"good_to_go|needs_work|high_risk","summary":"<one or two sentences>","flags":[{"policy":"<area name>","severity":"red|amber|green","present":true|false,"note":"<what was found or is missing, with the policy reference>"}]}

Verdict rule: "high_risk" if two or more reds; "needs_work" if exactly one red or two or more ambers; otherwise "good_to_go". Include all eight policy areas in "flags", in the order listed above.`;

const VALID_VERDICTS = new Set<ContractReview["verdict"]>(["good_to_go", "needs_work", "high_risk"]);
const VALID_SEVERITIES = new Set<FlagSeverity>(["red", "amber", "green"]);

interface RawAIReview {
  verdict?: string;
  summary?: string;
  flags?: Array<{ policy?: string; severity?: string; present?: boolean; note?: string }>;
}

async function reviewWithClaude(text: string): Promise<ContractReview | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: AI_SYSTEM,
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
    // COMPLETENESS GATE — the AI path must answer for EVERY policy, not merely
    // return some flags. Without this a model that silently omits, say, IP
    // retention, non-abandonment and liability returns five greens and zero reds,
    // and the verdict below reads good_to_go on a contract that has no IP clause
    // at all. The heuristic path cannot drift this way because it maps over
    // POLICIES directly (see :251); the AI path is free-form, so it is checked here.
    // Falling back to the heuristic is strictly safer than reporting a partial
    // review as a whole one.
    if (flags.length < POLICIES.length) {
      console.error(
        `[contract-review] AI returned ${flags.length}/${POLICIES.length} policy flags; ` +
          "an incomplete review cannot be scored — falling back to heuristic.",
      );
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
    console.error("[contract-review] AI path failed; falling back to heuristic:", err);
    return null;
  }
}

/**
 * Review a contract / SOW. Uses Claude when ANTHROPIC_API_KEY is configured,
 * otherwise (or on any AI error) falls back to the heuristic presence check.
 */
export async function reviewContract(text: string): Promise<ContractReview> {
  const ai = await reviewWithClaude(text);
  if (ai) return ai;
  return reviewHeuristic(text);
}
