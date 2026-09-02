/**
 * ESP bounce webhook — the pure half.
 *
 * Resend (and every Svix-backed ESP) signs each delivery with a Svix "standard webhook"
 * signature. No middleware here proves the caller is real; this signature does. The
 * route mounts ABOVE the team-auth line specifically because an ESP has no session, so
 * a rejection here is the ONLY thing standing between the open internet and the
 * suppression list — which is why a bad signature is refused rather than logged, and why
 * the comparison is constant-time.
 *
 * Kept free of Hono, the database and the env so it can be unit-tested with a signature
 * the test computes itself.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Svix's own tolerance. Older than this and a captured request could be replayed. */
const TIMESTAMP_TOLERANCE_SECOND = 5 * 60;

export interface SvixHeader {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

export type SvixVerdict =
  | { isValid: true }
  | { isValid: false; reason: "missing_header" | "bad_secret" | "stale_timestamp" | "no_match" };

/** Decodes the secret Resend shows in its dashboard: `whsec_<base64>`. */
function secretByte(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  if (!raw) return null;
  const byte = Buffer.from(raw, "base64");
  return byte.length === 0 ? null : byte;
}

/**
 * Compute `v1,<base64>` the way Svix does, so a test (or a curl) can sign a body
 * against a known secret. Exported for that reason only; the route never calls it.
 */
export function signSvix(id: string, timestamp: string, rawBody: string, secret: string): string {
  const key = secretByte(secret);
  if (!key) throw new Error("signSvix: empty secret");
  const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return `v1,${digest}`;
}

export function verifySvixSignature(
  header: SvixHeader,
  rawBody: string,
  secret: string,
  nowSecond: number = Math.floor(Date.now() / 1000),
): SvixVerdict {
  const { id, timestamp, signature } = header;
  if (!id || !timestamp || !signature) return { isValid: false, reason: "missing_header" };

  const key = secretByte(secret);
  if (!key) return { isValid: false, reason: "bad_secret" };

  const sentSecond = Number(timestamp);
  if (!Number.isFinite(sentSecond) || Math.abs(nowSecond - sentSecond) > TIMESTAMP_TOLERANCE_SECOND) {
    return { isValid: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  // The header may carry several signatures (secret rotation), space-separated. Any one
  // matching is enough; every candidate is checked so the loop's timing does not depend
  // on which entry matched.
  let isMatched = false;
  for (const entry of signature.split(" ")) {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    const candidate = Buffer.from(encoded, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) isMatched = true;
  }

  return isMatched ? { isValid: true } : { isValid: false, reason: "no_match" };
}

// ─── Event translation ──────────────────────────────────

export type DeliveryFailureKind = "hard_bounce" | "soft_bounce" | "complaint";

export interface DeliveryFailureEvent {
  email: string;
  kind: DeliveryFailureKind;
}

/**
 * The slice of a Resend event this cares about. Resend nests the address under `data.to`
 * (an array) and the bounce classification under `data.bounce.type`; both are read
 * defensively because the payload is external input, not a contract this repo owns.
 */
interface ResendEventLike {
  type?: unknown;
  data?: {
    to?: unknown;
    email?: unknown;
    bounce?: { type?: unknown; subType?: unknown } | null;
  } | null;
}

function firstAddress(data: ResendEventLike["data"]): string | null {
  if (!data) return null;
  const to = data.to;
  if (Array.isArray(to) && typeof to[0] === "string" && to[0].includes("@")) return to[0];
  if (typeof to === "string" && to.includes("@")) return to;
  if (typeof data.email === "string" && data.email.includes("@")) return data.email;
  return null;
}

/**
 * Resend → the internal `{ email, kind }` that /delivery-failure already understands.
 *
 * Returns null for any event that is not a bounce or a complaint (delivered, opened,
 * clicked…) and for a bounce with no address; the route answers 200 to those so the ESP
 * stops retrying. An "undetermined" bounce is treated as SOFT on purpose: suppressing
 * on the first report of a bounce the ESP itself could not classify would drop real
 * addresses, and the soft-bounce counter already escalates the repeat offender.
 */
export function translateResendEvent(payload: unknown): DeliveryFailureEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as ResendEventLike;
  if (typeof event.type !== "string") return null;

  const email = firstAddress(event.data);
  if (!email) return null;

  if (event.type === "email.complained") return { email, kind: "complaint" };

  if (event.type === "email.bounced") {
    const bounceType = String(event.data?.bounce?.type ?? "").toLowerCase();
    const isHard = bounceType === "hard" || bounceType === "permanent";
    return { email, kind: isHard ? "hard_bounce" : "soft_bounce" };
  }

  return null;
}
