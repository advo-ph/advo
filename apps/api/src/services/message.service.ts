/**
 * Message persistence — the consent gate, the send ledger, and inbound ingest.
 *
 * message-channel.service.ts is the pure half: normalization, signature verification,
 * the provider adapters, `judgeConsent`. This file is the half that touches the
 * database, and it exists to hold four properties:
 *
 *   1. NOTHING IS SENT WITHOUT RECORDED CONSENT. `sendMessage` resolves the
 *      contact_channel, runs judgeConsent, and on refusal writes a `refused` row and
 *      returns — before any provider is reached. Under RA 10173 the ~5K scraped clinic
 *      numbers are personal data with no consent basis, and the gate is what stops that
 *      list from becoming an SMS blast.
 *
 *   2. A REFUSAL IS NOT A FAILURE. Two distinct statuses, because "we declined to send"
 *      and "we tried and it broke" need different responses from a human, and a
 *      dashboard that conflates them teaches people to ignore both.
 *
 *   3. EVERY ATTEMPT LEAVES A ROW, INCLUDING THE ONES THAT DIDN'T GO. email.service.ts
 *      caught its own failures and logged them nowhere useful; prod ran with no mail
 *      transport for months and nobody could tell. Three more channels without a visible
 *      ledger would have rebuilt that outage three times.
 *
 *   4. INBOUND IS DEDUPLICATED BY THE DATABASE. Messenger and Viber both redeliver until
 *      they get a 2xx, so a duplicate is guaranteed. The unique
 *      (channel, provider_message_id) index plus onConflictDoNothing makes the second
 *      delivery a no-op — the same mechanism 017 used for double-billing and 022 for
 *      payment replay, rather than trusting application care.
 *
 * Deliberately NOT here: no auto-reply, no threading, no read receipts. Nothing in this
 * file lets the platform answer a client on its own.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import {
  client,
  contactChannel,
  inboundMessage,
  lead,
  outboundMessage,
  project,
} from "../db/schema.js";
import { createLogger } from "../utils/logger.js";
import {
  judgeConsent,
  normalizePhoneNumber,
  parseMessengerWebhook,
  parseSmsWebhook,
  parseViberWebhook,
  providerFor,
  verifyMessengerSignature,
  verifyViberSignature,
  type MessageChannel,
  type MessagePurpose,
  type NormalizedInboundMessage,
} from "./message-channel.service.js";
import { env } from "../utils/env.js";

const log = createLogger("message");

export type ContactChannelRow = typeof contactChannel.$inferSelect;
export type InboundMessageRow = typeof inboundMessage.$inferSelect;
export type OutboundMessageRow = typeof outboundMessage.$inferSelect;

// ─── Contact channels ────────────────────────────────

export interface ContactChannelInput {
  clientId?: number | null;
  leadId?: number | null;
  channel: MessageChannel;
  reference: string;
  displayName?: string | null;
  isPrimary?: boolean;
  /** Recording consent is an explicit act. Omitted = no consent, and sends refuse. */
  consentSource?: string | null;
  note?: string | null;
}

/**
 * Create a contact channel.
 *
 * Consent is granted ONLY when a source is supplied. Passing no source stores the
 * address with consent_at NULL — a known number we may not use. That default is the
 * point: the easy path must be the one that does not assume permission.
 */
export async function createContactChannel(input: ContactChannelInput): Promise<ContactChannelRow> {
  if (!input.clientId === !input.leadId) {
    throw new HTTPException(400, {
      message: "A contact channel belongs to exactly one of a client or a lead, never both or neither.",
    });
  }

  const reference =
    input.channel === "sms" || input.channel === "viber"
      ? normalizePhoneNumber(input.reference)
      : input.reference;

  if (!reference) {
    throw new HTTPException(400, {
      message:
        `"${input.reference}" is not a recognisable Philippine mobile number. ` +
        `Refusing to store it rather than guess — a wrong number is a message to a stranger.`,
    });
  }

  const inserted = await db()
    .insert(contactChannel)
    .values({
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      channel: input.channel,
      reference,
      displayName: input.displayName ?? null,
      isPrimary: input.isPrimary ?? false,
      consentAt: input.consentSource ? new Date() : null,
      consentSource: input.consentSource ?? null,
      note: input.note ?? null,
    })
    .returning();

  return inserted[0];
}

