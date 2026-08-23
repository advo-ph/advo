#!/bin/bash
# ADVO monorepo deploy — git-transport shaped.
# Usage: ./deploy.sh [--api-only | --frontend-only]
#
# Host: advo (SSH alias). Override with VPS_SSH=...
# API:  /opt/advo is a checkout of this same origin, so the API deploy is
#       `git fetch` + `git reset --hard origin/<branch>` on the box, then
#       `npm install --workspace apps/api` and `pm2 restart advo-api`.
# Web:  local vite build -> tar over ssh into a staging dir -> atomic swap into
#       /var/www/advo/dist, keeping the replaced tree as dist.prev-<stamp>.
#
# Why the transport changed: on 2026-08-19 the old file-copy transport failed with
# `dup() in/out/err failed` (an MSYS file-descriptor bug). The script stopped
# pm2 BEFORE the sync, so that transport failure left prod down for ~2 minutes.
# Two things follow, and both are load-bearing:
#   1. No transport step here can fail in a way that leaves prod stopped. There
#      is no `pm2 stop` at all — `pm2 restart` is the only lifecycle call, and
#      it runs only once the new code is already on disk.
#   2. The web tree is swapped in, never written in place, so a partial upload
#      is never what nginx is serving.
#
# This ships origin/<branch>, NOT your working tree. Commit and push first.
# apps/api/.env and apps/web/.env.production are untracked on the box, so
# `git reset --hard` leaves them alone; both are copied into the backup
# directory before the reset regardless.
# apps/api/deploy.sh forwards here with --api-only.

set -euo pipefail

VPS_SSH="${VPS_SSH:-advo}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
REMOTE_ROOT="/opt/advo"
REMOTE_API="/opt/advo/apps/api"
REMOTE_WEB="/var/www/advo/dist"
REMOTE_BACKUP="/var/tmp/advo-backup"
PM2_NAME="advo-api"
DOMAIN="advo.ph"
STAMP="$(date +%Y%m%d-%H%M%S)"

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
ssh -o ConnectTimeout=5 -q "${VPS_SSH}" "echo ok" >/dev/null 2>&1 \
  || err "Cannot connect to ${VPS_SSH}. Check SSH alias / key."

# The box resets to origin/<branch>, so what ships is what is pushed — not what
# sits in this working tree. Under the old file-copy transport those were the same
# thing, which makes this the one behaviour change worth refusing to guess at.
log "Checking that origin/${DEPLOY_BRANCH} is what you mean to ship..."
git fetch --prune --quiet origin \
  || err "Local 'git fetch origin' failed — cannot confirm what would ship."
git rev-parse --verify --quiet "origin/${DEPLOY_BRANCH}" >/dev/null \
  || err "No origin/${DEPLOY_BRANCH}. Set DEPLOY_BRANCH=<branch> to deploy another one."

LOCAL_HEAD="$(git rev-parse HEAD)"
ORIGIN_HEAD="$(git rev-parse "origin/${DEPLOY_BRANCH}")"

if [[ "$LOCAL_HEAD" != "$ORIGIN_HEAD" ]]; then
  if [[ "${DEPLOY_ANY_HEAD:-}" == "1" ]]; then
    warn "HEAD is ${LOCAL_HEAD:0:8}; shipping origin/${DEPLOY_BRANCH} ${ORIGIN_HEAD:0:8} (DEPLOY_ANY_HEAD=1)."
  else
    err "HEAD (${LOCAL_HEAD:0:8}) is not origin/${DEPLOY_BRANCH} (${ORIGIN_HEAD:0:8}).
       This ships origin/${DEPLOY_BRANCH}, so your commits would not go out.
       Push them, or re-run with DEPLOY_ANY_HEAD=1 to ship origin/${DEPLOY_BRANCH} deliberately."
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  warn "Working tree is dirty. Uncommitted changes do NOT ship — the box takes origin/${DEPLOY_BRANCH}."
fi

