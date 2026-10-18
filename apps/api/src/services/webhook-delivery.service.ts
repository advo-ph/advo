/**
 * Webhook delivery queue + poller (MCP phase 2).
 *
 * queueDeliveriesForActivity is called from inside activity.service.ts's logActivity()
 * itself (so it can never be forgotten) — for every active member_webhook, inserts one
 * webhook_delivery row.
 *
 * startWebhookPoll/stopWebhookPoll use the same self-rescheduling setTimeout shape as
 * plaud-poll.service.ts. Every 5s, pick up to 20 rows where
 * status IN ('queued','failed') AND next_attempt_at <= now(); for each, decrypt the
 * webhook's secret, sign the JSON body, POST with X-ADVO-Signature + X-ADVO-Event, 5s
 * timeout.
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "../db/connection.js";
import { activityLog, memberWebhook, webhookDelivery } from "../db/schema.js";
import { decryptSecret, signPayload } from "../utils/crypto.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("webhook-delivery");

const POLL_INTERVAL_MILLISECOND = 5_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPT = 6;
const REQUEST_TIMEOUT_MILLISECOND = 5_000;

/** 30s, 2m, 10m, 30m, 2h, capped — index 0 is the delay before the SECOND attempt. */
const BACKOFF_MILLISECOND = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

function backoffFor(attemptCount: number): number {
  const index = Math.min(attemptCount - 1, BACKOFF_MILLISECOND.length - 1);
  return BACKOFF_MILLISECOND[Math.max(index, 0)];
}

export type WebhookEventPayload = {
  event: string;
  entityType: string;
  entityId: number | null;
  source: string;
  actorUserId: number | null;
  occurredAt: string;
  activityId: number | null;
};

/** For every active member_webhook, insert one queued webhook_delivery row for this activity. */
export async function queueDeliveriesForActivity(activityId: number): Promise<void> {
  const d = db();
  const [activity] = await d
    .select()
    .from(activityLog)
    .where(eq(activityLog.activityId, activityId))
    .limit(1);
  if (!activity) return;

  const webhooks = await d
    .select({ memberWebhookId: memberWebhook.memberWebhookId })
    .from(memberWebhook)
    .where(eq(memberWebhook.isActive, true));
  if (webhooks.length === 0) return;

  const metadata = (activity.metadata ?? {}) as Record<string, unknown>;
  const payload: WebhookEventPayload = {
    event: activity.action,
    entityType: activity.entityType,
    entityId: activity.entityId,
    source: typeof metadata.source === "string" ? metadata.source : "api",
    actorUserId: activity.userId,
    occurredAt: activity.createdAt.toISOString(),
    activityId: activity.activityId,
  };

  await d.insert(webhookDelivery).values(
    webhooks.map((w) => ({
      memberWebhookId: w.memberWebhookId,
      activityId,
      payload,
      status: "queued" as const,
    })),
  );
}

