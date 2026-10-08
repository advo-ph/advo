# Visitor analytics: server-side geo + admin "Visitors" surface

**Status:** EXECUTED 2026-10-09 — see "Execution log" at the end of this file for the
checklist, deviations (location + map amendments from the user), and verification
evidence. Ships dormant (`VITE_ANALYTICS` unset); nothing deployed, VPS untouched.
**Classification:** COMPLEX (new migration, new backend service, new admin surface, privacy copy change, new test harness)
**Repo:** `/Users/princewagan/advo-1`
**Plan file:** `process/general-plans/active/visitor-analytics_PLAN_09-10-26.md`

---

## 0. Scope change applied during planning

The user issued a scope change after research completed: **do not delete raw analytics
rows.** This plan reflects that change throughout. Specifically, relative to the original
request:

- `retention.service.ts` keeps the **daily rollup** (cheap, still useful for fast
  long-range charts) but **stops deleting raw rows by default**. Deletion becomes
  **opt-in**: `ANALYTICS_RETENTION_DAY` unset or `0` = never delete (new default);
  a positive integer re-enables the existing rollup-verify-then-delete sweep at that
  many days.
- The geo **rollup table is dropped from scope.** Raw `analytics_event` rows are kept
  indefinitely by default, so the admin stats API reads geo directly off the raw table for
  any date range — no separate aggregate is needed to preserve history past 90 days.
- `Privacy.tsx`'s "ninety (90) days" retention claim is now false and must be rewritted to
  match the new default (kept until deleted on request / no automatic deletion).
- `bench/roadmap/analytics/scoring.mjs`'s `A8-retention` check was inspected (exact regex
  below) — **no change to the bench file is required**, but the plan calls out exactly why
  and what must be preserved in `retention.service.ts` so the check keeps passing.
- A storage-growth estimate is added to Risks, because "never delete by default" on a
  20 GB VPS disk is a real operational exposure the user should see before approving.

---

## 1. Context (verified by research)

### 1.1 What already exists, dormant

Visitor analytics is fully built end-to-end and shipped **inert** behind the build-time
flag `VITE_ANALYTICS` (unset everywhere in this repo; the real prod value, if any, lives in
the untracked `apps/web/.env.production` on the VPS). See
`docs/ROADMAP.md` lines 144-170 ("Analytics — consent gate, event spine, surfaces").

| Piece | File | Notes |
|---|---|---|
| Client tracker | `apps/web/src/lib/track.ts` | Consent-gated, batched (`BATCH_MAX=40`, 15s flush, `BUFFER_MAX=200`). `EventKind` = `page_view\|click\|form_start\|form_submit\|scroll_depth\|outbound_click\|session_start\|session_end\|error`. `observeLandingSection(root)` (line 445) watches `section[id]` on the landing page and emits `scroll_depth` events with `detail.metric === "section_dwell"` per section id on dwell-end, plus scroll-depth milestones (25/50/75/100) with `detail.metric === "depth_percent"`. Landing section ids today: `top`, `solutions`, `services`, `process` — the marquee section has no `id` and is invisible to this instrumentation. |
| Consent | `apps/web/src/components/ConsentGate.tsx` | `localStorage`, 180-day re-ask, excluded on `/admin` and `/hub`. |
| Ingest | `apps/api/src/routes/event.routes.ts` | `POST /api/event` — zod batch schema, 200 events/request, 256 KB body cap, in-process rate limiter keyed by `rateKey()` (socket peer; trusts `X-Real-IP` only when the peer is private/loopback — i.e. our own nginx). `normalisePath()` bounds path cardinality for the rollup. |
| Admin read | `GET /api/event/engagement` (same file) | admin-only, joins `analytics_event.user_id -> client.user_id`, used only by `AdminEngagement.tsx` / `useEngagement.ts`. |
| Schema | `apps/api/src/db/schema.ts` lines 1796-1871 | `analyticsEvent` (no IP, no geo columns today) + `analyticsEventRollup` (unique on `period, kind, path`; `eventCount`, `sessionCount`, `visitorCount`). Migration `046_analytics_event.sql`. Raw SQL migrations live in `apps/api/migrations/`, latest applied is `050_portfolio_visibility.sql`, so the next file is `051_*`. |
| Retention | `apps/api/src/services/retention.service.ts` | Rollup-verify-then-delete, daily sweep, currently defaults to 90-day raw retention. **This plan changes its default — see §2.** |
| Privacy copy | `apps/web/src/pages/legal/Privacy.tsx` lines 108-122, 180 | States IP is used in memory for rate-limiting only and is not stored; states analytics records are deleted after 90 days. **Both claims must stay true after this change — the 90-day one currently would not.** |
| Admin section registry | `apps/web/src/pages/Admin.tsx` (`SECTION_LABEL`), `apps/web/src/components/admin/AdminSidebar.tsx` (`AdminSection` union) | Adding a section means: add to the `AdminSection` union, add a sidebar entry, add to `SECTION_LABEL`, add the `activeSection === "x"` render branch in `Admin.tsx`. `AdminEngagement.tsx` is the closest existing analog — same file set, same `_ui.tsx` primitives (`PageHeader`, `StatStrip`, `Stat`, `Table`, `THead`, `TBody`, `TRow`, `Empty`, `Dot`). |
| Chart library | `recharts@2.15.4` | Already a dependency of `apps/web`. Already used once, in `AdminVpsMonitor.tsx` — follow that file's chart-wrapper pattern rather than inventing a new one. |

`docs/MONITORING-POLICY.md` bans geolocation, but it governs **staff** `/admin` telemetry
only (`lib/staff-telemetry.ts`, flag `VITE_STAFF_MONITORING`, currently OFF). This plan does
not touch staff telemetry and the policy does not apply to visitor geo.

### 1.2 Hosting facts that drive design

