# Development & Deployment Setup

## Architecture

```
Frontend (React/Vite)  →  ADVO API (Hono/Node)  →  PostgreSQL
     port 6447                port 6407              port 5432
     (static /var/www       (PM2 fork, localhost)
      /advo/dist via nginx)
```

Ports: advo range `6400–6499` (sisia-app owns `6100–6199`). API is `6407`. Vite dev is `6447` and proxies `/api` → `:6407`.

All three tiers run on the same Contabo VPS in Singapore — host `advo` (`62.146.237.12`).

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 15+ (local: `brew services start postgresql@15`)
- **Chromium** (for the brand scraper's full-mode endpoint and FB scraper) — macOS: bundled in Puppeteer; Linux/VPS: `apt-get install chromium-browser`. The API auto-detects `/usr/bin/chromium-browser`, `/usr/bin/chromium`, `/usr/bin/google-chrome`, or the macOS `Google Chrome.app`.

## Local Development

The repo is an npm-workspaces monorepo (`apps/web` + `apps/api`). One install, one database
command, one dev command.

```bash
cd /path/to/advo
cp apps/api/.env.example apps/api/.env   # Set DATABASE_URL to the database db:local creates (below)
npm install                              # Installs both workspaces
npm run db:local                         # Creates `advo`, db:push, applies every migration, prints the drift verdict
npm --workspace apps/api run db:seed     # Seed default data
npm run dev                              # npx concurrently: web :6447 + api :6407
```

Open http://localhost:6447

Default admin login: `admin@advo.ph` / `changeme`

### `npm run db:local` — what it does and why it exists

`scripts/db-local.mjs` replaces the old "run `db:push`, then apply the migrations by hand"
instruction, which is the sequence that produced migration 025's defect: `db:push` creates every
table WITHOUT its CHECK constraints, the migrations' `CREATE TABLE IF NOT EXISTS` then no-op, and
nothing says so. The script does the whole sequence in the order that ends clean, then runs
`scripts/migration-drift.mjs` against the result and prints its verdict — so the last line is a
fact, not a hope:

1. creates the database if it does not exist (default `advo`, `--name <db>` for another)
2. runs `db:push` — only on a database that has never been migrated; once the ledger has rows the
   schema moves by migration only
3. applies every `apps/api/migrations/*.sql` not yet in the `schema_migration` ledger, in filename
   order, and records each
4. adds any CHECK constraint a migration declared inside a `CREATE TABLE IF NOT EXISTS` body that
   `db:push` pre-empted, naming the migration that needs rewriting in 025's `ALTER TABLE` form
5. runs `migration:drift` and exits with its verdict (`0` clean, `1` drift, `2` could not run)

It connects as a Postgres superuser at `postgresql://postgres@127.0.0.1:5432` by default;
override with `--base postgresql://user:pass@host:port`. Re-running it is safe — it applies only
what is missing and touches no other database.

**Windows.** The installer does not put `psql` on PATH. The script looks on PATH first, then at
`C:\Program Files\PostgreSQL\<major>\bin\psql.exe` (newest major first), so nothing needs to be
added to PATH. To call psql yourself: `"C:\Program Files\PostgreSQL\18\bin\psql" postgresql://postgres@127.0.0.1:5432/advo`.
A default Windows install uses trust auth for local connections, so no password is needed. On
macOS the equivalent superuser is usually your own login user (`--base postgresql://$USER@127.0.0.1:5432`).

**Throwaway databases.** `npm run db:local -- --name advo_scratch` bootstraps a second database
without touching `advo`; drop it afterwards with `psql -c 'DROP DATABASE advo_scratch' postgresql://postgres@127.0.0.1:5432/postgres`.

### 3. Run the test suite

```bash
cd /path/to/Antigravity/advo
npm run test:local            # boots the API automatically, runs 68 tests, cleans up
```

If you already have the API running on `:6407`, the script reuses it. Pass extra args to target a single file: `npm run test:local src/test/e2e-flow`.

## Environment Variables

### Frontend (`advo/.env`)

```env
VITE_API_URL=http://localhost:6407        # Local
# VITE_API_URL=https://api.advo.ph       # Production
# (S4, 9574820) VITE_GITHUB_TOKEN / VITE_CLOUDFLARE_TOKEN removed — the GitHub
# feed routes through the backend now; no API tokens in the browser bundle.
# Do not reintroduce either: Vite inlines VITE_* into the public bundle.
# VITE_API_PROXY_TARGET=http://127.0.0.1:6407  # which API `npm run dev:web` proxies /api to
```

### API (`apps/api/.env`)

```env
# Required
DATABASE_URL=postgresql://user@localhost:5432/advo
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>

# Optional
RESEND_API_KEY=re_...                     # Email via Resend (lead notifications + invites)
ANTHROPIC_API_KEY=sk-ant-...              # AI contract review (Claude); falls back to heuristic if unset
GITHUB_TOKEN=ghp_...                      # GitHub API (server-side)
GITHUB_WEBHOOK_SECRET=...                 # GitHub webhook verification
GITHUB_ORG=advo-ph
PRAUD_IMPORT_SECRET=...                   # praud passcode `advo` → POST /api/meeting/import/praud
ADVO_INBOX_PROJECT_ID=                    # optional; else auto Inbox project
# PLAUD_TOKEN=                            # file-id import + GET /api/meeting/plaud (share URL works without)
# PLAUD_POLL_SECOND=60                    # ADVO-folder probe interval; 0 disables

# Preview hosting for "Show Client Now". Unset = manual: the team pastes
# preview_url onto the project. `cloudflare` deploys the built artifact to Pages
# (token needs "Cloudflare Pages: Edit"); `herenow` has no issuable key today and
# falls back to manual rather than failing the endpoint.
# PREVIEW_HOST_PROVIDER=manual
# CLOUDFLARE_ACCOUNT_ID=...
# CLOUDFLARE_API_TOKEN=...
# CLOUDFLARE_PAGES_PROJECT=...
# HERENOW_API_KEY=

# Outreach transport — deliberately separate from the transactional mailer above,
# which carries client magic-links. Campaign sending is REFUSED when these are
# unset and never falls back to the transactional transport. Setting them is not
# clearance to send: run `npm run outreach:preflight` first.
# OUTREACH_SMTP_HOST=... / OUTREACH_SMTP_PORT=587 / OUTREACH_SMTP_USER=...
# OUTREACH_SMTP_PASS=... / OUTREACH_FROM=ADVO <hello@outreach.advo.ph>
# OUTREACH_DKIM_SELECTOR=...                # no safe default; the ESP issues it

# Server (advo = 6400–6499; API ends in 07)
PORT=6407
NODE_ENV=development
UPLOAD_DIR=./uploads
API_URL=http://localhost:6407
FRONTEND_URL=http://localhost:6447        # Vite dev (proxies /api → :6407)
```

## Database

Schema is defined in `apps/api/src/db/schema.ts` using Drizzle ORM.

```bash
npm run db:local              # Create + push + migrate + drift verdict, in one command (see Local Development)
npm run db:push               # Push schema to database — a fresh database only; db:local does this for you
npm run db:seed               # Seed defaults (admin user, site content, config)
npm run db:studio             # Open Drizzle Studio (DB browser)
npm run db:generate           # Generate migration files
npm run migration:drift       # Which migrations has this database NOT seen?
```

Raw SQL migrations in `apps/api/migrations/` are applied by hand. `migration:drift` compares
that directory against the `schema_migration` ledger in the target database and exits non-zero
when any migration is unapplied — including one skipped in the *middle* of the sequence, which
is how prod ended up serving `/api/expense` against a table that was never created. A database
that predates the ledger needs `019_schema_ledger.sql` applied first; its backfill is guarded
per-migration, so it is safe on an existing box. See [SCHEMA.md](SCHEMA.md#migration-log).

> ### `db:push` runs FIRST, and that has a consequence worth understanding
>
> Found 2026-09-02 by applying every migration to a throwaway database and asking Postgres
> what it actually had: **30 of the 34 CHECK constraints the migrations declare did not
> exist**, on every database bootstrapped this way — and the drift ledger was clean the
> whole time.
>
> The mechanism: `db:push` creates every table from `schema.ts`, and Drizzle cannot express
> a CHECK constraint. The migrations then run `CREATE TABLE IF NOT EXISTS <same table>`,
> which is a **no-op** — silently skipping every constraint declared inside it. Nothing
> errored; the ledger recorded each migration as applied, correctly, because it *was*.
>
> `025_enforce_check_constraint.sql` adds all of them idempotently via guarded
> `ALTER TABLE`, which works whether the table came from push or from a migration. **Apply
> it on any existing database**, including prod.
>
> `migration:drift` now checks this too — it compares the constraints the tree *declares*
> against the ones the database *has*, and reports `SHAPE DRIFT` when they disagree.
> Comparing filenames could never see this, because every filename was already right.
>
> **If `025` fails, that is the point.** Adding a CHECK to a table holding rows that
> violate it aborts the transaction, which means real data has been sitting outside a rule
> the code believed was enforced. Fix the rows; do not reach for `NOT VALID`.

### Tables

| Table | Purpose |
|-------|---------|
| `user` | Auth accounts (email, password_hash, role) |
| `session` | Refresh tokens (DB-backed, one-time use) |
| `client` | Client/company records |
| `project` | Projects linked to clients |
| `progress_update` | Project updates/milestones |
| `team_member` | Team profiles, roles, avatars |
| `project_access` | RBAC: team member ↔ project |
| `deliverable` | Tasks with status tracking |
| `invoice` | Billing records |
| `lead` | Sales pipeline |
| `notification` | In-app + email notifications |
| `project_asset` | Uploaded files (photos, docs) |
| `site_content` | CMS sections (hero, services, etc.) |
| `portfolio_project` | Public portfolio items |
| `social_post` | Social media content |
| `site_config` | Key-value settings |
| `github_event` | Cached webhook events |
| `activity_log` | Audit trail |
| `scrape_result` | Saved brand/FB scrape results |

## Production Deployment

Host: `advo` (SSH alias). Remote monorepo: `/opt/advo`. PM2: `advo-api` from `/opt/advo/apps/api`. Frontend static: `/var/www/advo/dist`.

Add to `~/.ssh/config`:

```
Host advo
  HostName 62.146.237.12
  User root
  IdentityFile ~/.ssh/id_ed25519_advo
  IdentitiesOnly yes
```

Monorepo cutover is done (see [CUTOVER.md](./CUTOVER.md)). Live API cwd is `/opt/advo/apps/api`. `/opt/advo-api` is a rollback artifact only.

```bash
# Full (API + frontend) — default host is the `advo` alias:
./deploy.sh

./deploy.sh --api-only
./deploy.sh --frontend-only

# Override host / branch if needed:
VPS_SSH=advo ./deploy.sh
DEPLOY_BRANCH=main ./deploy.sh
```

**The deploy ships `origin/<branch>` (default `main`), not your working tree.** `/opt/advo` is a checkout of the same origin, so the API deploy is `git fetch` + `git reset --hard origin/main` on the box, then `npm install --workspace apps/api` and `pm2 restart advo-api --update-env`. Commit and push before deploying — the script refuses to run when `HEAD` is not `origin/<branch>` (override with `DEPLOY_ANY_HEAD=1`) and warns when the tree is dirty.

The web half builds locally with `VITE_API_URL=https://api.advo.ph`, is verified to reference `api.advo.ph`, ships over SSH into `/var/www/advo/dist.new-<stamp>`, is verified again on the box, and is then swapped into place — the replaced tree is kept as `dist.prev-<stamp>`.

Two ordering guarantees, both from the 2026-08-19 outage (see [HANDOFF.md](HANDOFF.md)):

- **There is no `pm2 stop`.** `pm2 restart` is the only lifecycle call and it runs only after the new code is on disk, so a transport failure can no longer leave the API stopped.
- **The live web tree is swapped, never written in place**, so a partial upload is never what nginx serves.

`apps/api/.env` and `apps/web/.env.production` are untracked on the box, so `git reset --hard` leaves them alone; both are copied to `/var/tmp/advo-backup/` before the reset regardless, along with a tarball of `/opt/advo`. Rollback commands are printed if the post-deploy health check is not 200.

`apps/api/deploy.sh` forwards to `./deploy.sh --api-only`. Do not use the legacy `advo-api` repo script except for rollback.

API runs under PM2 as `advo-api` (port 6407). Logs: `/var/log/advo-api/{out,error}.log`.

Nginx serves `/var/www/advo/dist` with SPA fallback (`try_files $uri /index.html`). `apps/web/.env.production` stays on the box (gitignored) as a fallback for any on-VPS build.

The `$uri/` term was removed on 2026-09-02: every directory under `public/` ships into `dist/` (`team/` photos, `landing/` icons), and with `$uri/` present nginx answered any route sharing a directory's name with a 301 to a trailing slash, then 403 — `/team` (the Team page route) was forbidden because `dist/team/` is the team-photo folder. Dropping `$uri/` sends directory-named routes to the SPA and leaves real files (`/team/angelo-revelo.jpg`) on the `$uri` hit. A backup of the old config sits at `/var/tmp/advo-frontend.bak-20260902-*`.

### SSL

One cert covers all three hostnames, auto-renewed by certbot:

```bash
ssh advo "certbot certificates"    # view
ssh advo "certbot renew --dry-run" # test renewal
```

Initial issuance (already done): `certbot --nginx -d advo.ph -d www.advo.ph -d api.advo.ph --redirect`

### Database Backup

Automated: `backup.sh` runs nightly at 3am via root crontab, writes to `/var/backups/advo/`, keeps 14 days.

```bash
# Manual backup
ssh advo "sudo -u postgres pg_dump -Fc advo > /var/backups/advo/advo_$(date +%Y%m%d).dump"

# Restore
scp advo:/var/backups/advo/advo_YYYYMMDD.dump ./
sudo -u postgres pg_restore -d advo advo_YYYYMMDD.dump
```

## Infrastructure

| Service | URL / Location |
|---------|---------------|
| **Frontend (prod)** | [advo.ph](https://advo.ph) + [www.advo.ph](https://www.advo.ph) (VPS nginx) |
| **API (prod)** | [api.advo.ph](https://api.advo.ph) (VPS, PM2 port 6407) |
| **VPS** | `advo` (`62.146.237.12`, Contabo Cloud VPS 20 SSD, Singapore 2). |
| **Database** | PostgreSQL on VPS (port 5432) |
| **DNS** | Namecheap |
| **GitHub Org** | [github.com/advo-ph](https://github.com/advo-ph) |
| **Email** | Google Workspace (@advo.ph) + Resend (transactional) |

## Advo Vercel (client preview ops)

Client site previews are host-agnostic in the product (`project.preview_url` → Hub live iframe). When using **Vercel** for a client build, follow this checklist. **Do not store Vercel tokens or deploy secrets in this repo or in the ADVO app env** — Vercel stays in the Vercel dashboard; ADVO only stores the public preview URL.

> This section is an ops runbook. It does **not** claim an Advo Vercel team or account already exists — create one when you need it.

### Ops checklist

1. **Create an Advo Vercel team** (or use an existing org team) under the Advo account you control. Invite only team members who deploy client sites.
2. **Connect the client repo** — Import the client GitHub repo (typically under [github.com/advo-ph](https://github.com/advo-ph)) into that Vercel team. One Vercel project per client site.
3. **Deploy on `main`** — Production branch = `main`. Push/merge to `main` should produce the production deployment URL (Vercel production domain or assigned `*.vercel.app`).
4. **Put `preview_url` on the project** — In Admin → Projects (or project edit), set `preview_url` to that production/preview HTTPS URL. Field maps to `project.preview_url` / column `preview_url`. No secrets; URL only.
5. **Hub iframe consumes it** — Client Hub (`ProjectDashboard`) embeds a sandboxed iframe when `preview_url` is set (`allow-scripts allow-same-origin allow-forms allow-popups`). Client also gets “Open in new tab” and “Request a preview”. Team can mint a short-lived show-client link via `POST /api/projects/:id/preview-link` → public `GET /api/preview/:token` 302 to the same URL.

### Out of scope here

- Vercel API tokens, OAuth, or webhooks in ADVO env
- Auto-sync of deploy status from Vercel into ADVO (not required for iframe)
- Using Vercel for **advo.ph** itself (hub frontend stays on the Contabo VPS)

## API Endpoints

Full endpoint list: see `apps/api/src/routes/*.routes.ts`

Quick reference:
- `GET /api/health` — health check
- `POST /api/auth/login` — login
- `GET /api/projects` — list projects (auth required)
- `GET /api/team` — list team (public)
- `GET /api/content/sections` — CMS sections (public)
- `POST /api/leads` — submit lead (public)
- `POST /api/github/webhook` — GitHub webhook receiver
- `POST /api/scrape/brand` — brand scrape (auth required)
- `POST /api/scrape/facebook` — FB public scrape (auth required)
- `POST /api/scrape/facebook-full` — FB authenticated scrape (auth required, uses blead session)
- `POST /api/scrape/save` — save scrape result
- `GET /api/scrape/history` — list saved scrapes
- `POST /api/auth/change-password` — change password (auth required)
- `POST /api/team/reorder` — reorder team members (admin)
- `PATCH /api/leads/bulk` — bulk update leads (team)
- `POST /api/leads/:id/convert` — convert lead to client (admin)

## Troubleshooting

### Port in use

```bash
lsof -ti :6400 | xargs kill -9    # Frontend
lsof -ti :6407 | xargs kill -9    # API
```

### API not starting

```bash
# Check logs
pm2 logs advo-api --lines 20

# Check env
cat /opt/advo/apps/api/.env

# Check DB connection
psql -U advo -d advo -c "SELECT 1;"
```

### Database reset (dev only)

```bash
dropdb advo
npm run db:local && npm --workspace apps/api run db:seed
```

`db:local` recreates the database, pushes, applies every migration and prints the drift
verdict. On Windows, where `dropdb` is not on PATH:
`"C:\Program Files\PostgreSQL\18\bin\psql" -c "DROP DATABASE advo" postgresql://postgres@127.0.0.1:5432/postgres`.
