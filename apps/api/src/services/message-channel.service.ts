/**
 * Message channel seam — SMS, Viber and Messenger, inbound and outbound.
 *
 * Two halves, and they exist for different reasons.
 *
 * OUTBOUND exists because the deemed-approval notice (021) is a 15-business-day
 * countdown whose legal force depends on the client actually receiving it — and the only
 * channel carrying it was transactional email, which had NO TRANSPORT IN PROD for
 * months and failed silently the whole time (fixed 2026-08-29). A contractual clock
 * running on an unmonitored channel is the risk; a second channel is the mitigation.
 *
 * INBOUND exists because docs/ROADMAP.md was assembled by a human reading a Messenger
 * export. The change-order process and the revision cap both depend on a paper trail of
 * what the client asked for and when, and that trail is on somebody's phone.
 *
 * ─── The consent gate is the load-bearing part ────────────────────────────────
 *
 * `send()` REFUSES a contact_channel with no consent_at, before any provider is reached,
 * and records the refusal. This is not politeness. The ~5K scraped clinic leads are
 * personal data under RA 10173 with no consent basis attached; a phone number reaches
 * someone at 2am. The refusal is a `refused` row, distinct from `failed`, because "we
 * declined to send" and "we tried and it broke" are different facts and an ops dashboard
 * that conflates them teaches people to ignore both.
 *
 * ─── Providers ────────────────────────────────────────────────────────────────
 *
 *   log        The default. Writes the row, sends nothing, marks it `refused` with
 *              "no transport configured". Honest: a queue that pretends to have sent is
 *              exactly the failure mode of the old email path.
 *   semaphore  PH SMS gateway. Sender name must be pre-registered with them.
 *   movider    PH SMS alternative, same shape.
 *   viber      Viber Business Messages.
 *   messenger  Facebook Messenger Send API, page-scoped.
 *
 * ─── Credential status ────────────────────────────────────────────────────────
 *
 * NONE of SEMAPHORE_API_KEY, MOVIDER_API_KEY, VIBER_AUTH_TOKEN, MESSENGER_PAGE_TOKEN
 * exists on this machine or in prod as of 2026-09-02. Every outbound request shape below
 * is written to the provider's documented contract and has NOT been exercised against a
 * live account — the same honesty preview-host.service.ts carries about here.now.
 * Everything pure (the consent gate, E.164 normalization, signature verification, the
 * inbound normalizers) IS covered by message-channel.test.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("message-channel");

export const MESSAGE_CHANNEL = ["sms", "viber", "messenger", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNEL)[number];

export const MESSAGE_PROVIDER = ["log", "semaphore", "movider", "viber", "messenger"] as const;
export type MessageProviderName = (typeof MESSAGE_PROVIDER)[number];

export const MESSAGE_PURPOSE = [
  "signoff_deadline",
  "invoice_due",
  "payment_receipt",
  "custom",
] as const;
export type MessagePurpose = (typeof MESSAGE_PURPOSE)[number];

/** Every terminal state an outbound row can hold. `refused` is ours, not a provider's. */
export const OUTBOUND_STATUS = ["queued", "sent", "failed", "refused"] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUS)[number];

// ─── E.164 normalization ─────────────────────────────

/** Philippine country calling code. */
export const PH_COUNTRY_CODE = "63";

/**
 * Normalize a Philippine mobile number to E.164, or return null.
 *
 * PH numbers arrive in at least five shapes in this business — `0917…`, `+63917…`,
 * `63917…`, `917…`, and any of those with spaces or dashes. Storing them unnormalized
 * means the same person occupies several contact_channel rows with several consent
 * states, and at send time there is no correct way to pick one. The unique index on
 * (channel, reference) only helps if the reference is canonical.
 *
 * Returns null rather than guessing on anything that is not recognisably a PH mobile.
 * A wrong number is a message to a stranger.
 */
