---
description: How to deploy ADVO to production
---

## Stack overview

- **VPS**: `root@62.146.237.12` (SSH alias: `advo`) — Contabo, Singapore
- **Frontend**: Static build served by Nginx from `/var/www/advo/dist`
- **API**: Node + Hono on `127.0.0.1:6107`, managed by PM2 (process: `advo-api`)
- **Database**: PostgreSQL 16 on the same VPS

## Deploy frontend

1. Build and verify locally:

```bash
cd /Users/angelonrevelo/Antigravity/advo && npm run build
```

2. Stage, commit, push:

```bash
cd /Users/angelonrevelo/Antigravity/advo && git add -A && git status
git commit -m "feat: <description>"
git push origin main
```

3. Pull + rebuild on VPS:

```bash
ssh advo "cd /opt/advo && git pull && npm install && npm run build && rsync -a --delete dist/ /var/www/advo/dist/"
```

## Deploy API

`advo-api` is **not git-tracked** — it deploys directly via rsync.

```bash
cd /Users/angelonrevelo/Antigravity/advo-api && ./deploy.sh advo
```

This:
- Syncs source to `/opt/advo-api` (excluding `node_modules`, `uploads`, `.env`)
- Runs `npm install --production` on the VPS
- Restarts the `advo-api` PM2 process

After restart, give it ~3s before hitting `/api/health` (warm-up).

## Database migrations

Use Drizzle Kit from the API project:

```bash
cd /Users/angelonrevelo/Antigravity/advo-api && npm run db:push    # local dev
ssh advo "cd /opt/advo-api && npm run db:push"                     # prod
```

Manual backups (automated nightly at 3am via cron):

```bash
ssh advo "sudo -u postgres pg_dump -Fc advo > /var/backups/advo/advo_\$(date +%Y%m%d).dump"
```

## Verify

- Production: https://advo.ph
- API health: https://api.advo.ph/api/health → `{"status":"ok","db":true}`
- PM2 status: `ssh advo "pm2 list | grep advo-api"`
- Recent API logs: `ssh advo "pm2 logs advo-api --lines 50 --nostream"`
