# Monorepo Cutover — VPS Runbook

Record of the cutover from the two-repo layout (`/opt/advo` frontend + `/opt/advo-api` standalone) to the npm-workspaces monorepo (`/opt/advo` with `apps/web` + `apps/api`). Executed 2026-05-26.

Keep this file as the reference if a similar restructure happens again, or to roll back if needed.

## What changed on the VPS

| Before | After |
|---|---|
| `/opt/advo/` — frontend-only git clone (build root) | `/opt/advo/` — monorepo (frontend in `apps/web/`, API in `apps/api/`) |
| `/opt/advo-api/` — standalone API directory (not a git repo) | Kept in place as a rollback artifact; nothing runs from it |
| PM2 `advo-api` `cwd=/opt/advo-api` | PM2 `advo-api` `cwd=/opt/advo/apps/api` |
| `/var/www/advo/dist/` ← `npm run build` from `/opt/advo` | `/var/www/advo/dist/` ← `npm run build:web` from `/opt/advo`, rsync from `apps/web/dist/` |
| `/var/www/advo/uploads/` (UPLOAD_DIR) | Unchanged — absolute path, restructure-proof |

## The cutover, step by step

Each step ran via `ssh advo`. Total downtime: ~30 seconds (API was stopped from step 2 to step 7).

```bash
# 1. Backup .env
cp /opt/advo-api/.env /tmp/advo-api-env-$(date +%s).bak

# 2. Stop API (downtime starts)
pm2 stop advo-api

# 3. Pull new main onto /opt/advo (becomes monorepo layout)
cd /opt/advo && git fetch && git reset --hard origin/main

# 4. Restore .env into the new API location
cp /opt/advo-api/.env /opt/advo/apps/api/.env

# 5. Install workspace deps from the root
cd /opt/advo && npm install

# 6. Repoint PM2 to the new cwd
pm2 delete advo-api
cd /opt/advo/apps/api && pm2 start "npx tsx src/index.ts" --name advo-api
pm2 save

# 7. Verify API health (downtime ends)
curl -fsS http://localhost:6107/api/health

# 8. Build + deploy frontend
cd /opt/advo && npm run build:web
rsync -a --delete apps/web/dist/ /var/www/advo/dist/
```

## What was preserved without action

- **Uploads** — `UPLOAD_DIR=/var/www/advo/uploads` in `.env` is absolute, so the API serves them from the same location regardless of cwd.
- **DB credentials** — moved with the `.env` copy.
- **CORS allowlist** — the local source edit (adding localhost:6100/6101) was already in the pulled `apps/api/src/index.ts`.
- **Nginx config** — paths unchanged: nginx serves `/var/www/advo/dist` and proxies `/api/` → `127.0.0.1:6107`.
- **Drizzle schema** — no migrations changed in this restructure, so no `db:push` was needed.

## Rollback plan (if a future restructure breaks)

`/opt/advo-api/` is intentionally left intact post-cutover. To roll back:

```bash
ssh advo '
  pm2 delete advo-api
  cd /opt/advo-api && pm2 start "npx tsx src/index.ts" --name advo-api && pm2 save

  # If frontend also broke, restore from git history
  cd /opt/advo && git checkout 5c4a326 -- .  # pre-monorepo commit
  cd /opt/advo && npm install && npm run build
  rsync -a --delete /opt/advo/dist/ /var/www/advo/dist/
'
```

The `/opt/advo-api/.env` backup at `/tmp/advo-api-env-*.bak` is a second safety net for the API credentials.

## Cleanup (after 1 week of stable prod)

Once you trust the new layout, the old API directory can be removed:

```bash
ssh advo 'rm -rf /opt/advo-api && rm /tmp/advo-api-env-*.bak'
```

Don't run this immediately — keep it as a rollback path for a week or two.