- Single Contabo VPS, Singapore (`docs/SETUP.md` → Infrastructure table: **"Contabo Cloud
  VPS 20 SSD"**, i.e. **20 GB total disk**), nginx + PM2 (`advo-api`, port 6407) + local
  Postgres. No CDN, no edge geo headers available.
- `apps/api/.env` and `apps/web/.env.production` are **untracked** on the box; `deploy.sh`
  does `git fetch` + `git reset --hard origin/<branch>`, which leaves untracked files alone.
  This is the mechanism a gitignored `.mmdb` file relies on to survive a deploy.
- `npm --workspace apps/web run typecheck` is the correct web typecheck command (not
  `npx tsc --noEmit`, which checks nothing against this project's `tsconfig.app.json`).
- There is **no API-side test runner today.** `apps/api/package.json` has no `test`
  script and no `vitest`/`node:test` devDependency. All existing analytics tests
  (`apps/web/src/test/analytics-consent.test.ts`) run in the **web** workspace against
  mocked `fetch`, and the few true integration suites (`e2e-flow.test.ts`,
  `api-wiring.test.ts`) are also web-workspace vitest files that hit a **live, already
  running** local API (`scripts/test-local.sh` boots it) rather than importing API source
  directly — the web workspace does not depend on the API package. This plan adds a small,
  explicitly-scoped API-side test runner (§5) because the new geo-resolution logic is
  pure, server-only, and has nothing to mock against in the web workspace.

### 1.3 Acceptance bench

`npm run bench:analytics` → `bench/roadmap/analytics/scoring.mjs`, currently **13/13**,
candidate tier (not in default `npm test`). The one check this plan's retention change
touches:

```js
add("A8-retention", "raw events have a bounded retention window and a rollup",
  /RETENTION_DAY|retentionDay/.test(retention) && /rollup|aggregate/i.test(retention),
  ...);
```

This is a **substring match against the file text**, not a behavioral assertion — it only
requires the tokens `RETENTION_DAY` or `retentionDay`, and separately `rollup`/`aggregate`
(case-insensitive), to appear anywhere in `retention.service.ts`. Both already appear
today and both **must still appear** after this change (the constant name, the function
name, and the word "rollup" all stay in the file under the new default-disabled behavior).
**No edit to `scoring.mjs` is required.** Verification step: re-run `bench:analytics`
after the retention edit and confirm it is still 13/13 (§6).

---

## 2. Scope (revised)

1. **Server-side geo lookup at ingest**, using a local offline GeoIP database — no
   external API call per request, raw IP never persisted.
2. **Schema**: migration `051` adds geo columns directly to `analytics_event`. No separate
   geo rollup table (dropped per scope change — raw rows are retained indefinitely by
   default, so there is nothing to preserve past a retention window that no longer runs).
3. **Retention default change**: raw rows are kept forever unless an operator opts in by
   setting `ANALYTICS_RETENTION_DAY` to a positive integer. The daily rollup job is
   unchanged and keeps running regardless (cheap, and it is what the existing dashboards
   and any future long-range chart read for coarse trends).
4. **Admin "Visitors" stats API**: new admin-only read endpoint(s) over the raw table —
   unique visitors / sessions / page views over a date range, top pages, landing section
   attention + dwell, scroll-depth funnel, top countries/cities. Nothing beyond what
   `track.ts` already captures (no new client-side fingerprinting).
5. **Admin "Visitors" page**: new `/admin/visitors` section following the existing admin
   section pattern, built with `recharts` (already a dependency) and the shared `_ui.tsx`
   primitives.
6. **Privacy.tsx**: update the analytics disclosure — geo collection, honest retention
   language (no more "90 days"), DB-IP attribution if that provider is chosen.
7. **Turn-on step** (`VITE_ANALYTICS=true` in `apps/web/.env.production` on the VPS, then
   rebuild/redeploy) is a **manual ops step requiring explicit user approval** — it is
   listed in §9 but is NOT auto-executed by EXECUTE mode.

Out of scope (named, not silently dropped): legal review of the new Privacy.tsx copy
(flagged as an open question, §10), a server-side consent record, bounding `detail`'s
free-form JSON, staff telemetry of any kind, and any change to `MONITORING-POLICY.md`.

---

## 3. Geo database decision

**Chosen: DB-IP City Lite (CC BY 4.0), read via the `maxmind` npm package.**

| | DB-IP City Lite | MaxMind GeoLite2-City |
|---|---|---|
| Account required | No | Yes (MaxMind account + license key, EULA click-through) |
| File format | MMDB (same binary format MaxMind invented; `maxmind` npm reader works on either) | MMDB |
| Cost | Free, CC BY 4.0 — **attribution required** | Free tier, requires accepting MaxMind's GeoLite2 EULA, re-verification periodically |
| Download mechanism | Direct monthly URL, no auth: `https://download.db-ip.com/free/dbip-city-lite-<YYYY-MM>.mmdb.gz` | Requires a license key query param, account can be suspended/revoked, has had public incidents of changed download terms |
| Ops overhead on a one-person VPS | Lowest — one `curl` in a cron job, no secret to rotate | One more credential to generate, store, and rotate; one more thing that can silently expire |

Rationale: this project already minimizes third-party account dependencies (see
`docs/CREDENTIALS.md` philosophy referenced throughout `ROADMAP.md` — e.g. `PAYMENT_PROVIDER`
defaults to `manual` specifically to avoid being blocked on an external account). DB-IP
City Lite gets equivalent city-level accuracy for this use case (coarse "where are our
visitors" dashboard, not fraud scoring) with zero new secrets. The `maxmind` npm package
reads any MMDB file, so switching to GeoLite2 later is a config change, not a rewrite.

**Attribution requirement (CC BY 4.0):** a credit must be visible somewhere reasonably
discoverable. This plan places it in `Privacy.tsx`'s analytics section (the page a visitor
would read to understand what is collected), linking to `https://db-ip.com`. No footer
change is required for CC BY 4.0 compliance, but note in open questions (§10) that this is
the plan's own judgment call, not a confirmed legal reading.

---

## 4. Detailed design

### 4.1 Shared client-IP resolution (new, extracted)

`event.routes.ts`'s `rateKey()` already contains the only correct "what is the real
client IP" logic in this codebase (peer address from `getConnInfo`, trusting
`X-Real-IP`/`CF-Connecting-IP` only when the peer is private/loopback — i.e. arrived
through our own nginx, which sets `X-Real-IP $remote_addr`). The geo lookup needs the
same IP, so this logic is extracted rather than duplicated.

**New file: `apps/api/src/utils/client-ip.ts`**
- Export `resolveClientIp(c: Context<{ Variables: Variables }>): string` — the body of
  today's `rateKey()` minus the "unknown" fallback naming (same `isPrivateAddress` logic,
  same trust order: direct peer if not private → `X-Real-IP` → `CF-Connecting-IP` → peer).
- Export `isPrivateAddress(address: string): boolean` (moved as-is).
- `event.routes.ts`'s `rateKey()` becomes a thin wrapper: `const rateKey = (c) =>
  resolveClientIp(c)` (keeps the existing name/call sites so the rate limiter is
  untouched) — **behavior is identical**, this is a pure extraction, not a logic change.

### 4.2 Geo resolution service (new)

**New file: `apps/api/src/services/geo.service.ts`**

```
export interface GeoLocation {
  country: string | null;  // ISO 3166-1 alpha-2, e.g. "PH"
  region: string | null;   // e.g. "National Capital Region" or subdivision name as the DB returns it
  city: string | null;
}