/** Record consent. Separate from create because granting permission is its own act. */
export async function grantConsent(
  contactChannelId: number,
  consentSource: string,
): Promise<ContactChannelRow> {
  const updated = await db()
    .update(contactChannel)
    .set({ consentAt: new Date(), consentSource, revokedAt: null, updatedAt: new Date() })
    .where(eq(contactChannel.contactChannelId, contactChannelId))
    .returning();
  if (!updated[0]) throw new HTTPException(404, { message: "Contact channel not found" });
  return updated[0];
}

/**
 * Withdraw consent. Sets revoked_at rather than deleting the row — deleting loses the
 * evidence that consent was ever given, which is the record a DPA complaint is answered
 * with.
 */
export async function revokeConsent(contactChannelId: number): Promise<ContactChannelRow> {
  const updated = await db()
    .update(contactChannel)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(contactChannel.contactChannelId, contactChannelId))
    .returning();
  if (!updated[0]) throw new HTTPException(404, { message: "Contact channel not found" });
  return updated[0];
}

export async function listContactChannel(filter: {
  clientId?: number;
  leadId?: number;
}): Promise<ContactChannelRow[]> {
  const d = db();
  if (filter.clientId) {
    return d.select().from(contactChannel).where(eq(contactChannel.clientId, filter.clientId));
  }
  if (filter.leadId) {
    return d.select().from(contactChannel).where(eq(contactChannel.leadId, filter.leadId));
  }
  return d.select().from(contactChannel).orderBy(desc(contactChannel.createdAt)).limit(200);
}

// ─── Outbound ────────────────────────────────────────

export interface SendInput {
  contactChannelId: number;
  body: string;
  purpose: MessagePurpose;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
}

export interface SendResult {
  outboundMessageId: number;
  status: "sent" | "failed" | "refused";
  detail: string;
}

/**
 * Send one message, through the consent gate.
 *
 * The order matters and is the whole design: resolve → judge consent → (refuse and
 * record) → send → record. Consent is checked BEFORE a provider is reached, so a
 * misconfigured provider can never be the reason a non-consenting number was spared.
 */
