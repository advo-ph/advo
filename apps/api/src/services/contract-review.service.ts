/**
 * Contract red-flag review — heuristic policy-presence check.
 *
 * Scans contract / SOW text for whether each of ADVO's contract policies
 * (docs/CONTRACTS.md) is even addressed. This catches the exact failure that
 * leaked revenue on Fourlinq + Felici: the contract was *silent* on
 * downpayment floor, revision caps, and change orders.
 *
 * This is intentionally a presence/heuristic check, NOT legal analysis. The
 * shape of the return value is LLM-ready: swapping `reviewContract` to call a
 * model later is a one-function change — the route + UI stay the same.
 */

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
  method: "heuristic";
  disclaimer: string;
}

interface PolicyCheck {
  policy: string;
  check: (t: string) => { severity: FlagSeverity; present: boolean; note: string };
}

const has = (t: string, re: RegExp) => re.test(t);

const POLICIES: PolicyCheck[] = [
  {
    policy: "Downpayment floor",
    check: (t) => {
      const mention = has(t, /down\s?payment|deposit|initial payment|mobilization fee/);
      const floor = has(t, /\b([4-9]\d|100)\s?%|forty percent|₱?\s?30[,.\s]?000|thirty thousand/);
      if (!mention)
        return {
          severity: "red",
          present: false,
          note: "No downpayment/deposit terms found. Policy: ≥40% of total value or ₱30,000, whichever is higher, before any work begins.",
        };
      if (floor)
        return {
          severity: "green",
          present: true,
          note: "Downpayment terms present with a percentage or peso floor.",
        };
      return {
        severity: "amber",
        present: true,
        note: "A downpayment is mentioned but no clear 40% / ₱30,000 floor was found. Confirm the amount meets the policy.",
      };
    },
  },
  {
    policy: "Revision limits",
    check: (t) => {
      const mention = has(t, /revision|round of (feedback|changes)|rounds of/);
      const cap = has(
        t,
        /\b(two|2)\b[^.\n]{0,30}\b(round|revision)|\b(round|revision)[^.\n]{0,20}\b(two|2)\b|per phase|additional revision|hourly rate|then-current hourly/,
      );
      if (!mention)
        return {
          severity: "red",
          present: false,
          note: "No revision limits found. Policy: 2 rounds per phase (discovery / design / build), then billed hourly.",
        };
      if (cap)
        return {
          severity: "green",
          present: true,
          note: "Revisions are capped and/or overage is metered.",
        };
      return {
        severity: "amber",
        present: true,
        note: "Revisions are mentioned but no clear cap (e.g. 2 rounds per phase) or overage rate was found.",
      };
    },
  },
  {
    policy: "Change orders",
    check: (t) => {
      const formal = has(t, /change[\s-]?order/);
      const scope = has(t, /out[\s-]?of[\s-]?scope|new scope|additional (scope|work|feature|page|section)|scope change/);
      if (formal)
        return {
          severity: "green",
          present: true,
          note: "A change-order process is defined for new scope.",
        };
      if (scope)
        return {
          severity: "amber",
          present: true,
          note: "Scope changes are referenced but no formal written change-order process was found.",
        };
      return {
        severity: "red",
        present: false,
        note: "No change-order clause found. Policy: new scope (incl. competitor-inspired requests) needs a written, signed change order before work.",
      };
    },
  },
  {
    policy: "Late payment",
    check: (t) => {
      const interest = has(t, /interest|late fee|penalty|\b2\s?%|per month|pause work/);
      const terms = has(t, /net\s?\d+|due within \d+|within \d+ (business )?days|payable within/);
      if (interest)
        return {
          severity: "green",
          present: true,
          note: "Late-payment consequences (interest / right to pause) are defined.",
        };
      if (terms)
        return {
          severity: "amber",
          present: true,
          note: "Payment terms exist but no late-payment interest or right-to-pause was found.",
        };
      return {
        severity: "red",
        present: false,
        note: "No late-payment terms found. Policy: due in 15 days; interest after 30; ADVO may pause work.",
      };
    },
  },
  {
    policy: "Termination",
    check: (t) => {
      const term = has(t, /terminat/);
      const cancel = has(t, /cancel(l?ation|led)?|end (this|the) (agreement|engagement)/);
      if (term)
        return {
          severity: "green",
          present: true,
          note: "Termination terms are present.",
        };
      if (cancel)
        return {
          severity: "amber",
          present: true,
          note: "Cancellation is referenced but a clear termination clause (notice, payment for WIP) was not found.",
        };
      return {
        severity: "red",
        present: false,
        note: "No termination clause found. Policy: either party may terminate with 15 days' notice; client pays completed + WIP; downpayment non-refundable.",
      };
    },
  },
];

export async function reviewContract(text: string): Promise<ContractReview> {
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

  const summary = `${greens}/5 ADVO protections addressed · ${ambers} partial · ${reds} missing. ${
    reds > 0
      ? "Close the missing clauses before sending — these are exactly what leaked revenue on past projects."
      : ambers > 0
        ? "Tighten the partial clauses, then it's good to go."
        : "All five policy areas are addressed."
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
