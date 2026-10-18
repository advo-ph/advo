#!/usr/bin/env node
/**
 * Seeds realistic fake analytics_event rows into advo_dev for manually verifying the
 * admin "Web Statistics" page (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md). NOT wired into any npm script on purpose — this is
 * a one-off dev convenience, not a repeatable fixture other tooling depends on.
 *
 * Every row this script inserts carries `detail->>'seed' = 'visitor-analytics-2026-10-09'`
 * so it can be found and deleted later without guessing:
 *
 *   DELETE FROM analytics_event WHERE detail->>'seed' = 'visitor-analytics-2026-10-09';
 *
 * Usage:
 *   DATABASE_URL=postgresql://localhost:5432/advo_dev node apps/api/scripts/seed-visitor-analytics.mjs
 */
import postgres from "postgres";

const SEED_TAG = "visitor-analytics-2026-10-09";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.includes("advo_dev")) {
  console.error("Refusing to run: DATABASE_URL must point at advo_dev. Got:", DATABASE_URL);
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const CITIES = [
  { country: "PH", region: "National Capital Region", city: "Manila", lat: 14.6, lon: 120.98, weight: 30 },
  { country: "PH", region: "National Capital Region", city: "Makati City", lat: 14.55, lon: 121.03, weight: 14 },
  { country: "PH", region: "Cebu", city: "Cebu City", lat: 10.32, lon: 123.89, weight: 10 },
  { country: "PH", region: "Davao del Sur", city: "Davao City", lat: 7.07, lon: 125.61, weight: 6 },
  { country: "SG", region: "Singapore", city: "Singapore", lat: 1.35, lon: 103.82, weight: 8 },
  { country: "JP", region: "Tokyo", city: "Tokyo", lat: 35.68, lon: 139.69, weight: 5 },
  { country: "AU", region: "New South Wales", city: "Sydney", lat: -33.87, lon: 151.21, weight: 5 },
  { country: "US", region: "California", city: "Los Angeles", lat: 34.05, lon: -118.24, weight: 7 },
  { country: "GB", region: "England", city: "London", lat: 51.51, lon: -0.13, weight: 6 },
  { country: "AE", region: "Dubai", city: "Dubai", lat: 25.2, lon: 55.27, weight: 4 },
  { country: "US", region: "New York", city: "New York", lat: 40.71, lon: -74.01, weight: 4 },
  { country: "KR", region: "Seoul", city: "Seoul", lat: 37.57, lon: 126.98, weight: 3 },
  { country: "HK", region: "Hong Kong", city: "Hong Kong", lat: 22.32, lon: 114.17, weight: 3 },
  { country: "CA", region: "Ontario", city: "Toronto", lat: 43.65, lon: -79.38, weight: 3 },
  { country: "DE", region: "Berlin", city: "Berlin", lat: 52.52, lon: 13.4, weight: 2 },
];

const PAGES = ["/", "/portfolio", "/pricing", "/start", "/team", "/privacy", "/project/12"];
const LANDING_SECTIONS = ["top", "solutions", "services", "process"];
const SCROLL_MILESTONE = [25, 50, 75, 100];

function weightedPick(items) {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function randomPastDate(maxDaysAgo) {
  const daysAgo = Math.random() * maxDaysAgo;
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function nanoidLike() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const rows = [];
const SESSION_COUNT = 220;
const WINDOW_DAY = 85;

for (let s = 0; s < SESSION_COUNT; s += 1) {
  const sessionId = `seed_${nanoidLike()}`;
  const visitorId = Math.random() < 0.85 ? `seed_v_${nanoidLike()}` : null;
  const city = weightedPick(CITIES);
  const startedAt = randomPastDate(WINDOW_DAY);
  const pageCount = 1 + Math.floor(Math.random() * 4);
  const visitedPages = Array.from({ length: pageCount }, () => PAGES[Math.floor(Math.random() * PAGES.length)]);

  let cursor = new Date(startedAt);
  const pushEvent = (kind, path, detail) => {
    rows.push({
      kind,
      occurredAt: new Date(cursor),
      // The stats API filters on receivedAt (the server clock), same as production
      // ingest -- a seed row backdated only on occurredAt would all land in "today"'s
      // bucket and the trend chart would show one spike instead of a spread.
      receivedAt: new Date(cursor),
      sessionId,
      visitorId,
      path,
      detail: { ...detail, seed: SEED_TAG },
      geoCountry: city.country,
      geoRegion: city.region,
      geoCity: city.city,
      geoLat: city.lat.toFixed(2),
      geoLon: city.lon.toFixed(2),
    });
    cursor = new Date(cursor.getTime() + (5_000 + Math.random() * 40_000));
  };

  pushEvent("session_start", visitedPages[0], {});
  for (const page of visitedPages) {
    pushEvent("page_view", page, {});

    if (page === "/") {
      for (const section of LANDING_SECTIONS) {
        if (Math.random() < 0.7) {
          pushEvent("scroll_depth", page, {
            metric: "section_dwell",
            section,
            dwell_second: Math.round(3 + Math.random() * 40),
          });
        }
      }
      for (const milestone of SCROLL_MILESTONE) {
        if (Math.random() < 1 - milestone / 130) {
          pushEvent("scroll_depth", page, { metric: "depth_percent", percent: milestone });
        }
      }
    }

    if (Math.random() < 0.15) pushEvent("click", page, { surface: "landing", label: "Start a project" });
  }
  pushEvent("session_end", visitedPages[visitedPages.length - 1], {});
}

console.log(`Inserting ${rows.length} seed events across ${SESSION_COUNT} sessions...`);

const BATCH = 500;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH).map((r) => ({
    kind: r.kind,
    occurred_at: r.occurredAt,
    received_at: r.receivedAt,
    session_id: r.sessionId,
    visitor_id: r.visitorId,
    path: r.path,
    detail: r.detail,
    geo_country: r.geoCountry,
    geo_region: r.geoRegion,
    geo_city: r.geoCity,
    geo_lat: r.geoLat,
    geo_lon: r.geoLon,
  }));

  await sql`
    insert into analytics_event ${sql(
      chunk,
      "kind",
      "occurred_at",
      "received_at",
      "session_id",
      "visitor_id",
      "path",
      "detail",
      "geo_country",
      "geo_region",
      "geo_city",
      "geo_lat",
      "geo_lon",
    )}
  `;
}

console.log(`Done. Tag: detail->>'seed' = '${SEED_TAG}'`);
console.log(`To remove: DELETE FROM analytics_event WHERE detail->>'seed' = '${SEED_TAG}';`);

await sql.end();
