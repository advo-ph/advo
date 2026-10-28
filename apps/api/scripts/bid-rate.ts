/**
 * Rate bids from the terminal, so the daily check never spends AI credits.
 *
 *   npm --workspace apps/api run bids:rate -- pending <file.json>
 *     Writes the rating guide and every open bid still waiting for a rating.
 *   npm --workspace apps/api run bids:rate -- apply <file.json>
 *     Saves ratings: { "ratings": [ { ref, fit, notFitReason, win, kind, what, buyer,
 *     place, join, why, bidsDue, preBid } ] }, in the shape bid-rate.service.ts checks.
 *
 * Both run against apps/api/.env's database. On the VPS, run them in /opt/advo.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import * as z from "zod/v4";
import { loadEnv } from "../src/utils/env.js";
import { closeDb, initDb } from "../src/db/connection.js";
import { RATING_GUIDE, RatingSchema } from "../src/services/bid-rate.service.js";
import { applyRatings, pendingRatings } from "../src/services/bid-sync.service.js";

const [command, file] = process.argv.slice(2);
if (!["pending", "apply"].includes(command) || !file) {
  console.error("Use: bids:rate -- pending <file.json> | apply <file.json>");
  process.exit(1);
}

loadEnv();
initDb();
if (command === "pending") {
  const bids = await pendingRatings();
  writeFileSync(file, JSON.stringify({ guide: RATING_GUIDE, bids }, null, 2));
  console.log({ pending: bids.length, file });
} else {
  const { ratings } = z.object({ ratings: z.array(RatingSchema) }).parse(JSON.parse(readFileSync(file, "utf8")));
  console.log(await applyRatings(ratings));
}
await closeDb();