export async function sendMessage(input: SendInput): Promise<SendResult> {
  const d = db();

  const found = (
    await d
      .select()
      .from(contactChannel)
      .where(eq(contactChannel.contactChannelId, input.contactChannelId))
      .limit(1)
  )[0];

  if (!found) throw new HTTPException(404, { message: "Contact channel not found" });

  const channel = found.channel as MessageChannel;

  // INVARIANT 1: the gate, before any provider.
  const verdict = judgeConsent({ consentAt: found.consentAt, revokedAt: found.revokedAt });
  if (!verdict.isAllowed) {
    const reason =
      verdict.reason === "consent_revoked"
        ? "Consent for this channel was withdrawn."
        : "No recorded consent for this channel — storing an address is not permission to use it.";
    const row = await recordOutbound({
      channel,
      provider: "log",
      contactChannelId: found.contactChannelId,
      toReference: found.reference,
      body: input.body,
      purpose: input.purpose,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      status: "refused",
      providerReference: null,
      failureReason: reason,
      sentAt: null,
    });
    log.warn(
      { contactChannelId: found.contactChannelId, channel, reason: verdict.reason },
      "outbound message REFUSED at the consent gate",
    );
    return { outboundMessageId: row.outboundMessageId, status: "refused", detail: reason };
  }

  const provider = providerFor(channel);

  let result: Awaited<ReturnType<typeof provider.send>>;
  try {
    result = await provider.send({ channel, toReference: found.reference, body: input.body });
  } catch (error) {
    // INVARIANT 3: a throw still leaves a row. This is the exact case email.service.ts
    // swallowed — a network error that vanished into a catch and a log line nobody read.
    result = {
      status: "failed",
      providerReference: null,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }

  const row = await recordOutbound({
    channel,
    provider: provider.name,
    contactChannelId: found.contactChannelId,
    toReference: found.reference,
    body: input.body,
    purpose: input.purpose,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    status: result.status,
    providerReference: result.providerReference,
    failureReason: result.failureReason,
    sentAt: result.status === "sent" ? new Date() : null,
  });

  return {
    outboundMessageId: row.outboundMessageId,
    status: result.status as "sent" | "failed" | "refused",
    detail:
      result.status === "sent"
        ? `Sent via ${provider.name}.`
        : (result.failureReason ?? "Not sent."),
  };
}

async function recordOutbound(
  values: typeof outboundMessage.$inferInsert,
): Promise<OutboundMessageRow> {
  const inserted = await db().insert(outboundMessage).values(values).returning();
  return inserted[0];
}

/**
 * The ops view: what did NOT go out. An empty list is the expected state; anything here
 * is either a missing credential or a consent gap, and both need a person.
 */
export async function listUndeliveredMessage(limit = 100): Promise<OutboundMessageRow[]> {
  return db()
    .select()
    .from(outboundMessage)
    .where(sql`${outboundMessage.status} IN ('failed', 'refused')`)
    .orderBy(desc(outboundMessage.createdAt))
    .limit(limit);
}

export async function listOutboundMessage(filter: {
  relatedEntityType?: string;
  relatedEntityId?: number;
}): Promise<OutboundMessageRow[]> {
  const d = db();
  if (filter.relatedEntityType && filter.relatedEntityId) {
    return d
      .select()
      .from(outboundMessage)
      .where(
        and(
          eq(outboundMessage.relatedEntityType, filter.relatedEntityType),
          eq(outboundMessage.relatedEntityId, filter.relatedEntityId),
        ),
      )
      .orderBy(desc(outboundMessage.createdAt));
  }
  return d.select().from(outboundMessage).orderBy(desc(outboundMessage.createdAt)).limit(200);
}

// ─── Inbound ─────────────────────────────────────────

export interface IngestResult {
  receivedCount: number;
  storedCount: number;
  duplicateCount: number;
  signatureVerified: boolean;
  detail: string;
}

/** Which parser and which secret each inbound channel uses. */
function verifyInbound(
  channel: MessageChannel,
  rawBody: string,
  header: Record<string, string>,
): boolean {
  const e = env();
  if (channel === "messenger") {
    return verifyMessengerSignature(rawBody, header["x-hub-signature-256"], e.MESSENGER_APP_SECRET ?? "");
  }
  if (channel === "viber") {
    return verifyViberSignature(rawBody, header["x-viber-content-signature"], e.VIBER_AUTH_TOKEN ?? "");
  }
  if (channel === "sms") {
    // Semaphore does not sign inbound. A shared secret in the path is the only control
    // available, so it is checked here and the weakness is recorded on the row rather
    // than papered over with a `true`.
    const expected = e.SMS_INBOUND_SECRET;
    return !!expected && header["x-advo-inbound-secret"] === expected;
  }
  return false;
}

function parseInbound(channel: MessageChannel, payload: unknown): NormalizedInboundMessage[] {
  if (channel === "messenger") return parseMessengerWebhook(payload);
  if (channel === "viber") return parseViberWebhook(payload);
  if (channel === "sms") return parseSmsWebhook(payload);
  return [];
}

/**
 * Ingest an inbound webhook.
 *
 * Unverified messages ARE stored, flagged `signature_verified = false`. That is a
 * deliberate difference from the payment webhook, where an unverified event must never
 * settle: here nothing is actuated by a message, so the risk of storing a forgery is
 * lower than the risk of dropping a real client message. The flag is what stops a forged
 * row from being read as genuine client speech — a fabricated paper trail is worse than
 * a missing one, and the flag is how the admin inbox tells them apart.
 */
export async function ingestInbound(
  channel: MessageChannel,
  rawBody: string,
  header: Record<string, string>,
): Promise<IngestResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new HTTPException(400, { message: "Webhook body is not JSON" });
  }

  const signatureVerified = verifyInbound(channel, rawBody, header);
  const message = parseInbound(channel, payload);

  if (message.length === 0) {
    return {
      receivedCount: 0,
      storedCount: 0,
      duplicateCount: 0,
      signatureVerified,
      detail: `No client message in this ${channel} callback (delivery receipt, status event, or a shape this adapter does not read).`,
    };
  }

  let storedCount = 0;
  for (const one of message) {
    const link = await resolveSender(channel, one.senderReference);
    // INVARIANT 4: the DB decides whether this is a replay.
    const inserted = await db()
      .insert(inboundMessage)
      .values({
        channel: one.channel,
        providerMessageId: one.providerMessageId,
        contactChannelId: link.contactChannelId,
        clientId: link.clientId,
        projectId: link.projectId,
        leadId: link.leadId,
        senderReference: one.senderReference,
        senderName: one.senderName,
        body: one.body,
        attachment: one.attachment as object | null,
        sentAt: one.sentAt,
        signatureVerified,
        rawPayload: payload as object,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) storedCount += 1;
  }

  if (!signatureVerified) {
    log.warn({ channel, count: message.length }, "inbound message stored with an UNVERIFIED signature");
  }

  return {
    receivedCount: message.length,
    storedCount,
    duplicateCount: message.length - storedCount,
    signatureVerified,
    detail: `${storedCount} stored, ${message.length - storedCount} already seen.`,
  };
}