if $DEPLOY_FRONTEND; then
  export VITE_API_URL="${VITE_API_URL:-https://api.${DOMAIN}}"
  log "Building web (VITE_API_URL=${VITE_API_URL})..."
  npm run build:web || err "Web build failed"
  if ! grep -Rql "api.${DOMAIN}" apps/web/dist/; then
    err "Built bundle does not reference api.${DOMAIN} — refusing to ship (check VITE_API_URL)."
  fi
fi

log "Backing up prod env + tree to ${REMOTE_BACKUP} (stamp ${STAMP})..."
ssh "${VPS_SSH}" bash -s <<EOF || err "Pre-deploy backup failed — nothing on prod has been changed."
set -euo pipefail
mkdir -p ${REMOTE_BACKUP}
if [ -f ${REMOTE_API}/.env ]; then
  cp -f ${REMOTE_API}/.env ${REMOTE_BACKUP}/api-env-${STAMP}.bak
fi
if [ -f ${REMOTE_ROOT}/apps/web/.env.production ]; then
  cp -f ${REMOTE_ROOT}/apps/web/.env.production ${REMOTE_BACKUP}/web-env-production-${STAMP}.bak
fi
tar czf ${REMOTE_BACKUP}/opt-advo-pre-reset-${STAMP}.tar.gz \
  -C /opt --exclude=node_modules --exclude=advo/apps/web/dist advo
EOF

if $DEPLOY_API; then
  log "Resetting ${REMOTE_ROOT} to origin/${DEPLOY_BRANCH}..."
  # `reset --hard` over `pull`: the box carries tracked churn a merge would
  # conflict on — CRLF left by the old file-copy transport, and a package-lock
  # that every npm install rewrites. It leaves untracked files (.env,
  # .env.production, uploads) alone, which is what makes it safe here.
  ssh "${VPS_SSH}" bash -s <<EOF || err "git reset failed — prod is untouched and still serving the old code."
set -euo pipefail
cd ${REMOTE_ROOT}
git fetch --prune origin
git reset --hard origin/${DEPLOY_BRANCH}
git --no-pager log -1 --format='  now at %h %s'
EOF

  log "Installing workspace dependencies on VPS..."
  ssh "${VPS_SSH}" "cd ${REMOTE_ROOT} && npm install --workspace apps/api --include=dev --no-audit --no-fund" \
    || err "npm install failed — code is updated but deps are not. ${PM2_NAME} is still up on the old process."

  # The only lifecycle call in this script. Everything above can fail without
  # taking prod down; `pm2 restart` swaps the process in one step, and
  # `pm2 start` is only the first-run path.
  log "Restarting ${PM2_NAME} from ${REMOTE_API}..."
  ssh "${VPS_SSH}" "cd ${REMOTE_API} && \
    (pm2 describe ${PM2_NAME} >/dev/null 2>&1 && pm2 restart ${PM2_NAME} --update-env \
      || pm2 start 'npx tsx src/index.ts' --name ${PM2_NAME}) && pm2 save" \
    || err "pm2 restart failed. Logs: ssh ${VPS_SSH} 'pm2 logs ${PM2_NAME} --lines 50 --nostream'"
fi

WEB_PREV=""
if $DEPLOY_FRONTEND; then
  WEB_STAGE="${REMOTE_WEB}.new-${STAMP}"
  WEB_PREV="${REMOTE_WEB}.prev-${STAMP}"

  log "Staging web bundle -> ${WEB_STAGE}"
  ssh "${VPS_SSH}" "rm -rf ${WEB_STAGE} && mkdir -p ${WEB_STAGE}" \
    || err "Could not create the web staging directory. Live site untouched."
  tar czf - -C apps/web/dist . | ssh "${VPS_SSH}" "tar xzf - -C ${WEB_STAGE}" \
    || err "Web upload failed. Live site untouched; remove the stale staging dir at ${WEB_STAGE}."

  log "Verifying the staged bundle on the box..."
  ssh "${VPS_SSH}" "test -f ${WEB_STAGE}/index.html && grep -Rql 'api.${DOMAIN}' ${WEB_STAGE}" \
    || err "Staged bundle is incomplete or does not reference api.${DOMAIN}. Live site untouched."

  log "Swapping in ${WEB_STAGE} (previous kept as ${WEB_PREV})"
  ssh "${VPS_SSH}" bash -s <<EOF || err "Web swap failed. Check ${REMOTE_WEB} and ${WEB_PREV} on the box."
