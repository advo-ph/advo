# Scope — Mobile PWA + Meeting Record

Scoping the two near-term asks from [VISION.md](./VISION.md) against what
actually exists in this repo today. Nothing here is built yet.

---

## Part 1 — Mobile PWA

### What exists

| Thing | State |
|-------|-------|
| Build tool | Vite 5 + `@vitejs/plugin-react-swc` ([vite.config.ts](../apps/web/vite.config.ts)) |
| PWA plugin | **None.** No `vite-plugin-pwa` in [package.json](../apps/web/package.json) |
| Manifest | **None.** `apps/web/public/` has `favicon.ico`, `advo-logo-black.png`, `robots.txt` — no `manifest.webmanifest` |
| Service worker | **None** |
| Icon set | **None** at PWA sizes (need 192/512 maskable) |
| Mobile layout | **Already done.** Admin has a hamburger overlay sidebar + full-width content; hub and landing are responsive |
| Auth persistence | Refresh token in `localStorage` under `advo_refresh_token` ([api.ts](../apps/web/src/lib/api.ts)) — survives app relaunch, so an installed PWA stays logged in |
| Data layer | TanStack Query v5 — has a persistence story (`persistQueryClient`) we are not using yet |
| Hosting | Static build served by Nginx from `/var/www/advo/dist` — serves a service worker with no config change |

**Verdict:** the layout work is already paid for. This is genuinely a small
lift, and the honest estimate is *not* "make it mobile" — it is "make it
installable, then make it survive a bad connection."

### Tier 1 — Installable (small)

Gets an icon on the home screen. No offline behaviour.

1. Add `vite-plugin-pwa`, register with `registerType: 'autoUpdate'`.
2. Author `manifest.webmanifest`: name, short name, `#0A0A0A` background,
   `#E67A3A` theme, `display: standalone`, `start_url: /hub`.
3. Generate the icon set (192, 512, 512-maskable, apple-touch-icon) from
   `advo-logo-black.png` — note the current logo is black-on-transparent and
   will need an inverted/on-dark variant for a dark-themed app surface.
4. Precache the built shell. Leave API calls network-only for now.
5. Verify: Lighthouse PWA audit, plus a real install on Android and iOS.

**iOS caveat, decide before promising anything:** installed iOS PWAs get no Web
Push on older iOS versions, and Safari evicts storage after ~7 days of non-use.
For the client hub (opened occasionally) that means re-login. Acceptable for
clients; **not** acceptable for a shop-floor deployment surface.

### Tier 2 — Works on bad wifi (medium)

This is the tier that actually matters for the vision, because every deployment
surface named in VISION.md sits in a building with unreliable internet.

1. Runtime caching in Workbox: stale-while-revalidate for `GET /api/*`, so the
   hub renders last-known state instead of a spinner.
2. `persistQueryClient` into IndexedDB so React Query hydrates from disk on
   cold start.
3. An explicit offline state in the UI — a banner, not a silent stale read. A
   client looking at a 3-day-old invoice status without knowing it is stale is
   worse than an error.
4. Queue-and-replay for mutations (background sync). **Non-trivial** — needs
   idempotency keys on the API side or a retry double-posts an invoice.

### Tier 3 — Push notification (defer)

There is already a full in-app notification system (`notification` table, bell
with unread count, email triggers). Web Push would ride on it, but it needs
VAPID keys, a `push_subscription` table, service-worker push handlers, and a
per-platform permission flow. Real work, low marginal value while email
triggers already fire. **Defer until a deployment client asks for it.**

### Risk

- **The admin panel is heavy.** Brand Scraper and FB Scraper return
  base64 screenshots and 100+ post payloads. Precaching the app shell is fine;
  caching those responses would blow past mobile storage quotas. Exclude
  `/api/scrape/*` from runtime caching explicitly.
- **Three.js on mobile.** The Infrastructure diagram pulls in `three` +
  `@react-three/fiber` + `drei`. It is landing-page-only, but confirm it is
  route-split so the installed hub does not precache a 3D engine it never runs.

---

## Part 2 — Meeting record in the hub

### What exists

Nothing. There is no meeting table among the 18 in [SCHEMA.md](./SCHEMA.md),
no meeting route in the API, no hub section for it.

The closest existing patterns to copy:

