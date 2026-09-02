/**
 * Payment routes — one public endpoint and the rest behind auth.
 *
 * The webhook is the only unauthenticated write path in this file, and it is
 * unauthenticated because it has to be: PayMongo and Xendit call it from their own
 * infrastructure with no ADVO credential. Its authentication is the SIGNATURE, verified
 * in payment.service.ts before anything is judged. That is why the raw body is read with
 * `c.req.text()` and never re-serialized — `JSON.stringify(JSON.parse(body))` reorders
 * keys and would break every HMAC.
 *
 * The webhook always answers 200, even when it refuses the event. Providers retry any
 * non-2xx, so a 400 on a bad signature turns an attack into a retry storm and a 500 on
 * an unknown reference makes the provider hammer us for a link we deleted. The refusal
 * is recorded in payment_event and surfaced in the response body; the STATUS is an
 * acknowledgement of receipt, not a verdict.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { PAYMENT_PROVIDER_NAME } from "../services/payment-provider.service.js";
import {
  cancelPaymentIntent,
  createPaymentIntent,
  ingestWebhook,
  listPaymentEvent,
  listPaymentIntent,
  listUnverifiedEvent,
} from "../services/payment.service.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("payment-route");

const paymentRoutes = new Hono<{ Variables: Variables }>();

// ─── Webhook (public, signature-authenticated) ───────
//
// Mounted BEFORE the auth middleware below. Order matters: `use("*")` applies to every
// route registered after it, so moving this block down would put a provider callback
// behind a bearer token it cannot have.

paymentRoutes.post("/webhook/:provider", async (c) => {
  const name = c.req.param("provider");
  if (!(PAYMENT_PROVIDER_NAME as readonly string[]).includes(name)) {
    // A 404 here, not a 200 — this is not a provider we ever registered, so there is no
    // delivery to acknowledge and no retry worth encouraging.
    throw new HTTPException(404, { message: `Unknown payment provider: ${name}` });
  }

  // The RAW body. Re-serializing would break the HMAC.
  const rawBody = await c.req.text();

  const header: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.header())) {
    header[key.toLowerCase()] = value;
  }

  const result = await ingestWebhook(
    name as (typeof PAYMENT_PROVIDER_NAME)[number],
    rawBody,
    header,
  );

  if (result.refusalReason === "bad_signature") {
    log.warn({ provider: name }, "payment webhook refused: bad signature");
  }

  // 200 even on refusal. See the file header.
  return c.json({ data: result, error: null });
});

// ─── Everything below requires a session ─────────────

paymentRoutes.use("*", requireAuth);

/**
 * A client may read the intents for their OWN invoice so the Hub can show a pay button.
 * Cross-tenant scoping is enforced by the invoice read inside the service, which is the
 * same seam the S1/S2/S3 fixes settled on.
 */
paymentRoutes.get("/intent", async (c) => {
  const raw = c.req.query("invoiceId");
  const invoiceId = raw ? Number(raw) : undefined;
  const user = c.get("user");

  if (user.role === "client" && !invoiceId) {
    throw new HTTPException(400, {
      message: "invoiceId is required — a client may only read intents for a named invoice.",
    });
  }

  return c.json({ data: await listPaymentIntent(invoiceId), error: null });
});

paymentRoutes.get("/intent/:id/event", requireTeam, async (c) => {
  return c.json({ data: await listPaymentEvent(Number(c.req.param("id"))), error: null });
});

/**
 * The security view. Empty is the expected state; anything here is a misconfigured
 * secret or someone probing the public webhook, and both need a person.
 */
paymentRoutes.get("/event/unverified", requireTeam, async (c) => {
  return c.json({ data: await listUnverifiedEvent(), error: null });
});

// ─── Write (admin) ───────────────────────────────────

const createSchema = z.object({
  invoiceId: z.number().int().positive(),
});

/**
 * Issue a payment link for an invoice. Idempotent in the way that matters: an open link
 * for the same amount is REUSED rather than duplicated, because two live collectables
 * against one invoice is how a client pays twice.
 */
paymentRoutes.post("/intent", requireAdmin, zValidator("json", createSchema), async (c) => {
  const { invoiceId } = c.req.valid("json");
  const result = await createPaymentIntent(invoiceId);
  return c.json({ data: result, error: null }, 201);
});

/**
 * Marks OUR side cancelled. Does not void the link at the provider — that is a separate
 * outbound act, and claiming it happened would be a lie in the response body.
 */
paymentRoutes.post("/intent/:id/cancel", requireAdmin, async (c) => {
  const cancelled = await cancelPaymentIntent(Number(c.req.param("id")));
  return c.json({
    data: {
      intent: cancelled,
      detail:
        "Cancelled on ADVO's side. The link may still be live at the provider — void it there too if that matters.",
    },
    error: null,
  });
});

export default paymentRoutes;
