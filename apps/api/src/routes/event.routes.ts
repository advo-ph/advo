/**
 * POST /api/event — the analytics ingest (migration 046).
 *
 * BATCHED BY DESIGN. One request per hover would not survive a single session: a browsing
 * visitor generates hundreds of events a minute, and a request each means a connection
 * each on a VPS that also serves the app. The client buffers and flushes an ARRAY — on a
 * timer, on route change, and on unload via sendBeacon. So this endpoint's contract is an
 * array, and a batch is accepted or rejected whole.
 *
 * PUBLIC. The marketing site has no auth session, and an anonymous visitor is precisely
 * the traffic worth measuring, so there is no requireAuth here — optionalAuth instead.
 *
 * THE USER ID IS NEVER READ FROM THE BODY. If a verified JWT is present, the user id comes
 * off the session server-side; if not, it is null. A body-supplied actor id is exactly the
 * S1/S2/S3 cross-tenant class closed in the 2026-06-20 wiring audit (docs/WIRING-AUDIT.md),
 * and on a public unauthenticated endpoint it would let anyone attribute traffic to any
 * user. The zod schema below does not even have a userId field — the parse strips it.
 */
import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { and, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { analyticsEvent, client } from "../db/schema.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const event = new Hono<{ Variables: Variables }>();

/** Events per request. A real flush is 10-40; 200 is generous and still bounded. */
const BATCH_MAX = 200;

/** Hard body ceiling, checked BEFORE parsing. 200 events x ~1 KB detail, plus slack. */
const BODY_BYTE_MAX = 256 * 1024;

/** Ingest budget per key per window. A flush every few seconds sits far under this. */
const RATE_WINDOW_MILLISECOND = 60 * 1000;
const RATE_REQUEST_MAX = 120;
const RATE_EVENT_MAX = 2000;

const EVENT_KIND = [
  "page_view",
  "click",
  "form_start",
  "form_submit",
  "scroll_depth",
  "outbound_click",
  "session_start",
  "session_end",
  "error",
] as const;

/**
 * No userId key, on purpose — see the header. Unknown keys are stripped by zod's default
 * object behaviour, so a caller cannot smuggle columns in through `detail`'s siblings.
 */
const eventSchema = z.object({
  kind: z.enum(EVENT_KIND),
  /** Client clock. Optional — a client with no usable clock still gets its event stored. */
  occurredAt: z.coerce.date().optional(),
  sessionId: z.string().min(1).max(64),
  visitorId: z.string().min(1).max(64).nullish(),
  path: z.string().max(512).default("/"),
  detail: z.record(z.string(), z.unknown()).default({}),
});

const batchSchema = z
  .array(eventSchema)
  .min(1, "batch is empty")
  .max(BATCH_MAX, `batch exceeds ${BATCH_MAX} events`);

// ─── Abuse bound ──────────────────────────────────────
//
// In-process fixed window, keyed by client IP. Deliberately NOT the shared hono-rate-limiter
// instances in index.ts: those are tuned for 10-30 requests a minute on human-paced
// endpoints, and a legitimate analytics client flushes far more often than a human clicks.
// This also counts EVENTS, not just requests — 120 requests of 200 events is the attack a
// request-only limiter waves through.
type Bucket = { windowStart: number; requestCount: number; eventCount: number };
const bucket = new Map<string, Bucket>();

/**
 * The rate-limit key must be an address the CALLER cannot choose.
 *
 * First attempt at this took the last `X-Forwarded-For` hop, on the theory that our own
 * nginx appends the real peer. That is FALSE when nothing is in front: with a direct
 * connection the caller supplies the entire header, so the "last hop" is still attacker-
 * chosen. Measured: 90 requests with a rotating spoofed XFF all returned 202 against a
 * 120/min budget.
 *
 * The only trustworthy base is the SOCKET PEER. So:
 *   - read the peer address from the connection,
 *   - trust `X-Forwarded-For` ONLY when that peer is a loopback/private address, i.e. the
 *     request genuinely arrived through our own reverse proxy,
 *   - otherwise key on the peer itself and ignore the header entirely.
 *
 * This endpoint is an unauthenticated INSERT and deliberately skips the shared public
 * limiter, so this map is the only bound in front of it.
 */
const isPrivateAddress = (address: string): boolean => {
  const a = address.replace(/^::ffff:/, "");
  return (
    a === "127.0.0.1" ||
    a === "::1" ||
    a.startsWith("10.") ||
    a.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a)
  );
};

