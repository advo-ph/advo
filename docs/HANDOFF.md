# ADVO Session Handoff

Reverse-chronological log of substantive work sessions. One entry per session or coherent batch. Newest at top. Each entry ends with **Honest open-items** — things that did NOT ship — so the next session knows what's left.

Cross-links:
- Forward-looking work → [ROADMAP.md](ROADMAP.md)
- Current product surface → [FEATURES.md](FEATURES.md)
- VPS deploy state → [CUTOVER.md](CUTOVER.md)
- Schema reference → [SCHEMA.md](SCHEMA.md)
- Contracts/policy → [CONTRACTS.md](CONTRACTS.md)

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
- Frontend deploy: `ssh advo 'cd /opt/advo && git pull && npm install && npm run build:web && rsync -a --delete apps/web/dist/ /var/www/advo/dist/'`
- API deploy: `cd apps/api && ./deploy.sh root@advo`  *(API code already at `/opt/advo/apps/api` — that script may need a path update)*
- PM2: `ssh advo "pm2 list"` — process name `advo-api`, port 6107
- Codex WIP recall: `git stash show -p stash@{0} -- <path>` (do not pop; the stash is the archive)
