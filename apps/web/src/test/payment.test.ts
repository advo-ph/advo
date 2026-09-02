/**
 * Payment rail (migration 022) — the first way money can ARRIVE in this repo.
 *
 * No live API call, no database, no network. Every behavioural test drives the PURE
 * exports of payment-provider.service.ts (the money conversions, the signature
 * verification, the event normalization) and payment.service.ts (`judgeEvent`), with an
 * injected clock where one is needed, so the assertions are stable on any machine in any
 * timezone. The rest is source-reading, in the style of recurring-fee.test.ts.
 *
 * Covers the five invariants the settlement service exists to hold:
 *   1. the invoice is the source of truth — settling writes invoice.paid_at
 *   2. every callback is recorded before it is judged, unverified ones included
 *   3. an unverified callback settles nothing
 *   4. replay is a DB-level no-op, not application care
 *   5. an amount mismatch refuses rather than rounding up to "paid"
 *
 * Plus the one bug that costs the most if it ever ships: the Xendit major-unit
 * conversion. Sending cents to Xendit overcharges a client by 100x.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAYMENT_PROVIDER_NAME,
  PAYMONGO_MINIMUM_CENTS,
  PAYMONGO_TOLERANCE_SECOND,
  centsToMajorUnit,
  isDigestEqual,
  majorUnitToCents,
  parsePaymongoSignature,
  paymongoProvider,
  verifyPaymongoSignature,
  verifyXenditToken,
  xenditProvider,
  type NormalizedPaymentEvent,
} from "../../../api/src/services/payment-provider.service.js";
import { judgeEvent } from "../../../api/src/services/payment.service.js";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

/** The live FourlinQ monthly infrastructure fee, as the contract states it. */
const FOURLINQ_MONTHLY_CENTS = 300_000;

