/**
 * PhilGEPS titles are written for the system, not for a person: "SUPPLY, DELIVERY AND
 * INSTALLATION OF CCTV SURVEILLANCE SYSTEM (PR-2026-1011-00092)". Until a member or the
 * model writes a short title, the Bids page shows this cleaned version instead, so a
 * row reads the same whoever rated it. Nothing is invented: words are only removed
 * (procurement verbs, reference codes) or re-cased.
 */

const ACRONYM = new Set(
  "AI AV BAC BFP BOSS BPLS CCTV CDRRMO CSSD DENR DICT DILG DIMS DOTR DPWH DRRM DRRMO EMR EOC EWS GIS GPS HD HRIMS HRIS HRMS ICS ICT ICTE ID IOT IP IT LED LGU LMS MDRRMO MIS PDRRMO PNP PWD RFID SB SDO SIEM SK UPS WIFI".split(" "),
);
const SMALL = new Set("a an and as at by for from in of on or the to with de del".split(" "));

const LEAD_CODE =
  /^(?:(?:P\.?\s?R\.?|ITB|IB|RFQ|PRN)\s*(?:No\.?)?\s*[\w./-]*\d[\w./-]*(?:\s*\([^)]*\))?\s*[:\-–_]?\s*|[A-Z]{0,4}-?\d{4,}[\w-]*[_:\s-]+|\d{4}-[A-Z]+-\d+[_:\s-]+)/i;
const TRAIL_CODE = /\s*[([](?:PR|ITB|IB|RFQ)[^)\]]*[)\]]\s*$/i;
const LEAD_VERB =
  /^(?:(?:procurement|purchase|acquisition|provision|rental|supply|delivery|installation|testing|commissioning|configuration|deployment|labor and materials)(?:\s+of\s+goods)?[\s,:&]*(?:and\s+)?)+(?:of|for)\s+/i;

const isShouting = (s: string) => {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters.length > 8 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
};

function recase(s: string, mode: "sentence" | "title"): string {
  if (!isShouting(s)) return s;
  return s
    .split(/(\s+|[(),/:-])/)
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (!bare) return w;
      if (ACRONYM.has(bare) || /\d/.test(w)) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (mode === "title" && !(i > 0 && SMALL.has(lower))) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join("");
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `buyer` is dropped from the end of the title, where many notices repeat it. */
export function plainTitle(raw: string, buyer?: string): string {
  let t = raw.replace(/\s+/g, " ").trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
  if (buyer) {
    const tail = t.toLowerCase().lastIndexOf(buyer.toLowerCase().trim());
    if (tail > 10 && tail + buyer.trim().length >= t.length - 1) t = t.slice(0, tail).replace(/[\s,–-]+$/, "");
  }
  for (let i = 0; i < 3; i++) t = t.replace(LEAD_CODE, "").trim();
  t = t.replace(TRAIL_CODE, "").replace(/^procurement of goods\b[\s:,-]*/i, "").replace(LEAD_VERB, "").trim();
  return capitalise(recase(t || raw, "sentence"));
}

/** "MUNICIPALITY OF IBAAN, BATANGAS" → "Ibaan, Batangas". */
export function plainBuyer(raw: string): string {
  const t = recase(raw.replace(/\s+/g, " ").trim(), "title");
  return capitalise(t.replace(/^(?:the\s+)?(?:municipality|municipal government|local government unit) of\s+/i, ""));
}
