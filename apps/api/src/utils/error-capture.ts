/**
 * In-process bounded error ring. No dependency, no external service.
 *
 * Feeds GET /api/health so an operator can tell a box is unhealthy without
 * SSH. That endpoint is PUBLIC, so nothing here may carry a credential:
 * we keep the error message and drop the stack entirely, and the message is
 * redacted and clamped before it is stored.
 */

const RING_SIZE = 20;
const MESSAGE_LIMIT = 200;

export type CapturedError = {
  scope: string;
  message: string;
  at: string;
};

const ring: CapturedError[] = [];
let totalCount = 0;

/** Strip anything that looks like a secret before it can reach a response. */
export function redactMessage(raw: string): string {
  return raw
    .replace(/\b[Bb]earer\s+[\w.\-]+/g, "Bearer <redacted>")
    .replace(/\beyJ[\w.\-]{10,}/g, "<jwt>")
    .replace(/([?&](?:token|key|secret|password|access_token)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_\-]{8,}/g, "<key>")
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/gi, "<database-url>")
    .slice(0, MESSAGE_LIMIT);
}

export function recordError(scope: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err ?? "unknown error");
  totalCount += 1;
  ring.push({ scope, message: redactMessage(raw), at: new Date().toISOString() });
  while (ring.length > RING_SIZE) ring.shift();
}

export function recentError(limit = 5): CapturedError[] {
  return ring.slice(-limit).reverse();
}

export function errorCount(): number {
  return totalCount;
}

/** Test seam — the ring is module state. */
export function resetErrorCapture(): void {
  ring.length = 0;
  totalCount = 0;
}
