# ADVO Session Handoff

Reverse-chronological log of substantive work sessions. One entry per session or coherent batch. Newest at top. Each entry ends with **Honest open-items** — things that did NOT ship — so the next session knows what's left.

Cross-links:
- Forward-looking work → [ROADMAP.md](ROADMAP.md)
- Current product surface → [FEATURES.md](FEATURES.md)
- VPS deploy state → [CUTOVER.md](CUTOVER.md)
- Schema reference → [SCHEMA.md](SCHEMA.md)
- Contracts/policy → [CONTRACTS.md](CONTRACTS.md)

---

## 2026-08-15 — wiring leftover (W1–W5, R3–R4)

> Roadmap-remain wiring lane. Close the WIRING-AUDIT half-built admin items this lane owns.

- **W1** Settings branding hydrates from `GET /api/settings/agency_name` (+ domain/accent/logo).
- **W2** Add Admin creates a login-capable `user` with `role: "admin"` (temp password emailed / shown once).
- **W3** Auto-rule toggles labeled inactive; `POST /api/notifications` reads them before send.
- **W4** Dashboard Recent activity uses real `getRecentProgressUpdates` (project update feed, not `{ data: [] }`).
- **W5** Social platform stats show queued post counts, not fake follower numbers.
- **R3** Team drag-reorder mutates `allMembers`, not the filtered visible subset.
- **R4** `useAdminTeam` reads `team_order` from `GET /api/settings/public`.

### Honest open-items
- Event triggers in `projects.routes.ts` / invoices / deliverables still do not call the auto-rule helper (those files are another lane).
- W7 scraper delete + R2 asset select + W8 public-settings test belong to admin/test lanes.
- API `tsc` on this machine is red (no `apps/api/node_modules`); not fixed with lockfile churn.

## 2026-08-15 — lane/admin: library, full-page CRUD, Tools scrapers, `/p/:token`

> Roadmap-remain admin lane. Ships the P2 admin surface: Library MVP, Projects/Clients as pages, collapsed Tools scrapers, branded preview gate, controlled add-asset, scraper history delete.

- **Library** — `/admin` → Library. `library_item` (011) + `/api/library` + grid/filter/drawer. Types: website / prompt / module / asset / doc.
- **Project / client forms** — high-field create/edit is a full page (`projectFormMode` / `ClientForm`), not a dialog.
- **Tools submenu** — Brand + FB scrapers sit behind `toolsExpanded`.
- **Preview** — public `/p/:token` branded gate → `GET /api/preview/:token`.
- **R2 / W7** — add-asset type/url/caption is controlled `assetType` state; scraper history has delete; new brand saves omit base64 screenshots.

### Honest open-items
- Library does **not** upload files to `/var/advo/library/` — URL metadata only. Apply `011_library_item.sql` on merge (do not use the shared 6407 DB from this lane).
- Show-Client-Now still *mints* `api.advo.ph/api/preview/<token>` URLs; the pretty path exists for humans to share. Rewriting the mint is a follow-up (Command Center is staff-owned).
- here.now ephemeral deploy still deferred.

## 2026-08-15 — lead lane: import, targeting, proposal tracker + template-fill

> Roadmap-remain lane `lead` (`lane/lead`). Ships the P1 lead-gen + P0 proposal-pipeline items that are code-buildable.

- **lead-import** — `npx tsx scripts/import-clinic-lead.ts` + `data/clinic-lead/sample.json`. Dedupes by email in-file and against existing `lead` rows. The 5K Messenger dump is a path argument when present; sample fixture is 6 rows (1 duplicate) so we do not invent 5K clinics.
- **targeting-rule** — `/admin` → Leads “Outdated only” toggle. `lib/targeting.ts` scores zero/outdated systems up and modern stacks (Shopify/Inventi/…) to 0.
- **proposal-tracker** — `/admin` → Proposals. `proposal` table statuses: sent / opened / replied / signed.
- **proposal-pdf** — Generate fills CONTRACTS.md clauses + lead fields into printable HTML (`POST /api/proposal`, `GET /api/proposal/:id/pdf`). AI generation deferred.
- Surgical mount in `Admin.tsx` + `AdminSidebar.tsx` (admin-lane files) so the Proposals section is reachable and scoring `/proposal/i` is true. Merge-order is lead then admin — keep the add additive.

### Honest open-items
- Full 5K archive is not in-repo; run the importer with the dump path when it exists.
- Proposal document is HTML print-to-PDF, not a binary PDF library.
- Clauses stay draft until the lawyer item.
- Local preview used lane DB `advo_lead` (API :6411) because staff already owns :6407.

## 2026-08-15 — hub: change-order form (`change-order-form`)

> Lane hub. Client files a change order (scope + reason) from `/hub` against CONTRACTS.md policy 3; team lists it.

- Migration `009_change_order.sql` + `change_order` table in `schema.ts`.
- `POST/GET /api/change-order` (client scoped to own projects; team sees all). `PATCH` (team) quotes `price_cents` / `timeline_note` / status.
- Hub project dashboard: Change order panel — form + filed list.
- Bench: `change-order-form` PASS. `monitor-backup` still PASS.

