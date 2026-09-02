/**
 * Message routes — inbound webhooks (public, signature-authenticated) and the rest
 * behind auth.
 *
 * Same shape as the payment router and for the same reason: Messenger, Viber and the SMS
 * gateway call us from their own infrastructure with no ADVO credential, so the webhook
 * cannot sit behind a bearer token. Its authentication is the signature, verified in
 * message.service.ts. The raw body is read with `c.req.text()` and never re-serialized —
 * `JSON.stringify(JSON.parse(x))` reorders keys and every HMAC would fail.
 *
 * One difference from the payment webhook, and it is deliberate: an unverified MESSAGE is
 * stored (flagged) rather than refused. Nothing is actuated by a message, so dropping a
 * real client message costs more than storing a forged one — and the flag is what keeps
 * a forgery from reading as genuine client speech.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { MESSAGE_CHANNEL, MESSAGE_PURPOSE } from "../services/message-channel.service.js";
import {
  attachInbound,
  createContactChannel,
  grantConsent,
  ingestInbound,
  listContactChannel,
  listInboundMessage,
  listOutboundMessage,
  listUndeliveredMessage,
  listUntriagedInbound,
  markInboundActioned,
  revokeConsent,
  sendMessage,
} from "../services/message.service.js";
import { env } from "../utils/env.js";

const messageRoutes = new Hono<{ Variables: Variables }>();

// ─── Webhooks (public, signature-authenticated) ──────
//
// Registered BEFORE the auth middleware. hono's use("*") applies to everything after it.

/**
 * Facebook's subscription handshake. It GETs the endpoint once with a challenge and will
 * not deliver anything until the exact `hub.challenge` value comes back as plain text.
 */
messageRoutes.get("/webhook/messenger", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const expected = env().MESSENGER_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    // Plain text, not JSON. Facebook rejects a JSON-wrapped challenge.
    return c.text(challenge);
  }
  throw new HTTPException(403, { message: "Messenger webhook verification failed" });
});

messageRoutes.post("/webhook/:channel", async (c) => {
  const name = c.req.param("channel");
  if (!(MESSAGE_CHANNEL as readonly string[]).includes(name)) {
    throw new HTTPException(404, { message: `Unknown message channel: ${name}` });
  }

  // The RAW body. Re-serializing would break every signature.
  const rawBody = await c.req.text();

  const header: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.header())) {
    header[key.toLowerCase()] = value;
  }

  const result = await ingestInbound(
    name as (typeof MESSAGE_CHANNEL)[number],
    rawBody,
    header,
  );

  // 200 always. Every one of these providers retries a non-2xx, so returning 400 on a
  // shape we do not read turns one odd callback into a delivery storm.
  return c.json({ data: result, error: null });
});

// ─── Everything below requires a session ─────────────

messageRoutes.use("*", requireAuth, requireTeam);

// ─── Contact channels + consent ──────────────────────

const contactSchema = z.object({
  clientId: z.number().int().positive().nullish(),
  leadId: z.number().int().positive().nullish(),
  channel: z.enum(MESSAGE_CHANNEL),
  reference: z.string().min(1).max(255),
  displayName: z.string().max(255).nullish(),
  isPrimary: z.boolean().optional(),
  /**
   * Supplying a source GRANTS consent. Omitting it stores the address with no
   * permission, and every send to it is refused. The default is the safe one on purpose.
   */
  consentSource: z.string().max(100).nullish(),
  note: z.string().max(2000).nullish(),
});

messageRoutes.get("/contact", async (c) => {
  const clientId = c.req.query("clientId");
  const leadId = c.req.query("leadId");
  return c.json({
    data: await listContactChannel({
      clientId: clientId ? Number(clientId) : undefined,
      leadId: leadId ? Number(leadId) : undefined,
    }),
    error: null,
  });
});

messageRoutes.post("/contact", requireAdmin, zValidator("json", contactSchema), async (c) => {
  return c.json({ data: await createContactChannel(c.req.valid("json")), error: null }, 201);
});

const consentSchema = z.object({ consentSource: z.string().min(1).max(100) });

messageRoutes.post(
  "/contact/:id/consent",
  requireAdmin,
  zValidator("json", consentSchema),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { consentSource } = c.req.valid("json");
    return c.json({ data: await grantConsent(id, consentSource), error: null });
  },
);

/** Revokes, never deletes — the row IS the evidence consent was given and withdrawn. */
messageRoutes.post("/contact/:id/revoke", requireAdmin, async (c) => {
  const revoked = await revokeConsent(Number(c.req.param("id")));
  return c.json({
    data: {
      contact: revoked,
      detail: "Consent withdrawn. The row is kept — deleting it would lose the record that consent was ever given.",
    },
    error: null,
  });
});

// ─── Outbound ────────────────────────────────────────

const sendSchema = z.object({
  contactChannelId: z.number().int().positive(),
  body: z.string().min(1).max(1600),
  purpose: z.enum(MESSAGE_PURPOSE),
  relatedEntityType: z.string().max(50).nullish(),
  relatedEntityId: z.number().int().positive().nullish(),
});

messageRoutes.post("/send", requireAdmin, zValidator("json", sendSchema), async (c) => {
  const result = await sendMessage(c.req.valid("json"));
  // 200 even for a refusal: the request was handled correctly and the refusal IS the
  // correct outcome. The status in the body is the verdict.
  return c.json({ data: result, error: null });
});

messageRoutes.get("/outbound", async (c) => {
  const type = c.req.query("relatedEntityType");
  const id = c.req.query("relatedEntityId");
  return c.json({
    data: await listOutboundMessage({
      relatedEntityType: type ?? undefined,
      relatedEntityId: id ? Number(id) : undefined,
    }),
    error: null,
  });
});

/** The ops view: what did NOT go out. Empty is the expected state. */
messageRoutes.get("/outbound/undelivered", async (c) => {
  return c.json({ data: await listUndeliveredMessage(), error: null });
});

// ─── Inbound ─────────────────────────────────────────

messageRoutes.get("/inbound", async (c) => {
  const clientId = c.req.query("clientId");
  const projectId = c.req.query("projectId");
  return c.json({
    data: await listInboundMessage({
      clientId: clientId ? Number(clientId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
    }),
    error: null,
  });
});

/** The admin inbox. */
messageRoutes.get("/inbound/untriaged", async (c) => {
  return c.json({ data: await listUntriagedInbound(), error: null });
});

messageRoutes.post("/inbound/:id/action", async (c) => {
  const user = c.get("user");
  return c.json({
    data: await markInboundActioned(Number(c.req.param("id")), user.userId),
    error: null,
  });
});

const attachSchema = z.object({
  clientId: z.number().int().positive().nullish(),
  projectId: z.number().int().positive().nullish(),
  leadId: z.number().int().positive().nullish(),
});

/** Place a message the automatic resolver declined to guess at. */
messageRoutes.post("/inbound/:id/attach", zValidator("json", attachSchema), async (c) => {
  return c.json({
    data: await attachInbound(Number(c.req.param("id")), c.req.valid("json")),
    error: null,
  });
});

export default messageRoutes;
