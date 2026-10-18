/**
 * GET /api/visitor-stats/* — admin-only reads over the raw analytics_event table.
 *
 * Gets its own top-level route file (not nested under /api/event) because this is a
 * materially larger surface than the single existing GET /api/event/engagement read, and
 * deserves its own file for reviewability (see
 * process/general-plans/active/visitor-analytics_PLAN_09-10-26.md §4.7).
 *
 * ADMIN ONLY, enforced at the route boundary (requireAuth + requireAdmin) the same way
 * event.routes.ts's engagement read is — hiding the panel client-side is not access
 * control.
 *
 * Every endpoint reads only columns and `detail` keys apps/web/src/lib/track.ts already
 * writes today. No new client-side fingerprinting, no new fields.
 */
import { Hono } from "hono";
import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { analyticsEvent } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";

const visitorStats = new Hono<{ Variables: Variables }>();

visitorStats.use("*", requireAuth, requireAdmin);

const MILLISECOND_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAY_DEFAULT = 30;
const WINDOW_DAY_MAX = 365;

/**
 * Shared `?from=&to=` parsing. Both are ISO dates; absent `to` defaults to now, absent
 * `from` defaults to WINDOW_DAY_DEFAULT days before `to`. The range is clamped to
 * WINDOW_DAY_MAX days total — mirrors event.routes.ts's ENGAGEMENT_WINDOW_DAY pattern.
 */
function parseRange(fromParam: string | undefined, toParam: string | undefined): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  const toSafe = Number.isNaN(to.getTime()) ? now : to;

  const defaultFrom = new Date(toSafe.getTime() - WINDOW_DAY_DEFAULT * MILLISECOND_PER_DAY);
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const fromSafe = Number.isNaN(from.getTime()) ? defaultFrom : from;

  const maxSpanMs = WINDOW_DAY_MAX * MILLISECOND_PER_DAY;
  const clampedFrom =
    toSafe.getTime() - fromSafe.getTime() > maxSpanMs
      ? new Date(toSafe.getTime() - maxSpanMs)
      : fromSafe;

  return { from: clampedFrom, to: toSafe };
}

function rangeWhere(from: Date, to: Date) {
  return and(gte(analyticsEvent.receivedAt, from), lte(analyticsEvent.receivedAt, to));
}

// ─── Summary ───────────────────────────────────────────

visitorStats.get("/summary", async (c) => {
  const { from, to } = parseRange(c.req.query("from"), c.req.query("to"));

  const [totals] = await db()
    .select({
      uniqueVisitorCount: sql<number>`count(distinct coalesce(${analyticsEvent.visitorId}, ${analyticsEvent.sessionId}))::int`,
      sessionCount: sql<number>`count(distinct ${analyticsEvent.sessionId})::int`,
      pageViewCount: sql<number>`count(*) filter (where ${analyticsEvent.kind} = 'page_view')::int`,
    })
    .from(analyticsEvent)
    .where(rangeWhere(from, to));

  const byDayRow = await db()
    .select({
      date: sql<string>`to_char(${analyticsEvent.receivedAt} at time zone 'utc', 'YYYY-MM-DD')`,
      uniqueVisitorCount: sql<number>`count(distinct coalesce(${analyticsEvent.visitorId}, ${analyticsEvent.sessionId}))::int`,
      sessionCount: sql<number>`count(distinct ${analyticsEvent.sessionId})::int`,
      pageViewCount: sql<number>`count(*) filter (where ${analyticsEvent.kind} = 'page_view')::int`,
    })
    .from(analyticsEvent)
    .where(rangeWhere(from, to))
    .groupBy(sql`to_char(${analyticsEvent.receivedAt} at time zone 'utc', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${analyticsEvent.receivedAt} at time zone 'utc', 'YYYY-MM-DD')`);

  return c.json({
    data: {
      from: from.toISOString(),
      to: to.toISOString(),
      uniqueVisitorCount: Number(totals?.uniqueVisitorCount ?? 0),
      sessionCount: Number(totals?.sessionCount ?? 0),
      pageViewCount: Number(totals?.pageViewCount ?? 0),
      byDay: byDayRow.map((r) => ({
        date: r.date,
        uniqueVisitorCount: Number(r.uniqueVisitorCount),
        sessionCount: Number(r.sessionCount),
        pageViewCount: Number(r.pageViewCount),
      })),
    },
    error: null,
  });
});

// ─── Top pages ─────────────────────────────────────────

