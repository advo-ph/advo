/**
 * Outreach targeting: prefer zero/outdated systems only.
 *
 * Product rule (Prince / ADVO): if a company already has a modern system or
 * website stack, we cannot simply offer them a new one. Score higher when the
 * prospect has no digital presence or an outdated stack.
 */

export type DigitalSignal = {
  hasWebsite?: boolean;
  /** e.g. known SaaS / Shopify / Inventi */
  hasModernStack?: boolean;
  /** 0–100; lower = worse / more outdated */
  digitalScore?: number;
  systemAgeYears?: number;
};

/**
 * Higher = better outreach target (no modern system).
 *
 * Rules:
 * - hasModernStack true → priority 0 (do not target)
 * - hasWebsite false → high priority (100)
 * - low digitalScore → higher priority
 * - old systemAgeYears → higher priority
 */
export function outreachPriority(signal: DigitalSignal): number {
  if (signal.hasModernStack === true) return 0;

  if (signal.hasWebsite === false) return 100;

  let priority = 50;

  if (typeof signal.digitalScore === "number" && Number.isFinite(signal.digitalScore)) {
    const clamped = Math.max(0, Math.min(100, signal.digitalScore));
    priority = 100 - clamped;
  }

  if (typeof signal.systemAgeYears === "number" && Number.isFinite(signal.systemAgeYears)) {
    // 0y → +0, 10y+ → +40
    const ageBoost = Math.min(40, Math.max(0, signal.systemAgeYears) * 4);
    if (typeof signal.digitalScore === "number" && Number.isFinite(signal.digitalScore)) {
      priority = Math.min(100, priority + ageBoost * 0.5);
    } else {
      priority = Math.min(100, 40 + ageBoost);
    }
  }

  // Has a website but no modernity/score/age signal → mild deprioritize
  if (
    signal.hasWebsite === true &&
    typeof signal.digitalScore !== "number" &&
    typeof signal.systemAgeYears !== "number"
  ) {
    priority = 30;
  }

  return Math.round(Math.max(0, Math.min(100, priority)));
}

/** True when priority meets the outreach floor (default 40). */
export function isOutreachTarget(signal: DigitalSignal, minPriority = 40): boolean {
  return outreachPriority(signal) >= minPriority;
}

/** Known modern platforms — do not target for greenfield rebuild offers. */
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

/**
 * Derive a DigitalSignal from free-text lead fields (company, project type,
 * description, notes). Keyword heuristic only — no network calls.
 */
export function signalFromLeadText(text: string): DigitalSignal {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return {};

  const hasModernStack = MODERN_PLATFORM_KEYWORD.some((keyword) => lower.includes(keyword));

  const noWebsite =
    /\bno\s+website\b/.test(lower) ||
    /\bwithout\s+(a\s+)?website\b/.test(lower) ||
    /\bdoesn'?t\s+have\s+(a\s+)?website\b/.test(lower) ||
    /\bno\s+site\b/.test(lower) ||
    /\bzero\s+digital\b/.test(lower) ||
    /\bno\s+online\s+presence\b/.test(lower);

  const outdated =
    /\boutdated\b/.test(lower) ||
    /\blegacy\b/.test(lower) ||
    /\bold\s+system\b/.test(lower) ||
    /\bpaper[- ]based\b/.test(lower) ||
    /\bmanual\s+process\b/.test(lower) ||
    /\bspreadsheet\b/.test(lower) ||
    /\bexcel\s+only\b/.test(lower);

  let systemAgeYears: number | undefined;
  const ageMatch = lower.match(/(\d+)\s*(?:year|yr)s?\s*old/);
  if (ageMatch) {
    systemAgeYears = parseInt(ageMatch[1], 10);
  } else {
    const builtMatch = lower.match(/built\s+in\s+(19|20)(\d{2})/);
    if (builtMatch) {
      const year = parseInt(`${builtMatch[1]}${builtMatch[2]}`, 10);
      const age = new Date().getFullYear() - year;
      if (age >= 0) systemAgeYears = age;
    }
  }

  let digitalScore: number | undefined;
  if (hasModernStack) {
    digitalScore = 90;
  } else if (noWebsite) {
    digitalScore = 5;
  } else if (outdated) {
    digitalScore = 20;
  }

  const signal: DigitalSignal = {};
  if (hasModernStack) signal.hasModernStack = true;
  if (noWebsite) signal.hasWebsite = false;
  if (typeof digitalScore === "number") signal.digitalScore = digitalScore;
  if (typeof systemAgeYears === "number") signal.systemAgeYears = systemAgeYears;
  return signal;
}

/** Concatenate lead text fields used for keyword targeting. */
export function leadTextForSignal(lead: {
  company?: string | null;
  project_type?: string | null;
  description?: string | null;
  notes?: string | null;
}): string {
  return [lead.company, lead.project_type, lead.description, lead.notes]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(" ");
}