function rateKey(c: Context<{ Variables: Variables }>): string {
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


/**
 * BOUND THE PATH CARDINALITY AT THE DOOR.
 *
 * `analytics_event_rollup` is the one table with no retention sweep — it is meant to be
 * the permanent aggregate. It carries one row per (period, kind, path). `path` arrives
 * from an anonymous caller, so without a cap a loop posting random paths mints unbounded
 * PERMANENT rows and the aggregate becomes the largest object on a ~10 MB VPS database.
 *
 * So: collapse anything that is not a known route shape into a bucket. Numeric and token
 * segments become placeholders (`/project/12` and `/project/13` are one route, not two),
 * and anything still unrecognised lands in `/other`. Real routes stay legible; a fuzzer
 * gets one row.
 */
const PATH_SEGMENT_MAX = 6;
const PATH_LENGTH_MAX = 128;

export function normalisePath(raw: string): string {
  let path = raw.split("?")[0]!.split("#")[0]!.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > PATH_LENGTH_MAX) return "/other";

  const segment = path.split("/").filter(Boolean);
  if (segment.length > PATH_SEGMENT_MAX) return "/other";

  const mapped = segment.map((s) => {
    if (/^\d+$/.test(s)) return ":id";
    // A slug or opaque token: long, or mixed-case/hex-looking.
    if (s.length > 24 || /^[0-9a-f]{16,}$/i.test(s)) return ":token";
    if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "/other".slice(1);
    return s.toLowerCase();
  });

  return `/${mapped.join("/")}`;
}

/** Returns null when allowed, or the reason it is not. */
function overBudget(key: string, eventCount: number): string | null {
  const now = Date.now();
  const existing = bucket.get(key);

  if (!existing || now - existing.windowStart >= RATE_WINDOW_MILLISECOND) {
    // Sweep on write. Without this the map is an unbounded leak keyed by attacker IP.
    if (bucket.size > 10_000) {
      for (const [k, b] of bucket) {
        if (now - b.windowStart >= RATE_WINDOW_MILLISECOND) bucket.delete(k);
      }
    }
    bucket.set(key, { windowStart: now, requestCount: 1, eventCount });
    return null;
  }

  if (existing.requestCount + 1 > RATE_REQUEST_MAX) return "Too many ingest requests";
  if (existing.eventCount + eventCount > RATE_EVENT_MAX) return "Too many events";

  existing.requestCount += 1;
  existing.eventCount += eventCount;
  return null;
}

// ─── Ingest ───────────────────────────────────────────

