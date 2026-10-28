/**
 * Which PhilGEPS notices might fit ADVO — keyword rules, before any model reads them.
 *
 * Ported from the 27 Oct 2026 hand pipeline (advoroads
 * process/general-plans/references/govt-bid-pipeline-27-10-26.md): a broad title match,
 * a long list of title exclusions (construction, food, vehicles, medicine, plain
 * computers...), a topic from the title or else the first part of the notice text, and
 * two flags that sink a bid outright — a renewal of one brand's licence, and plain
 * equipment supply with no software in the title.
 *
 * The rules decide what is worth rating. They never decide the odds: that is the
 * model's or a member's call (bid-rate.service.ts, PATCH /api/bids/:ref).
 */

export type BidTopic =
  | "flood"
  | "emergency"
  | "traffic"
  | "cctv"
  | "kiosk"
  | "mapping"
  | "software"
  | "display"
  | "network";

export const TOPIC_LABEL: Record<BidTopic, string> = {
  flood: "Flood and early warning",
  emergency: "Emergency and command centre",
  traffic: "Traffic and parking",
  cctv: "CCTV and smart city",
  kiosk: "Kiosks, IDs and access",
  mapping: "Drones and mapping",
  software: "Software and apps",
  display: "Displays and AV",
  network: "Networks",
};

/** Smallest budget worth a bid. A blank budget is kept: the notice may print it in the text. */
export const MIN_BUDGET = 500_000;

const FIT =
  /flood|water ?level|early warning|\bEWS\b|rain ?gauge|hydro|telemetr|weather|\bAWS\b|siren|warning|forecast|emergency|DRRM|disaster|incident|command|control cent|operations? cent|\bEOC\b|\bICS\b|software|information system|management system|application|\bapps?\b|web|portal|platform|online|digital|digitali|digitiz|database|e-?gov|BPLS|business permit|real property|civil registry|HRIS|HRMS|HRIMS|human resource|payroll|document|records|queu|kiosk|\bLMS\b|learning management|school management|hospital information|clinic|\bEMR\b|medical record|e-?BIS|barangay information|legislative|tracking|\bGIS\b|geographic|mapping|dashboard|\bAI\b|artificial|chatbot|automat|traffic|intelligent transport|parking|plate recogn|ANPR|smart|system|integration|cloud|subscription|consult|ticketing|registration|event management|e-?learning|monitoring|\bIoT\b|sensor|telehealth|telemedicine|payment|cashless|cctv|surveillance|camera|LED|display|video wall|signage|RFID|biometric|attendance|GPS|drone|lidar|public address|access control|barrier|gate|wi-?fi|data cent|network|interactive|solar.{0,40}(sensor|monitor|light.{0,20}(smart|system))|audio.?visual|projection/i;

const HARD =
  /\b(?:construction|concret\w*|building|\broad\b|bridge|drainage|canal|dike|seawall|riprap|gabion|catering|meal|food|rice|grocer\w*|christmas|decor|uniform|t-shirt|jersey|medicine|drugs|vaccine|reagent|laborator(?:y|ies) (?:supplies|equipment|reagents|instruments|consumables)|medical and laboratory|anesthe\w*|x-?ray|ultrasound|dental|medical (?:supplies|equipment)|hospital equipment|vehicle|truck|ambulance|motorcycle|\bboat|fuel|gasoline|diesel|\btires?\b|furniture|chairs?\b|tables?\b|aircon|air-?condition|toner|\bink\b|bond paper|office supplies|janitorial|security (?:guard|services)|printing|publication|newspaper|tarpaulin|lights and sound|venue|accommodation|airline|airfare|hotel|seedling|fertilizer|feeds|livestock|cement|lumber|\bpaint|plumbing|rescue (?:equipment|kit|supplies|paraphernalia)|life ?vest|life ?jacket|stretcher|\btent|sleeping kit|relief|hygiene kit|insurance|scholarship|seminar|workshop|orientation|capacity building|laptop|desktop|computer sets?|printers?|\bups\b|internet (?:subscription|service|connection)|leased.?line|direct internet|microsoft|office 365|adobe|\bSAP\b|oracle|antivirus|anti-virus|e-?journal|e-?book|\bISO \d|renewal|elevator|water district|water supply|pump|streetlight|street light|flood ?light|sporting goods|sports (?:supplies|equipment|uniform)|trophies|medals?|groceries|meat|fish|vegetable|poultry|laundry|linen|beddings?|kitchen|cooking|garbage|waste|sewage|septic|tractor|harvester|farm|go bag|tactical|asphalt|heavy equipment|mobile data|microscope|landscap\w*|glucose|blood bank|outboard)(?:s|es)?\b/i;

/**
 * A title that names software or a system we build. With no model to read the notice,
 * only these count as a fit: "sound system", "fire alarm system" and "LED display" do
 * not, and "go bags for the MDRRMO" never did.
 */
const SOFTWARE_SIGNAL =
  /software|information system|management system|monitoring system|warning system|early warning|\bEWS\b|alert system|notification system|application|\bapps?\b|platform|portal|website|web.?based|online system|database|digitali[sz]|digitiz|dashboard|e-?gov|BPLS|HRIS|HRMS|HRIMS|\bLMS\b|\bEMR\b|\bEHR\b|queu(?:e|e?ing) (?:management )?system|kiosk|command (?:and control )?cent|operations? cent|control cent|\bEOC\b|\bICS\b|smart city|surveillance system|cctv (?:system|command|monitoring)|traffic (?:management|signal|control) system|intelligent transport|\bGIS\b|geographic information|telemetr|hydromet|water ?level|rain ?gauge|flood (?:monitoring|sensor|early)|sensor network|artificial intelligence|\bAI\b|chatbot|analytics|cloud|\bIoT\b|automation|tracking system|\bID system|registration system|e-?payment|cashless|ticketing system|records management|document management|incident management|resource deployment|dispatch/i;

