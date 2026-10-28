/**
 * How a bid is rated: does it fit ADVO, what are the odds, how would we join, and a
 * plain title a member can scan.
 *
 * The daily sync never calls a model, so a refresh costs no AI credits. Ratings are
 * written from the terminal instead (scripts/bid-rate.ts): `pending` writes the bids
 * that need one together with this guide, Claude rates them in the session, and
 * `apply` saves the answers. Each rating is kept for that version of the notice
 * (`rated_hash`), so a bid is only rated again when PhilGEPS changes it. A member's
 * own rating is never sent and never overwritten.
 *
 * The odds are a judgement written the way the team wrote the first 24 by hand —
 * "good" only when the bid asks for something ADVO already built. Public bidding is a
 * pass/fail papers check and then the lowest price; nothing here is a probability.
 */
import * as z from "zod/v4";

export const RATING_GUIDE = `You rate Philippine government bids (PhilGEPS notices) for ADVO. Answer only in the JSON shape given.

About ADVO:
- A small Philippine software company (sole proprietorship). It builds web and mobile systems.
- It built FloodPASS: a road flood map, a city operations console (incidents, alerts, sensors, dashboards) and street flood sensors that a partner installs. Call this "our product".
- It has no finished government contract of its own. A public bid's papers check needs one finished similar contract worth at least half the budget, so most bids need a partner whose past contract counts for the joint venture.
- Partner for sensor, early-warning and telemetry bids: West Point Engineering Supplies (La Union telemetry ₱39.8M 2024, DPWH hydrological equipment ₱36.97M 2022, NIA water-level sensors ₱20.3M 2023).
- No software partner yet. Small value buys under ₱2M usually ask only for papers, so ADVO can join alone.
- Public bidding is a pass/fail papers check, then the lowest price wins. Extra features earn no points.

For each bid:
- fit: true when ADVO could sensibly bid: software, apps, information systems, dashboards, command or operations centres, early warning and sensors, smart city, kiosks or IDs with software. false for plain equipment supply, one brand's licence or a renewal, construction or building repairs, vehicles, medical or laboratory supplies, consulting that needs licensed experts ADVO lacks (engineers, hydrogeologists, appraisers), or anything else outside software. When false, notFitReason says why in under 8 words; otherwise it is null.
- win: "good" only when the bid asks for something ADVO already built (flood, early warning, DRRM or command-centre software) or is small and simple enough for ADVO alone. "fair" when ADVO can build it but needs a partner, faces strong competitors, or is far away. "low" when hardware is most of the cost, a specialist market owns it, or the papers are hard to meet.
- kind: "product" for FloodPASS-like work, "software" for other software, "hardware" when hardware is a big part.
- what: plain English, under 70 characters. No "Procurement of", "Supply and Delivery of" or codes.
- buyer: a short name, such as "Sagay City", "Samar province", "PHLPost" or "Barangay Pulvorista, Kawit".
- place: town or city and province; the region for a national agency.
- join: how ADVO can join, under 60 characters, such as "Yes, with West Point", "Need a software partner (₱7.25M past job)" or "Yes, ADVO alone (small value buy)". The past job needed is half the budget.
- why: the main reason for the win rating, under 70 characters.
- bidsDue: the real bid deadline only when the notice text names one that differs from the closing date given; else null.
- preBid: the pre-bid conference only when the notice text names one and the preBid given is null; else null.
Use plain words. No em dashes.`;

export const RatingSchema = z.object({
  ref: z.string(),
  fit: z.boolean(),
  notFitReason: z.string().nullable(),
  win: z.enum(["good", "fair", "low"]),
  kind: z.enum(["product", "software", "hardware"]),
  what: z.string(),
  buyer: z.string(),
  place: z.string(),
  join: z.string(),
  why: z.string(),
  bidsDue: z.object({ date: z.string().describe("YYYY-MM-DD"), time: z.string() }).nullable(),
  preBid: z.object({ date: z.string().describe("YYYY-MM-DD"), time: z.string(), place: z.string() }).nullable(),
});

export type BidRating = z.infer<typeof RatingSchema>;

export type RateInput = {
  ref: string;
  title: string;
  buyer: string;
  area: string | null;
  abc: number | null;
  mode: string | null;
  category: string | null;
  closingAt: string | null;
  preBid: string | null;
  description: string | null;
};
