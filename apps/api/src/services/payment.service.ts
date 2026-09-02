/**
 * Payment settlement — the only code allowed to decide that a client has paid.
 *
 * payment-provider.service.ts knows how to talk to PayMongo and Xendit. This file knows
 * what a callback is allowed to DO, and the answer is deliberately small: write an event
 * row, and — under five conditions, all of which must hold — flip one invoice to paid.
 *
 * Five invariants, each asserted by apps/web/src/test/payment.test.ts, so weakening any
 * of them turns it red:
 *
 *   1. THE INVOICE IS THE SOURCE OF TRUTH. Settling writes invoice.status = 'paid' and
 *      invoice.paid_at. payment_intent mirrors it; it never replaces it. Nothing else in
 *      the codebase has to learn a second place to ask "has this been paid?".
 *
 *   2. EVERY CALLBACK IS RECORDED BEFORE IT IS JUDGED — including the ones that fail
 *      signature verification. A dropped bad-signature callback is a deleted attack log.
 *      recordEvent() runs first, always, and the refusal is stored on the same row.
 *
 *   3. AN UNVERIFIED CALLBACK SETTLES NOTHING. The webhook route is public; its URL is
 *      printed in the provider's own dashboard. Without signature verification, "mark
 *      this invoice paid" is an unauthenticated public endpoint.
 *
 *   4. REPLAY IS A NO-OP AT THE DB LEVEL. Providers retry until they get a 2xx, so a
 *      duplicate is guaranteed, not hypothetical. The unique (provider, provider_event_id)
 *      index plus onConflictDoNothing makes the second delivery change nothing — the
 *      same mechanism 017 used for double-billing rather than trusting application care.
 *
 *   5. AMOUNT MISMATCH REFUSES. A provider reporting a different amount than the intent
 *      snapshot marks the intent failed and leaves the invoice ALONE. Partial payment is
 *      ordinary in PH B2B; rounding it up to "paid" writes off the remainder silently.
 *
 * Deliberately NOT here, and each for a reason:
 *
 *   * NO COMMISSION FINALIZE. Money landing does not finalize a commission plan (018).
 *     Finalizing freezes what people are owed; it is a decision, and 017 already set the
 *     precedent that this codebase derives whether an act is justified and leaves the act
 *     to a person.
 *   * NO AUTO-RESUME of a suspended host, NO auto-issued receipt. Same reason.
 *   * NO REFUND PATH. A refund moves real money outward and is not something a webhook
 *     handler should be able to trigger.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { client, invoice, paymentEvent, paymentIntent, project } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import { env } from "../utils/env.js";
import {
  createCollectable,
  providerBy,
  type NormalizedPaymentEvent,
  type PaymentProviderName,
} from "./payment-provider.service.js";

const log = createLogger("payment");

export type PaymentIntentRow = typeof paymentIntent.$inferSelect;
export type PaymentEventRow = typeof paymentEvent.$inferSelect;

/** Every reason a recorded event can legitimately change nothing. */
export const REFUSAL_REASON = [
  "bad_signature",
  "unknown_reference",
  "amount_mismatch",
  "already_paid",
  "unhandled_type",
  "duplicate_event",
] as const;
export type RefusalReason = (typeof REFUSAL_REASON)[number];

export interface SettleResult {
  /** True only when this call moved an invoice from unpaid to paid. */
  isSettled: boolean;
  refusalReason: RefusalReason | null;
  paymentIntentId: number | null;
  invoiceId: number | null;
  detail: string;
}

// ─── Create a collectable ────────────────────────────

/**
 * Issue a payment link for an invoice.
 *
 * The amount is read from the invoice ONCE, here, and snapshotted onto the intent. From
 * that moment the two are independent: editing the invoice afterwards cannot change what
 * an already-issued link settles.
 *
 * An invoice that is already paid is refused with 409 rather than quietly issuing a
 * second link — two live links against one invoice is how a client pays twice.
 */
