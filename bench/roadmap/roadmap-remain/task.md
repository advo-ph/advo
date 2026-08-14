# Roadmap remain

Date: 2026-08-15
Scope: **every still-open, code-buildable item** in `docs/ROADMAP.md`, `docs/FEATURES.md` (Roadmap), `docs/WIRING-AUDIT.md` Tier 3, `docs/SCOPE-PWA-MEETING.md` Tier 1, and the open test-coverage table. Nothing in those lists is omitted: it is either in a lane below or named under **Not in this tier**.

Spec pointers (do not restate or fork):

- Canonical roadmap: `docs/ROADMAP.md`
- Feature backlog: `docs/FEATURES.md` → Roadmap
- Half-built admin: `docs/WIRING-AUDIT.md` (W1–W5, W7, R2–R4)
- PWA installable: `docs/SCOPE-PWA-MEETING.md` Part 1 Tier 1
- Contract clauses: `docs/CONTRACTS.md`
- Naming: `~/.agents/skills/convention/SKILL.md` — singular everywhere
- Cadence: `~/.agents/skills/fanout/SKILL.md` — convention per item; gate per checkpoint; sync-docs on close
- Optional port from `origin/chimney-prairie-dog` (`5eefca7`) — **only files this lane owns**. Rebase/adapt to current `main`. Do not take the whole PR.

## Migration numbers (pre-assigned — do not collide)

| id | File |
|---|---|
| `change-order-form` | `apps/api/migrations/009_change_order.sql` |
| `proposal-tracker` / `proposal-pdf` | `apps/api/migrations/010_proposal.sql` |
| `library` | `apps/api/migrations/011_library_item.sql` |

`apps/api/src/db/schema.ts` and `apps/api/src/index.ts` are **shared**: add only your table / `app.route` block.

## In-scope item

### Lane staff — P1 multi-client PM

| id | Behavior | Surface |
|---|---|---|
| `capacity-view` | Project list includes `teamMemberId[]`. Availability shows each member's active-project count + remaining capacity. | `/admin` → Availability |
| `junior-assign` | Team can POST/DELETE `/api/projects/:id/team`. Command Center + Projects can assign one junior per project. | Command Center team + `/admin` Projects |
| `blackout-calendar` | School/unavailable blocks appear as a calendar layer so timelines do not promise into them. | `/admin` → Calendar + Availability |

### Lane lead — P1 leads + P0 proposal pipeline

