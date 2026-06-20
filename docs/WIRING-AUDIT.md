# ADVO Feature Wiring Audit — 2026-06-20

Full end-to-end audit of every admin and client-facing feature: UI control → frontend API client → backend route → DB table. Method: 5 parallel sub-audits (Operations admin, Content/Pipeline/Settings admin, Tools/scrapers, Client portal + public, and a definitive frontend↔backend cross-reference). Every claim below was traced to source; the security findings were re-verified by hand.

Cross-links: [ROADMAP.md](ROADMAP.md) (forward work) · [SCHEMA.md](SCHEMA.md) (DB) · [HANDOFF.md](HANDOFF.md) (session log).

---

## Executive summary

**The headline is good:** frontend↔backend wiring is clean. Of 63 backend endpoints, **every frontend call resolves to a real route** — 0 broken, 0 shadowed (the three routers mounted at `/api/scrape` define distinct paths), correct HTTP methods, correct auth guards, and no camelCase/snake_case field-drop bugs on any wired path. The core CRUD across projects, clients, team, availability, finance, leads, content, portfolio, social, and notifications is solid end-to-end.

**What's left is a specific, enumerable list in four buckets:**

| Bucket | Count | Severity |
|---|---|---|
| 🔴 Security — cross-tenant data exposure | 4 | ✅ S1–S4 all fixed + deployed (S1–S3 `0e42f13`; S4 `9574820`, 2026-06-20) |
| 🔴 Genuinely broken in the admin UI | 3 | ✅ all fixed 2026-06-20 (B1 Deliverables CRUD · B2 health badge · B3 no-op button) |
| 🟡 Looks done but isn't (write-only / stub / mock) | 8 | medium |
| 🟡 Correctness edges | 4 | medium-low |
| ⚪ Dead backend code (orphaned endpoints) | ~14 | cleanup |

---

## 🔴 Security — fix first (verified)

> **Update 2026-06-20 — S1, S2, S3 FIXED + DEPLOYED** (`0e42f13`, live on `api.advo.ph`). Each now role-scopes like `invoices.routes.ts`; a regression test ("cross-tenant data scoping" in `api-wiring.test.ts`) + a `client@advo.ph` seed fixture were added and proven to fail against the old code. **S4 (browser-exposed tokens) is still open.**

