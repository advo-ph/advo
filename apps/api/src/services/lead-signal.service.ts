/**
 * Lead signal extraction — the scraped facts a proposal is written from.
 *
 * The ~5K clinic archive carries its audit findings as free text on the lead
 * row (`description` + `notes`): "No website. Phone bookings only. Digital
 * score 8." / "outdated system; paper-based". Nothing parses those numbers
 * server-side today — `apps/web/src/lib/targeting.ts` only *infers* a digital
 * score from keywords for the Leads "Outdated only" filter.
 *
 * This module reads the explicit scores when the dump has them, falls back to
 * the same keyword inference when it doesn't, and adds the industry guess. It
 * is the input to AI proposal generation (proposal.service.ts) — so the body
 * copy argues from this lead's own numbers instead of a name-swapped template.
 *
 * Keyword + regex heuristic only. No network calls, no model.
 */

/** 0–100 where lower = worse / more outdated, matching targeting.ts. */
export type LeadSignal = {
  /** Explicit "digital score N" when present, else inferred from keywords. */
  digitalScore: number | null;
  /** Explicit "design score N" / design grade when present. */
  designScore: number | null;
  /** Explicit "performance score N" or a perf letter grade (A–F). */
  performanceScore: number | null;
  /** Whether each score above came from the dump or from keyword inference. */
  isScoreExplicit: boolean;
  industry: string | null;
  hasWebsite: boolean | null;
  hasModernStack: boolean;
  systemAgeYear: number | null;
  /** Short phrases lifted from the lead text, for prompt + audit trail. */
  evidence: string[];
};

/** Known modern platforms — a rebuild pitch does not apply (Prince's rule). */
const MODERN_PLATFORM_KEYWORD = [
  "shopify",
  "inventi",
  "squarespace",
  "wix",
  "webflow",
  "bigcommerce",
  "hubspot",
  "salesforce",
  "wordpress.com",
  "magento",
  "woocommerce",
] as const;

/** projectType / company / description keyword → industry label. */
const INDUSTRY_KEYWORD: ReadonlyArray<[RegExp, string]> = [
  [/\bdental|dentist|smile|ortho|tooth\b/, "dental clinic"],
  [/\bpedia|clinic|medical|health|derma|optical|laborator|diagnostic\b/, "healthcare clinic"],
  [/\bvet|veterinar|animal\b/, "veterinary clinic"],
  [/\bcafe|coffee|restaurant|resto|bakery|food|kitchen\b/, "food service"],
  [/\bsalon|spa|barber|aesthetic|wellness\b/, "salon & wellness"],
  [/\bconstruction|builder|contractor|engineering|architect\b/, "construction"],
  [/\bschool|academy|tutor|review\s?center|learning\b/, "education"],
  [/\breal\s?estate|property|realty|leasing\b/, "real estate"],
  [/\blogistic|freight|courier|forward(ing|er)|trucking\b/, "logistics"],
  [/\bretail|store|shop|boutique|apparel|merch\b/, "retail"],
  [/\bmanufactur|factory|fabricat|industrial\b/, "manufacturing"],
  [/\blaw|legal|attorney|notar\b/, "legal services"],
];

/** Perf letter grade → 0–100, matching the Lighthouse-style buckets. */
const GRADE_SCORE: Record<string, number> = { a: 95, b: 80, c: 65, d: 50, e: 40, f: 30 };

