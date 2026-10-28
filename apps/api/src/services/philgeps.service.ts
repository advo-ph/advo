/**
 * PhilGEPS reader: the list of every open government bid, and one bid's notice.
 *
 * Two pages, both public, both plain ASP.NET WebForms:
 *
 *   * The open-opportunities list (LIST_URL). A bare GET returns page 1 of ALL open
 *     notices — about 12,000 on 27 Oct 2026, 600 pages of 20 — newest publish date
 *     first. Any page is one postback away: post the page's own hidden fields back with
 *     the page drop-down set to that page's first row number. Each worker opens its own
 *     session, because ASP.NET serialises requests that share one session cookie.
 *   * The printable notice abstract (NOTICE_URL + ref). Every field sits in a span with
 *     a stable id (lblDisplayBudget, lblDisplayCloseDateTime, lblPreBidDate, ...), so
 *     it is read by id rather than by label text. "Approved Budget" and "Estimated
 *     Budget" are both printed into lblDisplayBudget; reading the label lost the second
 *     kind (Bustos, 13303860, printed ₱3.8M and was recorded as "no budget").
 *
 * No keyword search. The first crawl searched 90 keywords and reached 5,152 of the
 * open notices; walking the whole list reaches all of them.
 */
import * as cheerio from "cheerio";
import { createLogger } from "../utils/logger.js";

const log = createLogger("philgeps");

export const LIST_URL =
  "https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpportunitiesSearchUI.aspx?menuIndex=3&ClickFrom=OpenOpp&Result=3";
export const NOTICE_URL =
  "https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/PrintableBidNoticeAbstractUI.aspx?refid=";

const PAGE_LIST_FIELD = "pgCtrlDetailedSearch$pageDropDownList";
const USER_AGENT = "Mozilla/5.0 (compatible; ADVO bid reader; contact@advo.ph)";
const REQUEST_TIMEOUT_MS = 60_000;
const ATTEMPT_LIMIT = 3;

/** One row of the open list. Dates are Manila wall time written as ISO with +08:00. */
export type ListedNotice = {
  ref: string;
  title: string;
  buyer: string;
  businessCategory: string;
  publishedOn: string | null;
  closingAt: string | null;
};

export type PreBid = { at: string | null; date: string; time: string; place: string };

/** One notice abstract, read in full. */
export type Notice = {
  ref: string;
  title: string;
  buyer: string;
  area: string;
  solicitation: string;
  mode: string;
  classification: string;
  category: string;
  /** Pesos; null when the notice prints no budget. */
  abc: number | null;
  deliveryPeriod: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactText: string;
  status: string;
  /** Bid bulletins posted against the notice. A rise means the buyer changed something. */
  supplementCount: number;
  publishedOn: string | null;
  updatedAt: string | null;
  closingAt: string | null;
  preBid: PreBid | null;
  description: string;
};

