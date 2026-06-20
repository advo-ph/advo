# Features Documentation

## Public Landing (`/`)

The marketing site at advo.ph. Sections are CMS-driven where the React component imports defaults from a CMS section but accepts overrides from `/api/content/sections`. README.md has the in-depth section list; the entries here cover behavior the README doesn't.

### Portfolio Proof Cards

Each portfolio item renders as a proof card: outcome metric headline, products-used chip group, launch timeline, two result bullets, and a before/after ProofMock fallback (rendered when a project has no `image_url`). Layout is 2-column on `md+`. Pulls extended fields from `case_study` JSON: `metric` / `outcome` / `timeline` / `products_used` / `before_after`. All optional — falls back to `description`, `tech_stack`, and a hardcoded `["Website","Client Hub","Admin"]` product list when the case study is sparse. Section header: "Proof, not just screenshots."

**Files**: `landing/PortfolioCard.tsx`, `landing/PortfolioGrid.tsx`

### Mobile Drawer

`FloatingNav` mobile menu is a full-screen overlay (not a small popover). Three numbered nav rows (01/02/03) with large `text-2xl` labels for big tap targets, ADVO badge + tagline header at top, bottom-pinned 2-column action grid (Start a Project / Client Hub). A11y: `role="dialog"`, `aria-modal`, `aria-expanded`, `aria-controls="mobile-navigation-drawer"`. Closes on Escape, on route change, and on action-row click. Body scroll lock while open. Honors `prefers-reduced-motion`. **z-50** (one above sections — drawer was originally `z-40` same as Hero, only the bottom row peeked through, fixed in `bc0ac03`).

**Files**: `landing/FloatingNav.tsx`

### Public Settings Endpoint

`GET /api/settings/public` returns an allowlisted subset of `site_config` keys (currently `social_links`, `brand_name`, `team_order`) **without auth**. The landing Footer reads `social_links` from here. The rest of `/api/settings/*` stays admin-only.

Added because the Footer was hitting the admin-only `/api/settings` and 401-ing on every anonymous visit (visible noise in console; wasted round-trip). To add a new public key: extend `PUBLIC_KEYS` in [`settings.routes.ts`](../apps/api/src/routes/settings.routes.ts).

**Files**: `apps/api/src/routes/settings.routes.ts`, `landing/Footer.tsx`

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

### Contract Section

"View Contract" button linking to contract PDF, or "Contract pending" if not yet set.

**Files**: `ProjectDashboard.tsx` → reads `project.contract_url`

### Progress Photos

Grid of admin-uploaded progress photos with captions and upload dates.

**Files**: `ProjectDashboard.tsx` → reads `project_asset` via API

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

**Bottom feeds** (3 columns): Recent Activity, Upcoming Deadlines (urgent badges in red), Latest Leads (avatar + submission date).

**Files**: `AdminDashboard.tsx`, `useAdminData.ts`

### Projects

Full CRUD. Form includes: client, title, description, GitHub repo, preview URL, contract URL, status, value/paid, tech stack. Edit mode shows asset upload. Auto-notifies client on project status change. Each card has an **Open** button → the Project Command Center (below).

**Files**: `AdminProjects.tsx`, `useOrgProjects.ts`, `db.ts`

### Project Command Center

A per-project hub opened from the **Open** button on each project card (shipped `dea17b6` shell + `97b213a` Contracts + `fbcc8a7` Show-Client-Now). One page, role-aware, with a header (title/status/client/value/repo/preview + a **Show Client Now** button) and six tabs:

- **Overview** — KPIs (paid %, outstanding + invoice count, open/total deliverables, stage), payment-progress bar, brief, tech stack. Real data from the project.
- **Deliverables** — this project's deliverables (status/assignee/due), filtered from `useAdminDeliverables`.
- **Files** — **Project Drive** (shipped `bdf1a8b`): per-project file manager — upload (storage + DB record), thumbnail grid (images inline, docs/PDF as cards), download, delete. `useProjectAssets` + `DELETE /api/projects/:id/assets/:assetId` (requireTeam, scoped).
- **Dev & Deploy** — GitHub repo link + latest commit, plus the **Show Client Now** flow.
- **Contracts** — the agreement link + the **red-flag review** (below).
- **Finance** — payment summary + this project's invoices (filtered from `useInvoices`).

#### Contract red-flag review

Paste a contract / SOW into the Contracts tab → `POST /api/contracts/review` (requireTeam) scores it against ADVO's [CONTRACTS.md](CONTRACTS.md) policies (downpayment floor 40%/₱30k · 2 revisions/phase · change-order clause · late-payment · termination) and returns a **verdict** (good_to_go / needs_work / high_risk) + per-policy **red/amber/green** flags + a disclaimer. Catches the "contract was silent" gap that leaked revenue on Fourlinq + Felici.

