# Development & Deployment Setup

## Architecture

```
Frontend (React/Vite)  →  ADVO API (Hono/Node)  →  PostgreSQL
     port 6100                port 6107              port 5432
     (static /var/www       (PM2 fork, localhost)
      /advo/dist via nginx)
```

Ports follow the shared-VPS [PORTS.md](../../../Downloads/PORTS.md) scheme: advo gets range `6100–6199` (first slot on the fresh Singapore box). API always ends in `07`.

All three tiers run on the same Contabo VPS in Singapore (`62.146.237.12`, ssh alias `advo`).

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 15+ (local: `brew services start postgresql@15`)

## Local Development

### 1. Start the API

```bash
cd /path/to/Antigravity/advo-api
cp .env.example .env          # Edit with your local DB credentials
npm install
npm run db:push               # Create tables in PostgreSQL
npm run db:seed               # Seed default data
npm run dev                   # Starts on port 6107
```

### 2. Start the Frontend

```bash
cd /path/to/Antigravity/advo
npm install
npm run dev                   # Starts on port 6100
```

Open http://localhost:6100

Default admin login: `admin@advo.ph` / `changeme`

## Environment Variables

### Frontend (`advo/.env`)

```env
VITE_API_URL=http://localhost:6107        # Local
# VITE_API_URL=https://api.advo.ph       # Production

VITE_GITHUB_TOKEN=ghp_...                # Optional: GitHub commit history
```

### API (`advo-api/.env`)

```env
# Required
DATABASE_URL=postgresql://user@localhost:5432/advo
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>

# Optional
RESEND_API_KEY=re_...                     # Email via Resend
GITHUB_TOKEN=ghp_...                      # GitHub API (server-side)
GITHUB_WEBHOOK_SECRET=...                 # GitHub webhook verification
GITHUB_ORG=advo-ph
CLOUDFLARE_TOKEN=...                      # Deployment status
CLOUDFLARE_ACCOUNT_ID=...

# Server (advo = 6100–6499 per PORTS.md; API ends in 07)
PORT=6107
NODE_ENV=development
UPLOAD_DIR=./uploads
API_URL=http://localhost:6107
FRONTEND_URL=http://localhost:6100
```

## Database

Schema is defined in `advo-api/src/db/schema.ts` using Drizzle ORM.

```bash
npm run db:push               # Push schema to database
npm run db:seed               # Seed defaults (admin user, site content, config)
npm run db:studio             # Open Drizzle Studio (DB browser)
npm run db:generate           # Generate migration files
```

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

Host: `advo` (ssh alias for `root@62.146.237.12`, Contabo Singapore). Add to `~/.ssh/config`:

```
Host advo advo-vps
  HostName 62.146.237.12
  User root
  IdentityFile ~/.ssh/id_ed25519_advo
  IdentitiesOnly yes
```

### API

```bash
# One-shot deploy:
cd advo-api && ./deploy.sh root@advo

# Or manually:
rsync -azP --exclude node_modules --exclude .env ./ root@advo:/opt/advo-api/
ssh advo "cd /opt/advo-api && npm install && npx drizzle-kit push && pm2 restart advo-api"
```

API runs under PM2 as `advo-api` (fork mode, port 6107). Logs: `/var/log/advo-api/{out,error}.log`.

### Frontend (built on VPS)

```bash
ssh advo "cd /opt/advo && git pull && npm install && npm run build && rsync -a --delete dist/ /var/www/advo/dist/"
```

`/opt/advo` is a `git clone https://github.com/advo-ph/advo.git` with `.env.production` containing `VITE_API_URL=https://api.advo.ph`. Nginx serves `/var/www/advo/dist` with SPA fallback (`try_files $uri $uri/ /index.html`).

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
| **API (prod)** | [api.advo.ph](https://api.advo.ph) (VPS, PM2 port 6107) |
| **VPS** | `62.146.237.12` (Contabo Cloud VPS 20 SSD, Singapore 2). SSH alias `advo`. |
| **Database** | PostgreSQL on VPS (port 5432) |
| **DNS** | Namecheap |
| **GitHub Org** | [github.com/advo-ph](https://github.com/advo-ph) |
| **Email** | Google Workspace (@advo.ph) + Resend (transactional) |

## API Endpoints

Full endpoint list: see `advo-api/src/routes/*.routes.ts`

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
lsof -ti :6100 | xargs kill -9    # Frontend
lsof -ti :6107 | xargs kill -9    # API
```

### API not starting

```bash
# Check logs
pm2 logs advo-api --lines 20

# Check env
cat /opt/advo-api/.env

# Check DB connection
psql -U advo -d advo -c "SELECT 1;"
```

### Database reset (dev only)

```bash
dropdb advo && createdb advo
cd advo-api && npm run db:push && npm run db:seed
```