These were cross-tenant data-exposure bugs on a multi-client platform. The correct pattern (now applied) is the role-branch + `where(eq(client.userId, user.userId))` filter in [invoices.routes.ts:36-42](../apps/api/src/routes/invoices.routes.ts#L36-L42).

### S1 — 🔴 `GET /api/deliverables` leaks every client's deliverables
[deliverables.routes.ts:19-35](../apps/api/src/routes/deliverables.routes.ts#L19-L35). The list handler has **no role branch and no `WHERE`** — it selects all `deliverable` rows joined to `project`/`team_member`. Guarded only by `deliverables.use("*", requireAuth)` (line 15), which any `client` passes. The client Hub calls this directly ([useClientData.ts:146](../apps/web/src/hooks/useClientData.ts#L146)) and filters by `projectId` **client-side** — so the full deliverable list (titles, due dates, statuses, project linkage) for all clients is delivered to the browser.
**Fix:** branch on role like invoices; for `client`, join `project → client` and `where(eq(client.userId, user.userId))`; for `team`, restrict via `project_access`. The sibling `GET /api/deliverables/upcoming` (line 39) has the same gap (not called by the portal, but fix both).

### S2 — 🔴 `GET /api/projects/:id` IDOR — any client reads any project
[projects.routes.ts:93-138](../apps/api/src/routes/projects.routes.ts#L93-L138). The list handler (`GET /`) is correctly role-scoped (admin/client/team branches), but the single-project handler fetches by `id` with **no ownership check**, returning the project (incl. `totalValueCents`/`amountPaidCents` financials), `progress_update`, `project_asset`, and `project_access`/`team_member`. A client iterating `/api/projects/1,2,3…` reads every other client's project.
**Fix:** after loading the row, if `user.role === "client"` confirm a `client` row exists with `clientId = row.project.clientId AND userId = user.userId`, else 404. For `team`, verify a `project_access` row. The sub-routes `GET /:id/updates`, `/:id/github`, `/:id/assets` ([projects.routes.ts:238,251,267](../apps/api/src/routes/projects.routes.ts#L238)) share the same latent IDOR — apply the same guard.

### S3 — 🟡 `PATCH /api/notifications/:id/read` — no ownership check
[notifications.routes.ts:150](../apps/api/src/routes/notifications.routes.ts#L150). `requireAuth`-only; a client can mark any notification (incl. other clients') read by guessing IDs. Low impact (tampering, no content read), trivially fixed by scoping the `WHERE` to the caller's `clientId`.

### S4 — ✅ FIXED + DEPLOYED (2026-06-20, `9574820`) — Client-side API tokens inlined into the public bundle
[lib/github.ts](../apps/web/src/lib/github.ts) and [lib/cloudflare.ts](../apps/web/src/lib/cloudflare.ts) used to read `VITE_GITHUB_TOKEN` / `VITE_CLOUDFLARE_TOKEN`, which Vite inlines into the public client bundle. **Fixed:** both now route commits + branches through the backend (server-side token, `github_event` cache); the direct api.github.com / api.cloudflare.com calls and token reads are gone, and enrichment with no backend endpoint degrades to null/[]/0. The tokens were never set in prod, so this removed the footgun, not an active leak — the live bundle (`index-Mnygn4dS.js`) has 0 token literals.

---

## 🔴 Genuinely broken in the admin UI

### B1 — ✅ FIXED (2026-06-20) — Deliverables (AdminSchedule) was entirely read-only

> Shipped full CRUD: `useAdminDeliverables` now has create/update/delete + an optimistic inline status mutation; `AdminSchedule.tsx` has an Add/Edit dialog (project, title, description, assignee, status, priority, due date), per-card inline status quick-change, and delete. Verified end-to-end in a browser (create → inline status → edit → delete, each persisted to the API). Backend was already ready. Original finding below for history.

#### (original) Deliverables (AdminSchedule) is entirely read-only
[AdminSchedule.tsx](../apps/web/src/components/admin/AdminSchedule.tsx) renders deliverables + a member filter but has **zero** create/edit/assign/status/delete controls; [useAdminDeliverables.ts](../apps/web/src/hooks/useAdminDeliverables.ts) exposes only a `get` query. Meanwhile [deliverables.routes.ts:73,88,110](../apps/api/src/routes/deliverables.routes.ts#L73) fully implements `POST`/`PATCH`/`DELETE` (requireTeam). **An admin cannot create, assign, re-prioritize, change status of, or delete any deliverable from the panel** — the only way deliverables enter the system is direct DB/API. This is the single biggest functional gap and the backbone of "project management."
**Fix:** add an "Add deliverable" dialog + per-card status `<Select>`/assignee picker/delete; extend the hook with create/update/delete mutations posting camelCase `{ projectId, title, assignedTo, priority, status, dueDate }`. Backend is ready.

### B2 — ✅ FIXED (2026-06-20) — API health badge always showed "Disconnected"

> `checkConnection` ([db.ts](../apps/web/src/lib/db.ts)) now reads the raw `db` field from `/api/health` (which is intentionally un-enveloped, the shape monitors expect) instead of `res.data?.db`. Verified: Settings → Integrations shows **Connected**. Endpoint shape unchanged, so the health tests + any external monitors are unaffected. Original below.

#### (original) API health badge always shows "Disconnected"
[health.routes.ts:6-14](../apps/api/src/routes/health.routes.ts#L6-L14) returns the raw `{ status, db, uptime, timestamp }` — the only route **not** wrapped in the `{ data, error }` envelope. So [api.ts](../apps/web/src/lib/api.ts) returns it as-is, `res.data` is `undefined`, and [db.ts:342-348](../apps/web/src/lib/db.ts#L342) `checkConnection()` reads `res.data?.db` → `false`. The Settings → Integrations card shows a red "Disconnected" badge even when the API is healthy.
**Fix:** wrap the health response in the envelope (`return c.json({ data: { status, db, ... }, error: null })`).

### B3 — ✅ FIXED (2026-06-20) — Dashboard "Quick action" button was a no-op
Removed the dead button (it sat next to the working "New Project" link with no handler). `AdminDashboard.tsx`. Also wired the leads "View all" CTA — see W6.

---

## 🟡 Looks done, but isn't (write-only / stub / mock)

| # | Feature | Where | Problem |
|---|---|---|---|
| W1 | Settings → branding (agency name, domain, accent, logo) | AdminSettings.tsx:118-123 | Saves via `PATCH /api/settings/:key` but is **never read back** — resets to `DEFAULT_CONFIG` on mount, and no consumer reads those keys. Add a `fetchSiteConfig()` that GETs + hydrates. |
| W2 | Settings → "Add Admin" | AdminSettings.tsx:201-236 | Creates a `team_member` (directory row), **not** a `user` with `role:admin`. Does not grant login/admin access. Either add real user-provisioning or relabel. |
| W3 | Notification auto-rule toggles | AdminNotifications.tsx:72-75 | Persist into `site_content.client_dashboard` but **no backend reads them** before sending auto-notifications. Inert. Wire into the notification trigger or label as not-yet-active. |
| W4 | Dashboard "Recent activity" | db.ts:153-168 | `getRecentProgressUpdates` fetches then returns `[]`. Feed is leads-only; progress updates never appear. |
| W5 | Social platform stats | AdminSocial.tsx:180-184 | Hardcoded fake follower/post counts. Cosmetic; reads as live data. |
| W6 | Dashboard "View all" leads anchor | AdminDashboard.tsx | ✅ **FIXED 2026-06-20** — `FeedCard` CTA is now a button calling `onNavigate("leads")` (threaded from `Admin.tsx` `setActiveSection`); replaced the dead `href="#leads"`. Verified: click switches to the Leads tab. |
| W7 | Scraper history delete + bloat | AdminBrandScraper / AdminFacebookScraper | `DELETE /api/scrape/history/:id` exists but has **no UI**. Brand scrapes also store full base64 screenshots in `jsonb` with **no size cap** ([scrape.routes.ts:2114](../apps/api/src/routes/scrape.routes.ts#L2114)) → unbounded `scrape_result` bloat. Add delete UI + payload limit (the FB path already stores `/uploads/...` paths instead). |
| W8 | `/api/settings/public` has no test | — | The landing footer's only dynamic dependency. A regression re-ordering the route behind the auth middleware would 401 the footer silently. Add an anonymous-GET test. |

---

## 🟡 Correctness edges

| # | Feature | Where | Problem |
|---|---|---|---|
| R1 | Invoice status change away from "paid" | invoices.routes.ts | ✅ **FIXED 2026-06-20** — PATCH now clears `paidAt` when status changes to anything other than `paid`. Verified via API: paid→sets timestamp, overdue→clears it. |
| R2 | AdminProjects "Add Asset" | AdminProjects.tsx:533-583 | Asset-type `<Select>` is uncontrolled; handler reads `typeEl.textContent`; URL/caption read via `getElementById`. Works today but fragile. Make controlled with `useState`. |
| R3 | AdminTeam drag-reorder | AdminTeam.tsx:51-80 | Operates on the **filtered** (visible) list, so reordering while inactive members are hidden writes a `team_order` omitting them → scrambles their positions. Compute order against the full member list, or disable drag while filtered. |
| R4 | AdminTeam order read | useAdminTeam.ts:63 | Reads order from `GET /api/settings/team_order` (admin-only). For a `team`-role user this 403s (tolerated, but inconsistent). Point at `GET /api/settings/public` which already allowlists `team_order`. |
| R5 | Broadcast notification TOCTOU | notifications.routes.ts | ✅ **FIXED 2026-06-20** — each per-client insert is wrapped in try/catch, so a client deleted mid-broadcast is skipped instead of 500ing the whole call (email send also made non-fatal). `fileParallelism: false` in `vitest.config.ts` remains as the test-isolation fix. |

---

## ⚪ Dead backend code (orphaned endpoints — cleanup)

~14 of 63 endpoints have no frontend caller. Notable:

- **The entire backend GitHub cache is orphaned.** The frontend ([lib/github.ts](../apps/web/src/lib/github.ts)) calls `api.github.com` directly with a browser token (S4), so `GET /api/github/repos`, `/repos/:name/commits`, `/repos/:name/branches` are dead, and `POST /api/github/webhook` writes `github_event` rows nothing then reads. Reviving this (route the feed through the API) fixes S4 and uses data you already store.
- **`brand-analysis.routes.ts` is fully dead** — `POST /api/scrape/analyze-brand` + `/quick-analytics` have no caller (the FB scraper computes analytics client-side).
- Other orphans: `POST /api/scrape/facebook` (legacy), `/facebook-full`, `GET /facebook-session`, `GET /api/team/:id`, `GET /api/projects/:id/{updates,github,assets}` (data comes nested in `GET /:id`), `DELETE /api/files/:bucket/:filename` (uploads happen, deletes don't).
- Minor guard inconsistency: `GET /api/github/repos/:name/commits` is `requireAuth`-only (siblings are `requireTeam`) — low impact while orphaned, but tighten if revived.

---

## Feature inventory (status matrix)

Legend: ✅ wired end-to-end · ⚠️ partial/risk · 🔴 broken/missing.

### Operations admin
| Component | Actions | Status |
|---|---|---|
| AdminProjects | list ✅ · create ✅ · edit ✅ · delete ✅ · progress update ✅ · add asset ⚠️ (R2) | mostly ✅ |
| AdminClients | list ✅ · create ✅ · edit ✅ · delete ✅ · invite ✅ · project-count badge ✅ | ✅ clean |
| AdminTeam | list ⚠️ (R4) · create ✅ · edit ✅ · reorder ⚠️ (R3) · avatar upload ✅ · toggle active ✅ | ⚠️ |
| AdminSchedule (Deliverables) | list ✅ · filter ✅ · create ✅ · edit ✅ · assign ✅ · inline status ✅ · delete ✅ (B1 fixed) | ✅ full CRUD |
| AdminAvailability | list ✅ · create ✅ · edit ✅ · delete ✅ · find-free-time ✅ | ✅ clean |
| AdminFinance | list ✅ · create ✅ · status change ⚠️ (R1) · delete ✅ | mostly ✅ |

### Content / Pipeline / Settings / Dashboard admin
| Component | Actions | Status |
|---|---|---|
| AdminDashboard | KPIs/feeds render ✅ · quick-action 🔴 (B3) · recent-activity stub 🟡 (W4) · view-all anchor 🟡 (W6) | ⚠️ |
| AdminContentStudio | load ✅ · toggle public/hub ✅ · edit/save section ✅ | ✅ clean |
| AdminPortfolio | list ✅ · create ✅ · update ✅ · delete ✅ · media upload ✅ (served by `content.routes.ts`) | ✅ clean |
| AdminSocial | list/CRUD ✅ · platform stats 🟡 (W5, mock) | ✅ (stats cosmetic) |
| AdminNotifications | list ✅ · send ✅ · broadcast ✅ · auto-rule toggles 🟡 (W3, inert) | ⚠️ |
| AdminLeads | list ✅ · status/notes/assign ✅ · bulk ✅ · convert ✅ · delete ✅ | ✅ clean |
| AdminSettings | branding 🟡 (W1) · social links ✅ · change password ✅ · add admin 🟡 (W2) · remove admin ✅ · API status 🔴 (B2) | ⚠️ |

### Tools admin
| Component | Actions | Status |
|---|---|---|
| AdminBrandScraper | basic ✅ · full ✅ · compare ✅ · save ⚠️ (W7 bloat) · history list/load ✅ · delete 🟡 (no UI) | ⚠️ |
| AdminFacebookScraper | live stream ✅ · stop ✅ · history list/load ✅ · export ✅ · delete 🟡 (no UI) | ✅ (delete missing) |

### Client portal + public
| Surface | Actions | Status |
|---|---|---|
| Hub | projects ✅ (scoped) · project detail ✅ (S2 fixed) · invoices ✅ (scoped) · deliverables ✅ (S1 fixed) · notifications ✅ (scoped) · mark-read ✅ (S3 fixed) · sign out ✅ · eng feed / cloudflare 🟡 (S4 token open) | ⚠️ S4 only |
| ProjectDetail (public case study) | load by slug ✅ | ✅ |
| Start (lead form) | submit ✅ (public, rate-limited) | ✅ |
| Team (public) | list ✅ (optionalAuth) | ✅ |
| Login | password ✅ · magic link ✅ · session restore ✅ | ✅ |
| Index (landing) | section visibility ✅ | ✅ |

---

## New systems & feature recommendations

### Requested
- **Leads management** — ✅ **already built and fully wired** (list, status, notes, assign, bulk, convert-to-client, delete). The leverage is now the layer on top: lead → proposal → contract.
- **Customer management (CRM)** — the two halves exist but are disconnected: the leads pipeline + the `client` table/AdminClients. A real CRM unifies them into one **contact lifecycle** (lead → client → recurring) with an **interaction timeline**. The `activity_log` table already exists but is surfaced nowhere — the data model is half-built.
- **AI prompt management** (clarified intent) — a place to **author, version, and test the AI prompts** the platform uses: brand analysis, FB voice analysis, and the future proposal generator (the platform already uses Vertex AI in the scraper routes). Store prompts as versioned rows, let team edit/test them against sample inputs, and have the scraper + proposal services read the active version instead of hardcoded strings. Pairs directly with the proposal pipeline below.

### Other high-leverage features (grounded in repo + ROADMAP)
1. **Lead → Proposal → Contract pipeline** — CONTRACTS.md clauses are drafted; the P0 revenue item; turns the 5K scraped leads into sendable proposals.
2. **Email notifications** — the deferred new-lead alert, *and* wiring the inert auto-rule toggles (W3).
3. **Capacity / workload view** — Prince's explicit ask; the `project_access` data exists.
4. **Payment on invoices** — cents are tracked but there's no pay link; PayMongo/Xendit for PH.
5. **Route the engineering feed through the backend cache** — kills the S4 token exposure and uses the `github_event` table already being populated.

---

## Prioritized action plan

- **Tier 1 — security:** ✅ S1, S2, S3 done + deployed (`0e42f13`). ✅ S4 done + deployed (`9574820`) — GitHub/Cloudflare token reads removed from the browser; commits/branches route through the backend `github_event` cache.
- **Tier 2 — broken features:** ✅ all done — B1 (Deliverables CRUD UI), B2 (health badge), B3 (no-op button).
- **Tier 3 — finish the half-built:** ✅ R1 (invoice paid_at), W6 (leads CTA), R5 (broadcast TOCTOU) done. ⏳ remaining: W1, W2, W3, W4, W5, W7 + the W8 test; R2, R3, R4 correctness edges.
- **Tier 4 — cleanup + build:** prune/wire the orphaned GitHub + brand-analysis routes; then start a new system (CRM / proposal pipeline / AI prompt management).

## Test-coverage gaps
`/api/settings/public` untested (W8); no `/api/scrape/*` tests; method-specific gaps in `api-wiring.test.ts` (`PATCH /api/leads/bulk`, `POST /api/leads/:id/convert`, `POST /api/team/reorder`, `POST /api/notifications/broadcast`, availability routes). ✅ The S1/S2/S3 data-scoping bugs now have a regression test (the "cross-tenant data scoping" block in `api-wiring.test.ts`, backed by the `client@advo.ph` seed fixture).
