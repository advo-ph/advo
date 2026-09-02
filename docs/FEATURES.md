# Features Documentation

## Public Landing (`/`)

`/` is the shipped `LandingPage` (`apps/web/src/components/landing/LandingPage.tsx` + `landing-page.css`). White-canvas marketing page in the runway.com grammar: fixed blur nav (transparent over the full-bleed hero on phones), cinematic hero ("We digitalize it for you.") with staggered copy and a scroll drift, a client-logo strip driven by the portfolio table, the three product surfaces on real stills, an Inquiry-to-Launch stepper over a tabbed process panel, a dark mission band carrying the four engagement shapes, the shipped-sites grid (each card opens `/work/:slug` when a case study exists), FAQ, off-black footer. No illustrations or generated icons. Routed from `pages/Index.tsx`. Section list lives in [README.md](../README.md).

The previous dark landing (TechTicker, R3F infrastructure, orange-blob CTA, WhyDigital, ServiceTiers, ProcessSteps, the old Hero/FAQ/Footer) was **never** rendered by `/` and has been deleted (`landing/` now holds only what a live route mounts). Satellite public routes (`/start`, `/login`, `/team`, `/project/:slug`, `/404`) use `landing-shell` with the same white tokens; interiors no longer paint the dark Linear grid. `/hub` still uses `FloatingNav`.

Post-login destination is `destinationFor(role, explicitRedirect)` in `lib/destination.ts` (admin → `/admin`, else `/hub`; `?redirectTo=` wins).

Proof on `/` is the portfolio table plus the case studies in `data/case-study.ts`, each claim citing a file in the client repo. Title/meta match the hero. Footer social icons read `GET /api/settings/public`.

### Shared footer

`landing/landing-footer.tsx` is the single footer for both `/` and every `landing-shell` route, so the sitemap and the system story can't drift between them. It carries the system-continuity lede ("Websites with client systems behind them"), the **Start the system** CTA, four columns keyed to the system rather than a service menu (The system / How it ships / Keep it running / Studio), an oversized `ADVO` wordmark (`data-viewport-check="footer-wordmark"`, `clamp(72px, 21vw, 400px)` so it can't overflow at 360), and the social row.

`anchorPrefix` is the one prop: `""` on `/` keeps bare `#hash` links so the browser does its native in-page scroll; `"/"` on shell routes makes the anchor route home first.

The footer also carries a **legal row** (`.landing-footer-legal`) above the copyright bar, linking the four PayMongo disclosures. It sits on its own row rather than in `footerCol`, whose grid is fixed at four columns; at 360 it wraps to two lines without overflowing.

### Mobile nav drawer (`/hub`)

`FloatingNav` is a full-screen mobile overlay on `/hub`: numbered tap rows, Escape / route-change close, body scroll lock (restoring the previous value), `prefers-reduced-motion`. **z-50**. Behaviour is covered by `src/test/mobile-nav-drawer.test.ts` — Escape close, non-Escape keys ignored, lock/restore, close on a route change it did not initiate, and close on its own link navigation.

**Files**: `landing/LandingPage.tsx`, `landing/landing-footer.tsx`, `landing/landing-shell.tsx`, `landing/FloatingNav.tsx`, `landing/PortfolioCard.tsx` (proof card, unit-tested via `proof-card.test.ts`), `landing/landing-page.css`

### Legal disclosures (`/terms`, `/privacy`, `/refund`, `/dispute`)

The four disclosures PayMongo names in its merchant-review requirement list (sent by Prince 2026-08-21). A reviewer reads them **signed out**, so all four are registered in `App.tsx` above the `ProtectedRoute` blocks, and the shared footer reaches them from every page.

One layout — `components/legal/LegalDocument.tsx` — wraps all four inside `landing-shell`, so they cannot drift apart in structure or in the merchant identity they publish. Each page renders its own prose plus a shared "Who you are transacting with" panel and a cross-link nav to the other three.

Content is not boilerplate: the commercial terms restate what is already recorded in [ROADMAP.md](ROADMAP.md) and [CONTRACTS.md](CONTRACTS.md) — 50/50 milestone payment, five revision rounds with the 6-month tail, IP transferring on final payment, the ₱3,000/month infrastructure fee and its 15-day suspension rule, the 30-day warranty. Privacy describes the data this platform actually holds (the `/start` lead form fields, hashed passwords, expiring preview links) under RA 10173. **None of it is legally reviewed** — the same open item as the nine CONTRACTS.md policies.

#### Merchant identity — one file, never invented

`data/legal-identity.json` at the repo root is the single source; `apps/web/src/lib/legal-identity.ts` types it and exposes `identityValue()`, which returns `null` for any field still holding the placeholder vocabulary (`TBD`, `TODO`, empty, …) instead of the placeholder itself. The page then renders "Not yet published — request it at contact@advo.ph", plus an amber notice explaining that registration facts come from ADVO's DTI/SEC paperwork rather than being drafted here.

This is deliberate: the lane ships the surfaces, and the facts are Prince's to supply. `npm run bench:paymongo` is **5/7** and stays red on `legal-identity-filled` and `legal-support-contact` until the file is filled — filling it is the entire remaining change, no code edit required.

`resolveJsonModule` was enabled in `apps/web/tsconfig.app.json` so the web app can import that root-level JSON directly.

**Files**: `pages/legal/Terms.tsx`, `pages/legal/Privacy.tsx`, `pages/legal/Refund.tsx`, `pages/legal/Dispute.tsx`, `components/legal/LegalDocument.tsx`, `lib/legal-identity.ts`, `data/legal-identity.json`, `landing/landing-footer.tsx`, `App.tsx`. Covered by `src/test/legal-compliance.test.ts` (19 cases: each route renders with no auth context, discloses the identity, invents no registration number, links exactly the other three, and shows the pending affordance once per unsupplied field).

### Public Settings Endpoint

`GET /api/settings/public` returns an allowlisted subset of `site_config` keys (currently `social_links`, `brand_name`, `team_order`) **without auth**. The shared `landing-footer` reads `social_links` from here — one fetch, one mount point, on `/` and every shell route. The rest of `/api/settings/*` stays admin-only.

