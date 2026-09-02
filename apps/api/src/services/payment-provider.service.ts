/**
 * Payment provider seam — who turns an invoice into something a client can pay.
 *
 * Same shape as preview-host.service.ts, and for the same reason: the virtue this
 * codebase keeps claiming is portability, and portability only survives if there is a
 * named seam with more than one adapter behind it. PayMongo is blocked on merchant
 * review; if collection is wired directly to PayMongo, the review delay holds the entire
 * revenue tier hostage. Two adapters, one env var apart, is the fix.
 *
 * Three adapters:
 *
 *   manual    Today's behaviour, written down. Records the collectable and returns NO
 *             checkout URL. A GCash or bank transfer settled by hand still leaves an
 *             audit trail. It NEVER fabricates a link — an adapter that returns a URL
 *             nobody can pay is worse than one that admits it has none.
 *   paymongo  The intended primary. Cards + GCash + Maya + GrabPay, PH-domiciled,
 *             settles to a PH bank account.
 *   xendit    The second rail. Same tables, same seam.
 *
 * PAYMENT_PROVIDER selects between them and DEFAULTS to manual, so a deploy that sets
 * nothing behaves exactly as the business does today. A provider that is NAMED but not
 * CONFIGURED falls back to manual and says so in `detail` rather than throwing — prod
 * must not lose the ability to record a payment because a key is missing.
 *
 * ─── The two money conversions, written down because they are the classic bug ───
 *
 * This repo stores CENTS everywhere (₱3,000.00 = 300000). The two providers disagree:
 *
 *   PayMongo takes CENTAVOS — the same integer we store. No conversion. Its documented
 *   floor is 10000 (₱100.00), enforced here so a sub-floor link fails locally with a
 *   readable message instead of a 400 from Manila.
 *
 *   Xendit takes MAJOR UNITS for PHP — 300000 cents is `3000`, not `300000`. Sending
 *   cents to Xendit overcharges a client by 100x. The conversion is a named function
 *   with its own test for exactly that reason, and it REFUSES a fractional peso rather
 *   than rounding, because silently rounding someone's invoice is not a thing software
 *   should do on its own.
 *
 * ─── Credential status ─────────────────────────────────────────────────────────
 *
 * Neither PAYMONGO_SECRET_KEY nor XENDIT_SECRET_KEY exists on this machine or in prod as
 * of 2026-09-02, and PayMongo merchant review is still open. Both request shapes below
 * are written to the providers' documented contracts and have NOT been exercised against
 * a live account. Treat `paymongoCreate` and `xenditCreate` as unverified until someone
 * runs them with a real key — the same honesty preview-host.service.ts carries about
 * here.now. Everything else in this file (signature verification, event normalization,
 * the amount conversions) is pure and IS covered by payment.test.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("payment-provider");

export const PAYMENT_PROVIDER_NAME = ["manual", "paymongo", "xendit"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDER_NAME)[number];

/** PayMongo's documented minimum charge, in centavos (₱100.00). */
export const PAYMONGO_MINIMUM_CENTS = 10_000;

const PAYMONGO_API = "https://api.paymongo.com/v1";
const XENDIT_API = "https://api.xendit.co/v2";

// ─── Types ───────────────────────────────────────────

export interface CollectableInput {
  invoiceId: number;
  /** Integer CENTS, snapshotted by the caller. Never a float. */
  amountCents: number;
  currency: string;
  /** Shown to the payer on the provider's checkout page. */
  description: string;
  payerEmail?: string | null;
  payerName?: string | null;
  /** Where the provider returns the payer after a successful payment. */
  successUrl?: string | null;
}

export interface CollectableResult {
  /** Which adapter actually answered — after any fallback. */
  provider: PaymentProviderName;
  /** The provider's own id for this collectable. Null for manual. */
  providerReference: string | null;
  /** Where the client pays. Null for manual — never a fabricated URL. */
  checkoutUrl: string | null;
  expiresAt: Date | null;
  /** True when a provider was requested but manual answered instead. */
  fellBack: boolean;
  /** Operator-readable account of what happened, surfaced in the API response. */
  detail: string;
}

/**
 * One provider callback, reduced to the vocabulary this repo settles on. Every adapter
 * returns this shape so payment.service.ts never learns a provider's field names.
 */
