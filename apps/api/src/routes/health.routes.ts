import { Hono } from "hono";
import { checkDb } from "../db/connection.js";
import { errorCount, recentError } from "../utils/error-capture.js";
import { plaudSyncStatus } from "../services/plaud-poll.service.js";
import { plaudAuthState } from "../services/plaud.service.js";
import { mailHealth } from "../services/email.service.js";

const health = new Hono();

/**
 * Operational health. Reachable UNAUTHENTICATED on https://api.advo.ph/api/health,
 * so treat every field here as public:
 *   - secrets are reported as presence booleans, never values
 *   - captured errors carry a redacted message and NO stack
 */
health.get("/", async (c) => {
  const isDbOk = await checkDb();
  const poll = plaudSyncStatus();
  const auth = plaudAuthState();
  const mail = mailHealth();

  // `status` stays the API's OWN liveness — it is what the uptime ping watches,
  // and a stuck background job must not page anyone at 3am. Background-work
  // health rides alongside it in `isDegraded` so an operator still sees it.
  const degradedReason: string[] = [];
  if (poll.isSuppressed && poll.suppressedReason) degradedReason.push(`plaud: ${poll.suppressedReason}`);
  else if (poll.consecutiveFailure > 0) degradedReason.push(`plaud: ${poll.consecutiveFailure} consecutive failed tick`);

  // Mail is not background work — a dropped magic link is a client who cannot log in.
  // An unconfigured transport is reported the moment it is true, without waiting for a
  // send to fail, because the 2026-08-29 outage proved nobody notices the silence.
  if (!mail.isTransportConfigured) {
    degradedReason.push("mail: no transport configured — every email is being dropped");
  } else if (mail.consecutiveFailure > 0) {
    degradedReason.push(
      `mail: ${mail.consecutiveFailure} consecutive failed send (${mail.lastError ?? "unknown"})`,
    );
  }

  return c.json({
    status: isDbOk ? "ok" : "degraded",
    db: isDbOk,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),

    isDegraded: degradedReason.length > 0,
    degradedReason,

    plaud: {
      isEnabled: poll.isEnabled,
      isSuppressed: poll.isSuppressed,
      suppressedReason: poll.suppressedReason,
      intervalSecond: poll.intervalSecond,
      lastSyncAt: poll.lastSyncAt,
      lastSuccessAt: poll.lastSuccessAt,
      lastError: poll.lastError,
      consecutiveFailure: poll.consecutiveFailure,
      importedCount: poll.importedCount,
      seenCount: poll.seenCount,
      // Presence only — never the token itself.
      isTokenConfigured: auth.isConfigured,
      isTokenUsable: auth.isUsable,
    },

    mail,

    error: {
      totalCount: errorCount(),
      recent: recentError(5),
    },

    config: {
      isPlaudTokenConfigured: Boolean(process.env.PLAUD_TOKEN || process.env.PLAUD_AUTH_FILE),
      isAnthropicKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      isEmailTransportConfigured: mail.isTransportConfigured,
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
  });
});

export default health;