### Honest open-items
- No admin UI for quoting — team uses `GET`/`PATCH /api/change-order`. Command Center is another lane.
- Quote → client-sign flow is API-ready (`signed`) but the hub form only files; no client-confirm button yet.
- Binding language still needs the lawyer (`legal-bind` / `lawyer` are out of this tier).

## 2026-08-15 — staff lane: capacity, junior assign, school blackout

> Roadmap-remain lane `staff` on `lane/staff`. Scoring: `capacity-view`, `junior-assign`, `blackout-calendar` PASS; `monitor-backup` still PASS.

- **Capacity** — `GET /api/projects` already returned `teamMemberId[]`; extracted `attachTeamMemberId` + `projectCountByMember` / `capacityRemaining`. Availability member tabs show active-project count + remaining (soft cap 3).
- **Junior assign** — `POST/DELETE /api/projects/:id/team` (keeps existing `/access`). Command Center Overview **Team** panel assigns a junior (role match junior/dev/intern).
- **Blackout** — Calendar paints a togglable **School blackout** layer from weekly school/unavailable blocks.

Walked on `http://127.0.0.1:6440/admin`: Availability chip `1 proj · 2 left`, Calendar Mondays show `Angelo Revelo: pre-fi finals`, Command Center assign + remove.

### Honest open-items
- Other seven lanes still FAIL on the remain bench (expected).
- AdminProjects still assigns via `/access` (admin lane owns that file).
- Did not apply migrations in this commit; local preview needed 007/008 already in the repo.

## 2026-08-15 — docs: shipped `LandingPage` is the current `/`

> Landing-follow docs lane. A new agent reading README + ROADMAP should be told the truth: `/` is the shipped Codex `LandingPage` (`278a65a`), not the old 3D / TechTicker / orange-blob page, and the landing is not in-progress.

- [README.md](../README.md) Features → Public Site + Design System now describe `LandingPage` / `landing-page.css` (white editorial). Admin/hub stay Linear dark.
- [ROADMAP.md](ROADMAP.md) intro no longer calls the Codex landing in-progress or a hero+services-only copy port.
- [FEATURES.md](FEATURES.md) Public Landing + [MOODBOARD.md](MOODBOARD.md) type/look rows match the live page.

### Honest open-items
- Copy + route + docs lanes are merged to `main`. `/start` `/login` `/team` `/project/:slug` use `landing-shell`; inner page bodies still use dark Linear tokens on the white chrome.
- `/hub` stays Linear / `FloatingNav`.
- Do not invent a newsletter API, client-logo strip, or dashboard redesign.

## 2026-08-14 — host `advo`, ports 6400/6407, admin/meeting/expense on `main`

