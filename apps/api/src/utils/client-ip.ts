/**
 * The real client IP, extracted so the geo lookup (services/geo.service.ts) and the
 * ingest rate limiter (routes/event.routes.ts) agree on what "the caller's address" means.
 *
 * This is a pure port of event.routes.ts's original `rateKey()` body — same trust order,
 * same private-address check — so the behaviour documented there is unchanged by the
 * extraction. See client-ip.test.ts for the table-driven proof.
 */
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Variables } from "../types/context.js";

export const isPrivateAddress = (address: string): boolean => {
  const a = address.replace(/^::ffff:/, "");
  return (
    a === "127.0.0.1" ||
    a === "::1" ||
    a.startsWith("10.") ||
    a.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a)
  );
};

/**
 * The only trustworthy base is the SOCKET PEER. So:
 *   - read the peer address from the connection,
 *   - trust `X-Real-IP`/`CF-Connecting-IP` ONLY when that peer is a loopback/private
 *     address, i.e. the request genuinely arrived through our own reverse proxy,
 *   - otherwise key on the peer itself and ignore the header entirely.
 *
 * See event.routes.ts's original header comment for the full spoofing rationale — that
 * reasoning is unchanged, only the location of the code moved.
 */
export function resolveClientIp(c: Context<{ Variables: Variables }>): string {
  let peer = "unknown";
  try {
    peer = getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // No socket info (test harness).
  }

  // Direct connection: the peer is the caller. No header is worth reading.
  if (peer !== "unknown" && !isPrivateAddress(peer)) return peer;

  // Behind our own proxy. apps/api/nginx.conf sets `X-Real-IP $remote_addr`, which
  // OVERWRITES whatever the client sent — so it is the peer as nginx saw it, and it is
  // trustworthy. `X-Forwarded-For` uses $proxy_add_x_forwarded_for, which APPENDS to the
  // client's value, so its leading entries are attacker-chosen and are never read here.
  const real = c.req.header("X-Real-IP");
  if (real) return real.trim();

  const cloudflare = c.req.header("CF-Connecting-IP");
  if (cloudflare) return cloudflare.trim();

  return peer;
}