function clampScore(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Read "digital score 8", "design score: 42", "perf 30/100" for one label. */
function explicitScore(text: string, label: RegExp): number | null {
  const numeric = text.match(
    new RegExp(`${label.source}\\s*(?:score|grade|rating)?\\s*(?:is|of|[:=])?\\s*(\\d{1,3})`, "i"),
  );
  if (numeric) return clampScore(parseInt(numeric[1], 10));

  const letter = text.match(
    new RegExp(`${label.source}\\s*(?:score|grade|rating)\\s*(?:is|of|[:=])?\\s*([a-f])\\b`, "i"),
  );
  if (letter) {
    const mapped = GRADE_SCORE[letter[1].toLowerCase()];
    return mapped === undefined ? null : mapped;
  }
  return null;
}

/** Concatenate the lead text fields the audit findings live in. */
export function leadTextForSignal(field: {
  company?: string | null;
  projectType?: string | null;
  description?: string | null;
  notes?: string | null;
}): string {
  return [field.company, field.projectType, field.description, field.notes]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(" · ");
}

export function extractLeadSignal(text: string): LeadSignal {
  const lower = (text ?? "").toLowerCase();
  const evidence: string[] = [];

  if (!lower.trim()) {
    return {
      digitalScore: null,
      designScore: null,
      performanceScore: null,
      isScoreExplicit: false,
      industry: null,
      hasWebsite: null,
      hasModernStack: false,
      systemAgeYear: null,
      evidence,
    };
  }

  const hasModernStack = MODERN_PLATFORM_KEYWORD.some((keyword) => lower.includes(keyword));
  if (hasModernStack) evidence.push("already on a modern platform");

  const noWebsite =
    /\bno\s+website\b/.test(lower) ||
    /\bwithout\s+(a\s+)?website\b/.test(lower) ||
    /\bdoesn'?t\s+have\s+(a\s+)?website\b/.test(lower) ||
    /\bno\s+site\b/.test(lower) ||
    /\bzero\s+digital\b/.test(lower) ||
    /\bno\s+online\s+presence\b/.test(lower);
  if (noWebsite) evidence.push("no website at all");

  const outdated =
    /\boutdated\b/.test(lower) ||
    /\blegacy\b/.test(lower) ||
    /\bold\s+system\b/.test(lower) ||
    /\bpaper[- ]based\b/.test(lower) ||
    /\bmanual\s+process\b/.test(lower) ||
    /\bspreadsheet\b/.test(lower) ||
    /\bexcel\s+only\b/.test(lower);
  if (outdated) evidence.push("outdated or manual system");

  if (
    /\bphone\s+(?:booking|appointment|order|call|inquir)\w*/.test(lower) ||
    /\b(?:booking|appointment|order)\w*\s+(?:by|via|over the)\s+phone\b/.test(lower) ||
    /\bphone[\s-]?only\b/.test(lower)
  ) {
    evidence.push("bookings taken by phone");
  }
  if (/\bwalk[- ]?in\b/.test(lower)) evidence.push("walk-in intake");

  let systemAgeYear: number | null = null;
  const ageMatch = lower.match(/(\d{1,2})[\s-]*(?:year|yr)s?[\s-]*old/);
  if (ageMatch) {
    systemAgeYear = parseInt(ageMatch[1], 10);
  } else {
    const builtMatch = lower.match(/built\s+in\s+((?:19|20)\d{2})/);
    if (builtMatch) {
      const age = new Date().getFullYear() - parseInt(builtMatch[1], 10);
      if (age >= 0) systemAgeYear = age;
    }
  }
  if (systemAgeYear !== null) evidence.push(`system about ${systemAgeYear} years old`);

  const explicitDigital = explicitScore(lower, /digital(?:\s+presence)?/);
  const designScore = explicitScore(lower, /design(?:\s+quality)?/);
  const performanceScore =
    explicitScore(lower, /performance/) ?? explicitScore(lower, /perf(?:ormance)?/);

  let digitalScore = explicitDigital;
  if (digitalScore === null) {
    if (hasModernStack) digitalScore = 90;
    else if (noWebsite) digitalScore = 5;
    else if (outdated) digitalScore = 20;
  }

  if (explicitDigital !== null) evidence.push(`digital score ${explicitDigital}/100`);
  if (designScore !== null) evidence.push(`design score ${designScore}/100`);
  if (performanceScore !== null) evidence.push(`performance score ${performanceScore}/100`);

  const industry = INDUSTRY_KEYWORD.find(([pattern]) => pattern.test(lower))?.[1] ?? null;

  return {
    digitalScore,
    designScore,
    performanceScore,
    isScoreExplicit:
      explicitDigital !== null || designScore !== null || performanceScore !== null,
    industry,
    hasWebsite: noWebsite ? false : hasModernStack || digitalScore !== null ? true : null,
    hasModernStack,
    systemAgeYear,
    evidence,
  };
}

/** One-line human summary of the signal, used in the proposal document. */
export function describeLeadSignal(signal: LeadSignal): string {
  const part: string[] = [];
  if (signal.industry) part.push(signal.industry);
  if (signal.digitalScore !== null) part.push(`digital ${signal.digitalScore}/100`);
  if (signal.designScore !== null) part.push(`design ${signal.designScore}/100`);
  if (signal.performanceScore !== null) part.push(`performance ${signal.performanceScore}/100`);
  if (signal.systemAgeYear !== null) part.push(`system ~${signal.systemAgeYear}y old`);
  if (signal.hasModernStack) part.push("modern platform in place");
  else if (signal.hasWebsite === false) part.push("no website");
  return part.length > 0 ? part.join(" · ") : "no scraped signal on file";
}
