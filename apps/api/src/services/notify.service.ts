/**
 * The one place a client notification is created.
 *
 * Before this file, `POST /api/notifications` inserted a row and sent an email, and every
 * service that wanted to tell a client something (sign-off issued, invoice due, status
 * change) inserted its own row and sent NO email — not by decision, by omission, because
 * the email half lived inline in a route handler nobody else could call. A client whose
 * sign-off was ready found out when they next opened the Hub.
 *
 * Everything that notifies a client goes through `notifyClient` now, so the row and the
 * email cannot drift apart again. Two disciplines, both inherited from the route:
 *
 *   * The auto-rule toggles in site_content.client_dashboard gate the EMAIL, never the
 *     row. An admin who turns off "email on deliverable complete" still wants the Hub
 *     to show it.
 *   * Email failure is logged, not thrown. email.service.ts `send()` already never
 *     throws (see its header for the 2026-08-29 outage that shaped that), and this
 *     layer keeps the promise even if that changes: a deliverable PATCH must not 500
 *     because a mail key expired.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { client, notification, project, siteContent } from "../db/schema.js";
import { sendNotificationEmail } from "./email.service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("notify");

export type NotificationType = (typeof notification.$inferInsert)["type"];

export type NotifyClientInput = {
  clientId: number;
  projectId?: number | null;
  type?: NotificationType;
  title: string;
  body?: string | null;
  /** Default true. False records the row and sends nothing. */
  isEmail?: boolean;
};

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

/**
 * Insert the notification row, then email the client's contact address if the auto-rule
 * allows it. The insert throws (a caller that IS the notification wants to know); the
 * email never does.
 */
export async function notifyClient(input: NotifyClientInput) {
  const type: NotificationType = input.type ?? "custom";
  const d = db();

  const [created] = await d
    .insert(notification)
    .values({
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      type,
      title: input.title,
      body: input.body || null,
    })
    .returning();

  if (input.isEmail !== false && (await isAutoRuleEnabled(type))) {
    const [cl] = await d
      .select({ contactEmail: client.contactEmail })
      .from(client)
      .where(eq(client.clientId, input.clientId))
      .limit(1);

    if (cl?.contactEmail) {
      try {
        await sendNotificationEmail(cl.contactEmail, input.title, input.body || "");
      } catch (err) {
        log.error({ err, notificationId: created.notificationId }, "Notification email failed");
      }
    }
  }

  return created;
}

/**
 * The event form: resolve the client from the project and notify them. Best-effort by
 * design — a deliverable PATCH or a change-order POST has already done its real work,
 * and a notification hiccup must not undo it. A project with no client is skipped
 * silently; nothing is thrown, ever. Returns the row, or null when nothing was sent.
 */
export async function notifyProjectClient(
  projectId: number,
  input: Omit<NotifyClientInput, "clientId" | "projectId">,
) {
  try {
    const [owner] = await db()
      .select({ clientId: project.clientId })
      .from(project)
      .where(eq(project.projectId, projectId))
      .limit(1);
    if (!owner?.clientId) return null;

    return await notifyClient({ ...input, clientId: owner.clientId, projectId });
  } catch (err) {
    log.error({ err, projectId, title: input.title }, "Client notification failed");
    return null;
  }
}