/**
 * Attach an inbound message to whoever it is from, when we can tell.
 *
 * Resolution is by contact_channel reference only. It deliberately does NOT guess from a
 * display name or a partial number: attaching a client's message to the wrong project is
 * how a scope dispute gets argued from the wrong evidence. An unresolved message is
 * stored unattached and appears in the untriaged queue for a human to place.
 */
async function resolveSender(
  channel: MessageChannel,
  senderReference: string,
): Promise<{
  contactChannelId: number | null;
  clientId: number | null;
  leadId: number | null;
  projectId: number | null;
}> {
  const d = db();
  const found = (
    await d
      .select()
      .from(contactChannel)
      .where(and(eq(contactChannel.channel, channel), eq(contactChannel.reference, senderReference)))
      .limit(1)
  )[0];

  if (!found) return { contactChannelId: null, clientId: null, leadId: null, projectId: null };

  // A client's single active project is a safe attachment; two or more is ambiguous and
  // stays null rather than picking one.
  let projectId: number | null = null;
  if (found.clientId) {
    const row = await d
      .select({ projectId: project.projectId })
      .from(project)
      .where(eq(project.clientId, found.clientId))
      .limit(2);
    if (row.length === 1) projectId = row[0].projectId;
  }

  return {
    contactChannelId: found.contactChannelId,
    clientId: found.clientId,
    leadId: found.leadId,
    projectId,
  };
}

/** The admin inbox: what nobody has looked at yet. */
export async function listUntriagedInbound(limit = 100): Promise<InboundMessageRow[]> {
  return db()
    .select()
    .from(inboundMessage)
    .where(eq(inboundMessage.isActioned, false))
    .orderBy(desc(inboundMessage.receivedAt))
    .limit(limit);
}

export async function listInboundMessage(filter: {
  clientId?: number;
  projectId?: number;
}): Promise<InboundMessageRow[]> {
  const d = db();
  if (filter.projectId) {
    return d
      .select()
      .from(inboundMessage)
      .where(eq(inboundMessage.projectId, filter.projectId))
      .orderBy(desc(inboundMessage.receivedAt));
  }
  if (filter.clientId) {
    return d
      .select()
      .from(inboundMessage)
      .where(eq(inboundMessage.clientId, filter.clientId))
      .orderBy(desc(inboundMessage.receivedAt));
  }
  return d.select().from(inboundMessage).orderBy(desc(inboundMessage.receivedAt)).limit(200);
}

/** Triage. The only mutation an inbound message accepts — its body is never edited. */
export async function markInboundActioned(
  inboundMessageId: number,
  userId: number,
): Promise<InboundMessageRow> {
  const updated = await db()
    .update(inboundMessage)
    .set({ isActioned: true, actionedAt: new Date(), actionedByUserId: userId })
    .where(eq(inboundMessage.inboundMessageId, inboundMessageId))
    .returning();
  if (!updated[0]) throw new HTTPException(404, { message: "Inbound message not found" });
  return updated[0];
}

/**
 * Attach an unresolved message to a project by hand.
 *
 * The counterpart to resolveSender's refusal to guess: when the automatic resolution
 * declines, a human places it, and that act is recorded as triage.
 */
export async function attachInbound(
  inboundMessageId: number,
  target: { clientId?: number | null; projectId?: number | null; leadId?: number | null },
): Promise<InboundMessageRow> {
  const updated = await db()
    .update(inboundMessage)
    .set({
      clientId: target.clientId ?? null,
      projectId: target.projectId ?? null,
      leadId: target.leadId ?? null,
    })
    .where(eq(inboundMessage.inboundMessageId, inboundMessageId))
    .returning();
  if (!updated[0]) throw new HTTPException(404, { message: "Inbound message not found" });
  return updated[0];
}