export function resolveGeo(ip: string): GeoLocation | null
```

Behavior:
- Returns `null` immediately for a private/loopback address (reuse `isPrivateAddress` from
  `client-ip.ts`) — localhost dev traffic never gets a fake geo.
- Lazily opens the MMDB reader on first call (module-level singleton), from
  `process.env.GEO_DB_PATH || "./data/geo/dbip-city-lite.mmdb"` resolved relative to the
  API's cwd (matches the existing `UPLOAD_DIR=./uploads` convention in
  `apps/api/.env`).
- **If the file does not exist, or the reader throws on open or on lookup**: log once (a
  single warn on first failure, not per-request — a missing file must not become per-event
  log spam), cache a "geo is unavailable" flag, and return `null` for every subsequent call
  without re-attempting the file open on every request. Ingest must keep working with
  `geo_country/geo_region/geo_city = null` — geo is enrichment, never a hard dependency.
- The raw IP string is read, passed to the reader, and discarded within this function. It
  is **never logged, never returned, never stored** — satisfies "raw IP must never be
  persisted" and keeps the existing Privacy.tsx promise about IP intact (§4.5).
- Dependency: add `maxmind` to `apps/api/package.json` dependencies (new).

### 4.3 Migration 051 — geo columns (SQL sketch)

**New file: `apps/api/migrations/051_analytics_event_geo.sql`**

```sql
-- Migration 051: visitor geo on analytics_event (country/region/city only; no raw IP).
-- No separate geo rollup table — raw rows are retained indefinitely by default as of this
-- migration (see retention.service.ts), so the admin stats API reads geo straight off this
-- table for any date range.

ALTER TABLE analytics_event
  ADD COLUMN IF NOT EXISTS geo_country varchar(2),
  ADD COLUMN IF NOT EXISTS geo_region  varchar(100),
  ADD COLUMN IF NOT EXISTS geo_city    varchar(100);

-- Partial: most rows will have a geo once the lookup is live, but historical rows (and
-- anything looked up before the mmdb file existed) will not. Speeds "top countries in
-- range" without taxing every insert with a mandatory non-null index.
CREATE INDEX IF NOT EXISTS idx_analytics_event_geo_country
  ON analytics_event (geo_country, received_at)
  WHERE geo_country IS NOT NULL;

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('051_analytics_event_geo.sql', false)
ON CONFLICT (filename) DO NOTHING;
```

**Drizzle `apps/api/src/db/schema.ts` update** (inside the `analyticsEvent` pgTable, after
`detail`):
```ts
geoCountry: varchar("geo_country", { length: 2 }),
geoRegion: varchar("geo_region", { length: 100 }),
geoCity: varchar("geo_city", { length: 100 }),
```
and in the index array:
```ts
index("idx_analytics_event_geo_country").on(t.geoCountry, t.receivedAt).where(sql`geo_country IS NOT NULL`),
```

No change to `analyticsEventRollup` — it is unaffected by this feature (unchanged scope:
kind/path rollup for the existing dashboards).

### 4.4 Ingest wiring (`event.routes.ts` edit)

Inside the existing `event.post("/", optionalAuth, async (c) => { ... })` handler, after
the existing rate-limit check and before the `db().insert(...)` call:

```ts
const clientIp = resolveClientIp(c);           // was: inlined in rateKey()
const geo = resolveGeo(clientIp);               // new — computed ONCE per request/batch
```

Then in the `.values(parsed.data.map(...))` mapper, add:
```ts
geoCountry: geo?.country ?? null,
geoRegion: geo?.region ?? null,
geoCity: geo?.city ?? null,
```

Every event in a batch shares one requester, so geo is resolved once per request, not once
per event — consistent with the file's existing performance posture (rate limiting is also
computed once per request).

`rateKey(c)` call site is updated to `resolveClientIp(c)` (same behavior, new shared
location — see §4.1).

### 4.5 Privacy.tsx copy changes

File: `apps/web/src/pages/legal/Privacy.tsx`.

1. **Lines ~108-113** (IP paragraph) — add one sentence after the existing "Your IP
   address is used in memory to limit abuse... and is not stored with the analytics"
   sentence:
   > We also use your IP address, in memory only, to derive an approximate location
   > (country, region and city) at the moment we receive it; the IP address itself is
   > discarded immediately and never stored. Location data comes from the free
   > [DB-IP City Lite database](https://db-ip.com), used under its CC BY 4.0 licence.

2. **Lines ~114-122** (lawful basis / retention paragraph) — the collected-data list
   gains "approximate location (country, region, city)"; **replace** the sentence:
   > individual analytics records are deleted ninety (90) days after we receive them. What
   > remains afterwards is a daily count per page, with no visitor id, no session id, and
   > no account attached.

   with:
   > we do not currently delete individual analytics records automatically — they are kept
   > until you ask us to delete them (see "Your analytics choice" below) or until we adopt
   > a stated retention period. A daily summary count per page is kept separately and
   > never contains a visitor id, session id, or account identifier.

3. **Line ~180** — replace:
   > `{isAnalyticsOn && " Analytics records are kept for ninety (90) days, as described above."}`

   with:
   > `{isAnalyticsOn && " Analytics records are kept until deleted, as described above."}`

4. **Header doc-comment at line ~21** ("...and to RETENTION_DAY in
   `apps/api/src/services/retention.service.ts`") — update the comment to say
   `ANALYTICS_RETENTION_DAY (unset = kept indefinitely; set to enable automatic deletion)`.

### 4.6 Retention service changes (`retention.service.ts`)

Behavior change only; rollup logic (`rollupAnalyticsEvent`) is **untouched**.

- `RETENTION_DAY = 90` constant stays (documents the legacy/example value an operator can
  opt into; also keeps the bench token present, §1.3).
- `retentionDay()` is changed from "always returns a number, defaulting to 90" to:
  ```ts
  /** Returns null when deletion is disabled (the default). A positive env value opts in. */
  function retentionDay(): number | null {
    const raw = process.env.ANALYTICS_RETENTION_DAY;
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }
  ```
- `sweepAnalyticsEvent()`: first line becomes
  ```ts
  const day = retentionDay();
  if (day === null) {
    return { deletedCount: 0, isComplete: true, refusedDay: [] };
  }
  ```
  then uses `day` everywhere `retentionDay()` was called before (the cutoff computation,
  the orphan-check window). No other logic in this function changes — the
  rollup-verify-then-delete safety property is preserved byte-for-byte for the opt-in path.
- `runRetention()` is unchanged in shape (still rolls up lookback days, then calls
  `sweepAnalyticsEvent()`); add a `isRetentionEnabled: boolean` field to `RetentionResult`
  (`day !== null`) so a log line / future admin panel can show whether deletion is active.
- Update the file's header comment block (the "WINDOW" explanation) to state the new
  default plainly: raw rows are kept forever unless `ANALYTICS_RETENTION_DAY` is set to a
  positive integer, at which point the existing rollup-verify-then-delete sweep applies.
- `apps/api/.env.example` line with `# ANALYTICS_RETENTION_DAY=90` gets its comment
  rewritten: `# Unset (default) = analytics rows are never auto-deleted. Set to a positive
  integer (e.g. 90) to enable the rollup-verify-then-delete sweep at that many days.`

### 4.7 Admin stats API (new)

**New file: `apps/api/src/routes/visitor-stats.routes.ts`**, mounted in
`apps/api/src/index.ts` as `app.route("/api/visitor-stats", visitorStatsRoutes)`
(new top-level mount, consistent with how every other domain gets its own route prefix —
not nested under `/api/event` because this is a materially larger surface than the single
existing `/engagement` read and deserves its own file for reviewability).