export interface NormalizedPaymentEvent {
  /** The provider's event id. Half of the replay guard. */
  providerEventId: string;
  eventType: string;
  /** The collectable this refers to — joined against payment_intent.provider_reference. */
  providerReference: string | null;
  /** In CENTS, converted back from whatever the provider speaks. Null when unreported. */
  amountCents: number | null;
  /** gcash | maya | card | grab_pay | bank_transfer | … as the provider names it. */
  method: string | null;
  /** True only for a terminal success. A "pending" or "awaiting capture" is not paid. */
  isPaid: boolean;
  /** True for a terminal failure/expiry. Neither flag set = an event we do not act on. */
  isFailed: boolean;
  failureReason: string | null;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  /** Whether this adapter has everything it needs to reach the provider. */
  isConfigured: () => boolean;
  /** Returns null when this adapter cannot answer; the caller degrades to manual. */
  create: (input: CollectableInput) => Promise<CollectableResult | null>;
  /**
   * Whether this request genuinely came from the provider. Pure, synchronous, and
   * constant-time where it compares a digest. A false return must never settle anything.
   */
  verify: (rawBody: string, header: Record<string, string>) => boolean;
  /** Null when the payload is not one this adapter recognises. */
  parse: (payload: unknown) => NormalizedPaymentEvent | null;
}

// ─── Money conversions ───────────────────────────────

/**
 * Cents → the major currency unit Xendit expects for PHP. 300000 → 3000.
 *
 * Throws rather than rounds. A fractional peso reaching this function means an invoice
 * carries centavos that Xendit cannot represent, and quietly rounding it changes what a
 * client is charged — a decision no function gets to make by itself.
 */
export function centsToMajorUnit(amountCents: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`amountCents must be an integer, got ${amountCents}`);
  }
  if (amountCents % 100 !== 0) {
    throw new Error(
      `Xendit bills PHP in whole pesos and ${amountCents} centavos is not a whole peso. ` +
        `Refusing to round a client's invoice — adjust the invoice or use PayMongo.`,
    );
  }
  return amountCents / 100;
}

/** The major currency unit back to cents. 3000 → 300000. */
export function majorUnitToCents(amount: number): number {
  return Math.round(amount * 100);
}

// ─── Signature helpers ───────────────────────────────

/**
 * Constant-time compare of two hex digests. `timingSafeEqual` throws on a length
 * mismatch, which is itself a timing leak of sorts, so the length check happens first
 * and returns the same false a mismatch would.
 */
export function isDigestEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Parse PayMongo's `Paymongo-Signature: t=<unix>,te=<test>,li=<live>` header.
 * Returns nulls rather than throwing — a malformed header is an unverified request,
 * not a 500.
 */
export function parsePaymongoSignature(header: string | undefined): {
  timestamp: string | null;
  testSignature: string | null;
  liveSignature: string | null;
} {
  const out = { timestamp: null as string | null, testSignature: null as string | null, liveSignature: null as string | null };
  if (!header) return out;
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    if (key.trim() === "t") out.timestamp = value.trim();
    if (key.trim() === "te") out.testSignature = value.trim();
    if (key.trim() === "li") out.liveSignature = value.trim();
  }
  return out;
}

/**
 * PayMongo signs `${timestamp}.${rawBody}` with HMAC-SHA256 under the webhook secret.
 *
 * The timestamp is checked against a tolerance window, which is what stops a signature
 * captured off the wire from being replayed forever. The DB's unique
 * (provider, provider_event_id) stops a duplicate; this stops an ancient one.
 */
export const PAYMONGO_TOLERANCE_SECOND = 300;

export function verifyPaymongoSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSecond: number = Math.floor(Date.now() / 1000),
): boolean {
  const { timestamp, testSignature, liveSignature } = parsePaymongoSignature(header);
  if (!timestamp || !secret) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(nowSecond - sent) > PAYMONGO_TOLERANCE_SECOND) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  // Live keys sign `li`, test keys sign `te`. Accepting either lets a staging box use a
  // test key without a second code path; the key itself decides which one is present.
  return (
    (!!liveSignature && isDigestEqual(expected, liveSignature)) ||
    (!!testSignature && isDigestEqual(expected, testSignature))
  );
}

/**
 * Xendit does not sign — it echoes a static callback token in `x-callback-token`. Weaker
 * than an HMAC (no body binding, no replay window), which is why the event ledger and
 * the amount check carry more of the weight on this rail.
 */
