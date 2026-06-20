# ADVO Feature Wiring Audit — 2026-06-20

Full end-to-end audit of every admin and client-facing feature: UI control → frontend API client → backend route → DB table. Method: 5 parallel sub-audits (Operations admin, Content/Pipeline/Settings admin, Tools/scrapers, Client portal + public, and a definitive frontend↔backend cross-reference). Every claim below was traced to source; the security findings were re-verified by hand.

Cross-links: [ROADMAP.md](ROADMAP.md) (forward work) · [SCHEMA.md](SCHEMA.md) (DB) · [HANDOFF.md](HANDOFF.md) (session log).

---

## Executive summary

**The headline is good:** frontend↔backend wiring is clean. Of 63 backend endpoints, **every frontend call resolves to a real route** — 0 broken, 0 shadowed (the three routers mounted at `/api/scrape` define distinct paths), correct HTTP methods, correct auth guards, and no camelCase/snake_case field-drop bugs on any wired path. The core CRUD across projects, clients, team, availability, finance, leads, content, portfolio, social, and notifications is solid end-to-end.

**What's left is a specific, enumerable list in four buckets:**

| Bucket | Count | Severity |
|---|---|---|
| 🔴 Security — cross-tenant data exposure (live in prod) | 4 | **fix first** |
| 🔴 Genuinely broken in the admin UI | 3 | high |
| 🟡 Looks done but isn't (write-only / stub / mock) | 8 | medium |
| 🟡 Correctness edges | 4 | medium-low |
| ⚪ Dead backend code (orphaned endpoints) | ~14 | cleanup |

---

## 🔴 Security — fix first (verified)