**AI with heuristic fallback** (`fae49dd`) — `reviewContract()` runs Claude (`claude-opus-4-8`, via `@anthropic-ai/sdk`) against the 5 policies when `ANTHROPIC_API_KEY` is set, and falls back to the heuristic presence-check on a missing key or any AI error / malformed output. Same return shape; `method` is `"ai"` vs `"heuristic"` and the disclaimer reflects which ran. **Prod has no key yet**, so live review currently runs the heuristic — add `ANTHROPIC_API_KEY` to the VPS `.env` + `pm2 restart advo-api` to activate the AI path.

#### Show Client Now (expiring preview links)

Generate a private, **20-minute** link to the project's `preview_url` to drop to a client mid-build. `POST /api/projects/:id/preview-link` (requireTeam) mints a signed HS256 token (reuses `JWT_SECRET`); the **public** `GET /api/preview/:token` verifies it and **302-redirects** to the preview, or shows a branded 410 gate page when expired. Host-agnostic (Vercel / Cloudflare Pages / here.now / VPS — ADVO just stores the URL and controls the link's lifetime). Clients can also **request** a preview from their Hub (see Client Portal) → logged to `activity_log` → the team sees it in this panel.

**Files**: `ProjectCommandCenter.tsx`, `useContractReview.ts`, `usePreviewLink.ts`, `apps/api/src/services/contract-review.service.ts`, `apps/api/src/routes/contracts.routes.ts`, `apps/api/src/services/preview.service.ts`, `apps/api/src/routes/preview.routes.ts`

### Clients

Client management with company name, contact email, GitHub org, brand color. **Invite button** on each card — creates auth account and sends welcome email. **Search bar** filters by company name or email.

**Files**: `AdminClients.tsx`, `useAdminData.ts`

### Team

Team member profiles with name, role, email, bio, social links (LinkedIn, GitHub). Avatar upload (max 5MB). **Drag-to-reorder** — order persists via `team_order` site config key. Applied on landing page + team page.

**Files**: `AdminTeam.tsx`

### Deliverables (Schedule)

Full CRUD (shipped `3a622af`, closing audit finding B1 — was previously read-only). Add/Edit dialog (project, title, description, assignee, status, priority, due date), a per-card **inline status quick-change** (optimistic), delete (dialog footer), team-member filter, and an empty-state CTA. Mirrors the `AdminAvailability` dialog pattern. Backend `POST/PATCH/DELETE /api/deliverables` already existed; this added the missing UI.

**Files**: `AdminSchedule.tsx`, `useAdminDeliverables.ts`

### Calendar

The all-around ADVO records calendar (Phase 1, shipped `0018c3e`/`80f076e`). A month grid that overlays **manually-created events** (meeting / deadline / MOA / BIR / content / social / cold-email / event) with **derived events computed at read time** from existing records: deliverable due dates, invoice due + paid dates, project kickoffs, **content/social posts** (scheduled + published), **contracts/MOAs** (signed + expiry), and **BIR filing deadlines** (auto-generated statutory dates) — all Phase 2. Prev/today/next nav, today highlight, a category-filter legend, click-a-day to add, and an edit/delete dialog (title, category, date, all-day or start/end time, location, notes). `GET /api/calendar?from&to` returns the union; POST/PATCH/DELETE manage manual events (requireTeam). Derived events are read-only (edit them on their own page).

**Phase 2 (in progress):** content/social posts (`social_scheduled` / `social_published`, read from the existing `social_post` table — no migration) and **contracts/MOAs** (`contract_signed` / `contract_expires`, new `contract` table + CRUD at `/api/contracts`, migration `004`) now derive into the union, plus **BIR filing deadlines** — auto-generated from a small statutory ruleset in `calendar.routes.ts` (`bir_deadline` category, no table; statutory dates **not** adjusted for weekends/holidays → "verify with your accountant" caveat shown in the read-only detail). Remaining layers: meetings, cold-email cadence. `Availability` will fold into this as a team-availability layer.

**Phase 3 (decided, not started):** Google Calendar + ICS sync — **two-way / bidirectional** (owner decision, 2026-06-20).

**Files**: `AdminCalendar.tsx`, `useCalendar.ts`, `calendar.routes.ts`, `calendar_event` table (migration `003`); `contracts.routes.ts` + `contract` table (migration `004`) for the contracts/MOA layer. Endpoint coverage in `api-wiring.test.ts`: Calendar block (auth-gate, range-GET shape, manual-event CRUD, content/social layer) + Contract records block (CRUD + signed/expiry calendar derivation).

### Finance

Invoice management with create/edit/delete. Status toggle (unpaid → paid → overdue). Auto-triggers email notification on create.

**Files**: `AdminFinance.tsx`, `useInvoices.ts`

### Notifications

Compose notifications to single client or broadcast to all. Auto-notification on project status change.

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
- **Bulk actions** — select multiple leads, bulk set status or assign
- **Convert to Client** button — creates user account + client + project, sends welcome email
- **Notes** per lead with auto-save on blur

**Files**: `AdminLeads.tsx`, `useLeads.ts`

### Settings

