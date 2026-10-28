/**
 * Run the daily PhilGEPS bid check once, now, against apps/api/.env's database.
 *
 *   npm --workspace apps/api run bids:sync
 *
 * The same run the 06:00 schedule and the page's "Check now" start
 * (src/services/bid-sync.service.ts). It emails members only when the feed grew.
 */
import "dotenv/config";
import { loadEnv } from "../src/utils/env.js";
import { closeDb, initDb } from "../src/db/connection.js";
import { runBidSync } from "../src/services/bid-sync.service.js";

loadEnv();
initDb();
const started = Date.now();
const summary = await runBidSync("script");
console.log({ ...summary, minutes: ((Date.now() - started) / 60_000).toFixed(1) });
await closeDb();
process.exit(summary.status === "failed" ? 1 : 0);
