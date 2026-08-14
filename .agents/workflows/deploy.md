---
description: How to deploy ADVO to production
---

## Stack overview

- **VPS**: `advo` (`ssh advo` → `62.146.237.12`) — Contabo, Singapore
- **Frontend**: local Vite build, rsync to `/var/www/advo/dist`
- **API**: monorepo `apps/api`, PM2 `advo-api`, cwd `/opt/advo/apps/api`
- **Database**: PostgreSQL 16 on the same box

Do not deploy the standalone `advo-api` repo to `/opt/advo-api`. That path is rollback only.

## Pre-deploy checklist

Run locally before shipping:

```bash
cd /Users/angelonrevelo/Antigravity/advo
npx tsc --noEmit
npm run lint
npm run test:local
npm run build:web
```

CI (`.github/workflows/ci.yml`) runs typecheck + lint + build on push, not the integration tests.

## Deploy

From the monorepo root. Default host is `advo`.

```bash
./deploy.sh                 # API + web
./deploy.sh --api-only
./deploy.sh --frontend-only
```

The script:

- SSHs to `advo` (override with `VPS_SSH=…`)
- Does not clobber `apps/api/.env` or `apps/web/.env.production`
- Rsyncs `apps/api/` → `/opt/advo/apps/api`, restarts PM2 `advo-api`
- Builds web with `VITE_API_URL=https://api.advo.ph` and refuses to ship if the bundle still points at localhost
- Rsyncs `apps/web/dist/` → `/var/www/advo/dist/`
- Smokes `https://advo.ph/` and `https://api.advo.ph/api/health`

`apps/api/deploy.sh` forwards to `./deploy.sh --api-only`.

## Database migrations

```bash
cd /Users/angelonrevelo/Antigravity/advo
npm --workspace apps/api run db:push                 # local
ssh advo "cd /opt/advo/apps/api && npm run db:push"  # prod
```

Manual backup (nightly cron also runs at 03:00):

```bash
ssh advo "sudo -u postgres pg_dump -Fc advo > /var/backups/advo/advo_\$(date +%Y%m%d).dump"
```

## Verify

- Production: https://advo.ph
- API health: https://api.advo.ph/api/health → `{"status":"ok","db":true}`
- PM2: `ssh advo "pm2 list | grep advo-api"`
- Logs: `ssh advo "pm2 logs advo-api --lines 50 --nostream"`