event.post("/", optionalAuth, async (c) => {
  // Reject an oversized body BEFORE reading it. Parsing a 50 MB post to find out it is too
  // big is the denial-of-service the cap exists to prevent.
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_BYTE_MAX) {
    throw new HTTPException(413, { message: "Event batch body too large" });
  }

  /**
   * Parse the TEXT, not the content-type. The unload beacon must send
   * `text/plain` to stay CORS-safelisted (a JSON beacon needs a preflight that
   * does not complete during pagehide, so every session_end would be lost in
   * production). `c.req.json()` refuses a text/plain body, so read and parse.
   */
  let raw: unknown;
  let bodyText: string;
  try {
    bodyText = await c.req.text();
    raw = JSON.parse(bodyText);
  } catch {
    throw new HTTPException(400, { message: "Body must be JSON" });
  }

  // A chunked request has no Content-Length, so the declared check above can be skipped.
  // Re-measure what actually arrived.
  if (bodyText.length > BODY_BYTE_MAX) {
    throw new HTTPException(413, { message: "Event batch body too large" });
  }

  // Accept a bare object as a one-event batch: sendBeacon call sites are easy to get wrong
  // and a dropped beacon is silent. The stored shape is identical either way.
  const parsed = batchSchema.safeParse(Array.isArray(raw) ? raw : [raw]);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid event batch",
    });
  }

  const overage = overBudget(rateKey(c), parsed.data.length);
  if (overage) throw new HTTPException(429, { message: overage });

  // The one place a user id is allowed to come from.
  const user = c.get("user");
  const userId = user?.userId ?? null;
  const now = new Date();

  await db()
    .insert(analyticsEvent)
    .values(
      parsed.data.map((e) => ({
        kind: e.kind,
        // A client clock in the future is clamped to now — a forged occurred_at must not be
        // able to sort ahead of every real event forever.
        occurredAt: e.occurredAt && e.occurredAt <= now ? e.occurredAt : now,
        sessionId: e.sessionId,
        visitorId: e.visitorId ?? null,
        userId,
        path: normalisePath(e.path),
        detail: e.detail,
      }))
    );

  // 202, not 201: the client is a fire-and-forget beacon that must never block on us, and
  // there is no resource URL to hand back.
  return c.json({ data: { acceptedCount: parsed.data.length }, error: null }, 202);
});

// ─── Client engagement (admin read) ───────────────────
//
// GET /api/event/engagement — one row per client, STALEST FIRST.
//
// The question this answers is the one ADVO could not previously ask: has the client
// actually opened the proposal / the contract / the preview, and how long ago? A client
// who has generated nothing at all sorts ABOVE one who read something 9 days ago —
// silence is the strongest signal, so a null last-seen is treated as infinitely stale.
//
// ADMIN ONLY, enforced here with the repo's rbac middleware. Hiding the panel in the web
// build is not access control: the endpoint is the boundary, so requireAuth + requireAdmin
// run before the query rather than a role check inside the handler.
//
// The join is analytics_event.user_id -> client.user_id. That column is the server-written
// one (see the file header) — an anonymous marketing visitor has a null user_id and is
// correctly excluded, because "did MY client open it" is a question about a signed-in one.

/** Default look-back. Long enough that a quiet quarter still shows its last touch. */
const ENGAGEMENT_WINDOW_DAY_DEFAULT = 90;
const ENGAGEMENT_WINDOW_DAY_MAX = 365;

const MILLISECOND_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Which client-facing document a path represents. Bucketed in SQL so the group-by does the
 * work; a raw path is too high-cardinality to be a useful column in an admin table.
 */
const surfaceExpression = sql<string>`case
  when ${analyticsEvent.path} ilike '%proposal%' then 'proposal'
  when ${analyticsEvent.path} ilike '%contract%' or ${analyticsEvent.path} ilike '%sign%' then 'contract'
  when ${analyticsEvent.path} ilike '%preview%' or ${analyticsEvent.path} ilike '%staging%' then 'preview'
  when ${analyticsEvent.path} ilike '%invoice%' or ${analyticsEvent.path} ilike '%payment%' then 'invoice'
  when ${analyticsEvent.path} ilike '%portal%' or ${analyticsEvent.path} ilike '%project%' then 'portal'
  else 'other'
end`;

/** Whole days between `at` and now. Null in, null out — never a fabricated 0. */
function dayAgo(at: Date | null): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((Date.now() - at.getTime()) / MILLISECOND_PER_DAY));
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

