#!/bin/bash
# ADVO monorepo deploy — sisia-app shaped.
# Usage: ./deploy.sh [--api-only | --frontend-only]
#
# Host: advo (SSH alias). Override with VPS_SSH=...
# API:  rsync apps/api → /opt/advo/apps/api, pm2 restart advo-api
# Web:  local vite build, rsync apps/web/dist/ → /var/www/advo/dist/
#
# Does not clobber apps/api/.env or apps/web/.env.production.
# apps/api/deploy.sh forwards here with --api-only.

set -euo pipefail

VPS_SSH="${VPS_SSH:-advo}"
REMOTE_ROOT="/opt/advo"
REMOTE_API="/opt/advo/apps/api"
REMOTE_WEB="/var/www/advo/dist"
PM2_NAME="advo-api"
DOMAIN="advo.ph"

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

DEPLOY_API=true
DEPLOY_FRONTEND=true

if [[ "${1:-}" == "--api-only" ]]; then
  DEPLOY_FRONTEND=false
elif [[ "${1:-}" == "--frontend-only" ]]; then
  DEPLOY_API=false
elif [[ -n "${1:-}" ]]; then
  err "Unknown flag: $1 (use --api-only or --frontend-only)"
fi

cd "$PROJECT_ROOT"

log "Testing SSH connection to ${VPS_SSH}..."
ssh -o ConnectTimeout=5 -q "${VPS_SSH}" "echo ok" >/dev/null 2>&1 || err "Cannot connect to ${VPS_SSH}. Check SSH alias / key."

if $DEPLOY_FRONTEND; then
  export VITE_API_URL="${VITE_API_URL:-https://api.${DOMAIN}}"
  log "Building web (VITE_API_URL=${VITE_API_URL})..."
  npm run build:web || err "Web build failed"
  if ! grep -Rql "api.${DOMAIN}" apps/web/dist/; then
    err "Built bundle does not reference api.${DOMAIN} — refusing to ship (check VITE_API_URL)."
  fi
fi

if $DEPLOY_API; then
  log "Backing up remote API .env..."
  ssh "${VPS_SSH}" "cd ${REMOTE_API} && cp -f .env .env.bak 2>/dev/null" || true

  log "Stopping ${PM2_NAME} before file sync..."
  ssh "${VPS_SSH}" "pm2 stop ${PM2_NAME} 2>/dev/null" || true

  log "Syncing workspace manifests → ${REMOTE_ROOT}"
  rsync -az \
    package.json package-lock.json \
    "${VPS_SSH}:${REMOTE_ROOT}/"

  log "Syncing API → ${REMOTE_API}"
  rsync -az --delete \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.bak' \
    --exclude='uploads' \
    --exclude='dist' \
    --exclude='logs' \
    apps/api/ \
    "${VPS_SSH}:${REMOTE_API}/"

  log "Installing workspace dependencies on VPS..."
  ssh "${VPS_SSH}" "cd ${REMOTE_ROOT} && npm install --workspace apps/api --include=dev --no-audit --no-fund" \
    || err "npm install failed"

  log "Starting ${PM2_NAME} from ${REMOTE_API}..."
  ssh "${VPS_SSH}" "cd ${REMOTE_API} && \
    (pm2 describe ${PM2_NAME} >/dev/null 2>&1 && pm2 restart ${PM2_NAME} --update-env \
      || pm2 start 'npx tsx src/index.ts' --name ${PM2_NAME}) && pm2 save" \
    || err "pm2 restart failed"
fi

if $DEPLOY_FRONTEND; then
  log "Deploying web → ${REMOTE_WEB}"
  ssh "${VPS_SSH}" "mkdir -p ${REMOTE_WEB}"
  rsync -az --delete \
    apps/web/dist/ \
    "${VPS_SSH}:${REMOTE_WEB}/"
fi

log "Verifying deployment..."
sleep 3

echo ""
echo "┌──────────────────────────────────────┐"
echo "│       ADVO Deployment Status         │"
echo "├──────────────────────────────────────┤"

if $DEPLOY_FRONTEND; then
  WEB_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null || echo "000")
  printf "│  %-18s →  HTTP %-3s       │\n" "${DOMAIN}" "$WEB_STATUS"
fi

if $DEPLOY_API; then
  API_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://api.${DOMAIN}/api/health" 2>/dev/null || echo "000")
  printf "│  %-18s →  HTTP %-3s       │\n" "api.${DOMAIN}" "$API_STATUS"
fi

echo "└──────────────────────────────────────┘"
echo ""

log "Done. Host ${VPS_SSH} · API cwd ${REMOTE_API} · web ${REMOTE_WEB}"