> User: *"i want to change the name of my contabo repos"* / *"go /cleanup commit merge to main"*. The ADVO-PH box is **`ssh advo`** (was Contabo `vmi3170887`). Local + prod API **6407**, web **6400** (claimed block 6400–6499; do not share sisia's 6107). `deploy.sh` defaults `VPS_SSH=advo`. Expense / meeting / PM-assist WIP fast-forwarded to `origin/main` (`c75fc3d`); parking-lot `wip/admin-meeting-expense` deleted after land. Three-box contract: `booted/docs/vps.md`. Ledger: `~/Antigravity/PORTS.md`.

### Honest open-items
- **Calendar endpoints still have no automated test** (carried from 2026-06-20).
- **`.grok/` leftover** untracked; not committed.
- **Meeting/expense has no dedicated test** beyond what was already in the suite — new routes landed with the product WIP.
- This session did not re-smoke `api.advo.ph` after the 6407 retarget from this machine.

## 2026-06-20 — ADVO records calendar (Phase 1)

> Merged to `main` (`0018c3e` + `80f076e`). API + web typecheck 0/0, both builds ✓, suite 81/81. **Deployed (API + web + migration 003)** — `/api/calendar` live (401-gated), advo.ph serves `index-C1JfRqd4.js`, migration applied to prod as the app DB user. User: *"for availability, I feel like we can just make that a calendar... a full out calendar that's connected to deliverables, financing, BIR compliance, content, social aspects, posting, cold emailing."*

Phase 1 of the all-around calendar (the vision is much bigger — see open-items).
- Backend: new `calendar_event` table (migration `003`, per the database-conventions skill — see [SCHEMA.md](SCHEMA.md)). `GET /api/calendar?from&to` ([calendar.routes.ts](apps/api/src/routes/calendar.routes.ts), requireTeam) returns **manual events UNION derived** events computed at read time from deliverables (due), invoices (due + paid), and projects (kickoff). POST/PATCH/DELETE manage manual events.
- Frontend: [AdminCalendar.tsx](apps/web/src/components/admin/AdminCalendar.tsx) — month grid, dot-coded event chips, prev/today/next, category-filter legend, today highlight, click-day-to-add, edit/delete dialog (title/category/date/all-day/time/location/notes). [useCalendar.ts](apps/web/src/hooks/useCalendar.ts) hook. Wired "Calendar" into the Operations nav.
- Verified: read path live-tested locally (real deliverable/invoice/kickoff events rendered across months); migration applied + table confirmed local + prod.

### Honest open-items
- **Calendar endpoints have no automated test** — `/api/calendar` GET/POST/PATCH/DELETE aren't in `api-wiring.test.ts`. Add a range-GET + create/delete assertion.
- **Authenticated create not live-tested on prod** — no prod admin creds in hand; the write path is deployed + compiles + uses the same insert/mutation pattern as other working CRUD, but a live "Add event" click should confirm it.
- **Phase 2** (not started): contracts/MOAs, meetings, BIR deadlines, content/social posting, cold-email cadence as event layers — some need their own tables/fields first.
- **Phase 3** (not started): Google Calendar + ICS sync — needs the owner's **two-way vs read-only** decision.
- **Availability** page still in the nav; folds into the calendar (team-availability layer) once the calendar is proven.

---

## 2026-06-20 — Linear-inspired UI redesign (admin + hub + design system)

> Merged to `main` (`d728c2e` → `8d67d82`, + refinement `eab41ea`). API+web typecheck 0/0, lint 0 err, builds ✓, full suite **81/81**. **Deployed (web).** User: *"this font is screaming ai"* · *"I'd like the design... more compressed... not follow a template... more humane."*

Full redesign of the admin console + client hub to a Linear-inspired language, validated against the captured Linear spec in the local `Codex/design.md` repo. Design preference saved to memory (`feedback_design_language`).
- **Foundation** (`d728c2e`): cooled the palette to a cool near-black canvas + charcoal panels (kept ADVO orange accent), dark-first; swapped Geist/Geist Mono → **Hanken Grotesk** and removed all `font-mono` (the loudest "AI" tell); shared admin primitives in [_ui.tsx](apps/web/src/components/admin/_ui.tsx) (PageHeader/StatStrip/Stat/Panel/Empty/Dot/Table).
- **Compression** (`cbcfd5f`): killed the AI tells (greeting hero, "Admin" badge, icon chips, uniform floating cards, motion fade-ins); list pages → **dense tables**, summary pages → stat-strip + hairline panels. Propagated across all 17 admin sections via parallel agents + the Command Center.
- **Hub** (`8d67d82`): same language, compressed.
- **Refinement** (`eab41ea`): snapped tokens to Linear's exact values (canvas `#08090a`, card `#0f1011`, hairline `#23252a`, muted `#8a8f98`); radius 8px → 6px.

### Honest open-items
- Presentation-only — no logic changed; 81/81 suite still green (it tests API wiring, not styling).
- Landing page also picked up Hanken (the font is global) — owner OK'd one cohesive brand font.
- Availability page restyled but not restructured (becomes the calendar — see the entry above).

---

## 2026-06-20 — "go build these" batch: email-on-lead · S4 closed · Files pillar · AI contract review

> Merged to `main` (4 commits, `8bc719f`→`fae49dd`). API + web typecheck 0/0, lint clean (0 err), both builds ✓, full suite **81/81** against the live dev API. **Deployed (API + web)** — health 200, advo.ph serves `index-Mnygn4dS.js`, new routes live (401-gated).

Four open items from prior handoffs, shipped together:

1. **Email-on-new-lead** (`8bc719f`) — `POST /api/leads` fire-and-forgets a notification to every admin (`user` where role='admin') via `sendLeadNotificationEmail` (HTML summary + link to `/admin`). Resend SMTP when `RESEND_API_KEY` set, else logs only; failures swallowed so they never block lead creation. ([leads.routes.ts](apps/api/src/routes/leads.routes.ts), [email.service.ts](apps/api/src/services/email.service.ts))
2. **S4 closed** (`9574820`) — [github.ts](apps/web/src/lib/github.ts) / [cloudflare.ts](apps/web/src/lib/cloudflare.ts) no longer read `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` or call api.github.com / api.cloudflare.com from the browser. Commits + branches route through the backend (server-side token, github_event cache); enrichment with no backend endpoint degrades to null/[]/0. Tokens were never set in prod, so this removes the footgun, not an active leak. Live bundle has 0 token literals.
3. **Files/Drive pillar** (`bdf1a8b`) — per-project file drive in the Command Center: [useProjectAssets.ts](apps/web/src/hooks/useProjectAssets.ts) (list / upload via storage+record / optimistic delete) + `DELETE /api/projects/:id/assets/:assetId` (requireTeam, scoped) + a Files tab (upload, thumbnail grid, download, delete).
4. **AI contract review** (`fae49dd`) — `reviewContract()` now runs Claude (`claude-opus-4-8`) against ADVO's 5 contract policies when `ANTHROPIC_API_KEY` is set, and falls back to the existing heuristic on a missing key or any AI error / malformed output. Same `ContractReview` shape + route + UI; `method` is `"ai"` vs `"heuristic"` and the disclaimer reflects which ran. Adds `@anthropic-ai/sdk`. (Read the claude-api skill first: TS SDK, opus-4-8, strict-JSON prompt + parse/validate.)

### Honest open-items
- **AI contract path is untestable without a key** — prod has no `ANTHROPIC_API_KEY`, so live contract review still runs the **heuristic** (correct fallback). To activate the AI path: add `ANTHROPIC_API_KEY` to the VPS `.env` + `pm2 restart advo-api`. The heuristic stays covered by the existing contract tests.
- VPS `/opt/advo` had a drifted tracked `package-lock.json` (prior `npm install`); resolved with `git checkout -- package-lock.json` before the pull (**not** `stash -u`). Future pulls may hit the same — discard the lock, never sweep untracked.
- **Test-coverage gaps (low severity, verified manually this/prior session):** `DELETE /api/projects/:id/assets/:assetId` has no dedicated test (the GET-assets list is exercised in `e2e-flow.test.ts`); the fire-and-forget email side-effect on `POST /api/leads` isn't asserted (the lead-create path is). Both were proven live earlier (asset add→delete; leadId 154 email fired). Add an asset-delete + a lead-email-trigger assertion when convenient.
- Still open from prior: pretty `advo.ph/p/<token>` preview route; here.now fresh-deploy path; import the metro-manila clinic leads from the Messenger archive.

---

## 2026-06-20 — Command Center: Dev/Deploy pillar (Show Client Now)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full suite 81/81 (+3). Backend flow proven end-to-end via curl. **Deployed (API + web).**

Second pillar: the "Show Client Now" preview flow + client-initiated requests. Owner chose the **expiring-link-to-stored-preview** approach (no external dep / key) over a full here.now integration.

- Backend:
  - [preview.service.ts](apps/api/src/services/preview.service.ts) — signs a short-lived (20 min) HS256 token bound to a projectId (reuses `JWT_SECRET`/jose).
  - `POST /api/projects/:id/preview-link` (requireTeam) → mints `{ url, expiresAt, ttlMinutes }` where url is `…/api/preview/<token>`.
  - `GET /api/preview/:token` (**public**, [preview.routes.ts](apps/api/src/routes/preview.routes.ts)) → verifies + **302-redirects** to the project's `preview_url`; bad/expired token → branded 410 gate page. Host-agnostic.
  - `POST /api/projects/:id/preview-request` (auth + `assertProjectAccess`) → logs to `activity_log` (action `preview_requested`). `GET /api/projects/:id/preview-requests` (requireTeam) → team sees them.
- Frontend:
  - Command-center Dev tab: real **Show Client Now** card (Generate link → copyable, "expires in 20 min") + a "Client requests" list. Header button now jumps to the Dev tab (controlled tabs).
  - **Client Hub** ([ProjectDashboard.tsx](apps/web/src/components/hub/ProjectDashboard.tsx)): a **"Request a preview"** button → notifies the team (owner's ask).
- Verified: curl proved mint→302→request→list; 3 new endpoint tests (mint 200, bad token 410, request logged) pass in the 81/81 suite; typecheck + build clean.

### Honest open-items
- Admin generate-link **UI** verified via backend + build + the rendered Dev panel, but the final on-screen link render wasn't browser-clicked this run (MCP browser flaked on lock contention). Low risk — thin React-Query render over a proven endpoint.
- **S4 NOT closed** — this pillar added the preview flow but did not route the GitHub feed through the backend; `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` are still in the bundle. Separate task.
- Preview link is `api.advo.ph/api/preview/<token>` (functional, slightly unbranded) — a pretty `advo.ph/p/<token>` frontend route is a polish follow-up.
- here.now fresh-deploy path deferred (needs a here.now API key + per-project build artifacts) — the link approach is host-agnostic and works today.

---

## 2026-06-20 — Command Center: Contracts pillar (red-flag review)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full suite 78/78 (+3), browser-verified. **Deployed (API + web).**

First real pillar filled into the command center: the Contracts tab now runs a **heuristic red-flag review** of a pasted contract/SOW against ADVO's own [CONTRACTS.md](CONTRACTS.md) policies.
- Backend: [contract-review.service.ts](apps/api/src/services/contract-review.service.ts) (pure function, LLM-ready shape) + `POST /api/contracts/review` ([contracts.routes.ts](apps/api/src/routes/contracts.routes.ts), requireTeam) mounted at `/api/contracts`.
- Checks 5 policies (downpayment floor 40%/₱30k · 2 revisions/phase · change-order clause · late-payment · termination) → per-policy red/amber/green + verdict (good_to_go / needs_work / high_risk) + summary + disclaimer.
- Frontend: [useContractReview.ts](apps/web/src/hooks/useContractReview.ts) + the Contracts tab (paste → Check → verdict badge + flag list + disclaimer).
- Verified: silent contract → **high_risk (5 red)**; complete contract → **good_to_go (5 green)** — both in tests + a live browser run.

**Why heuristic, not AI:** there is **NO LLM configured anywhere** — no Vertex/Google/Anthropic env keys, no GCP creds, `GOOGLE_APPLICATION_CREDENTIALS` unset on local + VPS. The existing Gemini brand-analysis service is non-functional for this reason (hence orphaned). The review's return shape is LLM-ready: swapping `reviewContract()` to call a model later is a one-function change — needs a key (owner chose heuristic-only for now; recommended upgrade = add `ANTHROPIC_API_KEY` and use Claude).

### Honest open-items
- Heuristic = presence check, not legal analysis (disclaimer says so). Upgrade to real AI when a key is added.
- No PDF auto-extract yet — user pastes text (contract_url is just a link). PDF→text extraction is a follow-up.
- No persistence — the review is stateless (not saved per project). Status tracking (draft/sent/signed) is future.
- **Dev/Deploy pillar still to build** — incl. owner's new ask: clients should be able to **request** a temporary preview from their Hub. Owner's "here-dot-now" = **here.now** (instant web hosting for agents) — the intended mechanism for Show-Client-Now.

---

## 2026-06-20 — Project Command Center (shell)

> Branch merged to `main`. typecheck 0/0, lint clean, build ✓; walked through in a real browser. Web-only — **not yet deployed**. New feature, not an audit item.

First slice of the per-project "command center" vision (owner wants a Drive + dev/deploy status + "show client now" + contracts/AI-review, role-aware for manager/dev/finance, "benefit but don't overwhelm"). Chose **shell-first**: structure before features.

- New [ProjectCommandCenter.tsx](apps/web/src/components/admin/ProjectCommandCenter.tsx) — opened via a new **Open** button on each card in `AdminProjects` (early-returns into the command center; `openProjectId` re-derives from the live list so it stays fresh). Header (title/status/client/value/repo/preview + a disabled **Show Client Now**) + 6 tabs:
  - **Overview / Deliverables / Finance** — REAL data (project fields + payment progress; project-scoped deliverables via `useAdminDeliverables`; project-scoped invoices via `useInvoices`).
  - **Files / Dev & Deploy / Contracts** — `ComingNext` scaffolds that spell out each pillar (Project Drive on `project_asset`+R2; Show-Client-Now expiring preview link, host-agnostic, also closes S4; contract status + AI red-flag review against CONTRACTS.md). Each scaffold names which role it serves.

**Key insight (owner's "here-dot-now"):** that's **here.now** — "instant web hosting for agents". It's the right mechanism for the instant/ephemeral preview pillar (far better than fighting Vercel's persistent previews). Design Show-Client-Now around here.now when that pillar gets built.

### Honest open-items
- **Not deployed** (web-only — needs `build:web` + rsync).
- Shell only — Files/Dev/Contracts panels are scaffolds, no functionality yet. Next: pick a pillar to fill (owner leaning order TBD; my rec was Contracts AI-review first for business value, but they chose shell-first to see structure).
- Command center doesn't yet host Post Update / Edit (those still live on the list cards) — could move in later.

---

## 2026-06-20 — Tier 2 quick-fix batch (5 broken/papercut items)

> Merged to `main`. typecheck 0/0, lint clean, build ✓, full vitest 75/75. Each fix verified at runtime. **Touches API + web — needs both deploys.**

Knocked out five small verified-broken items from the audit in one pass:
- **B2** — health badge always read "Disconnected". `checkConnection` ([db.ts](apps/web/src/lib/db.ts)) now reads the raw `db` field from the un-enveloped `/api/health` instead of `res.data?.db`. Browser-verified: Settings shows **Connected**. (Endpoint shape unchanged → health tests + monitors unaffected.)
- **B3** — removed the no-op "Quick action" dashboard button (`AdminDashboard.tsx`).
- **R1** — invoice PATCH now clears `paid_at` when status leaves "paid" ([invoices.routes.ts](apps/api/src/routes/invoices.routes.ts)). API-verified: paid→stamps, overdue→clears.
- **W6** — dashboard "View all" leads CTA was a dead `#leads` anchor; now a button calling `onNavigate("leads")` threaded from `Admin.tsx`. Browser-verified: switches to Leads tab.
- **R5** — broadcast notification loop wrapped in try/catch so a client deleted mid-broadcast is skipped instead of 500ing the whole call ([notifications.routes.ts](apps/api/src/routes/notifications.routes.ts)). (The `fileParallelism:false` test fix from the gate stays.)

### Honest open-items
- **Deploy pending** — this batch changes both `apps/api` (invoices, notifications) and `apps/web` (db, dashboard, Admin), so it needs API rebuild+restart AND web build+rsync.
- Remaining Tier 3: W1 (settings not read back), W2 (Add-Admin), W3 (notif toggles), W4 (dashboard recent-activity stub), W5 (social mock stats), W7 (scraper delete+bloat), W8 (settings/public test); R2/R3/R4 edges. Plus **S4** (browser tokens).

---

## 2026-06-20 — B1: Deliverables CRUD UI (admin)

> Branch merged to `main`. Build + typecheck clean; full vitest suite 75/75; CRUD verified end-to-end in a real browser. **Not yet deployed** (frontend — needs VPS `build:web` + rsync).

Closed the audit's biggest functional gap (B1): the Deliverables panel (`AdminSchedule`) was entirely read-only despite a ready backend. Now full CRUD:
- [useAdminDeliverables.ts](apps/web/src/hooks/useAdminDeliverables.ts) — added create/update/delete mutations + an optimistic inline status mutation, `toApiPayload` (snake→camel), react-query invalidation to re-pull the joined list.
- [AdminSchedule.tsx](apps/web/src/components/admin/AdminSchedule.tsx) — Add/Edit dialog (project, title, description, assignee, status, priority, due date), per-card inline status quick-change, delete (dialog footer), empty-state CTA. Matches the `AdminAvailability` dialog pattern.

Verified in-browser (logged in as admin, local API): created "Gate Verify" deliverable → appeared with correct project/assignee/status; inline status → Completed persisted with `completedAt` set; edited title → persisted; deleted → removed from DB. Each step confirmed against `GET /api/deliverables`.

### Honest open-items
- **Not deployed yet** — frontend change; live admin still read-only until VPS `npm run build:web` + `rsync apps/web/dist/ /var/www/advo/dist/`.
- No automated UI test for the CRUD (verified manually in-browser). The API endpoints it uses are covered by the wiring suite.
- Remaining Tier 2: B2 (health-badge envelope), B3 (no-op dashboard button), the write-only Settings/notification items, S4 (browser tokens).

---

## 2026-06-20 — Tier 1 security fixes shipped + deployed

> Merged to `main` (`0e42f13`). Build: api+web typecheck clean; api-wiring suite 30/30 local. Prod: **deployed to api.advo.ph** (PM2 `advo-api` rebuilt + restarted from `0e42f13`).

Fixed the three verified cross-tenant data leaks from the wiring audit (S1/S2/S3) — all were `requireAuth`-only with no ownership scoping:
- **S1** `GET /api/deliverables` now role-branches (client → own projects, team → granted projects, admin → all). Was leaking every client's deliverables to any logged-in client.
- **S2** `GET /api/projects/:id` (+ `/updates`, `/github`, `/assets`) gated by a new `assertProjectAccess()` (404, not 403, so IDs can't be probed). Was an IDOR exposing any project incl. financials.
- **S3** `PATCH /api/notifications/:id/read` scoped to the caller's own `clientId` for non-admins.

Pattern copied from the already-correct `invoices.routes.ts` role-branch. Added a **regression test** ("cross-tenant data scoping" in `api-wiring.test.ts`) + a `client@advo.ph` seed fixture; proved teeth by reverting the handlers (tests went red) then restoring (green). Deploy: VPS `git pull` bc0ac03→0e42f13 + `npm run build:api` + `pm2 restart advo-api`; verified `assertProjectAccess` in the compiled dist + live `/api/health` OK.

### Honest open-items
- **S4 still open** — `VITE_GITHUB_TOKEN`/`VITE_CLOUDFLARE_TOKEN` are inlined into the public browser bundle. Fix = route the engineering feed through the backend `/api/github/*` cache (currently orphaned). See [WIRING-AUDIT.md](WIRING-AUDIT.md).
- The `client@advo.ph / changeme` seed fixture is a weak credential — fine for dev, but **do not run `db:seed` against prod**.
- Local dev DB was synced (`db:push`) + seeded during testing — local only, no prod impact.
- Tier 2 audit work (B1 Deliverables CRUD UI, B2 health-badge envelope, write-only settings, etc.) untouched — next up.

---

## 2026-06-20 — Feature wiring audit (admin + client surface)

> Branch: `main`. No code changes — investigation only. Output: [WIRING-AUDIT.md](WIRING-AUDIT.md).

Cautious pre-build audit (owner + Prince had hit many broken features). Traced all 15 admin sections + the client portal end-to-end (UI → API client → route → DB) via 5 parallel sub-audits + a frontend↔backend cross-reference. **Headline: wiring is clean** — every frontend call resolves to a real route, 0 broken/shadowed, casing+auth correct on wired paths. The real issues (full detail + fixes in [WIRING-AUDIT.md](WIRING-AUDIT.md)):

- **🔴 Security (verified, live):** `GET /api/deliverables` leaks all clients' deliverables (S1); `GET /api/projects/:id` IDOR exposes any project + financials (S2); `PATCH /api/notifications/:id/read` no ownership check (S3); `VITE_*_TOKEN` inlined into the public bundle (S4). Fix by copying the role-scope pattern in `invoices.routes.ts`.
- **🔴 Broken admin UI:** Deliverables (AdminSchedule) is entirely read-only — no CRUD controls despite a ready backend (B1); health badge always "Disconnected" — envelope mismatch (B2); a no-op dashboard "Quick action" button (B3).
- **🟡 Write-only/stub:** settings branding not read back; "Add Admin" creates a `team_member`, not an admin `user`; notif auto-rule toggles inert; dashboard recent-activity stub; social mock stats; scraper no-delete UI + base64 bloat.
- **⚪ Dead code:** backend GitHub cache + `brand-analysis.routes.ts` orphaned (~14/63 endpoints unused).

Decided this session: "prompt management system" = **AI prompt management** (author/version/test the Vertex prompts used by scrapers + the future proposal generator). Leads management already exists + fully wired; "customer management" = a CRM unifying leads + clients with an interaction timeline (the `activity_log` table exists but is surfaced nowhere).

### Honest open-items
- **Nothing fixed yet** — this is an audit. Tier 1 = the S1–S3 security fixes (small; copy the invoices scoping pattern). Tier 2 = Deliverables CRUD UI (B1). Full tiered action plan in WIRING-AUDIT.md.
- S1/S2 data-scoping bugs have **no regression test** — add one alongside the fix.

---

## 2026-06-20 — DB audit Tier 2: explicit ON DELETE on 8 FKs

> Branch: `db/audit-tier2-fk-policies` (not yet merged). Build: `apps/api` typecheck green. Prod: migration `002` applied live — all 18 FKs now carry an explicit policy.

Picks up the **8 FKs without explicit ON DELETE** open-item from the previous session. drizzle-kit `push` creates FK constraints but never ALTERs an existing one's action, so the DB had drifted to `NO ACTION` (RESTRICT-like) on 8 FKs — and it was actively blocking real deletes: `DELETE /api/team/:id` failed when a member had assigned deliverables/leads, and client-delete couldn't cascade through a project that had notifications.

**What shipped:**
- New migration [`002_audit_tier2.sql`](../apps/api/migrations/002_audit_tier2.sql) — `DROP`/`ADD CONSTRAINT` to set `ON DELETE` on all 8, applied to prod in one transaction.
  - **CASCADE** (drift-repair — schema.ts already declared it): `github_event.project_id`, `notification.project_id`.
  - **SET NULL** (nullable ref — detach, don't erase or block): `activity_log.user_id`, `deliverable.assigned_to`, `lead.assigned_to`, `scrape_result.scraped_by`, `client.user_id`, `team_member.user_id`.
- Per-FK policy decided with the database-conventions skill (rule 17). The two judgment calls — `client.user_id` and `team_member.user_id` — were confirmed **SET NULL** with the owner: deleting a login should preserve the business/billing record and the public team profile, not vaporize them (`team_member` already has `is_active` for hiding people).
- `schema.ts` mirrored — 6 `onDelete: "set null"` clauses added (the 2 cascades were already declared there). API `tsc --noEmit` clean.
- [SCHEMA.md](SCHEMA.md) migration-log row + 6 FK descriptions updated.
- **Verified:** `pg_constraint` now shows 12 CASCADE + 6 SET NULL, 0 NO ACTION. A rolled-back prod transaction proved deleting `team_member` 101 (3 assigned deliverables) now succeeds and sets `deliverable.assigned_to = NULL` instead of raising a FK violation.

### Honest open-items
- **No automated regression test for the FK policies.** Verified by hand (rolled-back txn). If a future raw migration reverts an action, nothing catches it — low risk (drizzle `push` won't touch FK actions), but a DB integration test asserting the delete-detach behavior would close it.
- Remaining Tier 2 hygiene unchanged: **19 of 20 tables still lack `COMMENT ON TABLE`**; `scripts/scrape-result-retention.ts` still unwritten.
- Branch `db/audit-tier2-fk-policies` not yet merged to `main`.

---

## 2026-06-19 → 2026-06-20 — Big session: monorepo, landing port, DB audit

> Range: `f024fae` → `0565510` (15+ commits). Branch: `main`. Build: green. Prod: live (frontend `index-Gpm-x0c2.js`, API uptime ~24h).

**What shipped, grouped:**

**Infra / restructure**
- Monorepo: two-repo split (`advo` + `advo-api`) merged into `apps/web` + `apps/api` under npm workspaces. VPS cutover completed (~30 sec downtime). Old `/opt/advo-api` kept intact as rollback. Runbook + gotchas in [CUTOVER.md](CUTOVER.md). Commits `f024fae`, `ad06a61`, `f3f3180`, `fd12d0b`.
- API repo initialized (was orphan, no `.git`) → `github.com/advo-ph/advo-api` (private). Now both halves are tracked.

**Auth + nav**
- Post-login role-based redirect: admins land on `/admin`, clients on `/hub`. `redirectAdminTo` prop on `ProtectedRoute` bounces admins off `/hub` too (`5c4a326`).
- Hub user card no longer hardcoded "Client" — shows actual role (`383f90b`).
- FloatingNav mobile menu: small popover → full-screen drawer with numbered tap rows, ADVO tagline header, bottom-pinned action grid. A11y (role=dialog, aria-modal/expanded), escape close, body scroll lock, prefers-reduced-motion. Commits `2360771`, `bc0ac03` (z-index fix — was equal to Hero's z-40, only bottom row peeked through).

**Landing copy + visuals**
- Hero headline default: *"We digitalize for you."* → *"Websites with the system behind them."* + product-system subtext. Structure / photo / stats unchanged (`38ff047`).
- ServiceTiers: generic agency tiers → 4 product surfaces (Website / Client Hub / Admin / Care Plan), section header *"One system, not just a website."* (`38ff047`).
- PortfolioCard: generic preview tile → proof card with outcome metric, products-used chips, launch timeline, result bullets, before/after ProofMock fallback. Section header: *"Proof, not just screenshots."* (`2360771`).
- Admin sidebar regrouped: flat 14 items → 4 labeled groups (Operations / Marketing Site / Pipeline / Tools) + Dashboard solo on top + Settings pinned bottom (`ae550e3`).
- Admin empty states with CTAs (Projects, Clients, Notifications); AdminLeads gets a hint pointing to advo.ph/start (`383f90b`).

**API**
- `GET /api/settings/public` — new anonymous endpoint exposing allowlisted keys (`social_links`, `brand_name`, `team_order`). Footer now calls this instead of admin-only `/api/settings`, eliminating per-pageview 401 (`a8a8cdc`).
- CORS allowlist extended to localhost:6100/6101 + 127.0.0.1 variants. Patched directly on VPS earlier in session; now reflected in source.

**Database**
- Tier 1 audit migration `001_audit_tier1.sql` applied: 3 missing FK indexes, `created_at` added to `site_config` + `site_content`, retention `COMMENT` on `scrape_result`. Schema.ts kept in sync (`0565510`).
- 2 test leads (`lead@test.com`) deleted from prod DB.

**Docs**
- New: [docs/ROADMAP.md](ROADMAP.md) — unified forward-looking roadmap synthesizing Messenger archive + landing/feature sub-roadmaps (`38b2daa`).
- New: [docs/CONTRACTS.md](CONTRACTS.md) — DRAFT policy + clauses for revision limits, downpayment floor, change orders. Needs legal review (`791a039`).
- New: [docs/CUTOVER.md](CUTOVER.md) — VPS monorepo cutover runbook + rollback plan (`ad06a61` + `f3f3180` + `fd12d0b`).
- New: ROADMAP.md at root, audits/, bench/ — codex/linear-design-system planning artifacts archived; PNGs gitignored (`256375f`).
- New: docs/SCHEMA.md migration log section + scrape_result + availability_block table docs.
- New: this file.
- Updated: docs/FEATURES.md (Public Landing section, Operational Docs table, shipped/open status), docs/SETUP.md (post-monorepo paths + cutover warning), README.md (Quick Start + Deployment paths).

**Codex/linear-design-system stash**
- The full landing redesign WIP was visually compared against Prince's deployed version and judged: keep Prince's foundation (distinctive 3D InfrastructureDiagram + tech ticker + team-photo hero), port only copy + product framing + portfolio proof cards + mobile drawer. Original WIP preserved in `stash@{0}` with descriptive label.

### Honest open-items

- **Email-on-new-lead notification.** Resend creds exist in `apps/api/.env`. User explicitly said "not yet" — punted to a later session. Until shipped, you only see leads by logging into admin.
- ~~**8 FKs without explicit ON DELETE.** DB drifted from schema (drizzle-kit push doesn't alter existing FK actions). Each needs per-FK decision (CASCADE / SET NULL / RESTRICT). Tier 2 audit work. Affected: `activity_log`, `client`, `deliverable`, `github_event`, `lead`, `notification`, `scrape_result`, `team_member` — see audit report in session conversation.~~ **✅ Resolved 2026-06-20** in `002_audit_tier2.sql` — see the Tier 2 entry above.
- **`scrape_result` retention script** mentioned in its COMMENT (`scripts/scrape-result-retention.ts`) doesn't exist. Table is fine at 4.7 MB today; only matters when scrape volume grows.
- **19 of 20 tables still have no `COMMENT ON TABLE`.** Tier 2 hygiene work.
- **Test coverage gaps** (see [ROADMAP.md → Open test-coverage gaps](ROADMAP.md#open-test-coverage-gaps)) — 4 untested behaviors shipped this session including the new `/api/settings/public` endpoint. The existing api-wiring test treats `/api/settings` as auth-required and wasn't updated for the public variant.
- **Capacity view in AdminAvailability** requires extending `GET /api/projects` (or new `GET /api/team/:id/projects`) to include team assignments. Audit done, no code yet.
- **Reduced-motion guards** are partial — Hero + FloatingNav have them, ContactCTA / TechTicker / InfrastructureDiagram don't.
- **TypeScript strictness mismatch:** `apps/api` is `strict: true`, `apps/web` has `noImplicitAny: false` + `strictNullChecks: false`. Probably accidental drift; tightening web would surface real null-safety bugs.
- **README has stale `advo-api/` path references** in code blocks not yet audited.
- **docs/SCHEMA.md still doesn't document `social_post` table indexes** and isn't a complete reference — drift accumulates.
- **Felici Round 1 revisions** still active per Messenger archive — apply new CONTRACTS.md revision-limit policy before any Round 2.
- **Coffee Rush proposal not yet sent** — first chance to apply the new downpayment floor + revision-allowance clauses.
- **Legal advisor not engaged.** All CONTRACTS.md clauses are DRAFT until reviewed by a Philippine corporate/cyber lawyer.

### Quick references next session needs

- VPS SSH alias: `advo` → `root@62.146.237.12` (in `~/.ssh/config`)
- Live URLs: `https://advo.ph` (frontend), `https://api.advo.ph` (API), `https://api.advo.ph/api/health` (health check)
- Prod DB: `ssh advo "sudo -u postgres psql advo"`
- Deploy: `./deploy.sh` (host `advo`; `--api-only` / `--frontend-only`). API cwd `/opt/advo/apps/api`, web `/var/www/advo/dist`.
- PM2: `ssh advo "pm2 list"` — process name `advo-api`, port 6407
- Codex WIP recall: `git stash show -p stash@{0} -- <path>` (do not pop; the stash is the archive)
