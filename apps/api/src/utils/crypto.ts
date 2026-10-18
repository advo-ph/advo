/**
 * Webhook-secret encryption + delivery signing (MCP phase 2, MCP-owned per the shared
 * contract — apps/api/src/utils/crypto.ts).
 *
 * AES-256-GCM, key derived via HKDF from env().JWT_SECRET when SECRET_ENCRYPTION_KEY is
 * unset — prod works with zero new env vars. Distinct salt/info so this derived key can
 * never collide with any other HKDF use in the repo.
 */
import { randomBytes, createCipheriv, createDecipheriv, createHmac, hkdfSync } from "node:crypto";
import { env } from "./env.js";

const INFO = "advo-mcp-webhook-secret-v1";
const SALT = "advo-mcp";

function derivedKey(): Buffer {
  const material = env().SECRET_ENCRYPTION_KEY ?? env().JWT_SECRET;
  return Buffer.from(hkdfSync("sha256", material, SALT, INFO, 32));
}

/** iv(12) + authTag(16) + ciphertext, all base64, joined with '.' */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(".");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

/** HMAC-SHA256 hex signature of a webhook body, using the member's plaintext secret. */
export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** A random, URL-safe webhook secret, shown to the owner exactly once at creation. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}