All routes: `requireAuth, requireAdmin` (same enforcement pattern as
`GET /api/event/engagement` — the boundary is the endpoint, not a client-side hide).

Query parameter shared by all: `?from=<ISO date>&to=<ISO date>` (default: last 30 days,
cap at 365 days — mirrors `ENGAGEMENT_WINDOW_DAY_DEFAULT`/`_MAX` pattern already in
`event.routes.ts`).

| Endpoint | Returns | Source |
|---|---|---|
| `GET /api/visitor-stats/summary` | `{ uniqueVisitorCount, sessionCount, pageViewCount, byDay: [{ date, uniqueVisitorCount, sessionCount, pageViewCount }] }` | `analytics_event` filtered by `receivedAt` range, `countDistinct(visitorId)`/`countDistinct(sessionId)`, grouped by UTC day of `receivedAt` |
| `GET /api/visitor-stats/pages` | `[{ path, viewCount, sessionCount }]`, top 25 by `viewCount` | `analytics_event` where `kind = 'page_view'`, grouped by `path` (already-normalised by `normalisePath` at ingest) |
| `GET /api/visitor-stats/sections` | `[{ section, viewCount, avgDwellSecond }]` for the landing sections | `analytics_event` where `kind = 'scroll_depth'` and `detail->>'metric' = 'section_dwell'`, grouped by `detail->>'section'`, `avg((detail->>'dwell_second')::int)` |
| `GET /api/visitor-stats/scroll-depth` | `[{ milestone: 25\|50\|75\|100, reachedSessionCount }]` | same table, `kind = 'scroll_depth'` and `detail->>'metric' = 'depth_percent'`, `countDistinct(sessionId)` grouped by `detail->>'percent'` |
| `GET /api/visitor-stats/geo` | `{ countries: [{ country, viewCount }], cities: [{ country, city, viewCount }] }`, top 20 each | `analytics_event` where `geo_country IS NOT NULL`, grouped by `geo_country` / `(geo_country, geo_city)` |

