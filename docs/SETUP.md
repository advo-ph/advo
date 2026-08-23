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

The repo is an npm-workspaces monorepo (`apps/web` + `apps/api`). One install, one dev command.

```bash
cd /path/to/Antigravity/advo
cp apps/api/.env.example apps/api/.env   # Edit with your local DB credentials
npm install                              # Installs both workspaces
npm --workspace apps/api run db:push     # Create tables in PostgreSQL
npm --workspace apps/api run db:seed     # Seed default data
npm run dev                              # npx concurrently: web :6447 + api :6407
```

Open http://localhost:6447

Default admin login: `admin@advo.ph` / `changeme`

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
CLOUDFLARE_TOKEN=...                      # Deployment status
CLOUDFLARE_ACCOUNT_ID=...

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
npm run db:push               # Push schema to database
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

# Override host if needed:
VPS_SSH=advo ./deploy.sh
```

The script rsyncs the monorepo (does not clobber `apps/api/.env` or `apps/web/.env.production`), restarts PM2 `advo-api` from `/opt/advo/apps/api`, builds web locally with `VITE_API_URL=https://api.advo.ph`, and rsyncs `apps/web/dist/` → `/var/www/advo/dist/`.

`apps/api/deploy.sh` forwards to `./deploy.sh --api-only`. Do not use the legacy `advo-api` repo script except for rollback.

API runs under PM2 as `advo-api` (port 6407). Logs: `/var/log/advo-api/{out,error}.log`.

Nginx serves `/var/www/advo/dist` with SPA fallback (`try_files $uri $uri/ /index.html`). `apps/web/.env.production` stays on the box (gitignored) as a fallback for any on-VPS build.

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
dropdb advo && createdb advo
npm --workspace apps/api run db:push && npm --workspace apps/api run db:seed
```