/** One synthetic delivery (no activityId), sent synchronously for an immediate pass/fail. */
export async function sendTestDelivery(memberWebhookId: number): Promise<{ ok: boolean; error?: string }> {
  const d = db();
  const [webhook] = await d
    .select()
    .from(memberWebhook)
    .where(eq(memberWebhook.memberWebhookId, memberWebhookId))
    .limit(1);
  if (!webhook) return { ok: false, error: "Webhook not found" };

  const payload: WebhookEventPayload = {
    event: "webhook_test",
    entityType: "webhook",
    entityId: webhook.memberWebhookId,
    source: "api",
    actorUserId: null,
    occurredAt: new Date().toISOString(),
    activityId: null,
  };

  const result = await deliverOnce(webhook.url, webhook.secretEncrypted, payload);
  await d
    .update(memberWebhook)
    .set({
      lastDeliveryAt: new Date(),
      lastStatus: result.ok ? "ok" : "failing",
      consecutiveFailures: result.ok ? 0 : webhook.consecutiveFailures + 1,
      updatedAt: new Date(),
    })
    .where(eq(memberWebhook.memberWebhookId, memberWebhookId));

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function deliverOnce(
  url: string,
  secretEncrypted: string,
  payload: WebhookEventPayload,
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify(payload);
  let secret: string;
  try {
    secret = decryptSecret(secretEncrypted);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not decrypt secret" };
  }
  const signature = signPayload(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECOND);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ADVO-Signature": `sha256=${signature}`,
        "X-ADVO-Event": payload.event,
      },
      body,
      signal: controller.signal,
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function processOne(row: typeof webhookDelivery.$inferSelect): Promise<void> {
  const d = db();
  const [webhook] = await d
    .select()
    .from(memberWebhook)
    .where(eq(memberWebhook.memberWebhookId, row.memberWebhookId))
    .limit(1);

  // The webhook was deleted/deactivated between queueing and delivery — nothing to send to.
  if (!webhook || !webhook.isActive) {
    await d
      .update(webhookDelivery)
      .set({ status: "abandoned", lastError: "Webhook no longer active" })
      .where(eq(webhookDelivery.webhookDeliveryId, row.webhookDeliveryId));
    return;
  }

  const result = await deliverOnce(webhook.url, webhook.secretEncrypted, row.payload as WebhookEventPayload);
  const nextAttemptCount = row.attemptCount + 1;

  if (result.ok) {
    await d
      .update(webhookDelivery)
      .set({ status: "delivered", attemptCount: nextAttemptCount, deliveredAt: new Date(), lastError: null })
      .where(eq(webhookDelivery.webhookDeliveryId, row.webhookDeliveryId));
    await d
      .update(memberWebhook)
      .set({ lastDeliveryAt: new Date(), lastStatus: "ok", consecutiveFailures: 0, updatedAt: new Date() })
      .where(eq(memberWebhook.memberWebhookId, webhook.memberWebhookId));
    return;
  }

  const abandoned = nextAttemptCount >= MAX_ATTEMPT;
  await d
    .update(webhookDelivery)
    .set({
      status: abandoned ? "abandoned" : "failed",
      attemptCount: nextAttemptCount,
      nextAttemptAt: new Date(Date.now() + backoffFor(nextAttemptCount)),
      lastError: result.error ?? "Delivery failed",
    })
    .where(eq(webhookDelivery.webhookDeliveryId, row.webhookDeliveryId));

  const consecutiveFailures = webhook.consecutiveFailures + 1;
  await d
    .update(memberWebhook)
    .set({
      consecutiveFailures,
      lastStatus: consecutiveFailures >= 3 ? "failing" : webhook.lastStatus,
      updatedAt: new Date(),
    })
    .where(eq(memberWebhook.memberWebhookId, webhook.memberWebhookId));
}

async function pollOnce(): Promise<void> {
  const d = db();
  const rows = await d
    .select()
    .from(webhookDelivery)
    .where(and(inArray(webhookDelivery.status, ["queued", "failed"]), lte(webhookDelivery.nextAttemptAt, new Date())))
    .orderBy(asc(webhookDelivery.nextAttemptAt))
    .limit(BATCH_SIZE);

  for (const row of rows) {
    // Per-row try/catch — one bad webhook must never stop the poller from processing the
    // rest of the batch.
    try {
      await processOne(row);
    } catch (err) {
      log.error({ err, webhookDeliveryId: row.webhookDeliveryId }, "Webhook delivery row crashed the poller tick");
    }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let isStopped = true;

function schedule(): void {
  if (isStopped) return;
  timer = setTimeout(() => {
    void tick();
  }, POLL_INTERVAL_MILLISECOND);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
}

async function tick(): Promise<void> {
  if (isStopped) return;
  try {
    await pollOnce();
  } catch (err) {
    log.error({ err }, "Webhook poll tick failed");
  }
  schedule();
}

export function startWebhookPoll(): void {
  isStopped = false;
  schedule();
  log.info({ intervalMillisecond: POLL_INTERVAL_MILLISECOND }, "Webhook delivery poll started");
}

export function stopWebhookPoll(): void {
  isStopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