Notes:
- Every query filters on `receivedAt` (indexed: `idx_analytics_event_received`), matching
  the direction in the scope-change instructions ("check index needs for long ranges:
  index exists"). The new `idx_analytics_event_geo_country` (§4.3) covers the geo endpoint
  specifically; Postgres can bitmap-AND it with the received_at index for a bounded range.
- `jsonb ->>` filters on `detail` have no index; given this project's stated traffic scale
  (a ~10 MB database before this feature) this is an accepted tradeoff, not an oversight —
  flagged in Risks (§8) as "revisit if the sections/scroll-depth queries become slow."
- No new fingerprinting, no new client-sent field — every endpoint reads only columns and
  `detail` keys `track.ts` already writes today.

### 4.8 Admin "Visitors" page (new)

1. `apps/web/src/components/admin/AdminSidebar.tsx`: add `"visitors"` to the
   `AdminSection` union (alongside `"engagement"`), add a sidebar nav entry.
2. `apps/web/src/pages/Admin.tsx`: add `"visitors": "Visitors"` to `SECTION_LABEL`, add
   `import AdminVisitors from "@/components/admin/AdminVisitors";`, add
   `{activeSection === "visitors" && <AdminVisitors />}`.
3. **New file: `apps/web/src/hooks/useVisitorStats.ts`** — one `useQuery` per endpoint in
   §4.7 (or a single hook returning all five keyed by date range, following
   `useEngagement.ts`'s shape: typed response interfaces, snake_case wire → the hook is the
   seam, components consume typed fields).
4. **New file: `apps/web/src/components/admin/AdminVisitors.tsx`**:
   - `PageHeader` + a date-range control (reuse the `WINDOW_OPTION`-style preset pattern
     from `AdminEngagement.tsx`: 7/30/90 days).
   - `StatStrip` with `Stat` tiles: unique visitors, sessions, page views (current window).
   - A line/area chart (recharts, following `AdminVpsMonitor.tsx`'s chart pattern) for the
     `byDay` time series.
   - A `Table` of top pages (`path`, `viewCount`, `sessionCount`).
   - A `Table` or small bar list of landing sections (`section`, `viewCount`,
     `avgDwellSecond`) — label clearly that only `top/solutions/services/process` can ever
     appear (the marquee section has no `id` and is invisible to this data; do not imply
     coverage it does not have).
   - A simple scroll-depth funnel (25/50/75/100 with reached-session counts, rendered as a
     horizontal bar or four stat tiles — no new chart type needed).
   - A `Table` of top countries and a `Table` of top cities (country code + name mapping:
     either a small static ISO-3166 alpha-2 → name lookup object colocated in this file, or
     `Intl.DisplayNames` if available in the supported browser matrix — prefer
     `Intl.DisplayNames('en', {type:'region'})` since it needs no new dependency and is
     broadly supported).
   - **Empty states** (two distinct ones, per `Empty` from `_ui.tsx`):
     a. No rows in the selected window at all → "No visitor activity in this range."
     b. (Detectable because every row would be entirely absent, not just geo-null)
        Analytics has never been enabled in production → the same empty state is
        sufficient; this plan does not add a separate "analytics is off" banner because
        the API has no reliable way to distinguish "off" from "on but quiet" — note this
        as an accepted limitation, not a bug.
   - Width constraint: must render without horizontal overflow or clipped controls at
     **1440×900** and **390×844** (iPhone 12/13 viewport — matches the project's existing
     mobile-check convention seen in `scripts/console-mobile-check.mjs` /
     `verify-console-mobile.mjs`). The admin shell is already responsive (sidebar collapses
     to a drawer on mobile per `AdminSidebar.tsx`'s `ADMIN_DRAWER_ID`); this page must not
     break that pattern — tables scroll horizontally within a bounded container rather than
     forcing the page to overflow.
   - UI copy rules (per project conventions): no decorative eyebrows, no em dashes, no
     filler. Every label states what the number is plainly ("Unique visitors", not "Visitor
     Insights ✨").

### 4.9 Geo database file: location, download, update cadence

- Runtime path: `apps/api/data/geo/dbip-city-lite.mmdb`, read via `GEO_DB_PATH` env
  (default points here). Add `apps/api/data/geo/` to `.gitignore` — the file is ~80 MB+ and
  license-restricted-to-redistribute-as-is in spirit (CC BY 4.0 permits redistribution with
  attribution, but there is no reason to bloat this git history with a monthly binary).
- **New file: `scripts/update-geo-db.sh`** (root `scripts/`, matching the project's existing
  convention of committing ops scripts there, e.g. `db-local.mjs`, `migration-drift.mjs`):
  - Downloads the current month's `dbip-city-lite-<YYYY-MM>.mmdb.gz` from DB-IP's public
    free URL, decompresses to a temp file, and **atomically renames** it into place over
    the live `.mmdb` (same atomic-swap discipline `deploy.sh` uses for the web dist dir —
    a partial download must never become the file the running process reads mid-write).
  - On the VPS: add a monthly root crontab entry (documented in §4.10's `docs/SETUP.md`
    addition) that runs this script then `pm2 restart advo-api --update-env` so the new
    file is picked up (the geo service opens the reader once per process lifetime; a
    restart is the simplest correct refresh — no hot-reload complexity added for a
    monthly cadence).
  - Exits non-zero and leaves the old file untouched if the download or decompression
    fails — never swap in a corrupt/partial file.

### 4.10 Documentation updates (part of this plan's deliverables)

- `docs/SETUP.md`: add a short "Geo database (visitor analytics)" subsection under
  Environment Variables or Infrastructure — what `GEO_DB_PATH` is, what
  `scripts/update-geo-db.sh` does, the monthly cron line to add on the VPS, and that the
  file is gitignored and must exist on the VPS before `VITE_ANALYTICS`/geo collection is
  meaningful (absence degrades to `null` geo, not a failure).
- `apps/api/.env.example`: add `# GEO_DB_PATH=./data/geo/dbip-city-lite.mmdb` (commented,
  matching the file's existing style for optional vars) and rewrite the
  `ANALYTICS_RETENTION_DAY` comment per §4.6.
- `docs/ROADMAP.md` analytics table: add a row (or amend `A9-public-funnel`'s note) once
  this ships, noting the admin visitors surface now exists — **defer the exact wording to
  EXECUTE/UPDATE PROCESS**, since ROADMAP entries describe shipped state and this plan has
  not shipped yet. Flagged here only so it is not forgotten at closeout.

---

## 5. Test plan

### 5.1 New API-side test harness (new, scoped narrowly)

There is currently no way to unit-test pure server-only logic without booting the full API
(§1.2). The new geo/IP logic is pure and deserves direct unit coverage rather than only an
indirect e2e assertion. Add a minimal, scoped vitest setup to `apps/api`:

- `apps/api/package.json`: add `vitest` to `devDependencies`, add
  `"test": "vitest run"` script.
- **New file: `apps/api/vitest.config.ts`** — Node environment (not jsdom; this is backend
  code), `include: ["src/**/*.test.ts"]`.
- **New file: `apps/api/src/services/geo.service.test.ts`**:
  - `resolveGeo("127.0.0.1")` → `null` (loopback short-circuit, no file read attempted).
  - `resolveGeo("192.168.1.1")` → `null` (private range short-circuit).
  - With `GEO_DB_PATH` pointed at a nonexistent path: `resolveGeo("8.8.8.8")` → `null`,
    and a second call does not re-attempt the file open (assert via a spy on the
    underlying file-read call, or via a module-level counter exposed for test only) —
    proves the "log once, then cheap no-op" behavior from §4.2.
  - With a tiny **test fixture** MMDB (a few-KB sample file is sufficient; `maxmind`'s own
    package or test fixtures typically ship one, or a minimal hand-built fixture can be
    generated — confirm during EXECUTE which is simpler) pointed at by `GEO_DB_PATH`:
    `resolveGeo(<ip the fixture knows>)` returns the expected `{country, region, city}`
    shape, and the returned object never contains an `ip` key under any code path (a
    static/structural assertion that the function's return type cannot carry it, backed by
    a runtime check that no property is ever an IP-shaped string).
- **New file: `apps/api/src/utils/client-ip.test.ts`**: table-driven tests for
  `isPrivateAddress` (loopback, `10.x`, `192.168.x`, `172.16-31.x`, a public address) and
  `resolveClientIp` given a mocked `Context` (direct peer wins when public; `X-Real-IP`
  wins only when the peer is private; `CF-Connecting-IP` as the next fallback) — this is a
  pure port of `rateKey()`'s existing documented behavior, so the tests encode what is
  already true today, proving the extraction in §4.1 changed nothing.
- `apps/api/src/services/retention.service.test.ts` (new): `retentionDay()` returns `null`
  for unset/empty/`"0"`/negative/non-numeric env, and a positive floored number otherwise;
  `sweepAnalyticsEvent()` short-circuits (no DB calls — mock `db()`) when disabled.
- Root `package.json`: add `"test:api": "npm --workspace apps/api run test"` for
  discoverability (does not change what `npm test` or `npm run test:local` run — both stay
  web-workspace-scoped, per existing convention — this is additive only).

**This is a new piece of infrastructure, not a trivial addition** — call this out
explicitly at the PLAN→EXECUTE checkpoint: it adds a new test runner to the monorepo,
which `vc-audit-vc`/`vc-audit-context` maintainers should know about going forward.

### 5.2 Web-side tests (existing pattern, extended)

- Extend `apps/web/src/test/analytics-consent.test.ts` or add a sibling test asserting
  `track.ts` still never sends an `ip` or geo field in its event body shape (defense in
  depth — the server computes geo from the transport layer, the client must never be
  asked to supply it). This is a static assertion on `TrackEvent`'s shape, cheap to write.
- No change needed to `e2e-flow.test.ts`/`api-wiring.test.ts` unless EXECUTE finds a
  reason; if a live-API smoke assertion is added for the new `/api/visitor-stats/*`
  endpoints (admin-auth-required, 200 shape), it follows the existing `live-api.ts`
  skip-if-API-not-running pattern.

### 5.3 Manual / screenshot verification

- `node scripts/update-geo-db.sh` run locally once against a throwaway path to confirm the
  atomic-swap behavior (does not require the VPS).
- A new `scripts/shot-admin-visitors.mjs`, following `scripts/shot-admin.mjs`'s existing
  pattern (Playwright, login, navigate, screenshot), capturing `/admin/visitors` at
  **1440×900** and **390×844**, saved under `/tmp/advo-shots/` (same output convention) —
  attach both screenshots to the EXECUTE/closeout report for the user to review, per this
  plan's instruction to verify visually rather than by trusting a report.
- Manual check: with `GEO_DB_PATH` pointed at a real downloaded DB-IP file and a few test
  events posted from a non-loopback IP (or via `X-Real-IP` header against a local nginx-
  simulated request), confirm `geo_country`/`geo_region`/`geo_city` populate and that no
  `ip`/`geo_ip`-shaped column or log line exists anywhere in `apps/api` output.

### 5.4 Regression gate

- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/api run build` (tsc; new files must compile)
- `npm test` (web vitest suite — must stay green; this plan does not touch anything it
  currently covers behaviorally, but the extraction in §4.1 and the schema/retention edits
  touch files `api-wiring.test.ts`/`e2e-flow.test.ts` may exercise indirectly if they're
  running against a live local API — re-run `npm run test:local` once if time allows)
- `npm run bench:analytics` — **must remain 13/13** (§1.3)
- `npm --workspace apps/api run test` (new, §5.1)
- `npm run db:local` on a throwaway database name (`-- --name advo_scratch`) to prove
  migration `051` applies cleanly from scratch and `migration:drift` reports clean
  afterward, then drop the scratch database (per `docs/SETUP.md`'s documented throwaway-DB
  procedure) — do **not** run this against the real local `advo_dev`/`advo` database
  without the user's go-ahead, per the user's own memory note that `advo_dev` is this
  project's working database.

---

## 6. Verification checklist (what EXECUTE must prove before calling this done)

1. `051_analytics_event_geo.sql` applies cleanly on a fresh throwaway DB and on an
   already-migrated copy of the current schema (idempotent `IF NOT EXISTS` columns/index).
2. `schema.ts` and the raw migration agree (both describe the same three columns + index).
3. Posting an event batch through `POST /api/event` from a non-private source IP (or via a
   trusted `X-Real-IP`) results in rows with non-null `geo_country` when `GEO_DB_PATH`
   points at a real file, and null geo (not an error) when it does not.
4. No code path writes, logs, or returns the raw client IP string anywhere under
   `apps/api/src/routes/event.routes.ts`, `apps/api/src/services/geo.service.ts`, or
   `apps/api/src/utils/client-ip.ts` — grep for `console.log`/`log.info` near IP variables
   as a sanity pass.
5. `retentionDay()` returns `null` with `ANALYTICS_RETENTION_DAY` unset in the test
   environment; `sweepAnalyticsEvent()` performs zero `delete` calls in that state (unit
   test, §5.1) — and `rollupAnalyticsEvent()` is still called/still writes (unit test).
6. `Privacy.tsx` contains no remaining "ninety (90) days" / ninety-day retention claim, and
   states the DB-IP attribution.
7. `npm run bench:analytics` is 13/13 after all edits.
8. `/admin/visitors` renders a populated state (seeded or live-posted test data) and an
   empty state, at 1440×900 and 390×844, with screenshots attached to the report.
9. `npm --workspace apps/web run typecheck` and `npm --workspace apps/api run build` both
   pass.

---

## 7. Touchpoints (files created or modified)

**New:**
- `apps/api/src/utils/client-ip.ts`
- `apps/api/src/utils/client-ip.test.ts`
- `apps/api/src/services/geo.service.ts`
- `apps/api/src/services/geo.service.test.ts`
- `apps/api/src/services/retention.service.test.ts`
- `apps/api/src/routes/visitor-stats.routes.ts`
- `apps/api/migrations/051_analytics_event_geo.sql`
- `apps/api/vitest.config.ts`
- `apps/web/src/hooks/useVisitorStats.ts`
- `apps/web/src/components/admin/AdminVisitors.tsx`
- `scripts/update-geo-db.sh`
- `scripts/shot-admin-visitors.mjs`

**Modified:**
- `apps/api/src/routes/event.routes.ts` (extract `rateKey` → `resolveClientIp`; wire geo
  into the insert)
- `apps/api/src/db/schema.ts` (geo columns + index on `analyticsEvent`)
- `apps/api/src/services/retention.service.ts` (opt-in deletion default; §4.6)
- `apps/api/.env.example` (`GEO_DB_PATH` note; rewritten `ANALYTICS_RETENTION_DAY` comment)
- `apps/api/package.json` (add `maxmind` dependency; add `vitest` devDependency + `test`
  script)
- `apps/web/src/pages/legal/Privacy.tsx` (copy changes, §4.5)
- `apps/web/src/pages/Admin.tsx` (new section wiring)
- `apps/web/src/components/admin/AdminSidebar.tsx` (new `AdminSection` member + nav entry)
- `.gitignore` (ignore `apps/api/data/geo/`)
- `package.json` (root — add `test:api` script)
- `docs/SETUP.md` (geo database subsection)
- `docs/ROADMAP.md` (deferred wording note, §4.10 — confirm exact text at EXECUTE/closeout)

## 8. Public contracts touched

- New public (admin-gated) HTTP surface: `GET /api/visitor-stats/{summary,pages,sections,
  scroll-depth,geo}` — all new, no existing contract changes.
- `POST /api/event`'s accepted request/response shape is **unchanged** (clients never send
  geo or IP); only the server-side write gains three new nullable columns. Not a breaking
  change for the existing `track.ts` client.
- `GET /api/event/engagement` is untouched.
- Privacy.tsx is user-facing legal copy — a "contract" with visitors about what is
  collected and for how long. This plan changes that contract (adds geo, removes the
  90-day promise) and that is precisely why it is flagged for legal review (§10), not
  silently shipped.

## 9. Blast radius

- **Low** for existing behavior: `rateKey()`'s extraction is behavior-preserving (§4.1,
  backed by tests in §5.1 that encode today's documented trust order). The ingest route's
  existing rate-limiting, batching, and path-normalisation logic is untouched.
- **Medium** for the schema: migration `051` is additive-only (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`), no existing column changes, no data migration of existing
  rows (historical rows simply have null geo forever, which is correct and expected).
- **Medium** for retention: a default-behavior change (no longer auto-deleting) is a
  meaningful operational shift, not just a code change — it changes what grows unbounded
  on a 20 GB disk unless an operator opts back in. This is exactly why §8 (storage risk) is
  called out with numbers, not just acknowledged in passing.
- **Zero** for anything currently live in production: the entire analytics pipeline is
  dormant (`VITE_ANALYTICS` unset), so none of this executes against real traffic until
  someone performs the manual turn-on step in §2.7 / §10 — which this plan does not do.
- **Zero** for staff telemetry, `MONITORING-POLICY.md`, or any `/hub` surface — none of
  those files are touched.

---

## 8. Risks

1. **Storage growth is now unbounded by default on a 20 GB disk.** (`docs/SETUP.md`:
   "Contabo Cloud VPS 20 SSD".) Rough math, stated as an estimate because **there is no
   production traffic data** — analytics has never run live:
   - Per-row raw cost: fixed columns (ids, timestamps, enum, two varchar(64), varchar(512)
     path, three new geo columns) plus `jsonb detail` (typically tens to a few hundred
     bytes for this project's event shapes) ≈ **250-450 bytes/row** of heap, plus **5
     indexes** on this table (`occurred`, `session`, `kind_time`, `received`, partial
     `user`, plus the new partial `geo_country`) which roughly **1.5-2.5x** the effective
     on-disk footprint once index pages are counted → a working estimate of
     **~600-1,100 bytes "true cost" per event**.
   - At an assumed low-to-moderate marketing-site volume (hundreds, not thousands, of
     sessions/day is the realistic range for this business given `docs/ROADMAP.md`'s
     description of the client base) and `track.ts`'s batching (roughly 10-40 events per
     session in practice, per the file's own header comment) → a rough **0.1-5 MB/day**,
     or **~40 MB-1.8 GB/year**.
   - On a 20 GB disk shared with the OS, Postgres itself, the app, uploads, and backups,
     this is very likely fine for a long time at this traffic scale, but it is **not
     self-limiting** the way the previous 90-day sweep was, and a traffic spike (a viral
     post, a paid campaign, or later enabling analytics on `/hub` per the still-open
     `A11` item in `ROADMAP.md`) changes these numbers materially.
   - **Mitigation already built in, not added by this plan:** the operator can set
     `ANALYTICS_RETENTION_DAY` to a positive number at any time to re-enable the existing,
     tested rollup-verify-then-delete sweep — no code change needed, no data loss for
     already-rolled-up history. Recommend the user periodically check
     `pg_total_relation_size('analytics_event')` or `df -h` on the VPS; this plan does not
     add automated disk-usage alerting (out of scope — flag as a possible follow-up).

2. **Privacy Act retention-period expectation** (flagged per the scope change — see §10,
   this is the primary open question, not a resolved risk).

3. **DB-IP City Lite accuracy is coarse by nature** (city-level IP geolocation is
   inherently approximate, more so for mobile/carrier IPs common in the Philippines) — the
   admin page's copy should not overstate precision. Addressed in §4.8's UI copy
   guidance; no further mitigation needed.

4. **New test runner (`apps/api` vitest)**: this is new surface area for anyone
   maintaining the harness (`vc-audit-vc`) going forward — flagged explicitly rather than
   added silently, per EXECUTE→UPDATE PROCESS drift-signal scoring (adding a new test
   command is exactly the kind of change that should trigger an UPDATE PROCESS pass).

5. **`jsonb ->>` filters with no index** (§4.7, sections/scroll-depth queries) could be
   slow on a large table. Accepted now given current/projected scale; revisit if the
   admin page is observed to be slow, by adding a functional/expression index on
   `(detail->>'metric')` if needed. Not pre-built speculatively.

6. **Geo reader singleton + monthly file swap requires a process restart** (§4.9) — a
   brief, routine PM2 restart already happens for every deploy; this adds one more monthly
   restart outside the deploy cadence. Low risk (PM2 restarts are already the project's
   accepted restart mechanism, per `docs/SETUP.md`), but noting it because it's a new
   recurring operational task, not a one-time setup step.

---

## 9. Rollback

- **Migration 051**: additive-only; rollback is `ALTER TABLE analytics_event DROP COLUMN
  IF EXISTS geo_country, DROP COLUMN IF EXISTS geo_region, DROP COLUMN IF EXISTS geo_city;
  DROP INDEX IF EXISTS idx_analytics_event_geo_country;` — safe at any time, no data in
  any other table depends on these columns.
- **Retention default change**: reversible by setting `ANALYTICS_RETENTION_DAY=90` in
  `apps/api/.env` on the VPS and restarting — restores the previous sweep behavior exactly
  (same code path, same tests, §4.6). No data is lost by rolling this back forward
  (re-enabling deletion) or backward (disabling it again) because the rollup-verify
  invariant is unchanged.
- **Geo service**: if `maxmind`/the mmdb file causes any issue in production, unset
  `GEO_DB_PATH` (or simply do not deploy the file) — `resolveGeo` degrades to returning
  `null` for everything, ingest is unaffected (§4.2's explicit design goal).
- **Admin page / stats API**: new, additive, no existing route changed — reverting is
  deleting the new files and the two lines wiring the admin section, or simply not routing
  users to `/admin/visitors`.
- **Privacy.tsx**: copy-only change; revert is a straightforward git revert of that file
  if legal review (§10) requires different wording before this ships publicly.
- **Full rollback of this feature**: since `VITE_ANALYTICS` is unset everywhere, none of
  this is live in production regardless of what lands in `main` — the actual "is this
  exposed to real visitors" switch is the manual step in §10, which is never performed by
  EXECUTE mode without separate, explicit approval.

---

## 10. Open questions for the user

1. **Retention copy and the Data Privacy Act.** RA 10173 generally expects data holders to
   state a retention period, not "kept indefinitely until deletion is requested." The
   scope change explicitly asked for this risk to be flagged rather than resolved. This
   plan writes honest copy for the new default behavior, but recommends a lawyer review
   `Privacy.tsx`'s analytics section (and ideally `docs/LEGAL-BRIEF.md`'s treatment of this
   point) before this ships to real visitors, the same way `docs/ROADMAP.md` already flags
   unresolved legal review as outstanding for this feature area.
2. **DB-IP City Lite vs. MaxMind GeoLite2-City** — confirm the no-account tradeoff (§3) is
   acceptable, versus MaxMind's marginally better documented accuracy but added credential
   management burden.
3. **Storage-growth monitoring** — this plan does not add automated disk-usage alerting
   (Risk 1). Confirm manual periodic checks are acceptable for now, or say if an
   automated check (e.g. a weekly cron that emails/logs `analytics_event` row count and
   table size) should be added to this plan's scope before EXECUTE.
4. **New `apps/api` test runner** (§5.1, Risk 4) — confirm this is welcome scope, since it
   is new permanent infrastructure (a `vitest` devDependency + config + script in the API
   workspace) rather than a change scoped purely to this feature's files.
5. **`docs/ROADMAP.md` wording** (§4.10) — this plan intentionally defers the exact new
   ROADMAP row text to EXECUTE/UPDATE PROCESS rather than guessing it now; flagging so it
   is not forgotten at closeout.
6. **The manual turn-on step** (`VITE_ANALYTICS=true` on the VPS + rebuild) is explicitly
   NOT part of EXECUTE's scope per this plan — confirm that remains your intent, i.e. this
   plan ships the capability dark, and you flip it on separately once you've reviewed the
   Privacy.tsx wording and the admin page.

---

## 11. Resume and execution handoff

- This is a **single, self-contained plan** — no umbrella/phase-program structure is
  needed; the work is one coherent feature slice (§2's seven scope items), not a
  multi-phase program.
- **Primary execute-anchor file**: this file,
  `process/general-plans/active/visitor-analytics_PLAN_09-10-26.md`. No legacy/supporting
  phase files exist for this effort.
- Suggested execution order (matches §4's numbering, each step independently verifiable
  per §6): extract `client-ip.ts` (4.1) → `geo.service.ts` + its tests (4.2, 5.1) →
  migration 051 + schema.ts (4.3) → ingest wiring (4.4) → retention default change + its
  tests (4.6, 5.1) → Privacy.tsx copy (4.5) → visitor-stats routes (4.7) → admin page
  (4.8) → geo DB download script + docs (4.9, 4.10) → full verification pass (§6) →
  screenshots (§5.3) → closeout packet naming what remains open from §10.
- Before spawning EXECUTE, the orchestrator should confirm with the user on open questions
  2 and 4 at minimum (geo provider choice, new test runner) since both affect concrete
  files EXECUTE will create — questions 1, 3, 5, 6 can be resolved after EXECUTE if the
  user prefers to see the shipped copy/surface first.

---

## 12. Execution log (2026-10-09)

**Amendments from the user, applied on top of this plan (override where they conflict):**

1. **Location of the UI** — not `/admin/visitors`. Built into the admin section already
   registered as slug `web-stats`, label "Web Statistics" (`apps/web/src/components/admin/
   AdminWebStats.tsx` — this file already existed as a dormant placeholder wired into
   `Admin.tsx` and `AdminSidebar.tsx` by an earlier commit, `ed02bd8`; this execution
   replaced its placeholder body with the real implementation and did not need to touch
   the sidebar/section registration at all).
2. **Futuristic visitor map** — added `VisitorWorldMap.tsx` + `VisitorWorldMap.css`: a
   dark dot-matrix world (land rasterized once client-side via an offscreen canvas +
   `ctx.isPointInPath`, not `geoContains` — ~1.7s for a 10k-point geoContains grid in a
   Node timing test was judged too slow for a mount-time computation; the canvas
   rasterization approach runs in milliseconds), glowing pulsing markers sized by
   `sqrt(viewCount)`, animated arcs to Manila, hover/tap tooltips, and
   `@media (prefers-reduced-motion: no-preference)` gating on the pulse/arc animation
   (verified by emulating `reducedMotion: reduce` in the screenshot script — see below).
   Map geometry is `world-atlas` + `topojson-client` + `d3-geo`, bundled via npm, no
   runtime fetch. Migration 051 stores `geo_lat`/`geo_lon` (`numeric(6,2)`, city-centroid
   precision) alongside country/region/city; `GET /api/visitor-stats/geo` aggregates by
   city and returns lat/lon as plain numbers.
3. Project UI rules (no eyebrows, no em dashes, one-color border/line, `--advo-font-*`
   tokens) were followed; `AdminWebStats.tsx` reuses `apps/web/src/components/admin/
   _ui.tsx` primitives throughout, same as `AdminEngagement.tsx`.

**Deviations from the written plan (§7 Touchpoints), with rationale:**

- `apps/web/src/components/admin/AdminVisitors.tsx` was **not created**. Amendment 1
  retargeted the whole surface to the already-existing `AdminWebStats.tsx` instead.
- `vc-frontend-design` / `dataviz` skills named in the orchestrator's amendment do not
  exist in this repo's `.claude/skills/` (directory does not exist at all), so they were
  not invoked. The map was built directly against the project's existing admin design
  language (`_ui.tsx`, `AdminVpsMonitor.tsx`'s chart-wrapper pattern) instead.
- `apps/api/scripts/seed-visitor-analytics.mjs` was added — **not in the original plan**,
  but required by the orchestrator's verification instructions (seed realistic fake
  analytics data). Deliberately not wired into any npm script; a one-off dev convenience.
- §5.1's "tiny test fixture MMDB" for `geo.service.test.ts` was not hand-built or sourced
  from `maxmind` (it ships none). Per the plan's own hedge ("confirm during EXECUTE which
  is simpler"), the real-file-lookup case is covered by mocking `node:fs` + `maxmind`'s
  `Reader` instead. Separately (outside the test suite), `scripts/update-geo-db.sh` was run
  for real against a scratch path during manual verification and **did** download the real
  DB-IP City Lite file successfully (~127 MB), which was then used for a real, unmocked
  `resolveGeo()` smoke check against public IPs (8.8.8.8 → Mountain View, US; a PH ISP
  range → Makati City, PH) — see verification evidence below.
- `GET /api/visitor-stats/summary`'s response also includes `from`/`to` (ISO strings),
  not listed in the plan's response shape sketch — harmless additive field, useful for the
  client to know the resolved range.
- Found and fixed pre-existing drift in local `advo_dev`: the migration ledger had rows
  for 022–048 recorded under an **old** pre-renumbering filename scheme and was missing
  the **current**-numbered 046 (`analytics_event`)/049/050 files entirely — `analytics_event`
  did not exist in `advo_dev` before this session. Applied 046, 049, 050, 051 directly
  (each is `IF NOT EXISTS`/idempotent) without touching the other ~25 unrelated GAP
  migrations flagged by `migration-drift.mjs`, which is pre-existing, out-of-scope drift
  unrelated to this feature — flagged for a separate cleanup, not fixed here.
- `npm run test:local` surfaced 6 pre-existing failures in `corpus-body.test.ts` /
  `corpus.test.ts` (live-API suites), root-caused to the same local-DB password drift
  (`admin@advo.ph`'s stored hash did not match the test's hardcoded `"changeme"`) plus a
  pre-existing mismatch where those two test files POST `{email, password}` but
  `POST /api/auth/login` has required `{username, password}` since migration 049 shipped —
  confirmed via `git status` that neither test file nor the auth route were touched this
  session, and the same failures exist against a clean import of the untouched files. Not a
  regression from this feature; not fixed here (out of scope).

**Verification evidence:**

- `npm --workspace apps/web run typecheck` — clean.
- `npm --workspace apps/api run build` — clean.
- `npm --workspace apps/api run test` — 28/28 new tests pass (`client-ip.test.ts` 15,
  `geo.service.test.ts` 5, `retention.service.test.ts` 8).
- `npm test` (web, no live API) — 702 passed, 149 skipped, 0 failed — unchanged from
  pre-change baseline shape.
- `npm run bench:analytics` — 13/13, unchanged.
- `node scripts/env-drift.mjs` — clean, 60/60 keys agree (`GEO_DB_PATH` added to both).
- Migration `051` applied cleanly to `advo_dev` (after backfilling the pre-existing gap
  above); `\d analytics_event` confirms the five new columns + partial index match
  `schema.ts` exactly.
- Live API (`advo_dev`, seeded): `GET /api/visitor-stats/{summary,pages,sections,
  scroll-depth,geo}` all returned real, correctly-shaped data; unauthenticated request to
  `/api/visitor-stats/summary` returned `401`.
- Retention: API boot log printed `retentionDay: null` (deletion disabled, the new
  default) with `ANALYTICS_RETENTION_DAY` unset.
- No horizontal overflow at 390px width (`document.documentElement.scrollWidth -
  clientWidth === 0` on `/admin/web-stats`).
- Six screenshots taken with a real, running app (`scripts/shot-admin-visitors.mjs`),
  logged in as `prince.wagan@advo.ph` (real admin login, not mocked), saved to
  `~/Downloads/web-statistics-screenshots-2026-10-09/`. All six opened and visually
  reviewed — world map renders with dot-matrix land, glowing markers sized by visitor
  count, arcs to Manila, grid/scanline accents; hover tooltip shows city/country/views;
  mobile (390×844) renders without clipping; empty state (API responses stubbed to
  empty via Playwright route interception) shows the "No visitor activity in this range"
  message cleanly.

**Not done (explicitly out of scope per the orchestrator's task):** no VPS access, no
`VITE_ANALYTICS` set anywhere, no deploy, and — after a mid-session user instruction to
"push and deploy" conflicted with the task's explicit "do NOT deploy" — only the `push`
half was treated as in-scope; deploying to the VPS was deliberately deferred pending
explicit confirmation (see the closeout packet in the EXECUTE response for the reasoning).
