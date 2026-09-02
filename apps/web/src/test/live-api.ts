/**
 * The reachability probe the two live-API suites share.
 *
 * `api-wiring` and `e2e-flow` drive a real running API + Postgres. When the API
 * is not up they used to fail at file level with ECONNREFUSED — a red suite that
 * meant "you forgot to start the API", not "something broke". A red that means
 * two different things trains people to ignore it, so the failure that matters
 * gets ignored too.
 *
 * The probe runs ONCE at module load (top-level await; vitest runs ESM), with a
 * short timeout so a dead port costs a second rather than the default fetch
 * wait. Both suites gate on `isApiLive` and report SKIPPED instead of FAILED.
 *
 * The honest half: a skip is only acceptable when it is visible. The probe logs
 * one line naming the URL it could not reach, and `requireApiLive()` exists so
 * CI can flip the skip back into a hard failure — set VITE_REQUIRE_LIVE_API=1
 * and an unreachable API fails loudly, which is what a deploy gate wants.
 */

export const API = process.env.VITE_API_URL || "http://127.0.0.1:6407";

/** A dead port should cost a second, not the platform default. */
const PROBE_TIMEOUT_MS = 2000;

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const isApiLive = await probe();

/**
 * True when an unreachable API must fail rather than skip. A deploy gate sets
 * this; a laptop does not.
 */
export const isLiveApiRequired = process.env.VITE_REQUIRE_LIVE_API === "1";

if (!isApiLive) {
  const detail = `live API not reachable at ${API}`;
  if (isLiveApiRequired) {
    // Thrown at import time so the suite cannot quietly pass by skipping.
    throw new Error(`${detail} and VITE_REQUIRE_LIVE_API=1 — refusing to skip.`);
  }
  console.warn(
    `[live-api] ${detail} — integration suites SKIPPED. ` +
      `Start it with \`npm run dev:api\`, or set VITE_REQUIRE_LIVE_API=1 to make this fail instead.`,
  );
}

/** `describe.skipIf(skipWhenApiDown)` reads better at the call site than a bare negation. */
export const skipWhenApiDown = !isApiLive;
