/**
 * Signed, expiring "Show Client Now" preview links.
 *
 * Mints a short-lived HS256 token bound to a projectId. The public redirect
 * route (`GET /api/preview/:token`) verifies it and 302s to the project's
 * stored preview_url. Instant (no build), ephemeral (token expires), and
 * host-agnostic — the preview can live on Vercel / Cloudflare / here.now /
 * the VPS; ADVO just stores the URL and controls the link's lifetime.
 */
import { SignJWT, jwtVerify } from "jose";
import { env } from "../utils/env.js";

const encoder = new TextEncoder();
export const PREVIEW_TTL_MINUTES = 20;

export async function signPreviewToken(
  projectId: number,
): Promise<{ token: string; expiresAt: string }> {
  const secret = encoder.encode(env().JWT_SECRET);
  const expSeconds = Math.floor(Date.now() / 1000) + PREVIEW_TTL_MINUTES * 60;
  const token = await new SignJWT({ projectId, kind: "preview" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(secret);
  return { token, expiresAt: new Date(expSeconds * 1000).toISOString() };
}

/** Returns the projectId if the token is a valid, unexpired preview token. */
export async function verifyPreviewToken(token: string): Promise<number | null> {
  try {
    const secret = encoder.encode(env().JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.kind !== "preview" || typeof payload.projectId !== "number") return null;
    return payload.projectId;
  } catch {
    return null;
  }
}