| id | Behavior | Surface |
|---|---|---|
| `lead-import` | Importer + sample fixture load clinic leads (deduped). Full 5K archive is a path argument when the Messenger dump is present; do not invent 5K rows. | `npx tsx scripts/import-clinic-lead.ts` |
| `targeting-rule` | Leads list can filter to zero/outdated systems only (Prince's rule). | `/admin` → Leads |
| `proposal-tracker` | Admin proposals table: sent / opened / replied / signed. | `/admin` → Proposals |
| `proposal-pdf` | Template-fill a proposal from CONTRACTS.md clauses + lead fields. Defer AI generation. | `/admin` → Proposals → generate |

### Lane admin — P2 admin surface

| id | Behavior | Surface |
|---|---|---|
| `library` | `/admin` Library MVP per FEATURES.md (website/prompt/module/asset/doc). | `/admin` → Library |
| `project-form` | Projects high-field CRUD is a full page, not a cramped modal. | `/admin` Projects |
| `client-form` | Clients high-field CRUD is a full page, not a cramped modal. | `/admin` Clients |
| `scraper-submenu` | Brand + FB scrapers are collapsed behind Tools, not always visible. | Admin sidebar |
| `preview-route` | Branded `advo.ph/p/:token` gate (not only `api.advo.ph/api/preview/...`). | `/p/:token` |
| `r2-asset-select` | Add-asset type/url/caption are controlled React state. | Command Center / Projects assets |
| `w7-scrape-delete` | History delete is in the scraper UI; new brand scrapes do not store unbounded base64. | Brand / FB scraper |

### Lane wiring — WIRING-AUDIT leftover

| id | Behavior | Surface |
|---|---|---|
| `w1-branding` | Settings branding keys hydrate from GET, not only DEFAULT_CONFIG. | `/admin` Settings |
| `w2-admin-user` | Add Admin creates a login-capable `user` with role admin, not only a directory `team_member`. | `/admin` Settings |
| `w3-notify-rule` | Auto-rule toggles are read before send, or clearly labeled inactive. | `/admin` Notifications |
| `w4-activity` | Dashboard recent activity includes progress updates (not a hardcoded `[]`). | `/admin` Dashboard |
| `w5-social-stats` | Platform stats are not fake live counts. Hide, label "placeholder", or wire real data. | `/admin` Social |
| `r3-team-reorder` | Drag-reorder uses the full member list, not the filtered visible subset. | `/admin` Team |
| `r4-team-order` | Team-role users read order from `/api/settings/public`. | `/admin` Team |

### Lane hub — P0 change-order

| id | Behavior | Surface |
|---|---|---|
| `change-order-form` | Client/hub can file a change-order (scope, reason) against CONTRACTS.md policy 3. Team sees it. | `/hub` project |

### Lane site — leftover public chrome

| id | Behavior | Surface |
|---|---|---|
| `reduced-motion-site` | `LandingPage` + `landing-shell` honor `prefers-reduced-motion` on remaining motion. | `/` |
| `viewport-site` | Source/viewport check exists for the **shipped** `LandingPage` (do not revive the Stripe-only bench as truth). | `bench/roadmap/roadmap-remain/viewport-site.mjs` |
| `shell-interior` | `/start` `/login` `/team` `/project/:slug` interiors match the white shell (no leftover dark Linear grid/tokens as the page chrome). | those routes |
| `destination-test` | `destinationFor()` is a tested pure function. | `apps/web/src/test/destination.test.ts` |

### Lane test — coverage table

| id | Behavior | Surface |
|---|---|---|
| `settings-public-test` | Anonymous GET `/api/settings/public` in `api-wiring.test.ts`. | vitest |
| `asset-delete-test` | Scoped DELETE `/api/projects/:id/assets/:assetId`. | vitest |
| `lead-email-test` | Lead create asserts the admin-mailer side-effect (mock). | vitest |
| `ai-contract-test` | Contract review AI path covered with a mocked SDK (no live key). | vitest |
| `proof-card-test` | `getProof()` fallbacks have a render/unit test. | vitest |
| `wiring-method-test` | `api-wiring` covers bulk lead, convert, team reorder, broadcast, availability. | vitest |

### Lane ops — infra + PWA + dead Vertex

| id | Behavior | Surface |
|---|---|---|
| `brand-analysis-gone` | Vertex brand-analysis route/service removed (or 404). Claude stays for contract/PM assist. | `GET /api/brand-analysis` → 404 |
| `monitor-backup` | **Already green** — SETUP already documents nightly `pg_dump`. Do not regress. | `docs/SETUP.md` |
| `pwa-install` | Installable PWA (manifest + plugin) per SCOPE-PWA-MEETING Tier 1. | Lighthouse / `manifest.webmanifest` |

## Not in this tier (named so nobody "fixes" them)

| id | Why |
|---|---|
| `lawyer` | Human. Prince must engage counsel. `CONTRACTS.md` open questions stay. |
| `legal-bind` | Revision/downpayment clauses cannot become binding without the lawyer. |
| `anthropic-prod` | Putting `ANTHROPIC_API_KEY` on the VPS is an owner secret, not a lane. |
| `here-now` | Needs a here.now API key + per-project artifacts. Deferred in ROADMAP. |
| `calendar-sync` | Phase 3 two-way Google/ICS needs OAuth client ids. |
| `pay-link` | PayMongo/Xendit needs a merchant account. |
| `vps-move` | Already on host `advo`. Do not migrate again. |
| `hospital` / `daj` / `inventi` | Parked in ROADMAP. |
| `client-logo` | ROADMAP triage: needs real permission. |
| `crm-unify` / `prompt-admin` | Wiring-audit ideas, no acceptance section. |
| `dashboard-redesign` | Not a roadmap item. Hub/admin stay Linear. |
| `newsletter-api` | No subscribe endpoint spec. |
| `why-digital` / `footer-wordmark` | Old Stripe landing. Public `/` is `LandingPage` now. Do not restore WhyDigital. |

## Rejected

- Do not invent testimonials, 5K fake clinics, or live social follower counts.
- Do not edit another lane's owned files.
- Do not take the whole `chimney-prairie-dog` PR.
- Do not add `ANTHROPIC_API_KEY` to any committed file.

## Bench

```bash
node bench/roadmap/roadmap-remain/scoring.mjs
```

Green for **your** ids only. A diff only under `bench/` or `test/` has not shipped unless you are the **test** lane (that lane's deliverable is the tests).

## Ports (do not edit `vite.config.ts` except ops)

| lane | port |
|---|---|
| staff | 6440 |
| lead | 6441 |
| admin | 6442 |
| wiring | 6443 |
| hub | 6444 |
| site | 6445 |
| test | 6446 |
| ops | 6447 |

API stays `http://localhost:6407` unless you add a table — then use a **lane-named** local database, never the shared one.