Added because the old Footer was hitting the admin-only `/api/settings` and 401-ing on every anonymous visit. To add a new public key: extend `PUBLIC_KEYS` in [`settings.routes.ts`](../apps/api/src/routes/settings.routes.ts).

**Files**: `apps/api/src/routes/settings.routes.ts`, `landing/landing-footer.tsx`. Anonymous GET covered in `api-wiring.test.ts`.

---

## Client Portal (`/hub`)

### Engineering Feed

Live GitHub commits merged with admin-posted progress updates. Supports branch switching.

**Files**: `ProjectDashboard.tsx`, `useOrgProjects.ts`, `lib/github.ts`

### Request a Preview

A **"Request a preview"** button on the client's project (shipped `fbcc8a7`) → `POST /api/projects/:id/preview-request` (ownership-scoped) logs the ask to `activity_log`; the team sees it in the project's Command Center → Dev & Deploy panel and replies with a Show-Client-Now link.

**Files**: `ProjectDashboard.tsx`, `usePreviewLink.ts` (`useRequestPreview`)

### Invoice Tracker

View issued invoices with amount, status (unpaid/paid/overdue), due dates. API enforces clients only see their own project invoices.

**Files**: `ProjectDashboard.tsx`, `useClientData.ts`

### Change order

Client files a **change order** (scope + reason) from the selected project on `/hub`, per [CONTRACTS.md](CONTRACTS.md) policy 3 — new scope, not a revision of existing work. Stored in `change_order` (migration `009`). Team lists every row at `GET /api/change-order` and quotes with `PATCH` (`price_cents`, `timeline_note`, status `filed`\|`quoted`\|`signed`\|`declined`). Work does not start until signed.

**Files**: `ProjectDashboard.tsx`, `useChangeOrder.ts`, `change-order.routes.ts`, `migrations/009_change_order.sql`

### Contract Section

"View Contract" button linking to `project.contract_url` when set, or "Contract pending".

**Signed contracts list** (CP1): hub also loads `GET /api/contracts/mine` — client-scoped first-class `contract` rows (title, type, status, signed_at, document_url; no notes/value). Team/admin get the same public field set for all contracts. Rendered on Hub alongside the project list.

**Files**: `ProjectDashboard.tsx` → `project.contract_url`; `Hub.tsx` + `useMyContracts` → `/api/contracts/mine`

### Live preview iframe

When `project.preview_url` is set, Hub embeds a sandboxed iframe (`allow-scripts allow-same-origin allow-forms allow-popups`) so the client sees the live site in-dashboard, not only the GitHub engineering feed or an external link. "Open in new tab" + "Request a preview" remain.

**Files**: `ProjectDashboard.tsx`

### Progress Photos / Your materials

Grid of project assets (progress photos, documents) with captions and upload dates.

**Client material upload** (CP1): clients with project access may `POST /api/projects/:id/assets` with `assetType: "document"` only (team may still set any asset type). Hub "Your materials" panel uploads via `/api/files/upload` then creates the asset row. Delete stays team-only.

**Files**: `ProjectDashboard.tsx`, `useProjectAssets.ts`, `projects.routes.ts`

### Team Contacts

Displays assigned team members with avatar, name, role, email, and LinkedIn link.

**Files**: `ProjectDashboard.tsx` → reads `project_access` → `team_member` via API

### Notification Bell

Unread count badge on bell icon. Dropdown shows last 10 notifications with mark-as-read.

**Files**: `Hub.tsx`, `useNotifications.ts` (`useClientNotifications`)

### Role Badge

User card surfaces the actual `user.role` (capitalized) instead of a hardcoded "Client" label, so admins viewing `/hub` aren't mislabeled.

**Files**: `Hub.tsx`

---

## Admin Panel (`/admin`)

> **Design language (2026-06-20):** the admin console + client hub use a Linear-inspired system — cool near-black canvas, charcoal panels, ADVO orange accent (used sparingly), Hanken Grotesk type (no monospace), 6px radius, dense tables over cards. Shared primitives in [`components/admin/_ui.tsx`](../apps/web/src/components/admin/_ui.tsx); pattern references: `AdminDashboard.tsx` (stat-strip + panels), `AdminLeads.tsx` (dense table). See [HANDOFF.md](HANDOFF.md) + memory `feedback_design_language`.

### Sidebar Navigation

Fixed left sidebar (240px / 72px collapsed). Dashboard sits at the top on its own; remaining sections are grouped under four labels — **Operations** (Projects, Clients, Team, Deliverables, Calendar, Availability, Contracts, Finance), **Marketing Site** (Content Studio, Portfolio, Social), **Pipeline** (Leads, Notifications), **Tools** (Brand Scraper, FB Scraper). Settings is anchored to the bottom. Collapsed state replaces group labels with thin dividers to preserve visual rhythm.

Admins landing on `/hub` are auto-redirected to `/admin` via `redirectAdminTo` on the route guard (post-login destination is also role-aware).

**Files**: `AdminSidebar.tsx`, `ProtectedRoute.tsx`, `Login.tsx`, `useAuth.tsx`

### Dashboard

Time-aware greeting ("Good morning, {name}"), today's date in mono caps, and quick-action buttons.

**KPI row** (4 cards): Active Projects (+ shipped count), Revenue Collected (% of billed, orange accent), Open Leads (+ qualified count), Active Clients (+ total projects).

**Pipeline panel**: horizontal stacked bars showing projects by stage — Discovery → Architecture → Development → Testing → Shipped, each with its own color dot and count.

**Cash flow panel**: Collected vs Outstanding progress bars + large collection rate %.

**Bottom feeds** (3 columns): Recent Activity (progress updates via `getRecentProgressUpdates` plus latest leads), Upcoming Deadlines (urgent badges in red), Latest Leads (avatar + submission date).

**Files**: `AdminDashboard.tsx`, `useAdminData.ts`

### Projects

Full CRUD. Form includes: client, title, description, GitHub repo, preview URL, contract URL, status, value/paid, tech stack. Edit mode shows asset upload. Auto-notifies client on project status change. Each card has an **Open** button → the Project Command Center (below).

**Files**: `AdminProjects.tsx`, `useOrgProjects.ts`, `db.ts`

### Project Command Center