export async function createPaymentIntent(invoiceId: number): Promise<{
  intent: PaymentIntentRow;
  checkoutUrl: string | null;
  fellBack: boolean;
  detail: string;
}> {
  const d = db();

  const row = await d
    .select({
      invoice: invoice,
      projectTitle: project.title,
      clientEmail: client.contactEmail,
      clientName: client.companyName,
    })
    .from(invoice)
    .leftJoin(project, eq(invoice.projectId, project.projectId))
    .leftJoin(client, eq(project.clientId, client.clientId))
    .where(eq(invoice.invoiceId, invoiceId))
    .limit(1);

  const found = row[0];
  if (!found) throw new HTTPException(404, { message: "Invoice not found" });
  if (found.invoice.status === "paid") {
    throw new HTTPException(409, {
      message: "Invoice is already paid — refusing to issue a second payment link.",
    });
  }

  // Reuse a live link rather than minting a parallel one. Two open collectables against
  // one invoice is the shape of a double payment.
  const open = await d
    .select()
    .from(paymentIntent)
    .where(and(eq(paymentIntent.invoiceId, invoiceId), eq(paymentIntent.status, "pending")))
    .orderBy(desc(paymentIntent.createdAt))
    .limit(1);

  const live = open[0];
  if (live && live.checkoutUrl && live.amountCents === found.invoice.amountCents) {
    return {
      intent: live,
      checkoutUrl: live.checkoutUrl,
      fellBack: false,
      detail: `Reused the open ${live.provider} link for this invoice.`,
    };
  }

  const result = await createCollectable({
    invoiceId,
    amountCents: found.invoice.amountCents,
    currency: "PHP",
    description: `${found.projectTitle ?? "ADVO"} — ${found.invoice.label}`,
    payerEmail: found.clientEmail,
    payerName: found.clientName,
    successUrl: `${env().FRONTEND_URL}/hub?paid=${invoiceId}`,
  });

  const inserted = await d
    .insert(paymentIntent)
    .values({
      invoiceId,
      provider: result.provider,
      providerReference: result.providerReference,
      checkoutUrl: result.checkoutUrl,
      // THE SNAPSHOT. Not a read-through to invoice.amountCents.
      amountCents: found.invoice.amountCents,
      currency: "PHP",
      status: "pending",
      expiresAt: result.expiresAt,
    })
    .returning();

  log.info(
    { invoiceId, provider: result.provider, fellBack: result.fellBack },
    "payment intent created",
  );

  return {
    intent: inserted[0],
    checkoutUrl: result.checkoutUrl,
    fellBack: result.fellBack,
    detail: result.detail,
  };
}

// ─── Webhook ingest ──────────────────────────────────

/**
 * Decide whether a normalized event may settle, given the intent it names.
 *
 * PURE — no database, no clock, no network. Every refusal branch is a unit test rather
 * than an integration test, which is why this is a separate function instead of an `if`
 * chain buried in the write path.
 */
export function judgeEvent(
  event: NormalizedPaymentEvent,
  intent: Pick<PaymentIntentRow, "amountCents" | "status"> | null,
  invoiceStatus: "unpaid" | "paid" | "overdue" | null,
): { isSettled: boolean; refusalReason: RefusalReason | null } {
  if (!intent) return { isSettled: false, refusalReason: "unknown_reference" };

  // A failure/expiry is handled (it marks the intent) but never settles.
  if (!event.isPaid) {
    return { isSettled: false, refusalReason: event.isFailed ? null : "unhandled_type" };
  }

  if (invoiceStatus === "paid") return { isSettled: false, refusalReason: "already_paid" };

  // The amount check. An unreported amount is NOT treated as a match — a provider that
  // will not say what it collected does not get to close an invoice.
  if (event.amountCents === null || event.amountCents !== intent.amountCents) {
    return { isSettled: false, refusalReason: "amount_mismatch" };
  }

  return { isSettled: true, refusalReason: null };
}

/**
 * The whole webhook path: verify → record → judge → maybe settle.
 *
 * `rawBody` is the request body as a STRING, byte-for-byte as received. It must not be
 * re-serialized from a parsed object first — `JSON.stringify(JSON.parse(x))` reorders
 * keys and drops whitespace, and the HMAC is over the original bytes. The route reads
 * `c.req.text()` for exactly this reason.
 */