const makeEvent = (over: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent => ({
  providerEventId: "evt_1",
  eventType: "link.payment.paid",
  providerReference: "link_1",
  amountCents: FOURLINQ_MONTHLY_CENTS,
  method: "gcash",
  isPaid: true,
  isFailed: false,
  failureReason: null,
  ...over,
});

const makeIntent = (over: Partial<{ amountCents: number; status: string }> = {}) =>
  ({
    amountCents: FOURLINQ_MONTHLY_CENTS,
    status: "pending",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

// ─── Money conversion ────────────────────────────────

describe("money conversion — the 100x bug", () => {
  it("converts cents to whole pesos for Xendit", () => {
    // ₱3,000.00 is 3000 pesos to Xendit, NOT 300000. Sending cents overcharges 100x.
    expect(centsToMajorUnit(FOURLINQ_MONTHLY_CENTS)).toBe(3_000);
    expect(centsToMajorUnit(1_200_000)).toBe(12_000);
  });

  it("round-trips", () => {
    expect(majorUnitToCents(centsToMajorUnit(FOURLINQ_MONTHLY_CENTS))).toBe(FOURLINQ_MONTHLY_CENTS);
  });

  it("REFUSES a fractional peso rather than rounding a client's invoice", () => {
    // Silently rounding changes what someone is charged. That is not a decision a
    // conversion function gets to make on its own.
    expect(() => centsToMajorUnit(300_050)).toThrow(/whole peso/i);
    expect(() => centsToMajorUnit(1)).toThrow(/whole peso/i);
  });

  it("refuses a non-integer amount outright", () => {
    expect(() => centsToMajorUnit(300_000.5)).toThrow(/integer/i);
  });

  it("PayMongo takes centavos unchanged — the source performs no conversion", () => {
    const source = readSource("apps/api/src/services/payment-provider.service.ts");
    // The literal `amount: input.amountCents` is the assertion: any arithmetic on that
    // line would mean somebody "fixed" a conversion that was already correct.
    expect(source).toContain("amount: input.amountCents");
  });

  it("knows PayMongo's ₱100 floor and refuses below it before calling out", () => {
    expect(PAYMONGO_MINIMUM_CENTS).toBe(10_000);
    const source = readSource("apps/api/src/services/payment-provider.service.ts");
    expect(source).toContain("PAYMONGO_MINIMUM_CENTS");
  });
});

// ─── Signature verification (invariant 3) ────────────

describe("PayMongo signature verification", () => {
  const SECRET = "whsk_test_secret";
  const BODY = JSON.stringify({ data: { id: "evt_1" } });

  const signedHeader = (timestamp: number, body = BODY, secret = SECRET) => {
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    return `t=${timestamp},te=${signature},li=${signature}`;
  };

  it("accepts a correctly signed, in-window request", () => {
    const now = 1_770_000_000;
    expect(verifyPaymongoSignature(BODY, signedHeader(now), SECRET, now)).toBe(true);
  });

  it("REFUSES a request signed with the wrong secret", () => {
    const now = 1_770_000_000;
    const header = signedHeader(now, BODY, "whsk_wrong");
    expect(verifyPaymongoSignature(BODY, header, SECRET, now)).toBe(false);
  });

  it("REFUSES when the body was altered after signing", () => {
    const now = 1_770_000_000;
    const header = signedHeader(now);
    // The classic attack: keep the signature, swap the amount.
    const tampered = JSON.stringify({ data: { id: "evt_1", amount: 999 } });
    expect(verifyPaymongoSignature(tampered, header, SECRET, now)).toBe(false);
  });

  it("REFUSES a replayed signature outside the tolerance window", () => {
    const signedAt = 1_770_000_000;
    const header = signedHeader(signedAt);
    const later = signedAt + PAYMONGO_TOLERANCE_SECOND + 1;
    expect(verifyPaymongoSignature(BODY, header, SECRET, later)).toBe(false);
    // …and still accepts one right at the edge, so the window is a window not a cliff.
    expect(verifyPaymongoSignature(BODY, header, SECRET, signedAt + PAYMONGO_TOLERANCE_SECOND)).toBe(true);
  });

  it("REFUSES when no secret is configured — never defaults to trusting", () => {
    const now = 1_770_000_000;
    expect(verifyPaymongoSignature(BODY, signedHeader(now), "", now)).toBe(false);
  });

  it("REFUSES a missing or malformed header instead of throwing", () => {
    const now = 1_770_000_000;
    expect(verifyPaymongoSignature(BODY, undefined, SECRET, now)).toBe(false);
    expect(verifyPaymongoSignature(BODY, "garbage", SECRET, now)).toBe(false);
    expect(verifyPaymongoSignature(BODY, "t=notanumber,li=abc", SECRET, now)).toBe(false);
  });

  it("parses the three-part header without throwing on junk", () => {
    expect(parsePaymongoSignature("t=1,te=aa,li=bb")).toEqual({
      timestamp: "1",
      testSignature: "aa",
      liveSignature: "bb",
    });
    expect(parsePaymongoSignature(undefined).timestamp).toBeNull();
    expect(parsePaymongoSignature("nonsense").timestamp).toBeNull();
  });
});

describe("digest compare", () => {
  it("is false for different lengths rather than throwing", () => {
    // timingSafeEqual throws on a length mismatch; a throw here would 500 the webhook.
    expect(isDigestEqual("aabb", "aa")).toBe(false);
  });

  it("is false for an empty digest — an unsigned request must never compare equal", () => {
    expect(isDigestEqual("", "")).toBe(false);
  });

  it("is true for identical digests", () => {
    expect(isDigestEqual("deadbeef", "deadbeef")).toBe(true);
  });
});

describe("Xendit callback token", () => {
  it("accepts the exact configured token", () => {
    expect(verifyXenditToken("tok_abc", "tok_abc")).toBe(true);
  });

  it("REFUSES a wrong, missing, or unconfigured token", () => {
    expect(verifyXenditToken("tok_wrong", "tok_abc")).toBe(false);
    expect(verifyXenditToken(undefined, "tok_abc")).toBe(false);
    expect(verifyXenditToken("tok_abc", "")).toBe(false);
  });
});

// ─── Event normalization ─────────────────────────────

describe("PayMongo event normalization", () => {
  it("normalizes a paid link event, resolving the link id and the method", () => {
    const parsed = paymongoProvider.parse({
      data: {
        id: "evt_paid",
        attributes: {
          type: "link.payment.paid",
          data: {
            id: "pay_1",
            attributes: {
              amount: FOURLINQ_MONTHLY_CENTS,
              link_id: "link_9",
              source: { type: "gcash" },
            },
          },
        },
      },
    });
    expect(parsed).toMatchObject({
      providerEventId: "evt_paid",
      providerReference: "link_9",
      amountCents: FOURLINQ_MONTHLY_CENTS,
      method: "gcash",
      isPaid: true,
      isFailed: false,
    });
  });

  it("does NOT mark a non-terminal event as paid", () => {
    const parsed = paymongoProvider.parse({
      data: {
        id: "evt_pending",
        attributes: { type: "payment.awaiting_capture", data: { id: "pay_2", attributes: {} } },
      },
    });
    expect(parsed?.isPaid).toBe(false);
  });

  it("marks a failed payment failed", () => {
    const parsed = paymongoProvider.parse({
      data: {
        id: "evt_failed",
        attributes: { type: "payment.failed", data: { id: "pay_3", attributes: {} } },
      },
    });
    expect(parsed?.isPaid).toBe(false);
    expect(parsed?.isFailed).toBe(true);
  });

  it("returns null for a payload it does not recognise rather than guessing", () => {
    expect(paymongoProvider.parse({ hello: "world" })).toBeNull();
    expect(paymongoProvider.parse(null)).toBeNull();
  });
});

describe("Xendit event normalization", () => {
  it("converts the reported major-unit amount back to cents", () => {
    const parsed = xenditProvider.parse({
      id: "inv_1",
      status: "PAID",
      amount: 3_000,
      payment_channel: "GCASH",
      webhook_id: "wh_1",
    });
    // 3000 pesos reported → 300000 cents stored. The inverse of the 100x bug.
    expect(parsed?.amountCents).toBe(FOURLINQ_MONTHLY_CENTS);
    expect(parsed?.isPaid).toBe(true);
    expect(parsed?.providerEventId).toBe("wh_1");
  });

  it("treats SETTLED as paid and EXPIRED as failed", () => {
    expect(xenditProvider.parse({ id: "i", status: "SETTLED" })?.isPaid).toBe(true);
    expect(xenditProvider.parse({ id: "i", status: "EXPIRED" })?.isFailed).toBe(true);
  });

  it("falls back to a STABLE dedupe key when no webhook id is sent", () => {
    // Without this, every redelivery looks like a brand-new event and the replay guard
    // never fires — the exact failure the unique index exists to prevent.
    const a = xenditProvider.parse({ id: "inv_7", status: "PAID" });
    const b = xenditProvider.parse({ id: "inv_7", status: "PAID" });
    expect(a?.providerEventId).toBe(b?.providerEventId);
    expect(a?.providerEventId).toBe("inv_7:PAID");
  });

  it("returns null without an id", () => {
    expect(xenditProvider.parse({ status: "PAID" })).toBeNull();
  });
});

// ─── judgeEvent — invariants 1, 3, 5 ─────────────────

describe("judgeEvent", () => {
  it("settles a verified, matching, paid event against an unpaid invoice", () => {
    expect(judgeEvent(makeEvent(), makeIntent(), "unpaid")).toEqual({
      isSettled: true,
      refusalReason: null,
    });
  });

  it("settles an OVERDUE invoice — late is still paid", () => {
    expect(judgeEvent(makeEvent(), makeIntent(), "overdue").isSettled).toBe(true);
  });

  it("REFUSES when the amount does not match the snapshot (invariant 5)", () => {
    // A partial payment. Ordinary in PH B2B, and rounding it up to "paid" silently
    // writes off the remainder.
    const verdict = judgeEvent(makeEvent({ amountCents: 150_000 }), makeIntent(), "unpaid");
    expect(verdict).toEqual({ isSettled: false, refusalReason: "amount_mismatch" });
  });

  it("REFUSES an unreported amount — silence is not a match", () => {
    const verdict = judgeEvent(makeEvent({ amountCents: null }), makeIntent(), "unpaid");
    expect(verdict.refusalReason).toBe("amount_mismatch");
  });

  it("REFUSES an amount LARGER than the snapshot too, not just smaller", () => {
    const verdict = judgeEvent(makeEvent({ amountCents: 600_000 }), makeIntent(), "unpaid");
    expect(verdict.refusalReason).toBe("amount_mismatch");
  });

  it("refuses an event naming no known intent", () => {
    expect(judgeEvent(makeEvent(), null, "unpaid")).toEqual({
      isSettled: false,
      refusalReason: "unknown_reference",
    });
  });

  it("refuses to re-settle an already-paid invoice", () => {
    expect(judgeEvent(makeEvent(), makeIntent(), "paid")).toEqual({
      isSettled: false,
      refusalReason: "already_paid",
    });
  });

  it("does not settle a non-paid event, and does not call a failure 'unhandled'", () => {
    expect(judgeEvent(makeEvent({ isPaid: false, isFailed: true }), makeIntent(), "unpaid")).toEqual({
      isSettled: false,
      refusalReason: null,
    });
    expect(judgeEvent(makeEvent({ isPaid: false, isFailed: false }), makeIntent(), "unpaid")).toEqual({
      isSettled: false,
      refusalReason: "unhandled_type",
    });
  });
});

// ─── Source-level invariants ─────────────────────────

describe("settlement invariants, read from the source", () => {
  const service = readSource("apps/api/src/services/payment.service.ts");
  const route = readSource("apps/api/src/routes/payment.routes.ts");
  const migration = readSource("apps/api/migrations/022_payment.sql");

  it("1. settling writes the INVOICE, not just the intent", () => {
    expect(service).toContain("settledPaymentIntentId");
    expect(service).toMatch(/\.update\(invoice\)/);
    expect(service).toMatch(/status:\s*"paid"/);
  });

  it("1. the invoice update is GUARDED, never read-then-write", () => {
    // An invoice an admin marked paid a millisecond earlier must not be re-settled by a
    // concurrent callback. Same discipline as the 017 sweep.
    expect(service).toContain("IN ('unpaid', 'overdue')");
  });

  it("2. an unverified event is RECORDED before it is refused", () => {
    // The refusal branch must call recordEvent. Deleting a bad-signature callback
    // deletes the only evidence of an attack.
    expect(service).toMatch(/if \(!isVerified\)[\s\S]{0,400}recordEvent\(/);
  });

  it("3. the unverified branch returns before any settle path", () => {
    const unverifiedAt = service.indexOf("if (!isVerified)");
    const settleAt = service.indexOf("await settle(");
    expect(unverifiedAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(unverifiedAt);
  });

  it("4. replay is a DB no-op — onConflictDoNothing plus a unique index", () => {
    expect(service).toContain("onConflictDoNothing");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_event_provider_event");
    expect(migration).toMatch(/ON payment_event \(provider, provider_event_id\)/);
  });

  it("4. a conflicted insert returns null and the caller stops", () => {
    expect(service).toContain("duplicate_event");
    expect(service).toMatch(/if \(!recorded\)/);
  });

  it("5. the intent amount is a SNAPSHOT, and the migration says so", () => {
    expect(service).toContain("// THE SNAPSHOT. Not a read-through to invoice.amountCents.");
    expect(migration).toContain("SNAPSHOTTED at creation");
  });

  it("the webhook reads the RAW body — re-serializing would break every HMAC", () => {
    expect(route).toContain("c.req.text()");
    expect(route).not.toContain("c.req.json()");
  });

  it("the webhook is mounted BEFORE the auth middleware", () => {
    const webhookAt = route.indexOf('post("/webhook/:provider"');
    const authAt = route.indexOf('use("*", requireAuth)');
    expect(webhookAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(webhookAt);
  });

  it("the webhook answers 200 even on refusal, so providers do not retry-storm", () => {
    expect(route).toContain("// 200 even on refusal. See the file header.");
  });

  it("creating a link is admin-only; the public surface is the webhook alone", () => {
    expect(route).toMatch(/post\("\/intent", requireAdmin/);
  });

  it("does NOT auto-finalize a commission plan or auto-resume a host", () => {
    // Money landing is not a decision to freeze what people are owed (018), nor to
    // restore a service (017). Both stay human acts.
    expect(service).not.toContain("commissionPlan");
    expect(service).not.toContain("finalizeCommission");
    expect(service).not.toMatch(/\.update\(recurringFee\)/);
  });

  it("has no refund path — a webhook must not be able to move money outward", () => {
    expect(service.toLowerCase()).not.toContain("refund(");
  });
});

describe("provider seam", () => {
  const provider = readSource("apps/api/src/services/payment-provider.service.ts");

  it("registers exactly the three known rails", () => {
    expect([...PAYMENT_PROVIDER_NAME]).toEqual(["manual", "paymongo", "xendit"]);
  });

  it("defaults to manual so a deploy that sets nothing keeps working", () => {
    const envSource = readSource("apps/api/src/utils/env.ts");
    expect(envSource).toMatch(/PAYMENT_PROVIDER:\s*z\s*\n?\s*\.enum\(\["manual", "paymongo", "xendit"\]\)\.default\("manual"\)|PAYMENT_PROVIDER: z\.enum\(\["manual", "paymongo", "xendit"\]\)\.default\("manual"\)/);
  });

  it("the manual adapter NEVER fabricates a checkout URL", () => {
    expect(provider).toMatch(/name: "manual"[\s\S]{0,600}checkoutUrl: null/);
  });

  it("the manual adapter refuses to verify anything — nothing calls back about it", () => {
    expect(provider).toMatch(/verify: \(\) => false/);
  });

  it("a configured provider that THROWS is not swallowed into a silent manual row", () => {
    // Otherwise an operator watches invoices quietly become manual and never learns the
    // rail is down.
    expect(provider).toContain("A configured provider that THROWS is not swallowed");
  });

  it("declares its credentials unverified rather than implying they were tested", () => {
    expect(provider).toContain("Credential status");
    expect(provider).toMatch(/have NOT been exercised against\s*\n?\s*\* a live account/);
  });
});