visitorStats.get("/pages", async (c) => {
  const { from, to } = parseRange(c.req.query("from"), c.req.query("to"));

  const row = await db()
    .select({
      path: analyticsEvent.path,
      viewCount: sql<number>`count(*)::int`,
      sessionCount: sql<number>`count(distinct ${analyticsEvent.sessionId})::int`,
    })
    .from(analyticsEvent)
    .where(and(rangeWhere(from, to), sql`${analyticsEvent.kind} = 'page_view'`))
    .groupBy(analyticsEvent.path)
    .orderBy(sql`count(*) desc`)
    .limit(25);

  return c.json({
    data: row.map((r) => ({
      path: r.path,
      viewCount: Number(r.viewCount),
      sessionCount: Number(r.sessionCount),
    })),
    error: null,
  });
});

// ─── Landing sections ──────────────────────────────────
//
// Only the ids apps/web/src/lib/track.ts's observeLandingSection actually watches can ever
// appear here: top, solutions, services, process. The marquee section has no id and is
// invisible to this instrumentation — the admin page's copy must not imply coverage this
// data does not have (plan §4.8).

visitorStats.get("/sections", async (c) => {
  const { from, to } = parseRange(c.req.query("from"), c.req.query("to"));

  const row = await db()
    .select({
      section: sql<string>`${analyticsEvent.detail}->>'section'`,
      viewCount: sql<number>`count(*)::int`,
      avgDwellSecond: sql<number | null>`avg((${analyticsEvent.detail}->>'dwell_second')::numeric)`,
    })
    .from(analyticsEvent)
    .where(
      and(
        rangeWhere(from, to),
        sql`${analyticsEvent.kind} = 'scroll_depth'`,
        sql`${analyticsEvent.detail}->>'metric' = 'section_dwell'`,
      ),
    )
    .groupBy(sql`${analyticsEvent.detail}->>'section'`);

  return c.json({
    data: row
      .filter((r) => r.section !== null)
      .map((r) => ({
        section: r.section,
        viewCount: Number(r.viewCount),
        avgDwellSecond: r.avgDwellSecond !== null ? Number(r.avgDwellSecond) : null,
      })),
    error: null,
  });
});

// ─── Scroll-depth funnel ───────────────────────────────

const SCROLL_MILESTONE = [25, 50, 75, 100] as const;

visitorStats.get("/scroll-depth", async (c) => {
  const { from, to } = parseRange(c.req.query("from"), c.req.query("to"));

  const row = await db()
    .select({
      milestone: sql<string>`${analyticsEvent.detail}->>'percent'`,
      reachedSessionCount: sql<number>`count(distinct ${analyticsEvent.sessionId})::int`,
    })
    .from(analyticsEvent)
    .where(
      and(
        rangeWhere(from, to),
        sql`${analyticsEvent.kind} = 'scroll_depth'`,
        sql`${analyticsEvent.detail}->>'metric' = 'depth_percent'`,
      ),
    )
    .groupBy(sql`${analyticsEvent.detail}->>'percent'`);

  const byMilestone = new Map(row.map((r) => [Number(r.milestone), Number(r.reachedSessionCount)]));

  return c.json({
    data: SCROLL_MILESTONE.map((milestone) => ({
      milestone,
      reachedSessionCount: byMilestone.get(milestone) ?? 0,
    })),
    error: null,
  });
});

// ─── Geo ───────────────────────────────────────────────
//
// Cities carry lat/lon (city-centroid precision, migration 051) so the admin page's world
// map can plot a marker without a second geocoding step. geo_lat/geo_lon are stored as
// drizzle `numeric`, which round-trips as a string — parsed to a number here so the wire
// shape is a plain number, not a string the client would have to coerce.

visitorStats.get("/geo", async (c) => {
  const { from, to } = parseRange(c.req.query("from"), c.req.query("to"));
  const hasGeo = sql`${analyticsEvent.geoCountry} is not null`;

  const countryRow = await db()
    .select({
      country: analyticsEvent.geoCountry,
      viewCount: sql<number>`count(*)::int`,
    })
    .from(analyticsEvent)
    .where(and(rangeWhere(from, to), hasGeo))
    .groupBy(analyticsEvent.geoCountry)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const cityRow = await db()
    .select({
      country: analyticsEvent.geoCountry,
      city: analyticsEvent.geoCity,
      lat: analyticsEvent.geoLat,
      lon: analyticsEvent.geoLon,
      viewCount: sql<number>`count(*)::int`,
    })
    .from(analyticsEvent)
    .where(and(rangeWhere(from, to), hasGeo))
    .groupBy(analyticsEvent.geoCountry, analyticsEvent.geoCity, analyticsEvent.geoLat, analyticsEvent.geoLon)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  return c.json({
    data: {
      countries: countryRow.map((r) => ({
        country: r.country,
        viewCount: Number(r.viewCount),
      })),
      cities: cityRow.map((r) => ({
        country: r.country,
        city: r.city,
        lat: r.lat !== null ? Number(r.lat) : null,
        lon: r.lon !== null ? Number(r.lon) : null,
        viewCount: Number(r.viewCount),
      })),
    },
    error: null,
  });
});

export default visitorStats;