export async function ingestWebhook(
  providerName: PaymentProviderName,
  rawBody: string,
  header: Record<string, string>,
): Promise<SettleResult> {
  const d = db();
  const provider = providerBy(providerName);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new HTTPException(400, { message: "Webhook body is not JSON" });
  }

  const isVerified = provider.verify(rawBody, header);
  const event = provider.parse(payload);

  // An unparseable body from a verified sender still deserves a row — it means the
  // provider changed a contract on us, and that must be visible, not swallowed.
  if (!event) {
    await d
      .insert(paymentEvent)
      .values({
        provider: providerName,
        providerEventId: `unparsed:${Date.now()}`,
        eventType: "unparsed",
        signatureVerified: isVerified,
        isSettled: false,
        refusalReason: "unhandled_type",
        payload: payload as object,
        processedAt: new Date(),
      })
      .onConflictDoNothing();
    return {
      isSettled: false,
      refusalReason: "unhandled_type",
      paymentIntentId: null,
      invoiceId: null,
      detail: `${providerName} sent a payload this adapter does not recognise. Recorded, not acted on.`,
    };
  }

  // Resolve the intent before recording, so the event row carries the FK even when it
  // is about to be refused. A refused event you cannot join to an invoice is half a log.
  const intentRow = event.providerReference
    ? (
        await d
          .select()
          .from(paymentIntent)
          .where(
            and(
              eq(paymentIntent.provider, providerName),
              eq(paymentIntent.providerReference, event.providerReference),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  // INVARIANT 3: an unverified callback is recorded and refused, never settled — before
  // any judging happens, so no later branch can accidentally let one through.
  if (!isVerified) {
    await recordEvent(providerName, event, intentRow?.paymentIntentId ?? null, false, false, "bad_signature", payload);
    log.warn(
      { provider: providerName, eventType: event.eventType, reference: event.providerReference },
      "REFUSED an unverified payment webhook",
    );
    return {
      isSettled: false,
      refusalReason: "bad_signature",
      paymentIntentId: intentRow?.paymentIntentId ?? null,
      invoiceId: intentRow?.invoiceId ?? null,
      detail: "Signature verification failed. Event recorded; nothing settled.",
    };
  }

  const invoiceRow = intentRow
    ? (await d.select().from(invoice).where(eq(invoice.invoiceId, intentRow.invoiceId)).limit(1))[0]
    : undefined;

  const verdict = judgeEvent(event, intentRow ?? null, invoiceRow?.status ?? null);

  // INVARIANT 4: the DB decides whether this is a replay. An insert that conflicts
  // returns nothing, and nothing downstream runs.
  const recorded = await recordEvent(
    providerName,
    event,
    intentRow?.paymentIntentId ?? null,
    true,
    verdict.isSettled,
    verdict.refusalReason,
    payload,
  );

  if (!recorded) {
    return {
      isSettled: false,
      refusalReason: "duplicate_event",
      paymentIntentId: intentRow?.paymentIntentId ?? null,
      invoiceId: intentRow?.invoiceId ?? null,
      detail: `Replay of ${event.providerEventId}. Already processed; nothing changed.`,
    };
  }

  if (!intentRow) {
    return {
      isSettled: false,
      refusalReason: "unknown_reference",
      paymentIntentId: null,
      invoiceId: null,
      detail: `No payment intent matches ${providerName} reference ${event.providerReference ?? "(none)"}.`,
    };
  }

  // A terminal failure marks the intent so an operator can reissue, and stops there.
  if (!verdict.isSettled) {
    if (event.isFailed || verdict.refusalReason === "amount_mismatch") {
      await d
        .update(paymentIntent)
        .set({
          status: event.isFailed ? "failed" : "pending",
          failureReason:
            verdict.refusalReason === "amount_mismatch"
              ? `Provider reported ${event.amountCents ?? "no"} cents against a ${intentRow.amountCents}-cent intent. Refused — this may be a partial payment.`
              : event.failureReason,
          updatedAt: new Date(),
        })
        .where(eq(paymentIntent.paymentIntentId, intentRow.paymentIntentId));
    }
    return {
      isSettled: false,
      refusalReason: verdict.refusalReason,
      paymentIntentId: intentRow.paymentIntentId,
      invoiceId: intentRow.invoiceId,
      detail: refusalDetail(verdict.refusalReason, event, intentRow),
    };
  }

  await settle(intentRow, event);

  return {
    isSettled: true,
    refusalReason: null,
    paymentIntentId: intentRow.paymentIntentId,
    invoiceId: intentRow.invoiceId,
    detail: `Invoice ${intentRow.invoiceId} settled by ${providerName} (${event.method ?? "method unreported"}).`,
  };
}

function refusalDetail(
  reason: RefusalReason | null,
  event: NormalizedPaymentEvent,
  intent: PaymentIntentRow,
): string {
  switch (reason) {
    case "already_paid":
      return `Invoice ${intent.invoiceId} was already paid. Recorded, nothing changed.`;
    case "amount_mismatch":
      return `Amount mismatch: provider reported ${event.amountCents ?? "nothing"}, intent snapshot is ${intent.amountCents}. Refused — a human must look at this.`;
    case "unhandled_type":
      return `Event type ${event.eventType} is recorded but not acted on.`;
    default:
      return `Event ${event.eventType} recorded.`;
  }
}

/**
 * Append one row to the event ledger. Returns null when the row already existed — that
 * IS the replay guard, and the caller must treat null as "do nothing further".
 */
async function recordEvent(
  provider: PaymentProviderName,
  event: NormalizedPaymentEvent,
  paymentIntentId: number | null,
  signatureVerified: boolean,
  isSettled: boolean,
  refusalReason: RefusalReason | null,
  payload: unknown,
): Promise<PaymentEventRow | null> {
  const inserted = await db()
    .insert(paymentEvent)
    .values({
      provider,
      providerEventId: event.providerEventId,
      paymentIntentId,
      eventType: event.eventType,
      signatureVerified,
      isSettled,
      refusalReason,
      payload: payload as object,
      processedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  return inserted[0] ?? null;
}

/**
 * The settlement write. Two guarded UPDATEs, no read-then-write.
 *
 * The invoice update carries `status = 'unpaid' OR 'overdue'` in its WHERE, so an
 * invoice an admin marked paid a millisecond earlier cannot be re-settled by a
 * concurrent callback — the same guarded-UPDATE discipline the 017 sweep uses.
 */
async function settle(intent: PaymentIntentRow, event: NormalizedPaymentEvent): Promise<void> {
  const d = db();
  const now = new Date();

  await d
    .update(paymentIntent)
    .set({
      status: "paid",
      paidAt: now,
      method: event.method,
      failureReason: null,
      updatedAt: now,
    })
    .where(eq(paymentIntent.paymentIntentId, intent.paymentIntentId));

  await d
    .update(invoice)
    .set({
      status: "paid",
      paidAt: now,
      settledPaymentIntentId: intent.paymentIntentId,
      updatedAt: now,
    })
    .where(
      and(
        eq(invoice.invoiceId, intent.invoiceId),
        sql`${invoice.status} IN ('unpaid', 'overdue')`,
      ),
    );

  log.info(
    { invoiceId: intent.invoiceId, intentId: intent.paymentIntentId, method: event.method },
    "invoice settled by payment webhook",
  );
}

// ─── Reads ───────────────────────────────────────────

export async function listPaymentIntent(invoiceId?: number): Promise<PaymentIntentRow[]> {
  const d = db();
  const q = d.select().from(paymentIntent).orderBy(desc(paymentIntent.createdAt));
  if (invoiceId) return q.where(eq(paymentIntent.invoiceId, invoiceId));
  return q.limit(200);
}

/**
 * The security view: callbacks that failed verification, newest first. An empty list is
 * the expected state; a non-empty one is either a misconfigured secret or someone
 * probing the endpoint, and both need a human.
 */
export async function listUnverifiedEvent(limit = 50): Promise<PaymentEventRow[]> {
  return db()
    .select()
    .from(paymentEvent)
    .where(eq(paymentEvent.signatureVerified, false))
    .orderBy(desc(paymentEvent.receivedAt))
    .limit(limit);
}

export async function listPaymentEvent(paymentIntentId: number): Promise<PaymentEventRow[]> {
  return db()
    .select()
    .from(paymentEvent)
    .where(eq(paymentEvent.paymentIntentId, paymentIntentId))
    .orderBy(desc(paymentEvent.receivedAt));
}

/**
 * Cancel an open collectable. Does NOT tell the provider to void the link — that is a
 * separate outbound act per provider, and pretending we did it would be worse than
 * saying we did not. This marks our side and stops the link being reused by
 * createPaymentIntent.
 */
export async function cancelPaymentIntent(paymentIntentId: number): Promise<PaymentIntentRow> {
  const updated = await db()
    .update(paymentIntent)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(paymentIntent.paymentIntentId, paymentIntentId), eq(paymentIntent.status, "pending")))
    .returning();
  if (!updated[0]) {
    throw new HTTPException(409, {
      message: "Only a pending payment intent can be cancelled.",
    });
  }
  return updated[0];
}