export function normalizePhoneNumber(raw: string): string | null {
  const digit = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digit)) return null;

  // 09XXXXXXXXX (11) → 639XXXXXXXXX
  if (/^09\d{9}$/.test(digit)) return `+${PH_COUNTRY_CODE}${digit.slice(1)}`;
  // 639XXXXXXXXX (12)
  if (/^639\d{9}$/.test(digit)) return `+${digit}`;
  // 9XXXXXXXXX (10) — bare mobile, no trunk prefix
  if (/^9\d{9}$/.test(digit)) return `+${PH_COUNTRY_CODE}${digit}`;

  return null;
}

// ─── Consent ─────────────────────────────────────────

/** The subset of a contact_channel row the consent decision actually needs. */
export interface ConsentState {
  consentAt: Date | null;
  revokedAt: Date | null;
}

export type ConsentVerdict =
  | { isAllowed: true }
  | { isAllowed: false; reason: "no_consent" | "consent_revoked" };

/**
 * May we send to this channel? PURE — no database, no clock beyond what is passed in.
 *
 * Separated from the write path precisely so every branch is a unit test. A consent
 * check buried inside an async send function is a check nobody can prove holds.
 */
export function judgeConsent(state: ConsentState): ConsentVerdict {
  if (!state.consentAt) return { isAllowed: false, reason: "no_consent" };
  if (state.revokedAt) return { isAllowed: false, reason: "consent_revoked" };
  return { isAllowed: true };
}

// ─── Outbound provider seam ──────────────────────────

export interface OutboundInput {
  channel: MessageChannel;
  /** Already normalized. E.164 for sms/viber, a page-scoped id for messenger. */
  toReference: string;
  body: string;
}

export interface OutboundResult {
  status: OutboundStatus;
  providerReference: string | null;
  failureReason: string | null;
}

export interface MessageProvider {
  name: MessageProviderName;
  channel: readonly MessageChannel[];
  isConfigured: () => boolean;
  send: (input: OutboundInput) => Promise<OutboundResult>;
}

/**
 * The default. Records the row, sends nothing, and says so.
 *
 * `refused`, not `sent`. A transport that reports success without a transport is the
 * exact failure email.service.ts shipped with for months — and the reason a live outage
 * was invisible until somebody happened to read a health payload.
 */
export const logProvider: MessageProvider = {
  name: "log",
  channel: MESSAGE_CHANNEL,
  isConfigured: () => true,
  async send(input) {
    log.warn(
      { channel: input.channel, to: input.toReference },
      "no message transport configured — recorded, not sent",
    );
    return {
      status: "refused",
      providerReference: null,
      failureReason: "No message transport configured for this channel.",
    };
  },
};

export const semaphoreProvider: MessageProvider = {
  name: "semaphore",
  channel: ["sms"],
  isConfigured: () => !!env().SEMAPHORE_API_KEY,
  async send(input) {
    const e = env();
    if (!e.SEMAPHORE_API_KEY) {
      return { status: "refused", providerReference: null, failureReason: "SEMAPHORE_API_KEY is not set." };
    }
    const form = new URLSearchParams({
      apikey: e.SEMAPHORE_API_KEY,
      number: input.toReference,
      message: input.body,
    });
    // Semaphore requires the sender name to be pre-registered; omitting it uses their
    // shared default rather than failing, which is the safer degradation.
    if (e.SEMAPHORE_SENDER_NAME) form.set("sendername", e.SEMAPHORE_SENDER_NAME);

    const res = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        status: "failed",
        providerReference: null,
        failureReason: `Semaphore ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const json = (await res.json()) as Array<{ message_id?: number | string }>;
    return {
      status: "sent",
      providerReference: json?.[0]?.message_id ? String(json[0].message_id) : null,
      failureReason: null,
    };
  },
};

export const moviderProvider: MessageProvider = {
  name: "movider",
  channel: ["sms"],
  isConfigured: () => !!env().MOVIDER_API_KEY && !!env().MOVIDER_API_SECRET,
  async send(input) {
    const e = env();
    if (!e.MOVIDER_API_KEY || !e.MOVIDER_API_SECRET) {
      return {
        status: "refused",
        providerReference: null,
        failureReason: "MOVIDER_API_KEY / MOVIDER_API_SECRET are not both set.",
      };
    }
    const res = await fetch("https://api.movider.co/v1/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: e.MOVIDER_API_KEY,
        api_secret: e.MOVIDER_API_SECRET,
        to: input.toReference.replace(/^\+/, ""),
        text: input.body,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        status: "failed",
        providerReference: null,
        failureReason: `Movider ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const json = (await res.json()) as { phone_number_list?: Array<{ message_id?: string }> };
    return {
      status: "sent",
      providerReference: json?.phone_number_list?.[0]?.message_id ?? null,
      failureReason: null,
    };
  },
};