set -euo pipefail
if [ -d ${REMOTE_WEB} ]; then
  mv ${REMOTE_WEB} ${WEB_PREV}
fi
mv ${WEB_STAGE} ${REMOTE_WEB}
EOF
fi

log "Verifying deployment..."

http_status() {
  curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$1" 2>/dev/null || echo "000"
}

WEB_STATUS="n/a"
API_STATUS="n/a"

# Retry until BOTH probes are actually healthy, not merely answering. `pm2 restart` returns
# as soon as the process is spawned, but `npx tsx` needs a few seconds more before it
# listens — during which nginx answers 502. The old loop broke on any status that was not
# 000, so it read that boot window as a failed deploy and reported red on a green ship
# (observed 2026-08-24). A still-booting API and a dead one look identical for ~5s, so the
# only honest way to tell them apart is to wait and ask again.
for attempt in 1 2 3 4 5 6 7 8; do
  if $DEPLOY_FRONTEND; then WEB_STATUS="$(http_status "https://${DOMAIN}/")"; fi
  if $DEPLOY_API; then API_STATUS="$(http_status "https://api.${DOMAIN}/api/health")"; fi
  WEB_OK=true; API_OK=true
  if $DEPLOY_FRONTEND && [[ "$WEB_STATUS" != "200" ]]; then WEB_OK=false; fi
  if $DEPLOY_API && [[ "$API_STATUS" != "200" ]]; then API_OK=false; fi
  if $WEB_OK && $API_OK; then
    break
  fi
  if [[ $attempt -lt 8 ]]; then
    sleep 3
  fi
done

echo ""
echo "┌──────────────────────────────────────┐"
echo "│       ADVO Deployment Status         │"
echo "├──────────────────────────────────────┤"
if $DEPLOY_FRONTEND; then
  printf "│  %-18s →  HTTP %-3s       │\n" "${DOMAIN}" "$WEB_STATUS"
fi
if $DEPLOY_API; then
  printf "│  %-18s →  HTTP %-3s       │\n" "api.${DOMAIN}" "$API_STATUS"
fi
echo "└──────────────────────────────────────┘"
echo ""

DEPLOY_OK=true

if $DEPLOY_API && [[ "$API_STATUS" != "200" ]]; then
  DEPLOY_OK=false
  warn "api.${DOMAIN}/api/health is ${API_STATUS}, not 200."
  warn "  logs:        ssh ${VPS_SSH} 'pm2 logs ${PM2_NAME} --lines 50 --nostream'"
  warn "  restore env: ssh ${VPS_SSH} 'cp ${REMOTE_BACKUP}/api-env-${STAMP}.bak ${REMOTE_API}/.env'"
  warn "  restore code: ssh ${VPS_SSH} 'cd ${REMOTE_ROOT} && git reset --hard <previous-sha>' then restart ${PM2_NAME}"
fi

if $DEPLOY_FRONTEND && [[ "$WEB_STATUS" != "200" ]]; then
  DEPLOY_OK=false
  warn "${DOMAIN} is ${WEB_STATUS}, not 200."
  warn "  roll back:   ssh ${VPS_SSH} 'rm -rf ${REMOTE_WEB} && mv ${WEB_PREV} ${REMOTE_WEB}'"
fi

if ! $DEPLOY_OK; then
  err "Deploy finished but prod is not healthy — see the recovery commands above."
fi

log "Done. Host ${VPS_SSH} · origin/${DEPLOY_BRANCH} · API cwd ${REMOTE_API} · web ${REMOTE_WEB}"
log "Backups in ${REMOTE_BACKUP} (stamp ${STAMP})${WEB_PREV:+ · previous web at ${WEB_PREV}}"