A per-project hub opened from the **Open** button on each project card (shipped `dea17b6` shell + `97b213a` Contracts + `fbcc8a7` Show-Client-Now). One page, role-aware, with a header (title/status/client/value/repo/preview + a **Show Client Now** button) and six tabs:

- **Overview** — KPIs (paid %, outstanding + invoice count, open/total deliverables, stage), payment-progress bar, brief, tech stack, and a **Team** panel: list assigned members and **assign one junior** (`POST/DELETE /api/projects/:id/team`, junior/developer/intern roles). Real data from the project.
- **Deliverables** — this project's deliverables (status/assignee/due), filtered from `useAdminDeliverables`.
- **Files** — **Project Drive** (shipped `bdf1a8b`): per-project file manager — upload (storage + DB record), thumbnail grid (images inline, docs/PDF as cards), download, delete. `useProjectAssets` + `DELETE /api/projects/:id/assets/:assetId` (requireTeam, scoped). Scoped delete covered in `api-wiring.test.ts`.
- **Dev & Deploy** — GitHub repo link + latest commit, plus the **Show Client Now** flow.
- **Contracts** — the agreement link + the **red-flag review** (below).
- **Finance** — payment summary + this project's invoices (filtered from `useInvoices`).

#### Contract red-flag review

Paste a contract / SOW into the Contracts tab → `POST /api/contracts/review` (requireTeam) scores it against ADVO's [CONTRACTS.md](CONTRACTS.md) **8** policies (payment schedule 50/50 · 5 revisions per deliverable · deemed approval · change-order · late-payment · IP retention & transfer · non-abandonment & termination · warranty/liability/fortuitous events) and returns a **verdict** (good_to_go / needs_work / high_risk) + per-policy **red/amber/green** flags + a disclaimer. Catches the "contract was silent" gap that leaked revenue on Fourlinq + Felici.

**AI with heuristic fallback** (`fae49dd`) — `reviewContract()` runs Claude (`claude-opus-4-8`, via `@anthropic-ai/sdk`) against all 8 policies when `ANTHROPIC_API_KEY` is set — and an AI answer covering **fewer** policies than the list is rejected and falls back to the heuristic, so a partial review can never be scored as a whole one, and falls back to the heuristic presence-check on a missing key or any AI error / malformed output. Same return shape; `method` is `"ai"` vs `"heuristic"` and the disclaimer reflects which ran. **Prod has no key yet**, so live review currently runs the heuristic — add `ANTHROPIC_API_KEY` to the VPS `.env` + `pm2 restart advo-api` to activate the AI path. AI path covered in `contract-ai.test.ts` with a mocked SDK (no live key).

#### Show Client Now (expiring preview links)

Generate a private, **20-minute** link to the project's `preview_url` to drop to a client mid-build. `POST /api/projects/:id/preview-link` (requireTeam) mints a signed HS256 token (reuses `JWT_SECRET`); the **public** `GET /api/preview/:token` verifies it and **302-redirects** to the preview, or shows a branded 410 gate page when expired. Host-agnostic (Vercel / Cloudflare Pages / here.now / VPS — ADVO just stores the URL and controls the link's lifetime). Clients can also **request** a preview from their Hub (see Client Portal) → logged to `activity_log` → the team sees it in this panel.

#### Preview artifact upload + deploying providers

The half that makes the seam real. `previewArtifactDir()` always named a directory, but
nothing ever wrote one — so every deploying adapter found it empty, declined, and the
seam fell back to `manual` forever.

**`POST /api/projects/:id/preview-artifact`** (requireTeam) takes the build. Send
`multipart/form-data` with one `file` entry per build file, each entry NAMED with its path
relative to the build root:

```bash
curl -X POST https://api.advo.ph/api/projects/12/preview-artifact \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@dist/index.html;filename=index.html" \
  -F "file=@dist/assets/app.js;filename=assets/app.js"
```

No zip, deliberately — extracting an archive server-side means a new dependency and a
zip-slip surface to get wrong. Every path is validated and **refused** rather than
sanitized (no `..` in any segment, no absolute / drive-letter / UNC path, no NUL); one bad
path rejects the **whole** upload, because silently skipping a file turns a broken site
into an apparently successful deploy. An artifact with no root `index.html` is refused as
a wrong-directory mistake. The artifact is staged and swapped in atomically, so a partial
upload is never what gets deployed. Caps: 2000 files / 200MB.