// ─── Small parsers ────────────────────────────────────

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** "27/10/2026" → "2026-10-27". */
export function isoDay(text: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * "03/11/2026 02:00 PM" or a date plus "10:00:00 AM" → "2026-11-03T14:00:00+08:00".
 * A date with no readable time is placed at 23:59, the latest it can mean.
 */
export function manilaTime(dateText: string, timeText = ""): string | null {
  const day = isoDay(dateText);
  if (!day) return null;
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i.exec(timeText || dateText.slice(10));
  if (!m) return `${day}T23:59:00+08:00`;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return `${day}T${String(hour).padStart(2, "0")}:${m[2]}:00+08:00`;
}

/** "14,500,000.00" → 14500000; anything without a number → null. */
export function pesos(text: string): number | null {
  const m = /[\d,]+(?:\.\d+)?/.exec(text.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hiddenFields($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name");
    if (name) out[name] = $(el).attr("value") ?? "";
  });
  return out;
}

// ─── List page ────────────────────────────────────────

export type ListPage = {
  rows: ListedNotice[];
  /** Drop-down values, one per page: "1", "21", "41", ... */
  pageValues: string[];
  hidden: Record<string, string>;
};

export function parseListPage(html: string): ListPage {
  const $ = cheerio.load(html);
  const rows: ListedNotice[] = [];
  $('a[id$="_hyLinkTitle"]').each((_, a) => {
    const link = $(a);
    const ref = /refID=(\d+)/i.exec(link.attr("href") ?? "")?.[1];
    if (!ref) return;
    const tr = link.closest("tr");
    const cells = tr.children("td");
    // ", Communication Equipment & Parts and Accessories ,BARANGAY KILOLORON - REAL, QUEZON"
    const tail = clean(tr.find('span[id$="_lblOrgAndBusCat"]').text());
    const split = /^,\s*(.*?)\s+,\s*(.*)$/.exec(tail);
    rows.push({
      ref,
      title: clean(link.text()),
      businessCategory: split?.[1] ?? "",
      buyer: split?.[2] ?? tail.replace(/^,\s*/, ""),
      publishedOn: isoDay(clean(cells.eq(1).text())),
      closingAt: manilaTime(clean(cells.eq(2).text())),
    });
  });
  const pageValues = $(`select[name="${PAGE_LIST_FIELD}"] option`)
    .map((_, o) => $(o).attr("value") ?? "")
    .get()
    .filter(Boolean);
  return { rows, pageValues, hidden: hiddenFields($) };
}

// ─── Notice abstract ──────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?63[\s-]?|0)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?:\s*(?:loc\.?|local)\s*\d+)?/i;

export function parseNotice(ref: string, html: string): Notice {
  const $ = cheerio.load(html);
  // A <br> inside a field is a line break on screen; read it as ", " so a venue does
  // not come out as "...TOWN HALLMUNICIPALITY OF...".
  const textOf = (el: ReturnType<typeof $>) =>
    clean(cheerio.load(`<i>${(el.first().html() ?? "").replace(/<br\s*\/?>/gi, ", ")}</i>`)("i").text()).replace(/(,\s*)+$/, "");
  const byId = (id: string) => textOf($(`#${id}`));

  // The contact block is lines split by <br>: name, role, address..., phone, email.
  const contactLines = ($("#lblDisplayContactPerson").html() ?? "")
    .split(/<br\s*\/?>/i)
    .map((l) => clean(cheerio.load(`<i>${l}</i>`)("i").text()))
    .filter(Boolean);
  const contactText = contactLines.join(" · ");
  const email = contactLines.find((l) => EMAIL.test(l))?.match(EMAIL)?.[0] ?? null;
  const phone =
    contactLines.find((l) => !EMAIL.test(l) && /\d{3}/.test(l) && PHONE.test(l) && !/philippines\s*\d{4}$/i.test(l))
      ?.match(PHONE)?.[0] ?? null;

  // Pre-bid rows live in their own small table; the first row is the meeting.
  const preDate = textOf($('[id$="lblPreBidDate"]'));
  const preTime = textOf($('[id$="lblPreBidTime"]'));
  const preVenue = textOf($('[id$="lblPreBidVenue"]'));
  const preBid: PreBid | null = isoDay(preDate)
    ? { at: manilaTime(preDate, preTime), date: isoDay(preDate)!, time: preTime, place: preVenue }
    : null;

  // The invitation text (lblAbstractText) and the schedule some buyers type into
  // "Other Information" (lblOtherInfo; Bustos puts its real bid deadline there). Line
  // breaks stay as " | " so a reader, or a model, sees numbered paragraphs.
  const lines = (id: string) =>
    ($(`#${id}`).html() ?? "")
      .split(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/i)
      .map((l) => clean(cheerio.load(`<i>${l}</i>`)("i").text()))
      .filter(Boolean);
  const other = lines("lblOtherInfo");
  const description = [...lines("lblAbstractText"), ...(other.length ? ["Other information:", ...other] : [])].join(" | ");

  return {
    ref,
    title: byId("lblDisplayTitle"),
    buyer: byId("lblDisplayProcuringEntity"),
    area: byId("lblDisplayAOD"),
    solicitation: byId("lblDisplaySolNumber"),
    mode: byId("lblDisplayProcureMode"),
    classification: byId("lblDisplayClass"),
    category: byId("lblDisplayCategory"),
    abc: pesos(byId("lblDisplayBudget")),
    deliveryPeriod: byId("lblDisplayPeriod"),
    contactName: contactLines[0] ?? "",
    contactPhone: phone ? clean(phone) : null,
    contactEmail: email,
    contactText,
    status: byId("lblDisplayStatus"),
    supplementCount: Number(byId("lblDisplayBidSupplements")) || 0,
    publishedOn: isoDay(byId("lblDisplayDatePublish")),
    updatedAt: manilaTime(byId("lblDisplayLastUpdateTime")),
    closingAt: manilaTime(byId("lblDisplayCloseDateTime")),
    preBid,
    description,
  };
}

// ─── HTTP ─────────────────────────────────────────────

/** One browser-like session: carries the cookies PhilGEPS sets, nothing else. */
class Session {
  private cookie = new Map<string, string>();

  async request(url: string, body?: Record<string, string>): Promise<string> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= ATTEMPT_LIMIT; attempt++) {
      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: {
            "User-Agent": USER_AGENT,
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
            ...(this.cookie.size ? { Cookie: [...this.cookie].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
          },
          body: body ? new URLSearchParams(body).toString() : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        for (const line of res.headers.getSetCookie()) {
          const [pair] = line.split(";");
          const at = pair.indexOf("=");
          if (at > 0) this.cookie.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

async function pool<T>(items: T[], concurrency: number, work: (item: T, worker: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async (_, worker) => {
      while (next < items.length) {
        const item = items[next++];
        await work(item, worker);
      }
    }),
  );
}

export type OpenListResult = {
  rows: ListedNotice[];
  pageCount: number;
  failedPageCount: number;
};

/**
 * Walk every page of the open list. Pages are spread across `concurrency` sessions;
 * a page that still fails after its retries is counted, never silently dropped, so
 * the caller can tell a complete walk from a partial one.
 */
export async function listOpenNotices(concurrency = 6): Promise<OpenListResult> {
  const first = parseListPage(await new Session().request(LIST_URL));
  const pageValues = first.pageValues.length ? first.pageValues : ["1"];
  const byRef = new Map(first.rows.map((r) => [r.ref, r]));

  const sessions = await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const session = new Session();
      const page = parseListPage(await session.request(LIST_URL));
      return { session, hidden: page.hidden };
    }),
  );

  let errorPageCount = 0;
  const emptyValues: number[] = [];
  let lastFullValue = 1;
  await pool(pageValues.slice(1), concurrency, async (value, worker) => {
    const { session, hidden } = sessions[worker];
    try {
      const html = await session.request(LIST_URL, {
        ...hidden,
        __EVENTTARGET: PAGE_LIST_FIELD,
        __EVENTARGUMENT: "",
        [PAGE_LIST_FIELD]: value,
        txtKeyword: "",
      });
      const page = parseListPage(html);
      if (!page.rows.length) {
        emptyValues.push(Number(value));
        return;
      }
      lastFullValue = Math.max(lastFullValue, Number(value));
      for (const row of page.rows) if (!byRef.has(row.ref)) byRef.set(row.ref, row);
    } catch (err) {
      errorPageCount++;
      log.warn({ err, value }, "Open-list page failed");
    }
  });
  // Notices close while the walk runs, so the last page or two can come back empty:
  // the list got shorter, nothing was missed. An empty page BEFORE a full one is a miss.
  const missedEmpty = emptyValues.filter((v) => v < lastFullValue).length;
  if (missedEmpty) log.warn({ missedEmpty }, "Open-list pages came back empty mid-list");

  return { rows: [...byRef.values()], pageCount: pageValues.length, failedPageCount: errorPageCount + missedEmpty };
}

/** Read one notice in full. Null when PhilGEPS will not serve it after retries. */
export async function readNotice(ref: string): Promise<Notice | null> {
  try {
    const html = await new Session().request(`${NOTICE_URL}${ref}`);
    const notice = parseNotice(ref, html);
    return notice.title ? notice : null;
  } catch (err) {
    log.warn({ err, ref }, "Notice read failed");
    return null;
  }
}

/** Read many notices, `concurrency` at a time. Missing entries failed to read. */
export async function readNotices(
  refs: string[],
  concurrency = 8,
  onProgress?: (done: number) => void,
): Promise<Map<string, Notice>> {
  const out = new Map<string, Notice>();
  let done = 0;
  await pool(refs, concurrency, async (ref) => {
    const notice = await readNotice(ref);
    if (notice) out.set(ref, notice);
    done++;
    if (onProgress && done % 200 === 0) onProgress(done);
  });
  return out;
}
