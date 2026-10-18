/**
 * Generic activity_log writer (MCP phase 2, MCP-owned per the shared contract).
 *
 * Both the generic change-log middleware (middleware/activity-log.middleware.ts) and every
 * MCP write-tool handler (services/mcp-tools.service.ts) call this instead of inserting into
 * activityLog directly. Existing self-logging call sites (change-order, commission,
 * project-signoff, projects.routes.ts) are NOT rewritten to use this helper — they are
 * deny-listed instead (middleware/activity-log.denylist.ts) so they never double-log.
 *
 * Every successful insert also queues a webhook_delivery row for every active
 * member_webhook, via queueDeliveriesForActivity — done here, not at each call site, so it
 * can never be forgotten.
 */
import { db } from "../db/connection.js";
import { activityLog } from "../db/schema.js";
import type { BotKeyContext } from "../types/bot-context.js";
import { queueDeliveriesForActivity } from "./webhook-delivery.service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("activity");

type Source = "api" | "bot" | "plaud" | "chat";

export async function logActivity(input: {
  userId: number | null;
  action: string; // "<entity>_<verb>", verb in created|updated|deleted
  entityType: string;
  entityId: number | null;
  source: Source;
  metadata?: Record<string, unknown>;
  bot?: BotKeyContext;
}): Promise<number> {
  const [row] = await db()
    .insert(activityLog)
    .values({
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: {
        ...(input.metadata ?? {}),
        source: input.source,
        ...(input.bot
          ? { viaBot: true, teamMemberId: input.bot.teamMemberId, botKeyId: input.bot.botKeyId }
          : {}),
      },
    })
    .returning({ activityId: activityLog.activityId });

  // Push-webhook fan-out must never turn a successful activity_log write into a failed
  // response — queueing is its own try/catch, logged and swallowed.
  queueDeliveriesForActivity(row.activityId).catch((err) => {
    log.warn({ err, activityId: row.activityId }, "Could not queue webhook deliveries");
  });

  return row.activityId;
}