- **Domain & Branding**: agency name, domain URL, accent color, logo
- **Social Links Editor**: add/edit/remove, saved to `site_config.social_links`, displayed in footer
- **Security**: Change password dialog
- **Admin Users**: manage admin email list
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

| Event | Type |
|-------|------|
| Progress update posted | `progress_update` |
| Invoice created | `invoice_issued` |
| Deliverable completed | `deliverable_completed` |
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

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scrape/save` | Save scrape result |
| GET | `/api/scrape/history` | List saved scrapes (optional `?type=brand\|facebook`) |
| GET | `/api/scrape/history/:id` | Get single saved scrape with full data |
| DELETE | `/api/scrape/history/:id` | Delete a saved scrape |

---

## Hooks Reference

All data fetching uses React Query (`@tanstack/react-query` v5). Each admin CRUD hook returns the canonical shape `{ items, isLoading, createX, updateX, deleteX, isSaving }` with optimistic updates and shared cache.

### Auth + utility

| Hook | Purpose |
|------|---------|
| `useAuth` | JWT auth state, login, magic link, password change, sign out |
| `useRoles` | Permission role from JWT token |
| `useGitHub` | GitHub commits and branches (via `lib/github.ts`) |

### Admin data

| Hook | Purpose |
|------|---------|
| `useAdminData` | Aggregated dashboard counts (projects, clients, leads, stats) |
| `useOrgProjects` | Projects with GitHub enrichment (commits, PRs, tech stack) |
| `useAdminPortfolio` | Portfolio CRUD (list, create, update, delete) |
| `useAdminSocial` | Social post CRUD |
| `useAdminTeam` | Team member CRUD + drag-reorder |
| `useAdminAvailability` | Team availability blocks CRUD |
| `useAdminDeliverables` | Deliverables CRUD + optimistic inline status |
| `useInvoices` | Invoice CRUD with optimistic status toggle |
| `useNotifications` | Admin: fetch all + send/broadcast. Client: fetch + mark-read |
| `useLeads` | Lead management with status updates, assignment, bulk actions, conversion |
| `useSiteContent` | CMS sections: toggle visibility, update content |
| `useContractReview` | Command Center: heuristic contract red-flag review |
| `usePreviewLink` | Command Center: mint expiring preview links + list client requests (`useProjectPreview`); client request-a-preview (`useRequestPreview`) |

### Client portal

| Hook | Purpose |
|------|---------|
| `useClientData` | Client-side: projects, deliverables, invoices, assets, contacts |

## Roadmap

### Internal Library (planned)

A MotionSites-style visual library at `/admin/library` — team-wide (not admin-only) — for pulling references into client conversations and reusing internal assets.

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
- File storage on VPS at `/var/advo/library/`, served by nginx behind auth

**Out of scope v1:** versioning, comments, collections/folders, client-facing access, AI-suggested tagging — all additive later.

**Open question:** one unified grid (filter by type) vs tabs-per-type. Shipping unified first; revisit if it feels incoherent in practice.

**Estimated effort:** ~3 days (schema + API + page + upload handling).

### Admin UX cleanup

1. ✅ **Sidebar grouping** — shipped `ae550e3` (Operations / Marketing Site / Pipeline / Tools)
2. ⏳ **Modal → page** for high-field-count CRUD (Projects, Clients) — not started
3. ✅ **Empty-state CTAs** — shipped `383f90b` for Projects, Clients, Notifications; AdminFinance + AdminSocial already had inline creates; AdminLeads gets a hint instead of a button (leads are user-generated, not admin-created)
4. ⏳ **Hide experimental tools** (Brand Scraper, FB Scraper) behind a "Tools" submenu — not started (they're in the Tools group but still always visible)

### Monorepo restructure

✅ Shipped `f024fae` (merge) + `ad06a61` (CUTOVER runbook). Repo is now `apps/web` + `apps/api` under npm workspaces. VPS cut over to the new layout; old `/opt/advo-api` kept intact as a rollback artifact (see [CUTOVER.md](CUTOVER.md)).

---

## Operational Docs

| Doc | What it's for |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Reverse-chronological session log — what shipped each session + honest open-items |
| [ROADMAP.md](ROADMAP.md) | Canonical forward-looking roadmap — synthesizes Messenger archive + landing/feature sub-roadmaps |
| [CONTRACTS.md](CONTRACTS.md) | Draft contract policy + clauses (revision limits, downpayment floor, change orders). Needs legal review before binding use. |
| [CUTOVER.md](CUTOVER.md) | VPS monorepo cutover runbook + rollback plan |
| [SCHEMA.md](SCHEMA.md) | Database schema reference + migration log |
| [SETUP.md](SETUP.md) | Dev setup + deployment commands |
| [/ROADMAP.md](../ROADMAP.md) | Historical Stripe-landing audit roadmap (codex branch) — most items live only in the labeled stash |
| [/.agents/workflows/advo-standard.md](../.agents/workflows/advo-standard.md) | The ADVO Standard — cross-stack naming, DB conventions, auth, file patterns |
