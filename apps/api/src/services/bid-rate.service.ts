/**
 * The model's first read of a bid: does it fit ADVO, what are the odds, how would we
 * join, and a plain title a member can scan.
 *
 * Only bids the keyword rules kept are sent (bid-fit.service.ts), a dozen per request,
 * once per version of the notice (`rated_hash`). A member's own rating is never sent
 * and never overwritten. With no ANTHROPIC_API_KEY, or when a batch fails, nothing is
 * invented: the bid keeps its PhilGEPS title and shows as not rated.
 *
 * The odds are a judgement written the way the team wrote the first 24 by hand —
 * "good" only when the bid asks for something ADVO already built. Public bidding is a
 * pass/fail papers check and then the lowest price; nothing here is a probability.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { ADVO_AI_MODEL } from "../utils/ai-model.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("bid-rate");

const BATCH_SIZE = 12;
/** The notice text sent per bid; the invitation's first paragraphs carry what matters. */
const DESCRIPTION_LIMIT = 3000;

const SYSTEM = `You rate Philippine government bids (PhilGEPS notices) for ADVO. Answer only in the JSON schema.

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

const RatingSchema = z.object({
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
const BatchSchema = z.object({ ratings: z.array(RatingSchema) });

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

export function canRate(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function rateBatch(client: Anthropic, batch: RateInput[]): Promise<BidRating[]> {
  const bids = batch.map((b) => ({ ...b, description: b.description?.slice(0, DESCRIPTION_LIMIT) ?? null }));
  try {
    const res = await client.messages.parse({
      model: ADVO_AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(BatchSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Rate these ${bids.length} bids. Return one rating per ref.\n\n${JSON.stringify(bids)}`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      log.warn({ stopReason: res.stop_reason, refs: batch.map((b) => b.ref) }, "Bid batch not rated");
      return [];
    }
    const asked = new Set(batch.map((b) => b.ref));
    return res.parsed_output.ratings.filter((r) => asked.has(r.ref));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) log.warn("Bid rating rate-limited; batch left unrated");
    else if (err instanceof Anthropic.APIError) log.error({ status: err.status, err: err.message }, "Bid rating failed");
    else log.error({ err }, "Bid rating failed");
    return [];
  }
}

/** Rate bids in batches, two requests at a time. Missing refs were not rated. */
export async function rateBids(inputs: RateInput[]): Promise<Map<string, BidRating>> {
  const out = new Map<string, BidRating>();
  if (!canRate() || !inputs.length) return out;
  const client = new Anthropic();
  const batches: RateInput[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) batches.push(inputs.slice(i, i + BATCH_SIZE));
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        for (const rating of await rateBatch(client, batch)) out.set(rating.ref, rating);
      }
    }),
  );
  return out;
}
