/**
 * Member webhooks (push alerts on every activity_log row). Mounted at /api/webhooks. Uses the
 * human JWT (Variables). The list is owner-only; create/update/test/rotate are open to the
 * owner for anyone and to a member for their own webhook (requireSelfOrOwner).
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { memberWebhook, teamMember } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { requireOwnerCaller, requireSelfOrOwner } from "./team.routes.js";
import { encryptSecret, generateWebhookSecret } from "../utils/crypto.js";
import { sendTestDelivery } from "../services/webhook-delivery.service.js";
import { looseUrl, zodMessageHook } from "../utils/validators.js";
import type { Variables } from "../types/context.js";

const webhookRoutes = new Hono<{ Variables: Variables }>();

/** True when an encrypted auth-header value is stored. The ciphertext itself is never selected. */
const authHeaderSet = sql<boolean>`${memberWebhook.authHeaderValueEncrypted} IS NOT NULL`.mapWith(Boolean);

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const RESERVED_HEADER = new Set(["content-type", "content-length", "host", "connection", "transfer-encoding", "x-advo-signature", "x-advo-event"]);

const authHeaderValueField = z
  .string()
  .max(4096)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "Header value cannot contain control characters")
  .nullish();

const authHeaderNameField = z
  .string()
  .trim()
  .max(100)
  .refine((value) => value === "" || HEADER_NAME.test(value), "Invalid header name")
  .refine((value) => value === "" || !RESERVED_HEADER.has(value.toLowerCase()), "That header name is reserved")
  .optional();

/** Columns to write when the caller sent an auth header. Undefined value means "leave it". */
function authHeaderWrite(
  authHeader: string | null | undefined,
  authHeaderName: string | undefined,
): { authHeaderName?: string; authHeaderValueEncrypted?: string | null } | null {
  if (authHeader === undefined) {
    const name = authHeaderName?.trim();
    return name ? { authHeaderName: name } : null;
  }
  const trimmed = authHeader?.trim() ?? "";
  if (!trimmed) return { authHeaderValueEncrypted: null, authHeaderName: "Authorization" };
  const columns: { authHeaderName?: string; authHeaderValueEncrypted: string } = {
    authHeaderValueEncrypted: encryptSecret(trimmed),
  };
  const name = authHeaderName?.trim();
  if (name) columns.authHeaderName = name;
  return columns;
}

webhookRoutes.use("*", requireAuth, requireAdmin);

/** The owner manages any webhook; a member only their own (Settings → Developer). */
async function requireWebhookAccess(caller: Variables["user"], memberWebhookId: number) {
  const [row] = await db()
    .select({ teamMemberId: memberWebhook.teamMemberId })
    .from(memberWebhook)
    .where(eq(memberWebhook.memberWebhookId, memberWebhookId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Webhook not found" });
  await requireSelfOrOwner(caller, row.teamMemberId);
}

// ─── List ─────────────────────────────────────────────
// Never includes secretEncrypted or the auth-header ciphertext — only whether one is set.

webhookRoutes.get("/", async (c) => {
  await requireOwnerCaller(c.get("user"));
  const rows = await db()
    .select({
      memberWebhookId: memberWebhook.memberWebhookId,
      teamMemberId: memberWebhook.teamMemberId,
      teamMemberName: teamMember.name,
      url: memberWebhook.url,
      isActive: memberWebhook.isActive,
      consecutiveFailures: memberWebhook.consecutiveFailures,
      lastDeliveryAt: memberWebhook.lastDeliveryAt,
      lastStatus: memberWebhook.lastStatus,
      createdAt: memberWebhook.createdAt,
      authHeaderSet,
    })
    .from(memberWebhook)
    .innerJoin(teamMember, eq(memberWebhook.teamMemberId, teamMember.teamMemberId))
    .orderBy(memberWebhook.teamMemberId);
  c.header("Cache-Control", "no-store");
  return c.json({ data: rows, error: null });
});

// ─── Create ───────────────────────────────────────────
// Generates + encrypts a random secret, returns { memberWebhookId, secret } once.

const createSchema = z.object({
  teamMemberId: z.number().int(),
  url: looseUrl(2000),
  authHeader: authHeaderValueField,
  authHeaderName: authHeaderNameField,
});

webhookRoutes.post("/", zValidator("json", createSchema, zodMessageHook), async (c) => {
  const { teamMemberId, url, authHeader, authHeaderName } = c.req.valid("json");
  await requireSelfOrOwner(c.get("user"), teamMemberId);
  if (!url) throw new HTTPException(400, { message: "A webhook URL is required" });

  const secret = generateWebhookSecret();
  const [created] = await db()
    .insert(memberWebhook)
    .values({
      teamMemberId,
      url,
      secretEncrypted: encryptSecret(secret),
      ...(authHeaderWrite(authHeader, authHeaderName) ?? {}),
    })
    .returning({ memberWebhookId: memberWebhook.memberWebhookId });

  return c.json({ data: { memberWebhookId: created.memberWebhookId, secret }, error: null }, 201);
});

// ─── Update ───────────────────────────────────────────

const updateSchema = z.object({
  url: looseUrl(2000).optional(),
  isActive: z.boolean().optional(),
  /** Omitted = keep the stored header. Blank or null = clear it. */
  authHeader: authHeaderValueField,
  authHeaderName: authHeaderNameField,
});

webhookRoutes.patch("/:id", zValidator("json", updateSchema, zodMessageHook), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid webhook id" });
  await requireWebhookAccess(c.get("user"), id);

  const data = c.req.valid("json");
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.url !== undefined && data.url !== null) values.url = data.url;
  if (data.isActive !== undefined) values.isActive = data.isActive;
  const headerColumns = authHeaderWrite(data.authHeader, data.authHeaderName);
  if (headerColumns) Object.assign(values, headerColumns);

  const [updated] = await db()
    .update(memberWebhook)
    .set(values)
    .where(eq(memberWebhook.memberWebhookId, id))
    .returning({
      memberWebhookId: memberWebhook.memberWebhookId,
      isActive: memberWebhook.isActive,
      url: memberWebhook.url,
      authHeaderSet,
    });

  if (!updated) throw new HTTPException(404, { message: "Webhook not found" });
  return c.json({ data: updated, error: null });
});

// ─── Test ─────────────────────────────────────────────
// One synthetic delivery, sent synchronously for an immediate pass/fail.

webhookRoutes.post("/:id/test", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid webhook id" });
  await requireWebhookAccess(c.get("user"), id);

  const result = await sendTestDelivery(id);
  if (!result.ok) {
    return c.json({ data: { ok: false, error: result.error }, error: null });
  }
  return c.json({ data: { ok: true }, error: null });
});

// ─── Rotate secret ────────────────────────────────────

webhookRoutes.post("/:id/rotate-secret", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid webhook id" });
  await requireWebhookAccess(c.get("user"), id);

  const secret = generateWebhookSecret();
  const [updated] = await db()
    .update(memberWebhook)
    .set({ secretEncrypted: encryptSecret(secret), updatedAt: new Date() })
    .where(eq(memberWebhook.memberWebhookId, id))
    .returning({ memberWebhookId: memberWebhook.memberWebhookId });

  if (!updated) throw new HTTPException(404, { message: "Webhook not found" });
  return c.json({ data: { memberWebhookId: updated.memberWebhookId, secret }, error: null });
});

export default webhookRoutes;