`PREVIEW_HOST_PROVIDER` picks who deploys it — `manual` (default, today's behaviour),
`cloudflare`, or `herenow`. A provider that is unconfigured, declines, or throws **falls
back to manual** rather than losing a working feature; the response says so
(`provider`, `fellBack`).

**Cloudflare Pages** is the one deploying adapter whose credential ADVO can issue for
itself (`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` with *Cloudflare Pages: Edit* /
`CLOUDFLARE_PAGES_PROJECT`). It POSTs the artifact to Pages' Create Deployment endpoint and
returns the per-deployment `.pages.dev` URL — a fresh immutable URL per deploy, which is
exactly the ephemeral shape this seam wants.

> ⚠️ **Neither deploying adapter has completed a real deploy.** A live call with an invalid
> token was confirmed to reach Cloudflare and return a structured `9106: Authentication
> failed`, so the endpoint and method are right and the error surfacing works — but auth is
> checked before the request shape, so the multipart body is still unproven. If Cloudflare
> rejects the shape, the supported fallback is
> `npx wrangler pages deploy <dir> --project-name=<name>`. `bench:preview`'s
> `provider-credential-live` stays **RED by design** until someone runs it with a real
> token — do not stub one to turn it green.

#### Plaud / praud import

Team `POST /api/meeting/import` takes `{ projectId, fileId? | shareUrl? }` (consumer JWT for file id; public `/share/access` for a `::` share URL). Rows stay unpublished (`is_visible_client = false`) until Publish.

praud passcode `advo` (password required on every upload) tags the new Plaud file into folder ADVO (`POST /file/update-tags`) then `POST /api/meeting/import/praud` with `Authorization: Bearer $PRAUD_IMPORT_SECRET`. Lands on `ADVO_INBOX_PROJECT_ID` or an auto-created **Inbox** project. Admin reassigns before publishing.

**Folder watch** (no praud required): the API probes Plaud every `PLAUD_POLL_SECOND` (default 60) for recordings tagged ADVO **or** named with the word “advo”. New `file_id`s import into Inbox. Team can also `POST /api/meeting/plaud/sync` (Admin Meetings → Sync Plaud). Status: `GET /api/meeting/plaud/status`. Needs `PLAUD_TOKEN` or `~/.piper/plaud-auth.json`. Set `PLAUD_POLL_SECOND=0` to disable.

#### Meeting → deliverable tasks (Plaud CP3)

**Generate tasks** on a meeting (AdminMeetings + Project Command Center) opens a preview first: `POST /api/meeting/:id/propose-task` (requireTeam). When the row has `plaudFileId` and consumer auth, **Ask Plaud** (`POST /ask/v2/ask`, same JWT as praud) is asked first with the live roster + glossary and must return Advo JSON (`method: "ask"`). Else the Plaud note (`meeting.summary`) — every Action Items / Next Arrangements block, including later `##` sections (`method: "note"`). Else Claude when `ANTHROPIC_API_KEY` is set (`"ai"`), else a line/bullet heuristic. Owners resolve against active `team_member` (prefix `Prince:`, suffix `— *Prince*`, skip `*[Insert Name]*`, nicknames like Gelo → Angelo). Inbox meetings can rematch `projectId` from the catalog. A new Plaud import or Sync that created a row opens this preview. Confirm sends the same list to `POST /api/meeting/:id/generate-task` `{ task, method }` and inserts **1–8** `deliverable` rows with `assignedTo` set when resolved. **400** empty transcript and note; **422** no actionable tasks (no silent success).

**Files** also: `MeetingTaskPreview.tsx`, `plaud.service.ts`, `plaud-import.service.ts`

#### Suggest timeline (Plaud CP3)

Team-only `POST /api/projects/:id/suggest-timeline` accepts optional `{ deliverable[], contractNotes, startDate }`. Loads the project (and DB deliverables when the body omits them). Returns a phase/milestone plan with **singular keys** (`phase`, `milestone`, `assumption`, `risk`, …) via Claude or complexity heuristic. **Response-primary** — audits `activity_log` action `timeline_suggested`; does **not** write a project JSON column.

#### Client revision → deliverable (Plaud CP3)

`POST /api/projects/:id/revision-task` (requireTeam). Body camelCase `{ revisionNote }`. Creates a deliverable titled **"Client revision"**; description = note (optional Claude polish when `ANTHROPIC_API_KEY` is set) + CONTRACTS.md **2-rounds/phase** policy reminder. Response data: `{ deliverable, method: "raw"|"ai", projectId }`.

**Files**: `ProjectCommandCenter.tsx`, `AdminMeetings.tsx`, `MeetingTaskPreview.tsx`, `useMeeting.ts`, `useContractReview.ts`, `usePreviewLink.ts`, `apps/api/src/services/contract-review.service.ts`, `apps/api/src/routes/contracts.routes.ts`, `apps/api/src/services/preview.service.ts`, `apps/api/src/routes/preview.routes.ts`, `apps/api/src/routes/meeting.routes.ts`, `apps/api/src/services/meeting-task.service.ts`, `apps/api/src/services/plaud.service.ts`, `apps/api/src/services/plaud-import.service.ts`, `apps/api/src/services/plaud-ask.service.ts`, `apps/api/src/services/plaud-poll.service.ts`, `apps/api/src/routes/projects.routes.ts`, `apps/api/src/services/timeline-suggestion.service.ts`, `apps/api/src/services/revision-task.service.ts`

### Clients

Client management with company name, contact email, GitHub org, brand color. **Invite button** on each card — creates auth account and sends welcome email. **Search bar** filters by company name or email.

**Files**: `AdminClients.tsx`, `useAdminData.ts`

### Team

Team member profiles with name, role, email, bio, social links (LinkedIn, GitHub). Avatar upload (max 5MB). **Drag-to-reorder** mutates the full member list (hidden inactive members keep their slots) and persists via `team_order`. Order is read from `GET /api/settings/public` so a `team`-role user does not 403. Applied on landing page + team page.

**Penalty points** (P11): each `team_member` has `penalty_point_count` (integer, default 0). Admin Team list shows the count; edit dialog lets admin set it via `PATCH /api/team/:id` (`penaltyPointCount`). **Automatic accrual is deferred** — rules still open; no hooks from late deliverables or verify yet.

**Files**: `AdminTeam.tsx`, `useAdminTeam.ts`, `team.routes.ts`, migration `008_team_member_penalty_point_count.sql`

### Deliverables (Schedule)

Full CRUD (shipped `3a622af`, closing audit finding B1 — was previously read-only). Add/Edit dialog (project, title, description, assignee, status, priority, due date), a per-card **inline status quick-change** (optimistic), delete (dialog footer), team-member filter, and an empty-state CTA. Mirrors the `AdminAvailability` dialog pattern. Backend `POST/PATCH/DELETE /api/deliverables` already existed; this added the missing UI.

**Verify** (P7): team can set/clear `verified_at` independently of status via **Verify** / **Verified** toggle on each row (`PATCH /api/deliverables/:id` with `verifiedAt` ISO or `null`). Completing a deliverable still sets `completed_at` only; verification is separate QA sign-off. Migration `007_deliverable_verified_at.sql`.

**Files**: `AdminSchedule.tsx`, `useAdminDeliverables.ts`, `deliverables.routes.ts`, `schema.ts`

### Calendar

The all-around ADVO records calendar (Phase 1, shipped `0018c3e`/`80f076e`). A month grid that overlays **manually-created events** (meeting / deadline / MOA / BIR / content / social / cold-email / event) with **derived events computed at read time** from existing records: deliverable due dates, invoice due + paid dates, project kickoffs, **content/social posts** (scheduled + published), **contracts/MOAs** (signed + expiry), and **PH compliance deadlines** (BIR/SSS/PhilHealth/Pag-IBIG/DOLE, auto-generated from a sourced schedule) — all Phase 2. Prev/today/next nav, today highlight, a category-filter legend, click-a-day to add, and an edit/delete dialog (title, category, date, all-day or start/end time, location, notes). `GET /api/calendar?from&to` returns the union; POST/PATCH/DELETE manage manual events (requireTeam). Derived events are read-only (edit them on their own page).

**School blackout layer:** weekly `school` / `unavailable` blocks from Availability expand onto every matching weekday in the month grid as a togglable **School blackout** layer so timelines do not promise into class/unavailable time.

**Phase 2 (in progress):** content/social posts (`social_scheduled` / `social_published`, read from the existing `social_post` table — no migration) and **contracts/MOAs** (`contract_signed` / `contract_expires`, new `contract` table + CRUD at `/api/contracts`, migration `004`) now derive into the union, plus **PH compliance deadlines** — BIR/SSS/PhilHealth/Pag-IBIG/DOLE filings generated from a sourced schedule (`apps/api/src/data/compliance-deadlines.ts`, ported from the pdfphile project; cited to RR 11-2018 / RA 11976 / agency circulars). Single `compliance_deadline` category, no table; statutory dates **not** adjusted for weekends/holidays (month-end filings clamped to the last day) → "confirm which apply to your registration" caveat in the read-only detail. Remaining layers: meetings, cold-email cadence. `Availability` still has its own weekly editor; school/unavailable now also paint the calendar blackout layer.

**Phase 3 (decided, not started):** Google Calendar + ICS sync — **two-way / bidirectional** (owner decision, 2026-06-20).

**Files**: `AdminCalendar.tsx`, `useCalendar.ts`, `calendar.routes.ts`, `calendar_event` table (migration `003`); `contracts.routes.ts` + `contract` table (migration `004`) for the contracts/MOA layer. Endpoint coverage in `api-wiring.test.ts`: Calendar block (auth-gate, range-GET shape, manual-event CRUD, content/social layer) + Contract records block (CRUD + signed/expiry calendar derivation) + method coverage for `PATCH /api/leads/bulk`, `POST /api/leads/:id/convert`, `POST /api/team/reorder`, `POST /api/notifications/broadcast`, `/api/availability`.

### Finance

Invoice management with create/edit/delete. Status toggle (unpaid → paid → overdue). Auto-triggers email notification on create.

**Expense ledger** (migration `005`, shipped with Plaud 07-30 CP1): team logs agency spend with purpose, who authorized, `amount_cents`, location, optional `receipt_url`, and category (`ai_usage` / `media` / `subscription` / `outside_payment` / travel / meals / software / hardware / marketing / office / other). **`is_reimbursable` is derived** as `receipt_url` present — never stored, so “no receipt → no reimbursement” cannot drift. CRUD at `GET/POST/DELETE /api/expense` (requireTeam). UI: Expenses section on `AdminFinance`.

**Recurring infrastructure fee** (migration `017`, FourlinQ MOA 2026-08-11): a per-project schedule that generates **real `invoice` rows** — there is no parallel billing system and no new `invoice_status` value. The contract commits FourlinQ to ₱3,000.00/month (`amount_cents = 300000`) for hosting, database maintenance and domain renewal, "billed on the 1st of every month", suspendable if unpaid **within 15 days of the due date**.

- **Manila calendar.** Every anchor (`starts_on`, `ends_on`, `next_run_on`, `last_generated_on`, `invoice.period_start_on`) is a `DATE` resolved through `BILLING_TIMEZONE = "Asia/Manila"` with built-in `Intl` — **no new dependency**. A UTC tick would bill the December period on Nov 30 at 16:00.
- **Idempotent generation.** `POST /api/recurring-fee/run` is an endpoint, *not* a cron — nothing starts a timer at boot. Double-billing is blocked by the partial unique index `(recurring_fee_id, period_start_on)` plus `onConflictDoNothing`, so a double-click generates nothing twice. Catch-up is bounded by `MAX_CATCHUP_PERIOD = 24`, and a new fee anchors `next_run_on` to `max(starts_on, today)` unless `isBackfill` is passed.
- **Suspension is DERIVED, and is a legal act.** `isSuspensionJustified` is computed at read time (active + suspension enabled + an unsettled generated invoice more than `grace_day_count` calendar days past due). A **paid** invoice never justifies suspension. `suspended_at` is written only by an explicit `POST /:id/suspend`, which returns **409** while the predicate is false. Nothing takes hosting or an API key down automatically.
- **Not project scope.** Generated invoices are excluded from the project-grouped invoice list and from contract-value/collection stats — the contract states the Total Fee "does not cover the ongoing costs". `DELETE /api/invoices/:id` returns **409** for a generated invoice, so a billed period cannot be orphaned. Deleting the *schedule* keeps the invoices (`ON DELETE SET NULL`).
- **Deliberately deferred**: penalty interest (the contract's 2%/month clause is a separate model), and the calendar-vs-business-days reading of the 15-day window — the hosting clause says 15 days, the payment clause says 15 *business* days; this implements **calendar** days.

Endpoints (requireAuth + requireTeam; mutations requireAdmin): `GET /api/recurring-fee`, `GET /api/recurring-fee/suspension`, `GET /api/recurring-fee/:id`, `POST /api/recurring-fee/:id/preview` (honest dry run — writes nothing), `POST /api/recurring-fee`, `PATCH /api/recurring-fee/:id`, `DELETE /api/recurring-fee/:id`, `POST /api/recurring-fee/run`, `POST /api/recurring-fee/:id/suspend`, `POST /api/recurring-fee/:id/resume`. UI: **Recurring fees** block + red suspension-risk banner on `AdminFinance`.

**Commission split** (migration `018`, Prince's 2026-06-19 compensation structure): on project completion a plan allocates the project basis into **60% developer / 25% staff / 15% company reserve**, with the staff pool sub-split **28% referral / 24% marketing / 24% accounting / 24% management**.

- **Integer centavos end to end**, with a single rounding site — a largest-remainder allocator. Verified on an indivisible basis: ₱1,000.03 splits and sums back to exactly ₱1,000.03, no centavo created or lost.
- **Draft then frozen.** A plan is editable while `draft`; `POST /api/commission/:id/finalize` blocks with plain-language reasons until the project is shipped and every share is agreed, and a finalized plan rejects `PATCH`/`DELETE`/void with **409**.
- **Basis is snapshotted and overridable** — it defaults to the project's contract value, which is not the same as money collected. Set `basisCents` explicitly to split only what was actually received.

Endpoints (requireAuth + requireTeam): `GET/POST /api/commission`, `GET/PATCH/DELETE /api/commission/:id`, `POST /api/commission/:id/finalize`. UI: **Commission** block on `AdminFinance`.

**Files**: `AdminFinance.tsx`, `useInvoices.ts`, `useExpense.ts`, `useRecurringFee.ts`, `expense.routes.ts`, `recurring-fee.routes.ts`, `recurring-fee.service.ts`

### Project sign-off

**Project sign-off document** (migration `016`, FourlinQ MOA 2026-08-11): the client-facing artifact the contract hangs three things on — final payment becomes due on signing (7 days to pay), free revisions must be used *before* it, and unused rounds stay invocable for **6 months after** it.

**Not to be confused with `deliverable.verified_at`** (migration `007`), which is internal team QA and stays independent.

- Lifecycle `draft → issued → signed`, with `void` and a `revision` path. Signing before issuing returns **409**; a sign-off can be signed exactly once.
- Signing stamps the signatory, the payment-due date, the revision-window expiry, and a snapshot of the scope/tier being accepted.
- `signoff_method` is `client` / `deemed` / `offline` and is **entered by a human admin — nothing auto-fires**. The contract's 15+15 business-day *Notice of Pending Deemed Approval* is not modeled; `deemed` records that a human concluded it, it does not compute it.

Endpoints (requireAuth + requireTeam): `GET/POST /api/project-signoff`, `GET/PATCH /api/project-signoff/:id`, `POST /api/project-signoff/:id/issue|sign|revision|void`. UI: **Project Sign-off** card on `/hub` project, **Sign-off** tab on `/admin → Projects → Command Center`.

**Files**: `AdminSignoff.tsx`, `SignoffCard.tsx`, `useProjectSignoff.ts`, `project-signoff.routes.ts`, `project-signoff.service.ts`, `AdminCommission.tsx`, `useCommission.ts`, `commission.routes.ts`, `commission.service.ts`

### Notifications

Compose notifications to single client or broadcast to all. Auto-notification on project status change. Auto-rule toggles persist on `site_content.client_dashboard` and are read before send on `POST /api/notifications`; the panel is labeled **inactive / not yet** for event triggers that still live in project/invoice/deliverable routes.

**Files**: `AdminNotifications.tsx`, `useNotifications.ts`

### Content Studio

CMS for landing page sections. Each row shows section label + `section_id` with two monochrome visibility toggles (🌐 `Public` — advo.ph, 🖥 `Hub` — /hub) plus an expand chevron for editable sections.

**Form-based editing** for 11 sections: hero, services, pricing, testimonials, contact, client dashboard, FAQ, process steps, why digital, team heading, portfolio heading.

**Files**: `AdminContentStudio.tsx`, `useSiteContent.ts`

### Portfolio

Manage public portfolio projects. Multi-image upload. Toggle featured. Full CRUD with case study. The `case_study` JSON column now also accepts proof-card fields read by the public landing — `metric` (outcome headline), `outcome` (one-line result), `timeline` (e.g. "14 days from kickoff"), `products_used` (string[]), and `before_after` (`{before, after}`). All optional; the public card falls back to existing `overview`/`challenge`/`solution`/`results` when these aren't set.

**Files**: `AdminPortfolio.tsx`, `landing/PortfolioCard.tsx`

### Leads

Pipeline view of inquiries. Status: new → contacted → qualified → proposal → won/lost.

- **Search + filter** by text and status
- **Outdated only** — Prince's targeting rule: keep zero/outdated systems, hide modern stacks (Shopify / Inventi / etc.)
- **Bulk actions** — select multiple leads, bulk set status or assign
- **Convert to Client** button — creates user account + client + project, sends welcome email
- **Notes** per lead with auto-save on blur
- **Import** — `npx tsx scripts/import-clinic-lead.ts` (default `data/clinic-lead/sample.json`; optional path to the Messenger dump). Dedupes by email. Does not invent 5K rows.

**Files**: `AdminLeads.tsx`, `useLeads.ts`, `lib/targeting.ts`, `scripts/import-clinic-lead.ts`

### Proposals

Admin table of generated proposals. Status: sent → opened → replied → signed.

- **Generate** from a lead → `POST /api/proposal` (requireTeam). Response data carries `method`:
  - `ai` — Claude (`claude-opus-4-8`) writes the narrative sections from **that lead's own scraped signals**: its digital / design / performance score, industry, system age, and budget, extracted from the lead's `description` + `notes` by `lead-signal.service.ts`. Runs when `ANTHROPIC_API_KEY` is set.
  - `template` — the original template fill, **byte-identical** to before. Runs when the key is unset, and on any AI error, malformed JSON, or a response with fewer than 2 usable sections.
- **CONTRACTS.md clauses and the money table are never AI-written** — they are rendered by us and appended verbatim to both documents. The model is given the scraped facts only, and is told not to invent scores, prices, timelines, or case studies; its output is escaped, not trusted as HTML.
- **Copy column** in the table shows `AI` / `TMPL` per row, backed by `proposal.method` (migration `014`, default `template` so pre-existing rows backfill correctly).
- **Status** editable in the table
- **View / print** the generated HTML document

**Prod has no key yet**, so live generation runs the template fill — add `ANTHROPIC_API_KEY` to the VPS `.env` + `pm2 restart advo-api` to activate the AI path. AI path covered in `proposal-ai.test.ts` with a mocked SDK (no live key); signal extraction in `lead-signal.test.ts`.

**Files**: `AdminProposals.tsx`, `lib/proposal-tracker.ts`, `apps/api/src/routes/proposal.routes.ts`, `apps/api/src/services/proposal.service.ts`, `apps/api/src/services/lead-signal.service.ts`, `apps/api/migrations/010_proposal.sql`, `apps/api/migrations/014_proposal_method.sql`

### Settings

- **Domain & Branding**: agency name, domain URL, accent color, logo — hydrated from `GET /api/settings/agency_name` (and sibling keys), not only `DEFAULT_CONFIG`
- **Social Links Editor**: add/edit/remove, saved to `site_config.social_links`, displayed in footer
- **Security**: Change password dialog
- **Admin Users**: Add Admin creates a login-capable `user` with `role: "admin"` (plus a directory `team_member`) and emails a temp password
- **Integrations**: API + VPS health status

**Files**: `AdminSettings.tsx`

### Brand Scraper

Two modes — lightweight `/api/scrape/brand` (fast) and full `/api/scrape/brand-full` (deep analysis). Uses stealth Puppeteer with a single browser instance reused across viewports and pages.

**Core extraction** (both modes):

- Colors (hex, frequency, CSS variables, theme color)
- Fonts (Google Fonts, CSS declarations)
- Logos & favicons (img, SVG inline, apple-touch-icon)
- Tech stack (React, Next.js, WordPress, Tailwind, Stripe, analytics, etc.)
- Features detected (search, auth, dark mode, lazy loading, chat, forms, etc.)
- Page structure (heading hierarchy, sections, CTAs, buttons, inputs)
- Navigation links + social media profiles
- All images with previews

**Full-scrape additions** (13 features):

- Screenshots at 3 viewports (desktop 1440×900, tablet 768×1024, mobile 375×812) as base64 data URLs
- Multi-page crawl (follows up to `crawlDepth` internal nav links, merges data)
- Color palette grouping (primary / secondary / accent[] / neutral[]) via HSL clustering
- Typography scale from real DOM computed styles (h1-h6, body, p)
- **Component detection** — see "Component detector" below
- SEO audit (11 checks — title, meta, H1 count, hierarchy, canonical, OG, JSON-LD, sitemap, robots.txt, alt text %) with score
- Performance metrics (load time, DOM nodes, JS heap, requests, JS/CSS files, page weight)
- Animation detection (CSS keyframes, transitions, GSAP, Framer Motion, AOS, Lenis, Lottie)
- Accessibility audit (lang, alt, ARIA, focus indicators, WCAG contrast) with score
- Compare mode — pass `compareUrl` to get a diff (`onlyInMain` / `shared` / `onlyInCompare`)

#### Component detector

Powered by the [easydiv](https://github.com/CelestialBrain/easydiv) component scanner, vendored at `advo-api/src/vendor/easydiv-detector.js` and injected into the live Puppeteer page via `mainPage.evaluate()`. Uses 6 signals: semantic tags, ARIA roles, class-name hints, structural shape, sibling clustering (3+ children with same tag+class signature), browser-side visibility checks. Includes a CSS-in-JS-aware class normalizer that strips hash suffixes (`hero-a8b3f9` → `hero`, `css-x1y2z3` → dropped) so it works against emotion / styled-components / CSS Modules sites.

Two response fields:

- `components: [{ name, selector, count }]` — legacy shape grouped by type, used by the existing UI
- `componentCandidates: { [type]: [{ tag, classes, score, reason, depth, childCount, textPreview, ... }] }` — top 5 per type with full element data including a 80-char text preview

Auto-saves to DB, load past scrapes from history.

**Files**: `AdminBrandScraper.tsx`, `advo-api/src/routes/scrape.routes.ts`, `advo-api/src/vendor/easydiv-detector.js`

### Facebook Scraper

Paste a Facebook page URL → extracts company data via authenticated Playwright:

- Company info (name, category, followers, likes)
- Contact details (website, phone, email, social links, address)
- **All posts** (100+) with full text, engagement metrics, and images per post
- Photos gallery
- Uses blead's saved Facebook session for authenticated access
- SSR `<script>` tag parsing + DOM fallback + infinite scroll
- Profile image extraction: matches `<img>` whose `alt` contains the page name (from FB CDN) to avoid leaking the logged-in user's avatar from `og:image`
- Auto-saves to DB, load past scrapes from history

**Files**: `AdminFacebookScraper.tsx`, `advo-api/src/routes/fb-scrape.routes.ts`, `advo-api/src/routes/scrape.routes.ts`

---

## Email Notifications

Handled by the ADVO API email service (`advo-api/src/services/email.service.ts`).

Uses Nodemailer with either Resend SMTP or custom SMTP transport.

**Templates**: Magic link, notification, welcome, invoice

**Auto-Triggers**:

| Event                  | Type                    |
| ---------------------- | ----------------------- |
| Progress update posted | `progress_update`       |
| Invoice created        | `invoice_issued`        |
| Deliverable completed  | `deliverable_completed` |
| Project status changed | `project_status_change` |

---

## Auth System

JWT-based authentication via ADVO API.

- **Access token**: 15 min expiry, HS256 signed
- **Refresh token**: 30-day expiry, DB-backed (`session` table), one-time use with rotation
- **Magic link**: Token emailed, 15 min expiry, one-time use
- **Password change**: Authenticated endpoint, bcrypt verification
- **Roles**: `admin`, `team`, `client` — enforced via RBAC middleware

**Files**: `useAuth.tsx`, `lib/api.ts`, `advo-api/src/services/auth.service.ts`

---

## Scrape History

Both brand and Facebook scrapes auto-save to `scrape_result` table. Endpoints:

| Method | Path                      | Description                                           |
| ------ | ------------------------- | ----------------------------------------------------- |
| POST   | `/api/scrape/save`        | Save scrape result                                    |
| GET    | `/api/scrape/history`     | List saved scrapes (optional `?type=brand\|facebook`) |
| GET    | `/api/scrape/history/:id` | Get single saved scrape with full data                |
| DELETE | `/api/scrape/history/:id` | Delete a saved scrape                                 |

---

## Hooks Reference

All data fetching uses React Query (`@tanstack/react-query` v5). Each admin CRUD hook returns the canonical shape `{ items, isLoading, createX, updateX, deleteX, isSaving }` with optimistic updates and shared cache.

### Auth + utility

| Hook        | Purpose                                                      |
| ----------- | ------------------------------------------------------------ |
| `useAuth`   | JWT auth state, login, magic link, password change, sign out |
| `useRoles`  | Permission role from JWT token                               |
| `useGitHub` | GitHub commits and branches (via `lib/github.ts`)            |

### Admin data

| Hook                   | Purpose                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `useAdminData`         | Aggregated dashboard counts (projects, clients, leads, stats)                                                                            |
| `useOrgProjects`       | Projects with GitHub enrichment (commits, PRs, tech stack)                                                                               |
| `useAdminPortfolio`    | Portfolio CRUD (list, create, update, delete)                                                                                            |
| `useAdminSocial`       | Social post CRUD; platform strip is queue counts, not fake follower stats                                                                |
| `useAdminTeam`         | Team member CRUD + drag-reorder (full list); order from `/api/settings/public`                                                           |
| `useAdminAvailability` | Team availability blocks CRUD                                                                                                            |
| `useAdminDeliverables` | Deliverables CRUD + optimistic inline status                                                                                             |
| `useInvoices`          | Invoice CRUD with optimistic status toggle                                                                                               |
| `useNotifications`     | Admin: fetch all + send/broadcast. Client: fetch + mark-read                                                                             |
| `useLeads`             | Lead management with status updates, assignment, bulk actions, conversion                                                                |
| `useSiteContent`       | CMS sections: toggle visibility, update content                                                                                          |
| `useContractReview`    | Command Center: heuristic contract red-flag review                                                                                       |
| `usePreviewLink`       | Command Center: mint expiring preview links + list client requests (`useProjectPreview`); client request-a-preview (`useRequestPreview`) |
| `useMeeting`           | Meeting rows + Plaud import; **propose** then **confirm** generate-task (`POST /api/meeting/:id/propose-task` → `generate-task`)         |

### Client portal

| Hook            | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `useClientData` | Client-side: projects, deliverables, invoices, assets, contacts |

## Installable PWA

Tier 1 from [SCOPE-PWA-MEETING.md](SCOPE-PWA-MEETING.md) — home-screen install, no offline behaviour.

- `apps/web/public/manifest.webmanifest` — name/short name ADVO, `display: standalone`, `start_url: /hub`, background `#0A0A0A`, theme `#E67A3A`
- `vite-plugin-pwa` in [`vite.config.ts`](../apps/web/vite.config.ts) with `registerType: 'autoUpdate'`; shell precached, `/api/*` network-only
- Icons 192 / 512 / 512-maskable / apple-touch generated from the inverted `advo-logo-black.png` wordmark on the dark app surface

**Files**: `apps/web/public/manifest.webmanifest`, `apps/web/vite.config.ts`, `apps/web/index.html`

---

## Roadmap

### Internal Library

A MotionSites-style visual library at `/admin` → Library — team-wide (not admin-only) — for pulling references into client conversations and reusing internal assets. Shipped on `lane/admin` (migration `011_library_item`, `GET/POST/PATCH/DELETE /api/library`).

**Item types** (single `library_item` table, `type` enum drives render):

- `website` — reference sites with thumbnail + optional looping preview, external URL
- `prompt` — reusable vibe-coding prompts with copy-to-clipboard
- `module` — code modules / reusable component recipes
- `asset` — marketing files, deck slides, brand kits (download)
- `doc` — KT notes, runbooks (markdown body)

**v1 surface**

- Grid view with thumbnail cards, type chip, tags, hover preview
- Filters: type chips + tag multi-select + search
- Detail drawer per item (copy / link out / download)
- Add Item modal with type selector → fields adjust by type
- File storage on VPS at `/var/advo/library/` — **not in this ship**; items store URL / thumbnail URL metadata

**Out of scope v1:** versioning, comments, collections/folders, client-facing access, AI-suggested tagging, local file upload — all additive later.

**Open question:** one unified grid (filter by type) vs tabs-per-type. Shipping unified first; revisit if it feels incoherent in practice.

**Files**: `AdminLibrary.tsx`, `apps/web/src/lib/library.ts`, `apps/api/src/routes/library.routes.ts`, `apps/api/migrations/011_library_item.sql`

### Admin UX cleanup

1. ✅ **Sidebar grouping** — shipped `ae550e3` (Operations / Marketing Site / Pipeline / Tools)
2. ✅ **Modal → page** for high-field-count CRUD (Projects, Clients) — full-page forms on `lane/admin`
3. ✅ **Empty-state CTAs** — shipped `383f90b` for Projects, Clients, Notifications; AdminFinance + AdminSocial already had inline creates; AdminLeads gets a hint instead of a button (leads are user-generated, not admin-created)
4. ✅ **Hide experimental tools** (Brand Scraper, FB Scraper) behind a collapsible Tools control (`toolsExpanded`)

### Monorepo restructure

✅ Shipped `f024fae` (merge) + `ad06a61` (CUTOVER runbook). Repo is now `apps/web` + `apps/api` under npm workspaces. VPS cut over to the new layout; old `/opt/advo-api` kept intact as a rollback artifact (see [CUTOVER.md](CUTOVER.md)).

---

## Operational Docs

| Doc                                                                          | What it's for                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [HANDOFF.md](HANDOFF.md)                                                     | Reverse-chronological session log — what shipped each session + honest open-items                                           |
| [ROADMAP.md](ROADMAP.md)                                                     | Canonical forward-looking roadmap — synthesizes Messenger archive + landing/feature sub-roadmaps                            |
| [LEGAL-BRIEF.md](LEGAL-BRIEF.md)                                             | The packet for counsel. All nine policies with their operative language quoted inline, 49 closed-form questions, the RA 10173 outreach block, real commercial figures, a TODO annex for entity details, and the bounded engagement ask. Sendable as-is; graded by `npm run bench:legal` (9/9). |
| [CONTRACTS.md](CONTRACTS.md)                                                 | Draft contract policy + 9 clauses (payment schedule, revisions, deemed approval, change orders, late payment, IP, non-abandonment, termination/warranty, project sign-off). Reconciled 2026-08-19 to what ADVO actually sends. Needs legal review before binding use. |
| [CUTOVER.md](CUTOVER.md)                                                     | VPS monorepo cutover runbook + rollback plan                                                                                |
| [SCHEMA.md](SCHEMA.md)                                                       | Database schema reference + migration log                                                                                   |
| [SETUP.md](SETUP.md)                                                         | Dev setup + deployment commands                                                                                             |
| [/ROADMAP.md](../ROADMAP.md)                                                 | Historical Stripe-landing audit roadmap (codex branch) — most items live only in the labeled stash                          |
| [/.agents/workflows/advo-standard.md](../.agents/workflows/advo-standard.md) | The ADVO Standard — cross-stack naming, DB conventions, auth, file patterns                                                 |
