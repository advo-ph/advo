/**
 * Generic change-log middleware. Writes one activity_log row (source: 'api') after every
 * successful (2xx) POST/PUT/PATCH/DELETE under /api/*, skipping routes that already
 * self-log or that are not a meaningful "change" (see activity-log.denylist.ts).
 *
 * Mounted in index.ts as `app.use("/api/*", activityLogMiddleware)`, after the existing
 * global CORS/rate-limit middleware and before the route mounts.
 */
import { createMiddleware } from "hono/factory";
import { logActivity } from "../services/activity.service.js";
import { SELF_LOGGING_ROUTES, DENY_LISTED_PREFIXES } from "./activity-log.denylist.js";
import { createLogger } from "../utils/logger.js";
import type { Variables } from "../types/context.js";

const log = createLogger("activity-log-middleware");

/** "project" from "/api/projects/42/preview-request". Crude plural strip — fine for logging. */
function entityTypeFromPath(path: string): string {
  const seg = path.split("/")[2] ?? "unknown";
  return seg.replace(/s$/, "");
}

const VERB_BY_METHOD: Record<string, string> = {
  POST: "created",
  PUT: "updated",
  PATCH: "updated",
  DELETE: "deleted",
};

export const activityLogMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  await next();
  const method = c.req.method;
  const verb = VERB_BY_METHOD[method];
  if (!verb) return; // GET/OPTIONS never log
  if (c.res.status < 200 || c.res.status >= 300) return;

  const path = new URL(c.req.url).pathname;
  if (DENY_LISTED_PREFIXES.some((p) => path.startsWith(p))) return;
  if (SELF_LOGGING_ROUTES.some((r) => r.method === method && r.pattern.test(path))) return;

  const user = c.get("user");
  const idMatch = path.match(/\/(\d+)(?:\/|$)/);
  try {
    await logActivity({
      userId: user?.userId ?? null,
      action: `${entityTypeFromPath(path)}_${verb}`,
      entityType: entityTypeFromPath(path),
      entityId: idMatch ? Number(idMatch[1]) : null,
      source: "api",
    });
  } catch (err) {
    // A logging failure must never surface as a failure of the business mutation that
    // already succeeded and already responded. Log and move on.
    log.warn({ err, path, method }, "Generic activity logging failed");
  }
});