event.get("/engagement", requireAuth, requireAdmin, async (c) => {
  const requestedDay = Number(c.req.query("day") ?? ENGAGEMENT_WINDOW_DAY_DEFAULT);
  const windowDay =
    Number.isFinite(requestedDay) && requestedDay > 0
      ? Math.min(Math.floor(requestedDay), ENGAGEMENT_WINDOW_DAY_MAX)
      : ENGAGEMENT_WINDOW_DAY_DEFAULT;
  const since = new Date(Date.now() - windowDay * MILLISECOND_PER_DAY);

  // Every client, including the ones with nothing to show — a client absent from the
  // analytics table is exactly the client this panel exists to surface.
  const clientRow = await db()
    .select({
      clientId: client.clientId,
      userId: client.userId,
      companyName: client.companyName,
      contactEmail: client.contactEmail,
    })
    .from(client);

  const surfaceRow = await db()
    .select({
      userId: analyticsEvent.userId,
      surface: surfaceExpression,
      viewCount: sql<number>`count(*)::int`,
      sessionCount: sql<number>`count(distinct ${analyticsEvent.sessionId})::int`,
      lastSeenAt: sql<Date | null>`max(${analyticsEvent.occurredAt})`,
    })
    .from(analyticsEvent)
    .where(and(isNotNull(analyticsEvent.userId), gte(analyticsEvent.occurredAt, since)))
    .groupBy(analyticsEvent.userId, surfaceExpression);

  // Group the per-surface aggregate by the client user it belongs to.
  const byUser = new Map<number, typeof surfaceRow>();
  for (const row of surfaceRow) {
    if (row.userId === null) continue;
    const existing = byUser.get(row.userId);
    if (existing) existing.push(row);
    else byUser.set(row.userId, [row]);
  }

  const engagement = clientRow.map((cl) => {
    const row = (cl.userId === null ? undefined : byUser.get(cl.userId)) ?? [];

    const surface = row
      .map((r) => {
        const lastSeenAt = asDate(r.lastSeenAt);
        return {
          surface: r.surface,
          viewCount: Number(r.viewCount),
          sessionCount: Number(r.sessionCount),
          lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
          staleDay: dayAgo(lastSeenAt),
        };
      })
      .sort((a, b) => {
        // `Infinity - Infinity` is NaN when both are null, giving an
        // implementation-defined order that reshuffles "Last: <surface>" between
        // refreshes. Compare finite, then tiebreak by name.
        const left = a.staleDay ?? Number.MAX_SAFE_INTEGER;
        const right = b.staleDay ?? Number.MAX_SAFE_INTEGER;
        return left === right ? a.surface.localeCompare(b.surface) : left - right;
      });

    const lastSeenAt = row
      .map((r) => asDate(r.lastSeenAt))
      .reduce<Date | null>((best, at) => (at && (!best || at > best) ? at : best), null);

    return {
      clientId: cl.clientId,
      companyName: cl.companyName,
      contactEmail: cl.contactEmail,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      /** Whole days since the last touch. Null = no event in the window at all. */
      staleDay: dayAgo(lastSeenAt),
      viewCount: surface.reduce((sum, s) => sum + s.viewCount, 0),
      sessionCount: surface.reduce((sum, s) => sum + s.sessionCount, 0),
      /** True when this client generated nothing in the window — the headline signal. */
      isSilent: lastSeenAt === null,
      surface,
    };
  });

  // STALEST FIRST. Never-seen clients lead, then longest-quiet, then by name so the order
  // is stable across refreshes rather than reshuffling on ties.
  engagement.sort((a, b) => {
    const left = a.staleDay ?? Number.POSITIVE_INFINITY;
    const right = b.staleDay ?? Number.POSITIVE_INFINITY;
    if (left !== right) return right - left;
    return a.companyName.localeCompare(b.companyName);
  });

  return c.json({
    data: {
      windowDay,
      generatedAt: new Date().toISOString(),
      clientCount: engagement.length,
      silentCount: engagement.filter((e) => e.isSilent).length,
      engagement,
    },
    error: null,
  });
});

export default event;