export const viberProvider: MessageProvider = {
  name: "viber",
  channel: ["viber"],
  isConfigured: () => !!env().VIBER_AUTH_TOKEN,
  async send(input) {
    const e = env();
    if (!e.VIBER_AUTH_TOKEN) {
      return { status: "refused", providerReference: null, failureReason: "VIBER_AUTH_TOKEN is not set." };
    }
    const res = await fetch("https://chatapi.viber.com/pa/send_message", {
      method: "POST",
      headers: { "X-Viber-Auth-Token": e.VIBER_AUTH_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver: input.toReference,
        type: "text",
        sender: { name: e.VIBER_SENDER_NAME || "ADVO" },
        text: input.body,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: number; status_message?: string; message_token?: number };
    // Viber answers 200 with a non-zero `status` on failure — a naive res.ok check would
    // record every rejected message as sent.
    if (!res.ok || (json.status ?? 1) !== 0) {
      return {
        status: "failed",
        providerReference: null,
        failureReason: `Viber status ${json.status ?? res.status}: ${json.status_message ?? "unknown"}`,
      };
    }
    return {
      status: "sent",
      providerReference: json.message_token ? String(json.message_token) : null,
      failureReason: null,
    };
  },
};

export const messengerProvider: MessageProvider = {
  name: "messenger",
  channel: ["messenger"],
  isConfigured: () => !!env().MESSENGER_PAGE_TOKEN,
  async send(input) {
    const e = env();
    if (!e.MESSENGER_PAGE_TOKEN) {
      return { status: "refused", providerReference: null, failureReason: "MESSENGER_PAGE_TOKEN is not set." };
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(e.MESSENGER_PAGE_TOKEN)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: input.toReference },
          // MESSAGE_TAG / RESPONSE only. Messenger forbids unsolicited messaging outside
          // a 24-hour window, and this codebase never initiates a cold Messenger thread.
          messaging_type: "RESPONSE",
          message: { text: input.body },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return {
        status: "failed",
        providerReference: null,
        failureReason: `Messenger ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const json = (await res.json()) as { message_id?: string };
    return { status: "sent", providerReference: json.message_id ?? null, failureReason: null };
  },
};

const PROVIDER_REGISTRY: Record<MessageProviderName, MessageProvider> = {
  log: logProvider,
  semaphore: semaphoreProvider,
  movider: moviderProvider,
  viber: viberProvider,
  messenger: messengerProvider,
};

/**
 * Which provider serves a channel, after configuration.
 *
 * SMS is the only channel with a choice, so it reads SMS_PROVIDER; the others have
 * exactly one implementation each. An unconfigured provider resolves to `log`, which
 * records and refuses rather than throwing — losing the ledger row would lose the very
 * evidence that a notice did not go out.
 */
export function providerFor(channel: MessageChannel): MessageProvider {
  if (channel === "sms") {
    const chosen = PROVIDER_REGISTRY[env().SMS_PROVIDER];
    return chosen.isConfigured() ? chosen : logProvider;
  }
  if (channel === "viber") return viberProvider.isConfigured() ? viberProvider : logProvider;
  if (channel === "messenger") return messengerProvider.isConfigured() ? messengerProvider : logProvider;
  // whatsapp is a declared channel with no adapter yet. `log` is the honest answer.
  return logProvider;
}

// ─── Inbound: signature verification ─────────────────

/**
 * Facebook signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`.
 * Same rule as the payment webhook — the HMAC is over the ORIGINAL bytes, so the route
 * must read the raw text and never a re-serialized object.
 */
export function verifyMessengerSignature(
  rawBody: string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const [algorithm, sent] = header.split("=");
  if (algorithm !== "sha256" || !sent) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sent, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Viber signs with `X-Viber-Content-Signature`, HMAC-SHA256 of the body under the auth
 * token itself — the same secret used to send, which is weaker than a dedicated signing
 * key but is what the platform offers.
 */
export function verifyViberSignature(
  rawBody: string,
  header: string | undefined,
  authToken: string,
): boolean {
  if (!header || !authToken) return false;
  const expected = createHmac("sha256", authToken).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(header, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Inbound: normalization ──────────────────────────

export interface NormalizedInboundMessage {
  channel: MessageChannel;
  providerMessageId: string;
  senderReference: string;
  senderName: string | null;
  body: string | null;
  attachment: unknown | null;
  /** The provider's own clock. Null when it did not say. */
  sentAt: Date | null;
}

/**
 * Facebook batches: one webhook body can carry several entries, each with several
 * messaging events. Returning an array rather than a single message is not future-proofing
 * — it is what the platform actually sends, and a normalizer that reads only [0] silently
 * drops client messages.
 */
export function parseMessengerWebhook(payload: unknown): NormalizedInboundMessage[] {
  if (typeof payload !== "object" || payload === null) return [];
  const body = payload as {
    object?: string;
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; attachments?: unknown };
      }>;
    }>;
  };
  if (body.object !== "page") return [];

  const out: NormalizedInboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const mid = event.message?.mid;
      const senderId = event.sender?.id;
      // An echo, a delivery receipt or a read receipt carries no mid — skipping them is
      // correct, and recording them as empty client messages would pollute the trail.
      if (!mid || !senderId) continue;
      out.push({
        channel: "messenger",
        providerMessageId: mid,
        senderReference: senderId,
        senderName: null,
        body: event.message?.text ?? null,
        attachment: event.message?.attachments ?? null,
        sentAt: event.timestamp ? new Date(event.timestamp) : null,
      });
    }
  }
  return out;
}

export function parseViberWebhook(payload: unknown): NormalizedInboundMessage[] {
  if (typeof payload !== "object" || payload === null) return [];
  const body = payload as {
    event?: string;
    message_token?: number | string;
    timestamp?: number;
    sender?: { id?: string; name?: string };
    message?: { text?: string; type?: string; media?: string };
  };
  // Viber sends subscribed / unsubscribed / delivered / seen on the same endpoint. Only
  // `message` is client speech.
  if (body.event !== "message" || !body.message_token || !body.sender?.id) return [];
  return [
    {
      channel: "viber",
      providerMessageId: String(body.message_token),
      senderReference: body.sender.id,
      senderName: body.sender.name ?? null,
      body: body.message?.text ?? null,
      attachment: body.message?.media ? { media: body.message.media, type: body.message.type } : null,
      sentAt: body.timestamp ? new Date(body.timestamp) : null,
    },
  ];
}

/**
 * Semaphore posts inbound SMS as a flat form/JSON body. The phone number is normalized
 * here so it can join contact_channel.reference, which is canonical E.164.
 */
export function parseSmsWebhook(payload: unknown): NormalizedInboundMessage[] {
  if (typeof payload !== "object" || payload === null) return [];
  const body = payload as { message_id?: string | number; sender?: string; from?: string; message?: string; timestamp?: string };
  const rawFrom = body.sender ?? body.from;
  if (!rawFrom || !body.message_id) return [];
  const normalized = normalizePhoneNumber(rawFrom);
  // An unrecognisable number is still recorded — under its raw form — because dropping
  // an inbound client message to keep the index tidy is the wrong trade.
  return [
    {
      channel: "sms",
      providerMessageId: String(body.message_id),
      senderReference: normalized ?? rawFrom,
      senderName: null,
      body: body.message ?? null,
      attachment: null,
      sentAt: body.timestamp ? new Date(body.timestamp) : null,
    },
  ];
}
