/**
 * ESP bounce webhook — the pure half, tested with a signature the test computes itself.
 *
 * WHAT THIS PROTECTS. `POST /api/campaign/esp-webhook` is mounted ABOVE the team-auth
 * line because Resend has no session. The Svix signature is therefore the only thing
 * between the open internet and the suppression list, so the verifier is exercised the
 * way an attacker would: wrong secret, replayed (stale) timestamp, tampered body. The
 * rotation case (two signatures in one header) is covered so a secret rotation does not
 * silently start refusing every bounce.
 *
 * The translation is covered separately: the internal `{ email, kind }` shape is what
 * feeds recordSoftBounce / recordDeliveryFailure, and mapping "undetermined" to a HARD
 * bounce would suppress real addresses on their first report.
 */
import { describe, it, expect } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import {
  signSvix,
  translateResendEvent,
  verifySvixSignature,
} from "../../../api/src/services/esp-webhook.service.js";

const secretByte = randomBytes(24);
const secret = `whsec_${secretByte.toString("base64")}`;
const otherSecret = `whsec_${randomBytes(24).toString("base64")}`;

const id = "msg_2Xb5ZfF3k";
const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.com"] } });
const now = 1_760_000_000;
const timestamp = String(now);

/** Computed by hand here, independently of signSvix, so the two cannot agree by accident. */
const handSignature = `v1,${createHmac("sha256", secretByte).update(`${id}.${timestamp}.${body}`).digest("base64")}`;

describe("verifySvixSignature", () => {
  it("accepts a signature computed with the shared secret", () => {
    expect(signSvix(id, timestamp, body, secret)).toBe(handSignature);
    const verdict = verifySvixSignature({ id, timestamp, signature: handSignature }, body, secret, now);
    expect(verdict).toEqual({ isValid: true });
  });

  it("rejects a signature made with a different secret", () => {
    const forged = signSvix(id, timestamp, body, otherSecret);
    const verdict = verifySvixSignature({ id, timestamp, signature: forged }, body, secret, now);
    expect(verdict).toEqual({ isValid: false, reason: "no_match" });
  });

  it("rejects a valid signature over a body that was then tampered with", () => {
    const tampered = body.replace("a@example.com", "victim@example.com");
    const verdict = verifySvixSignature({ id, timestamp, signature: handSignature }, tampered, secret, now);
    expect(verdict.isValid).toBe(false);
  });

  it("rejects a timestamp more than five minutes away from now", () => {
    const stale = String(now - 6 * 60);
    const signature = signSvix(id, stale, body, secret);
    const verdict = verifySvixSignature({ id, timestamp: stale, signature }, body, secret, now);
    expect(verdict).toEqual({ isValid: false, reason: "stale_timestamp" });

    // Symmetric: a clock skewed into the future is refused too.
    const future = String(now + 6 * 60);
    const futureSignature = signSvix(id, future, body, secret);
    expect(verifySvixSignature({ id, timestamp: future, signature: futureSignature }, body, secret, now).isValid).toBe(false);
  });

  it("accepts a multi-signature header when any entry matches (secret rotation)", () => {
    const rotated = `${signSvix(id, timestamp, body, otherSecret)} ${handSignature}`;
    const verdict = verifySvixSignature({ id, timestamp, signature: rotated }, body, secret, now);
    expect(verdict).toEqual({ isValid: true });
  });

  it("refuses when a header is missing rather than treating it as empty", () => {
    const verdict = verifySvixSignature({ id, timestamp, signature: undefined }, body, secret, now);
    expect(verdict).toEqual({ isValid: false, reason: "missing_header" });
  });
});

describe("translateResendEvent", () => {
  it("maps a hard / permanent bounce to hard_bounce", () => {
    expect(
      translateResendEvent({ type: "email.bounced", data: { to: ["a@example.com"], bounce: { type: "hard" } } }),
    ).toEqual({ email: "a@example.com", kind: "hard_bounce" });
    expect(
      translateResendEvent({ type: "email.bounced", data: { to: ["a@example.com"], bounce: { type: "Permanent" } } }),
    ).toEqual({ email: "a@example.com", kind: "hard_bounce" });
  });

  it("maps a soft / transient / undetermined bounce to soft_bounce", () => {
    for (const type of ["soft", "transient", "undetermined"]) {
      expect(
        translateResendEvent({ type: "email.bounced", data: { to: ["a@example.com"], bounce: { type } } }),
      ).toEqual({ email: "a@example.com", kind: "soft_bounce" });
    }
  });

  it("maps a complaint to complaint", () => {
    expect(translateResendEvent({ type: "email.complained", data: { to: ["a@example.com"] } })).toEqual({
      email: "a@example.com",
      kind: "complaint",
    });
  });

  it("returns null for any other event, and for a bounce without an address", () => {
    expect(translateResendEvent({ type: "email.delivered", data: { to: ["a@example.com"] } })).toBeNull();
    expect(translateResendEvent({ type: "email.opened", data: { to: ["a@example.com"] } })).toBeNull();
    expect(translateResendEvent({ type: "email.bounced", data: { to: [] } })).toBeNull();
    expect(translateResendEvent(null)).toBeNull();
    expect(translateResendEvent("email.bounced")).toBeNull();
  });
});
