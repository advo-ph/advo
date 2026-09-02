/**
 * Message channels (migration 023) — SMS / Viber / Messenger, in and out.
 *
 * No live API call, no database, no network. Every behavioural test drives the PURE
 * exports of message-channel.service.ts — E.164 normalization, the consent verdict,
 * signature verification, the inbound normalizers. The rest is source-reading, in the
 * style of recurring-fee.test.ts and payment.test.ts.
 *
 * Covers the four properties the persistence layer exists to hold:
 *   1. nothing is sent without recorded consent, and the check runs BEFORE any provider
 *   2. a refusal is not a failure — two statuses, because they need different responses
 *   3. every attempt leaves a row, including the ones that never left the building
 *   4. inbound replay is a DB no-op, not application care
 *
 * Plus the two normalization bugs that would be worst in production: a PH number stored
 * in five shapes (which splits one person's consent across several rows), and a Messenger
 * batch parser that reads only the first event (which silently drops client messages).
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MESSAGE_CHANNEL,
  OUTBOUND_STATUS,
  judgeConsent,
  normalizePhoneNumber,
  parseMessengerWebhook,
  parseSmsWebhook,
  parseViberWebhook,
  verifyMessengerSignature,
  verifyViberSignature,
} from "../../../api/src/services/message-channel.service.js";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const readSource = (path: string) => readFileSync(join(monorepoRoot, path), "utf-8");

// ─── E.164 normalization ─────────────────────────────

describe("PH phone normalization", () => {
  it("normalizes every shape a PH mobile actually arrives in to one canonical form", () => {
    // The same person must not occupy several contact_channel rows with several consent
    // states — at send time there would be no correct way to pick one.
    const expected = "+639171234567";
    expect(normalizePhoneNumber("09171234567")).toBe(expected);
    expect(normalizePhoneNumber("+639171234567")).toBe(expected);
    expect(normalizePhoneNumber("639171234567")).toBe(expected);
    expect(normalizePhoneNumber("9171234567")).toBe(expected);
  });

  it("strips the formatting people actually type", () => {
    expect(normalizePhoneNumber("0917 123 4567")).toBe("+639171234567");
    expect(normalizePhoneNumber("+63 917-123-4567")).toBe("+639171234567");
    expect(normalizePhoneNumber("(0917) 123-4567")).toBe("+639171234567");
  });

  it("returns null rather than guessing — a wrong number is a message to a stranger", () => {
    expect(normalizePhoneNumber("12345")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("not a phone")).toBeNull();
    // A landline, not a mobile. SMS to it goes nowhere.
    expect(normalizePhoneNumber("0288123456")).toBeNull();
    // A US number. Plausible-looking and completely wrong.
    expect(normalizePhoneNumber("+14155551234")).toBeNull();
  });

  it("is idempotent — normalizing an already-normal number changes nothing", () => {
    const once = normalizePhoneNumber("09171234567")!;
    expect(normalizePhoneNumber(once)).toBe(once);
  });
});

// ─── Consent gate (invariant 1) ──────────────────────

describe("consent gate", () => {
  it("allows a channel with recorded consent", () => {
    expect(judgeConsent({ consentAt: new Date("2026-08-01"), revokedAt: null })).toEqual({
      isAllowed: true,
    });
  });

  it("REFUSES a channel with no consent — storing an address is not permission", () => {
    // This is what stops the ~5K scraped clinic numbers becoming an SMS blast.
    expect(judgeConsent({ consentAt: null, revokedAt: null })).toEqual({
      isAllowed: false,
      reason: "no_consent",
    });
  });

  it("REFUSES after consent is withdrawn, even though consent_at is still set", () => {
    expect(
      judgeConsent({ consentAt: new Date("2026-08-01"), revokedAt: new Date("2026-08-20") }),
    ).toEqual({ isAllowed: false, reason: "consent_revoked" });
  });

  it("distinguishes the two refusals — they need different responses from a human", () => {
    const never = judgeConsent({ consentAt: null, revokedAt: null });
    const withdrawn = judgeConsent({ consentAt: new Date(), revokedAt: new Date() });
    expect(never).not.toEqual(withdrawn);
  });
});

// ─── Signature verification ──────────────────────────

describe("Messenger signature verification", () => {
  const SECRET = "app_secret";
  const BODY = JSON.stringify({ object: "page", entry: [] });
  const sign = (body = BODY, secret = SECRET) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a correctly signed body", () => {
    expect(verifyMessengerSignature(BODY, sign(), SECRET)).toBe(true);
  });

  it("REFUSES a body altered after signing", () => {
    expect(verifyMessengerSignature(JSON.stringify({ object: "page", entry: [1] }), sign(), SECRET)).toBe(false);
  });

  it("REFUSES the wrong secret, a missing header, and a wrong algorithm", () => {
    expect(verifyMessengerSignature(BODY, sign(BODY, "other"), SECRET)).toBe(false);
    expect(verifyMessengerSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyMessengerSignature(BODY, `sha1=${"a".repeat(40)}`, SECRET)).toBe(false);
  });

  it("REFUSES when no app secret is configured — never defaults to trusting", () => {
    expect(verifyMessengerSignature(BODY, sign(), "")).toBe(false);
  });

  it("does not throw on a malformed signature of the wrong length", () => {
    // timingSafeEqual throws on a length mismatch; a throw here would 500 the webhook.
    expect(() => verifyMessengerSignature(BODY, "sha256=abcd", SECRET)).not.toThrow();
    expect(verifyMessengerSignature(BODY, "sha256=abcd", SECRET)).toBe(false);
  });
});

describe("Viber signature verification", () => {
  const TOKEN = "viber_token";
  const BODY = JSON.stringify({ event: "message" });
  const sign = (body = BODY, token = TOKEN) => createHmac("sha256", token).update(body).digest("hex");

  it("accepts a correctly signed body and refuses everything else", () => {
    expect(verifyViberSignature(BODY, sign(), TOKEN)).toBe(true);
    expect(verifyViberSignature(BODY, sign(BODY, "other"), TOKEN)).toBe(false);
    expect(verifyViberSignature(BODY, undefined, TOKEN)).toBe(false);
    expect(verifyViberSignature(BODY, sign(), "")).toBe(false);
  });
});

// ─── Inbound normalization ───────────────────────────

describe("Messenger webhook parsing", () => {
  it("reads EVERY event in a batch, not just the first", () => {
    // Facebook batches. A parser that reads entry[0].messaging[0] silently drops real
    // client messages, and the loss is invisible because the webhook still 200s.
    const parsed = parseMessengerWebhook({
      object: "page",
      entry: [
        {
          messaging: [
            { sender: { id: "psid_1" }, timestamp: 1_770_000_000_000, message: { mid: "m1", text: "first" } },
            { sender: { id: "psid_2" }, timestamp: 1_770_000_001_000, message: { mid: "m2", text: "second" } },
          ],
        },
        {
          messaging: [
            { sender: { id: "psid_3" }, timestamp: 1_770_000_002_000, message: { mid: "m3", text: "third" } },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(3);
    expect(parsed.map((m) => m.body)).toEqual(["first", "second", "third"]);
    expect(parsed.map((m) => m.providerMessageId)).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps the PROVIDER's timestamp — a scope dispute turns on when it was said", () => {
    const parsed = parseMessengerWebhook({
      object: "page",
      entry: [{ messaging: [{ sender: { id: "p" }, timestamp: 1_770_000_000_000, message: { mid: "m", text: "hi" } }] }],
    });
    expect(parsed[0].sentAt?.getTime()).toBe(1_770_000_000_000);
  });

  it("skips delivery and read receipts rather than storing them as empty messages", () => {
    const parsed = parseMessengerWebhook({
      object: "page",
      entry: [{ messaging: [{ sender: { id: "psid" }, delivery: { mids: ["m1"] } } as never] }],
    });
    expect(parsed).toEqual([]);
  });

  it("ignores a non-page object and malformed payloads instead of throwing", () => {
    expect(parseMessengerWebhook({ object: "instagram", entry: [] })).toEqual([]);
    expect(parseMessengerWebhook(null)).toEqual([]);
    expect(parseMessengerWebhook("nope")).toEqual([]);
    expect(parseMessengerWebhook({})).toEqual([]);
  });

  it("carries attachments through", () => {
    const parsed = parseMessengerWebhook({
      object: "page",
      entry: [
        {
          messaging: [
            { sender: { id: "p" }, message: { mid: "m", attachments: [{ type: "image" }] } },
          ],
        },
      ],
    });
    expect(parsed[0].attachment).toEqual([{ type: "image" }]);
  });
});

describe("Viber webhook parsing", () => {
  it("reads a client message", () => {
    const parsed = parseViberWebhook({
      event: "message",
      message_token: 5_000_000_000,
      timestamp: 1_770_000_000_000,
      sender: { id: "viber_1", name: "Prince" },
      message: { type: "text", text: "when is the deploy" },
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      channel: "viber",
      providerMessageId: "5000000000",
      senderReference: "viber_1",
      senderName: "Prince",
      body: "when is the deploy",
    });
  });

  it("ignores the non-message events Viber sends to the SAME endpoint", () => {
    // subscribed / delivered / seen all arrive here. None of them is client speech.
    for (const event of ["subscribed", "unsubscribed", "delivered", "seen", "webhook"]) {
      expect(parseViberWebhook({ event, message_token: 1, sender: { id: "v" } })).toEqual([]);
    }
  });

  it("does not throw on malformed input", () => {
    expect(parseViberWebhook(null)).toEqual([]);
    expect(parseViberWebhook({ event: "message" })).toEqual([]);
  });
});

describe("SMS webhook parsing", () => {
  it("normalizes the sender so it can join contact_channel.reference", () => {
    const parsed = parseSmsWebhook({ message_id: 99, sender: "09171234567", message: "ok" });
    expect(parsed[0].senderReference).toBe("+639171234567");
  });

  it("still records a message from an unrecognisable number", () => {
    // Dropping an inbound client message to keep an index tidy is the wrong trade.
    const parsed = parseSmsWebhook({ message_id: 100, sender: "SHORTCODE", message: "ok" });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].senderReference).toBe("SHORTCODE");
  });

  it("returns nothing without an id or a sender", () => {
    expect(parseSmsWebhook({ message: "orphan" })).toEqual([]);
    expect(parseSmsWebhook(null)).toEqual([]);
  });
});

// ─── Source-level invariants ─────────────────────────

describe("persistence invariants, read from the source", () => {
  const service = readSource("apps/api/src/services/message.service.ts");
  const channel = readSource("apps/api/src/services/message-channel.service.ts");
  const route = readSource("apps/api/src/routes/message.routes.ts");
  const migration = readSource("apps/api/migrations/023_message_channel.sql");

  it("1. the consent gate runs BEFORE any provider is resolved", () => {
    const consentAt = service.indexOf("const verdict = judgeConsent(");
    const providerAt = service.indexOf("const provider = providerFor(");
    expect(consentAt).toBeGreaterThan(-1);
    expect(providerAt).toBeGreaterThan(consentAt);
  });

  it("1. consent defaults to ABSENT — an address is stored without permission", () => {
    expect(service).toContain("consentAt: input.consentSource ? new Date() : null");
  });

  it("1. the DB records consent as nullable, and says why", () => {
    expect(migration).toContain("consent_at          timestamptz,");
    expect(migration).toContain("RA 10173");
  });

  it("2. a refusal is a distinct status from a failure", () => {
    expect([...OUTBOUND_STATUS]).toEqual(["queued", "sent", "failed", "refused"]);
    expect(migration).toContain("A refusal is not a failure");
  });

  it("3. a thrown provider error still writes a row", () => {
    // The exact case email.service.ts swallowed: a network error into a catch and a log
    // line nobody read.
    expect(service).toMatch(/catch \(error\)[\s\S]{0,400}status: "failed"/);
  });

  it("3. the DB refuses a failure with no reason", () => {
    expect(migration).toContain("chk_outbound_message_failure");
    expect(migration).toMatch(/status <> 'failed' OR failure_reason IS NOT NULL/);
  });

  it("3. the default transport records and REFUSES rather than claiming success", () => {
    expect(channel).toMatch(/name: "log"[\s\S]{0,600}status: "refused"/);
  });

  it("4. inbound replay is a DB no-op", () => {
    expect(service).toContain("onConflictDoNothing");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_message_provider");
    expect(migration).toMatch(/ON inbound_message \(channel, provider_message_id\)/);
  });

  it("the inbound webhook reads the RAW body", () => {
    expect(route).toContain("c.req.text()");
    expect(route).not.toContain("c.req.json()");
  });

  it("the webhooks are registered BEFORE the auth middleware", () => {
    const webhookAt = route.indexOf('post("/webhook/:channel"');
    const authAt = route.indexOf('use("*", requireAuth');
    expect(webhookAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(webhookAt);
  });

  it("revoking consent UPDATEs — it never deletes the row", () => {
    // The row is the evidence that consent was given and withdrawn. Deleting it is the
    // one thing that makes a DPA complaint unanswerable.
    expect(service).toMatch(/revokeConsent[\s\S]{0,400}revokedAt: new Date\(\)/);
    expect(service).not.toMatch(/revokeConsent[\s\S]{0,400}\.delete\(/);
  });

  it("resolveSender refuses to guess an ambiguous project", () => {
    // Attaching a client's message to the wrong project means a scope dispute is argued
    // from the wrong evidence.
    expect(service).toContain("if (row.length === 1) projectId = row[0].projectId;");
  });

  it("nothing auto-replies", () => {
    expect(service).not.toMatch(/autoReply|auto_reply/);
    expect(route).not.toMatch(/autoReply|auto_reply/);
  });

  it("declares its credentials unverified rather than implying they were tested", () => {
    expect(channel).toContain("Credential status");
    expect(channel).toContain("has NOT been exercised against a\n * live account");
  });

  it("Messenger only ever replies inside the platform's allowed window", () => {
    // Unsolicited Messenger messaging outside 24h is a policy violation that gets a page
    // restricted. RESPONSE is the only messaging_type this codebase uses.
    expect(channel).toContain('messaging_type: "RESPONSE"');
  });

  it("Viber failures are read from the body, not from res.ok", () => {
    // Viber answers 200 with a non-zero status on rejection. A naive res.ok check would
    // record every rejected message as sent.
    expect(channel).toContain("(json.status ?? 1) !== 0");
  });

  it("registers exactly the four known channels", () => {
    expect([...MESSAGE_CHANNEL]).toEqual(["sms", "viber", "messenger", "whatsapp"]);
  });

  it("023 self-registers in the schema ledger", () => {
    expect(migration).toMatch(/INSERT INTO schema_migration[\s\S]*023_message_channel\.sql/);
  });
});