/** The fit reason when rules alone keep a title they cannot judge; not worth listing. */
export const UNCLEAR_REASON = "Unclear from the title";

export function hasSoftwareSignal(title: string): boolean {
  return SOFTWARE_SIGNAL.test(title);
}

/** Topic patterns in priority order: the first match wins. */
const TOPICS: [BidTopic, RegExp][] = [
  ["flood", /flood|water ?level|early warning|\bEWS\b|rain ?gauge|hydromet|hydrolog|telemetr|weather|\bAWS\b|siren|forecast|tsunami|landslide|warning (?:device|system)/i],
  ["emergency", /emergency|DRRM|disaster|incident|command|control cent|operations? cent|\bEOC\b|\bICS\b|resource deployment|\b911\b|dispatch/i],
  ["traffic", /traffic|intelligent transport|parking|plate recogn|\bANPR\b|apprehension|\bGPS\b|fleet|tracking device/i],
  ["cctv", /cctv|surveillance|camera|smart city|smart pole/i],
  ["kiosk", /kiosk|queu|RFID|biometric|attendance|access control|\bID (?:card|system)|turnstile/i],
  ["mapping", /drone|lidar|mapping|\bGIS\b|geographic|geo.?tag|photogrammetr/i],
  [
    "software",
    /software|information system|management system|application|\bapps?\b|website|web.?based|portal|platform|online|digitali|digitiz|database|e-?gov|BPLS|business permit|real property|civil registry|HRIS|HRMS|HRIMS|human resource information|payroll|document|records management|\bLMS\b|learning management|school management|hospital information|clinic|\bEMR\b|medical records?|barangay information|legislative|dashboard|artificial intelligence|\bAI\b|chatbot|systems? development|systems? integration|cloud|e-?payment|cashless|ticketing|registration system|tracking system|monitoring system|smart|analytics|\bIoT\b|automation/i,
  ],
  ["display", /\bLED\b|video wall|display|signage|projection|audio.?visual|public address|sound system/i],
  ["network", /network|wi-?fi|data cent|server|fiber|cabling|telecom/i],
];

/** A renewal, or one named vendor's licence: the incumbent wins it. */
const LOCK =
  /\b(?:EZGov|SAP|oracle|microsoft|office 365|smartsheet|zoom|canva|adobe|autodesk|autocad|arcgis|esri|kaspersky|sophos|fortinet|cisco|vmware|nutanix|veeam|renewal|existing|annual subscription of the|maintenance of (?:the )?(?:existing|koica)|upgrad(?:e|ing) of (?:the )?existing|license subscription|licenses? of|e-?journal|e-?book|e-?library|turnitin|grammarly|anti.?virus|endpoint|firewall)\b/i;

/** Equipment words; with no software word beside them, the bid is plain supply. */
const EQUIPMENT =
  /laptop|desktop|computer set|printer|scanner and consumables|server\b|network|cabling|internet|led wall|video wall|smart ?tv|television|projector|cctv|camera|radio|drone|lidar|gnss|rtk|survey(?:ing)? (?:instrument|equipment|receiver)|biometric(?:s)? (?:machine|device)|IT equipment|ICT equipment|office equipment|signage|signages|paints|materials and supplies|supplies and materials|hardware materials/i;
const SOFTWARE_WORD = /software|system|platform|application|portal|website/i;

export type FitInput = {
  title: string;
  description?: string | null;
  abc: number | null;
};

export type FitResult = {
  topic: BidTopic | null;
  /** Passes the title match and exclusions and has a topic: worth reading in full. */
  isCandidate: boolean;
  /** Set when the rules alone rule the bid out; the reason a member reads. */
  ruleNotFit: string | null;
};

export function topicOf(title: string, description?: string | null): BidTopic | null {
  const inTitle = TOPICS.find(([, re]) => re.test(title));
  if (inTitle) return inTitle[0];
  if (!description) return null;
  const text = `${title} ${description.slice(0, 800)}`;
  return TOPICS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function classifyBid({ title, description, abc }: FitInput): FitResult {
  if (HARD.test(title) || !FIT.test(title)) {
    // Title-only topic: a construction notice that says "drainage system" in its text
    // is not a software bid.
    const topic = TOPICS.find(([, re]) => re.test(title))?.[0] ?? null;
    return { topic, isCandidate: false, ruleNotFit: topic ? "Not our kind of work" : null };
  }
  const topic = topicOf(title, description);
  if (!topic) return { topic: null, isCandidate: false, ruleNotFit: null };
  if (LOCK.test(title)) return { topic, isCandidate: true, ruleNotFit: "Renewal or one brand's licence" };
  if (EQUIPMENT.test(title) && !SOFTWARE_WORD.test(title)) {
    return { topic, isCandidate: true, ruleNotFit: "Equipment supply only" };
  }
  if (abc !== null && abc < MIN_BUDGET) return { topic, isCandidate: true, ruleNotFit: "Under ₱500k" };
  return { topic, isCandidate: true, ruleNotFit: null };
}
