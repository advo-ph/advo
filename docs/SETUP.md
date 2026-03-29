# Development & Deployment Setup

## Architecture

```
Frontend (React/Vite)  →  ADVO API (Hono/Node)  →  PostgreSQL
     port 6400                port 3001              port 5432
     (Vercel prod)           (VPS prod)
```

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
npm run dev                   # Starts on port 3000
```

### 2. Start the Frontend

```bash
cd /path/to/Antigravity/advo
npm install
npm run dev                   # Starts on port 6400
```

Open http://localhost:6400

Default admin login: `admin@advo.ph` / `changeme`

## Environment Variables

### Frontend (`advo/.env`)

```env
VITE_API_URL=http://localhost:3000        # Local
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

# Server
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
API_URL=http://localhost:3000
FRONTEND_URL=http://localhost:6400
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

### VPS (Contabo: 217.216.72.28)

```bash
# Deploy API
cd advo-api
./deploy.sh root@217.216.72.28

# Or manually:
rsync -azP --exclude node_modules --exclude .env ./ root@217.216.72.28:/opt/advo-api/
ssh root@217.216.72.28 "cd /opt/advo-api && npm install && npx drizzle-kit push && pm2 restart advo-api"
```

### Frontend (VPS — migrating from Vercel)

```bash
# Build locally
cd advo
npm run build

# Deploy to VPS
rsync -azP --delete dist/ root@217.216.72.28:/var/www/advo/dist/
rsync -azP public/ root@217.216.72.28:/var/www/advo/dist/   # team photos, logos
```

Nginx serves from `/var/www/advo/dist/` with SPA fallback.

> **Note:** Currently still on Vercel while DNS migrates. Once `advo.ph` A record points to `217.216.72.28`, run `certbot --nginx -d advo.ph -d www.advo.ph` for SSL.

### SSL

```bash
ssh root@217.216.72.28
certbot --nginx -d api.advo.ph
```

### Database Backup

```bash
# Manual backup
ssh root@217.216.72.28 "pg_dump -Fc advo > /var/backups/advo/advo_$(date +%Y%m%d).dump"

# Restore
pg_restore -d advo backup.dump

# Automated daily (cron)
ssh root@217.216.72.28 "crontab -e"
# Add: 0 3 * * * /opt/advo-api/backup.sh
```

### Transfer to New VPS

```bash
# On old VPS:
pg_dump -Fc advo > advo.dump
rsync -az /var/www/advo/uploads/ newvps:/var/www/advo/uploads/

# On new VPS:
pg_restore -d advo advo.dump
rsync -az oldvps:/opt/advo-api/ /opt/advo-api/
# Update .env, restart PM2, update DNS
```

## Infrastructure

| Service | URL / Location |
|---------|---------------|
| **Frontend (prod)** | [advo.ph](https://advo.ph) (VPS nginx, migrating from Vercel) |
| **API (prod)** | [api.advo.ph](https://api.advo.ph) (VPS) |
| **VPS** | 217.216.72.28 (Contabo) |
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
lsof -ti :6400 | xargs kill -9    # Frontend
lsof -ti :3000 | xargs kill -9    # API
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
