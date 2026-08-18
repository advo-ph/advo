#!/usr/bin/env node
/**
 * Lane `resilience` — source-reading, idempotent scoring.
 * No clock, no random, no network. Same shape as roadmap-remain/scoring.mjs.
 *
 * Root cause behind these checks (measured 2026-08-17, see docs/HANDOFF.md):
 * the ADVO folder poll ticks every 60s, but undici's keep-alive idle timeout
 * is ~4s — so every tick opened a brand-new TLS connection and abandoned the
 * previous one into TIME_WAIT (+1 per tick, monotonic, never plateauing).
 * On a box near its ephemeral-port ceiling that surfaces as WSAENOBUFS on the
 * NEXT outbound connect — which is what rsync/SSH and Ask Plaud actually hit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};
const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const plaud = read("apps/api/src/services/plaud.service.ts");
const poll = read("apps/api/src/services/plaud-poll.service.ts");
const ask = read("apps/api/src/services/plaud-ask.service.ts");
const health = read("apps/api/src/routes/health.routes.ts");
const meetingTask = read("apps/api/src/services/meeting-task.service.ts");
const resilienceTest = read("apps/web/src/test/plaud-resilience.test.ts");
const service = plaud + poll + ask + read("apps/api/src/services/plaud-import.service.ts");

const check = [
  {
    id: "no-unbounded-plaud-listing",
    passed:
      !/limit=9{4,}/.test(service) &&
      !/limit=\$\{\s*(?:99999|Number\.MAX)/.test(service) &&
      /limit=\$\{[A-Za-z_$][\w$]*\}/.test(plaud),
    expected:
      "No limit=99999 (or equivalent unbounded page size) left in apps/api/src/services/; the listing page size is a bounded named value.",
  },
  {
    id: "plaud-listing-paged",
    passed:
      /PAGE_(?:SIZE|LIMIT)|pageSize|LISTING_LIMIT/.test(plaud) &&
      /skip=\$\{/.test(plaud) &&
      /(seenFileId|isSeen|stopAt|knownFileId)/.test(plaud + poll),
    expected:
      "Listing walks bounded pages (skip advances) and stops early at the first already-seen file id instead of pulling the whole account.",
  },
  {
    id: "plaud-keep-alive-dispatcher",
    passed:
      /keepAliveTimeout/.test(plaud) &&
      /dispatcher/.test(plaud) &&
      /export async function plaudFetch/.test(plaud) &&
      // every outbound Plaud call goes through the shared pool, never bare fetch
      /plaudFetch\(/.test(ask) &&
      !/(?<![\w.])fetch\(`?\$\{?host/.test(ask) &&
      !/await fetch\(/.test(plaud),
    expected:
      "Plaud outbound requests share one keep-alive dispatcher whose idle timeout outlives the poll interval, so a tick reuses its connection instead of leaking one into TIME_WAIT.",
  },
  {
    id: "poll-skips-without-token",
    passed:
      /isPlaudReachable|isTokenUsable|isPollSuppressed|circuitOpen/.test(poll + plaud) &&
      /(?:return|skip)/.test(poll) &&
      /markTokenDead|tokenDead|sessionDead/.test(plaud + poll),
    expected:
      "The poller issues NO outbound request when no Plaud token is configured, and latches off after the token is rejected as dead and cannot be reminted (rather than failing a request every 60s forever).",
  },
  {
    id: "poll-backoff-on-failure",
    passed:
      /consecutiveFailure|failureStreak|backoff/i.test(poll) &&
      /(?:Math\.min|MAX_BACKOFF|maxBackoff)/.test(poll),
    expected:
      "A failed tick widens the interval (bounded backoff) instead of retrying at the same cadence.",
  },
  {
    id: "ask-retry-on-reset",
    passed:
      /ECONNRESET|isRetryable|isResetError/.test(ask) &&
      /(?:MAX_ATTEMPT|maxAttempt|ATTEMPT_LIMIT)/.test(ask) &&
      /(?:backoff|delayMs|sleep)/i.test(ask) &&
      // must NOT retry a 4xx
      /status\s*>=\s*400\s*&&\s*[a-z.]*status\s*<\s*500|is4xx|clientError/i.test(ask),
    expected:
      "Ask Plaud retries a connection reset with bounded backoff, never retries a 4xx, and still reports its true method.",
  },
  {
    id: "ask-method-honest",
    passed:
      /method:\s*"ask"/.test(meetingTask) &&
      /method:\s*"note"/.test(meetingTask) &&
      // the ask path must still be able to return null so the caller falls back honestly
      /return null/.test(meetingTask),
    expected:
      'Every path reports which one actually ran — a fallback never reports method "ask".',
  },
  {
    id: "health-operational",
    passed:
      /plaud|poll/i.test(health) &&
      /(?:recentError|errorCount|lastError)/.test(health) &&
      /Boolean\(|!!\s*process\.env|isConfigured/.test(health) &&
      // never leak a secret VALUE
      !/process\.env\.(?:PLAUD_TOKEN|ANTHROPIC_API_KEY|JWT_SECRET|DATABASE_URL)\s*[,}\n]/.test(health) &&
      !/token:\s*process\.env/.test(health),
    expected:
      "/api/health exposes poller state + captured-error summary and reports secret presence as booleans only — never a secret value (the endpoint is public).",
  },
  {
    id: "error-capture-ring",
    passed:
      (has("apps/api/src/utils/error-capture.ts") || /ringBuffer|recordError|captureError/.test(health)) &&
      /recordError|captureError/.test(read("apps/api/src/index.ts") + health),
    expected:
      "An in-process bounded error ring buffer captures recent failures and is wired into the app error handler (no new dependency).",
  },
  {
    id: "resilience-test",
    passed:
      has("apps/web/src/test/plaud-resilience.test.ts") &&
      /vi\.(?:mock|stubGlobal|fn)/.test(resilienceTest) &&
      /ECONNRESET/.test(resilienceTest) &&
      !/api-apse1\.plaud\.ai\/(?!.*mock)/.test(resilienceTest.replace(/^.*DEFAULT_HOST.*$/gm, "")),
    expected:
      "plaud-resilience.test.ts stubs the network (no live Plaud call) and covers the reset-retry path.",
  },
];

let failed = 0;
for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  if (!row.passed) failed += 1;
  console.log(`[${mark}] ${row.id}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}
console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - failed}/${check.length} resilience check(s) green`,
);
process.exit(failed === 0 ? 0 : 1);