These are cross-tenant data-exposure bugs on a multi-client platform. The correct, already-existing pattern to copy is the role-branch + `where(eq(client.userId, user.userId))` filter in [invoices.routes.ts:36-42](../apps/api/src/routes/invoices.routes.ts#L36-L42).

### S1 — 🔴 `GET /api/deliverables` leaks every client's deliverables
[deliverables.routes.ts:19-35](../apps/api/src/routes/deliverables.routes.ts#L19-L35). The list handler has **no role branch and no `WHERE`** — it selects all `deliverable` rows joined to `project`/`team_member`. Guarded only by `deliverables.use("*", requireAuth)` (line 15), which any `client` passes. The client Hub calls this directly ([useClientData.ts:146](../apps/web/src/hooks/useClientData.ts#L146)) and filters by `projectId` **client-side** — so the full deliverable list (titles, due dates, statuses, project linkage) for all clients is delivered to the browser.
**Fix:** branch on role like invoices; for `client`, join `project → client` and `where(eq(client.userId, user.userId))`; for `team`, restrict via `project_access`. The sibling `GET /api/deliverables/upcoming` (line 39) has the same gap (not called by the portal, but fix both).

### S2 — 🔴 `GET /api/projects/:id` IDOR — any client reads any project
[projects.routes.ts:93-138](../apps/api/src/routes/projects.routes.ts#L93-L138). The list handler (`GET /`) is correctly role-scoped (admin/client/team branches), but the single-project handler fetches by `id` with **no ownership check**, returning the project (incl. `totalValueCents`/`amountPaidCents` financials), `progress_update`, `project_asset`, and `project_access`/`team_member`. A client iterating `/api/projects/1,2,3…` reads every other client's project.
**Fix:** after loading the row, if `user.role === "client"` confirm a `client` row exists with `clientId = row.project.clientId AND userId = user.userId`, else 404. For `team`, verify a `project_access` row. The sub-routes `GET /:id/updates`, `/:id/github`, `/:id/assets` ([projects.routes.ts:238,251,267](../apps/api/src/routes/projects.routes.ts#L238)) share the same latent IDOR — apply the same guard.

### S3 — 🟡 `PATCH /api/notifications/:id/read` — no ownership check
[notifications.routes.ts:150](../apps/api/src/routes/notifications.routes.ts#L150). `requireAuth`-only; a client can mark any notification (incl. other clients') read by guessing IDs. Low impact (tampering, no content read), trivially fixed by scoping the `WHERE` to the caller's `clientId`.

### S4 — 🟡 Client-side API tokens inlined into the public bundle
[lib/github.ts](../apps/web/src/lib/github.ts) and [lib/cloudflare.ts](../apps/web/src/lib/cloudflare.ts) read `VITE_GITHUB_TOKEN` / `VITE_CLOUDFLARE_TOKEN`, which Vite inlines into the public client bundle. If set in prod, they're exposed to every visitor. The backend already has cached/proxied equivalents (the orphaned `/api/github/*` routes + `github_event` table). **Fix:** route the engineering feed through the backend (see also W-dead below).

---

## 🔴 Genuinely broken in the admin UI

### B1 — 🔴 Deliverables (AdminSchedule) is entirely read-only
[AdminSchedule.tsx](../apps/web/src/components/admin/AdminSchedule.tsx) renders deliverables + a member filter but has **zero** create/edit/assign/status/delete controls; [useAdminDeliverables.ts](../apps/web/src/hooks/useAdminDeliverables.ts) exposes only a `get` query. Meanwhile [deliverables.routes.ts:73,88,110](../apps/api/src/routes/deliverables.routes.ts#L73) fully implements `POST`/`PATCH`/`DELETE` (requireTeam). **An admin cannot create, assign, re-prioritize, change status of, or delete any deliverable from the panel** — the only way deliverables enter the system is direct DB/API. This is the single biggest functional gap and the backbone of "project management."
**Fix:** add an "Add deliverable" dialog + per-card status `<Select>`/assignee picker/delete; extend the hook with create/update/delete mutations posting camelCase `{ projectId, title, assignedTo, priority, status, dueDate }`. Backend is ready.

### B2 — 🔴 API health badge always shows "Disconnected"
[health.routes.ts:6-14](../apps/api/src/routes/health.routes.ts#L6-L14) returns the raw `{ status, db, uptime, timestamp }` — the only route **not** wrapped in the `{ data, error }` envelope. So [api.ts](../apps/web/src/lib/api.ts) returns it as-is, `res.data` is `undefined`, and [db.ts:342-348](../apps/web/src/lib/db.ts#L342) `checkConnection()` reads `res.data?.db` → `false`. The Settings → Integrations card shows a red "Disconnected" badge even when the API is healthy.
**Fix:** wrap the health response in the envelope (`return c.json({ data: { status, db, ... }, error: null })`).

### B3 — 🔴 Dashboard "Quick action" button is a no-op
[AdminDashboard.tsx:124-126](../apps/web/src/components/admin/AdminDashboard.tsx#L124) — a button with no `onClick`. Wire it or remove it.

---

## 🟡 Looks done, but isn't (write-only / stub / mock)

| # | Feature | Where | Problem |
|---|---|---|---|
| W1 | Settings → branding (agency name, domain, accent, logo) | AdminSettings.tsx:118-123 | Saves via `PATCH /api/settings/:key` but is **never read back** — resets to `DEFAULT_CONFIG` on mount, and no consumer reads those keys. Add a `fetchSiteConfig()` that GETs + hydrates. |
| W2 | Settings → "Add Admin" | AdminSettings.tsx:201-236 | Creates a `team_member` (directory row), **not** a `user` with `role:admin`. Does not grant login/admin access. Either add real user-provisioning or relabel. |
| W3 | Notification auto-rule toggles | AdminNotifications.tsx:72-75 | Persist into `site_content.client_dashboard` but **no backend reads them** before sending auto-notifications. Inert. Wire into the notification trigger or label as not-yet-active. |
| W4 | Dashboard "Recent activity" | db.ts:153-168 | `getRecentProgressUpdates` fetches then returns `[]`. Feed is leads-only; progress updates never appear. |
| W5 | Social platform stats | AdminSocial.tsx:180-184 | Hardcoded fake follower/post counts. Cosmetic; reads as live data. |
| W6 | Dashboard "View all" leads anchor | AdminDashboard.tsx:336 | `href="#leads"` but the admin shell uses state-driven tabs, not hash routing. Likely dead. |
| W7 | Scraper history delete + bloat | AdminBrandScraper / AdminFacebookScraper | `DELETE /api/scrape/history/:id` exists but has **no UI**. Brand scrapes also store full base64 screenshots in `jsonb` with **no size cap** ([scrape.routes.ts:2114](../apps/api/src/routes/scrape.routes.ts#L2114)) → unbounded `scrape_result` bloat. Add delete UI + payload limit (the FB path already stores `/uploads/...` paths instead). |
| W8 | `/api/settings/public` has no test | — | The landing footer's only dynamic dependency. A regression re-ordering the route behind the auth middleware would 401 the footer silently. Add an anonymous-GET test. |

---

## 🟡 Correctness edges

| # | Feature | Where | Problem |
|---|---|---|---|
| R1 | Invoice status change away from "paid" | invoices.routes.ts:89 | Sets `paid_at` on "paid" but never clears it on flip back to unpaid/overdue → stale timestamp. Add `if (status && status !== "paid") values.paidAt = null;`. |
| R2 | AdminProjects "Add Asset" | AdminProjects.tsx:533-583 | Asset-type `<Select>` is uncontrolled; handler reads `typeEl.textContent`; URL/caption read via `getElementById`. Works today but fragile. Make controlled with `useState`. |
| R3 | AdminTeam drag-reorder | AdminTeam.tsx:51-80 | Operates on the **filtered** (visible) list, so reordering while inactive members are hidden writes a `team_order` omitting them → scrambles their positions. Compute order against the full member list, or disable drag while filtered. |
| R4 | AdminTeam order read | useAdminTeam.ts:63 | Reads order from `GET /api/settings/team_order` (admin-only). For a `team`-role user this 403s (tolerated, but inconsistent). Point at `GET /api/settings/public` which already allowlists `team_order`. |

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
| AdminSchedule (Deliverables) | list ✅ · filter ✅ · **create/edit/assign/status/delete 🔴 (B1, no UI)** | 🔴 read-only |
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
| Hub | projects ✅ (scoped) · **project detail 🔴 (S2 IDOR)** · invoices ✅ (scoped) · **deliverables 🔴 (S1 leak)** · notifications ✅ (scoped) · mark-read 🟡 (S3) · sign out ✅ · eng feed / cloudflare 🟡 (S4 token) | 🔴 security |
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

- **Tier 1 — security, ship now (~1-2h):** S1, S2, S3 (copy the invoices scoping pattern); S4 plan.
- **Tier 2 — broken features (~half day):** B1 (Deliverables CRUD UI — biggest functional win), B2 (health envelope), B3 (no-op button).
- **Tier 3 — finish the half-built (~1 day):** W1, W2, W3, W7 + the W8 test; R1–R4 correctness edges.
- **Tier 4 — cleanup + build:** prune/wire the orphaned GitHub + brand-analysis routes; then start a new system (CRM / proposal pipeline / AI prompt management).

## Test-coverage gaps
`/api/settings/public` untested (W8); no `/api/scrape/*` tests; method-specific gaps in `api-wiring.test.ts` (`PATCH /api/leads/bulk`, `POST /api/leads/:id/convert`, `POST /api/team/reorder`, `POST /api/notifications/broadcast`, availability routes). The data-scoping bugs S1/S2 have **no test** — when fixed, add a "client cannot read another client's project/deliverable" regression test.