export function verifyXenditToken(header: string | undefined, expected: string): boolean {
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── manual ──────────────────────────────────────────

export const manualProvider: PaymentProvider = {
  name: "manual",
  isConfigured: () => true,
  async create(input) {
    return {
      provider: "manual",
      providerReference: null,
      checkoutUrl: null,
      expiresAt: null,
      fellBack: false,
      detail:
        `Recorded a manual collectable for ${(input.amountCents / 100).toFixed(2)} ${input.currency}. ` +
        `No checkout URL: collect out-of-band (bank transfer / GCash) and settle it from admin.`,
    };
  },
  // A manual intent has no provider, so nothing can legitimately call back about it.
  verify: () => false,
  parse: () => null,
};

// ─── paymongo ────────────────────────────────────────

function paymongoAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export const paymongoProvider: PaymentProvider = {
  name: "paymongo",
  isConfigured: () => !!env().PAYMONGO_SECRET_KEY,

  async create(input) {
    const e = env();
    if (!e.PAYMONGO_SECRET_KEY) return null;

    if (input.amountCents < PAYMONGO_MINIMUM_CENTS) {
      // Caught here so the operator reads a sentence instead of a provider 400.
      throw new Error(
        `PayMongo will not accept ${input.amountCents} centavos — its minimum is ` +
          `${PAYMONGO_MINIMUM_CENTS} (₱100.00). Use the manual rail for this invoice.`,
      );
    }

    const res = await fetch(`${PAYMONGO_API}/links`, {
      method: "POST",
      headers: {
        Authorization: paymongoAuthHeader(e.PAYMONGO_SECRET_KEY),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            // PayMongo speaks CENTAVOS — the same integer we store. No conversion.
            amount: input.amountCents,
            description: input.description,
            remarks: `ADVO invoice #${input.invoiceId}`,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PayMongo link create failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
    };
    const reference = json.data?.id ?? null;
    const checkoutUrl = json.data?.attributes?.checkout_url ?? null;
    if (!reference || !checkoutUrl) {
      throw new Error("PayMongo returned no link id or checkout_url — refusing to record a half-made intent.");
    }

    return {
      provider: "paymongo",
      providerReference: reference,
      checkoutUrl,
      // PayMongo links do not expire by default; a null here is the truth, not a gap.
      expiresAt: null,
      fellBack: false,
      detail: `PayMongo link ${reference} created.`,
    };
  },

  verify(rawBody, header) {
    const secret = env().PAYMONGO_WEBHOOK_SECRET;
    if (!secret) return false;
    return verifyPaymongoSignature(rawBody, header["paymongo-signature"], secret);
  },

  parse(payload) {
    // A null / non-object body would throw on the first property read and 500 the
    // webhook. A provider that sends us garbage gets a refusal, not a stack trace.
    if (typeof payload !== "object" || payload === null) return null;
    const body = payload as {
      data?: {
        id?: string;
        attributes?: {
          type?: string;
          data?: {
            id?: string;
            attributes?: Record<string, unknown>;
          };
        };
      };
    };
    const providerEventId = body.data?.id;
    const eventType = body.data?.attributes?.type;
    if (!providerEventId || !eventType) return null;

    const resource = body.data?.attributes?.data;
    const attribute = (resource?.attributes ?? {}) as Record<string, unknown>;

    // A payment event nests the link it belongs to; a link event IS the link.
    const linkId =
      (attribute["link_id"] as string | undefined) ??
      (eventType.startsWith("link.") ? resource?.id : undefined) ??
      null;

    const amount = attribute["amount"];
    const status = attribute["status"] as string | undefined;

    // `link.payment.paid` and `payment.paid` are the two terminal successes PayMongo
    // sends. Anything else — including `payment.failed`'s pending retries — is not paid.
    const isPaid = eventType === "link.payment.paid" || eventType === "payment.paid";
    const isFailed = eventType === "payment.failed" || status === "failed";

    return {
      providerEventId,
      eventType,
      providerReference: linkId,
      amountCents: typeof amount === "number" ? amount : null,
      method: (attribute["source"] as { type?: string } | undefined)?.type ?? null,
      isPaid,
      isFailed,
      failureReason: isFailed ? ((attribute["last_payment_error"] as string | undefined) ?? "payment.failed") : null,
    };
  },
};

// ─── xendit ──────────────────────────────────────────

export const xenditProvider: PaymentProvider = {
  name: "xendit",
  isConfigured: () => !!env().XENDIT_SECRET_KEY,

  async create(input) {
    const e = env();
    if (!e.XENDIT_SECRET_KEY) return null;

    // Throws on a fractional peso rather than rounding. See centsToMajorUnit.
    const amount = centsToMajorUnit(input.amountCents);

    const res = await fetch(`${XENDIT_API}/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${e.XENDIT_SECRET_KEY}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Our invoice id is the external id, so a callback that lost its reference can
        // still be traced back by a human reading the Xendit dashboard.
        external_id: `advo-invoice-${input.invoiceId}`,
        amount,
        currency: input.currency,
        description: input.description,
        payer_email: input.payerEmail ?? undefined,
        success_redirect_url: input.successUrl ?? undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Xendit invoice create failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as { id?: string; invoice_url?: string; expiry_date?: string };
    if (!json.id || !json.invoice_url) {
      throw new Error("Xendit returned no id or invoice_url — refusing to record a half-made intent.");
    }

    return {
      provider: "xendit",
      providerReference: json.id,
      checkoutUrl: json.invoice_url,
      expiresAt: json.expiry_date ? new Date(json.expiry_date) : null,
      fellBack: false,
      detail: `Xendit invoice ${json.id} created.`,
    };
  },

  verify(_rawBody, header) {
    const token = env().XENDIT_CALLBACK_TOKEN;
    if (!token) return false;
    return verifyXenditToken(header["x-callback-token"], token);
  },

  parse(payload) {
    // Same guard as the PayMongo adapter: garbage in, refusal out, never a 500.
    if (typeof payload !== "object" || payload === null) return null;
    const body = payload as {
      id?: string;
      external_id?: string;
      status?: string;
      amount?: number;
      payment_method?: string;
      payment_channel?: string;
      failure_code?: string;
      /** Xendit sends its event id in the body for v2 invoice callbacks. */
      webhook_id?: string;
    };
    if (!body.id) return null;

    const status = (body.status ?? "").toUpperCase();
    return {
      // Falls back to the invoice id + status so a callback without a webhook_id still
      // dedupes on something stable rather than being treated as forever-new.
      providerEventId: body.webhook_id ?? `${body.id}:${status}`,
      eventType: `invoice.${status.toLowerCase() || "unknown"}`,
      providerReference: body.id,
      amountCents: typeof body.amount === "number" ? majorUnitToCents(body.amount) : null,
      method: body.payment_channel ?? body.payment_method ?? null,
      isPaid: status === "PAID" || status === "SETTLED",
      isFailed: status === "EXPIRED" || status === "FAILED",
      failureReason: body.failure_code ?? (status === "EXPIRED" ? "invoice expired" : null),
    };
  },
};

// ─── Registry + selection ────────────────────────────

const REGISTRY: Record<PaymentProviderName, PaymentProvider> = {
  manual: manualProvider,
  paymongo: paymongoProvider,
  xendit: xenditProvider,
};

export function providerBy(name: PaymentProviderName): PaymentProvider {
  return REGISTRY[name];
}

/** Which adapter PAYMENT_PROVIDER names. Not necessarily the one that will answer. */
export function selectedProviderName(): PaymentProviderName {
  return env().PAYMENT_PROVIDER;
}

/**
 * Create a collectable through the selected provider, degrading to manual when that
 * provider is named but unconfigured.
 *
 * A configured provider that THROWS is not swallowed — a PayMongo 500 must surface, or
 * an operator watches invoices silently become manual rows and never learns the rail is
 * down. Only the "named but no credential" case falls back, and it says so.
 */
export async function createCollectable(input: CollectableInput): Promise<CollectableResult> {
  const name = selectedProviderName();
  const provider = providerBy(name);

  if (name === "manual") return (await manualProvider.create(input))!;

  if (!provider.isConfigured()) {
    const result = (await manualProvider.create(input))!;
    const detail =
      `PAYMENT_PROVIDER=${name} but no credential is set, so the manual rail answered. ` +
      result.detail;
    log.warn({ provider: name, invoiceId: input.invoiceId }, "payment provider unconfigured — fell back to manual");
    return { ...result, fellBack: true, detail };
  }

  const result = await provider.create(input);
  if (result) return result;

  // isConfigured() said yes and create() still declined. Treat as a fallback rather than
  // an error, but record which adapter changed its mind.
  const manual = (await manualProvider.create(input))!;
  return {
    ...manual,
    fellBack: true,
    detail: `${name} declined to create a collectable. ${manual.detail}`,
  };
}
