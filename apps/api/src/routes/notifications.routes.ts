import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { notification, client, siteContent } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { sendNotificationEmail } from "../services/email.service.js";
import { createLogger } from "../utils/logger.js";
import { describeDbError } from "../utils/db-error.js";
import type { Variables } from "../types/context.js";

const log = createLogger("notifications");

/** Read auto-rule toggles from site_content.client_dashboard before send. */
async function isAutoRuleEnabled(type: string): Promise<boolean> {
  const key =
    type === "progress_update"
      ? "notify_on_progress_update"
      : type === "invoice_issued"
        ? "notify_on_invoice"
        : type === "deliverable_completed"
          ? "notify_on_deliverable_complete"
          : null;
  if (!key) return true;

  const [row] = await db()
    .select()
    .from(siteContent)
    .where(eq(siteContent.sectionId, "client_dashboard"))
    .limit(1);
  const content = (row?.content ?? {}) as Record<string, unknown>;
  return content[key] !== false;
}

const notifications = new Hono<{ Variables: Variables }>();

notifications.use("*", requireAuth);

// ─── List ─────────────────────────────────────────────

notifications.get("/", async (c) => {
  const user = c.get("user");
  const d = db();

  if (user.role === "admin") {
    const rows = await d
      .select()
      .from(notification)
      .leftJoin(client, eq(notification.clientId, client.clientId))
      .orderBy(desc(notification.sentAt))
      .limit(100);

    return c.json({
      data: rows.map((r) => ({ ...r.notification, client: r.client })),
      error: null,
    });
  }

  // Client: own notifications only
  const [clientRow] = await d
    .select()
    .from(client)
    .where(eq(client.userId, user.userId))
    .limit(1);

  if (!clientRow) return c.json({ data: [], error: null });

  const rows = await d
    .select()
    .from(notification)
    .where(eq(notification.clientId, clientRow.clientId))
    .orderBy(desc(notification.sentAt));

  return c.json({ data: rows, error: null });
});

// ─── Send Notification ────────────────────────────────

const sendSchema = z.object({
  clientId: z.number(),
  projectId: z.number().nullable().optional(),
  type: z
    .enum([
      "progress_update",
      "invoice_issued",
      "deliverable_completed",
      "project_status_change",
      "custom",
    ])
    .optional(),
  title: z.string().min(1).max(255),
  body: z.string().max(5000).optional(),
  sendEmail: z.boolean().default(true),
});

notifications.post("/", requireAdmin, zValidator("json", sendSchema), async (c) => {
  const data = c.req.valid("json");
  const d = db();

  const [created] = await d
    .insert(notification)
    .values({
      clientId: data.clientId,
      projectId: data.projectId || null,
      type: data.type || "custom",
      title: data.title,
      body: data.body || null,
    })
    .returning();

  const type = data.type || "custom";
  if (data.sendEmail && (await isAutoRuleEnabled(type))) {
    const [cl] = await d
      .select()
      .from(client)
      .where(eq(client.clientId, data.clientId))
      .limit(1);

    if (cl?.contactEmail) {
      await sendNotificationEmail(cl.contactEmail, data.title, data.body || "");
    }
  }

  return c.json({ data: created, error: null }, 201);
});

// ─── Broadcast ────────────────────────────────────────

const broadcastSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().max(5000).optional(),
  sendEmail: z.boolean().default(true),
});

notifications.post(
  "/broadcast",
  requireAdmin,
  zValidator("json", broadcastSchema),
  async (c) => {
    const data = c.req.valid("json");
    const d = db();

    const allClients = await d.select().from(client);
    const created = [];

    /**
     * A broadcast is a loop of independent writes, so one bad row must not take
     * down the other 40. But "must not throw" was previously implemented as
     * "must not be recorded either": every insert failure was swallowed whole,
     * so a broadcast that persisted 3 of 40 still answered 200 with no hint that
     * 37 people will never see it.
     *
     * Failures are now counted, logged with their constraint, and reported back
     * in the response. A broadcast where nothing landed is an error, not a
     * success with a zero in it.
     */
    const failedClientId: number[] = [];
    const emailFailedClientId: number[] = [];

    for (const cl of allClients) {
      try {
        const [n] = await d
          .insert(notification)
          .values({
            clientId: cl.clientId,
            type: "custom",
            title: data.title,
            body: data.body || null,
          })
          .returning();

        created.push(n);
      } catch (err) {
        // A client may have been deleted between the select-all above and this
        // insert (FK violation). Skip it rather than 500 the whole broadcast,
        // but never skip it silently.
        failedClientId.push(cl.clientId);
        log.error(
          { clientId: cl.clientId, db: describeDbError(err), err },
          "Broadcast notification insert failed",
        );
        continue;
      }

      if (data.sendEmail && cl.contactEmail) {
        try {
          await sendNotificationEmail(cl.contactEmail, data.title, data.body || "");
        } catch (err) {
          // The notification row is committed, so the client will still see it
          // in the hub. Only the email leg failed.
          emailFailedClientId.push(cl.clientId);
          log.error({ clientId: cl.clientId, err }, "Broadcast notification email failed");
        }
      }
    }

    // Nothing persisted. That is a failed broadcast, not a successful empty one.
    if (allClients.length > 0 && created.length === 0) {
      throw new HTTPException(500, {
        message: "The broadcast could not be saved for any client. Nothing was sent.",
      });
    }

    const message =
      failedClientId.length > 0
        ? `Sent to ${created.length} of ${allClients.length} clients. ${failedClientId.length} could not be saved.`
        : `Sent to ${created.length} clients`;

    return c.json({
      data: {
        message,
        notifications: created,
        attemptedCount: allClients.length,
        deliveredCount: created.length,
        failedCount: failedClientId.length,
        emailFailedCount: emailFailedClientId.length,
      },
      error: null,
    });
  }
);

// ─── Mark as Read ─────────────────────────────────────

notifications.patch("/:id/read", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const d = db();

  // Admins can mark any notification read; everyone else only their own.
  let where = eq(notification.notificationId, id);
  if (user.role !== "admin") {
    const [clientRow] = await d
      .select({ clientId: client.clientId })
      .from(client)
      .where(eq(client.userId, user.userId))
      .limit(1);
    if (!clientRow) throw new HTTPException(404, { message: "Notification not found" });
    where = and(
      eq(notification.notificationId, id),
      eq(notification.clientId, clientRow.clientId),
    )!;
  }

  const [updated] = await d
    .update(notification)
    .set({ isRead: true })
    .where(where)
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Notification not found" });
  return c.json({ data: updated, error: null });
});

export default notifications;