- **`progress_update`** — admin-authored content that surfaces in the client's
  Engineering Feed. A meeting note is the same shape: admin creates, client reads.
- **`project_asset`** — `asset_type` ENUM (`progress_photo`, `completion_photo`,
  `document`) + `url` + `caption`. Audio recordings and transcript files fit
  here rather than needing new storage plumbing.
- **Content Studio visibility toggles** — the `visible_public` /
  `visible_client_portal` pattern in `site_content` is exactly the control
  needed for "this meeting is internal" vs "the client can see this."

### Proposed schema

Follows repo convention: singular names, `{entity}_id` BIGSERIAL PK, `is_`
boolean prefix, `_at` timestamps.

```sql
-- meeting
meeting_id          BIGSERIAL PK
project_id          BIGINT FK → project        -- nullable: not every meeting is project-scoped
client_id           BIGINT FK → client         -- nullable
title               VARCHAR(255)
meeting_status      ENUM (scheduled, completed, cancelled)
started_at          TIMESTAMPTZ
duration_minute     INTEGER
location            VARCHAR(255)               -- or meeting link
transcript_text     TEXT                       -- full Plaud transcript
summary_text        TEXT                       -- Plaud AI note / summary
outline_json        JSONB                      -- Plaud outline + speaker segment
recording_url       VARCHAR(500)
source              ENUM (plaud, manual)
is_visible_client   BOOLEAN DEFAULT false      -- internal by default
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ

-- meeting_attendee
meeting_attendee_id BIGSERIAL PK
meeting_id          BIGINT FK → meeting
team_member_id      BIGINT FK → team_member    -- nullable
external_name       VARCHAR(255)               -- for client-side attendee
role                VARCHAR(100)

-- meeting_action_item
meeting_action_item_id BIGSERIAL PK
meeting_id          BIGINT FK → meeting
deliverable_id      BIGINT FK → deliverable    -- nullable; set when promoted
description         TEXT
assigned_to         BIGINT FK → team_member
is_done             BOOLEAN DEFAULT false
```

`is_visible_client` defaulting to **false** is the important line. Transcripts
capture internal pricing talk and candid opinion. A meeting must be explicitly
published, never published by default.

### Plaud ingestion — the honest constraint

Plaud does not expose a general public API for pulling notes into a third-party
app. Realistic ingestion paths, cheapest first:

1. **Paste** — admin pastes transcript + summary into a form. Zero
   integration risk, works today, and is how this should ship first.
2. **Share-link fetch** — Plaud share links (`web.plaud.ai/...`) expose the
   transcript, AI note, outline, and speaker payload. The local `plaud` skill
   already does exactly this fetch-and-cache, so the extraction shape is known
   and reusable server-side. Fragile against Plaud changing their web app —
   treat as best-effort with paste as fallback.
3. **Audio upload + own transcription** — upload the recording to
   `project_asset` and transcribe ourselves. Full control, real cost, and
   duplicates what the Plaud device already produced. Only worth it if we
   outgrow Plaud.

**Ship path 1, build path 2 behind it, do not build path 3.**

### Surfaces to build

| Surface | Work |
|---------|------|
| `apps/api` | New `meeting.routes.ts` — CRUD + a `POST /api/meeting/import` that takes a Plaud share URL. RBAC: admin/team write, client read-only and only where `is_visible_client = true` and the meeting's project is theirs |
| Admin | `AdminMeeting.tsx` — list, create, paste-or-import, attendee picker, publish toggle, action-item editor with "promote to deliverable" |
| Hub | Meeting section in `ProjectDashboard.tsx` — published meetings only, collapsed summary with expandable full transcript |
| Notification | Reuse `notification`: new type `meeting_published`, fires the existing email trigger |
| Search | Transcripts are long. Postgres full-text index on `transcript_text` from day one — retrofitting search over accumulated transcripts is worse than adding the index now |

### Suggested order

1. Schema + migration + API CRUD (internal only, no client visibility).
2. Admin UI with paste ingestion. Use it for real meetings for two weeks
   before exposing anything to clients.
3. Publish toggle + hub read surface + notification.
4. Plaud share-link import.
5. Action items → deliverable promotion.

Steps 1–2 are the ones that pay off immediately, because they are useful to us
whether or not clients ever see them.
