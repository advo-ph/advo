import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { notification, client } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { sendNotificationEmail } from "../services/email.service.js";
import type { Variables } from "../types/context.js";

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

  if (data.sendEmail) {
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

    for (const cl of allClients) {
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

      if (data.sendEmail && cl.contactEmail) {
        await sendNotificationEmail(cl.contactEmail, data.title, data.body || "");
      }
    }

    return c.json({
      data: { message: `Sent to ${created.length} clients`, notifications: created },
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
