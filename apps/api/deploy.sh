#!/bin/bash
# ─────────────────────────────────────────────────────────
# ADVO API — Deploy to VPS
# Usage: ./deploy.sh [user@host]
# ─────────────────────────────────────────────────────────

set -euo pipefail

VPS="${1:-root@your-vps-ip}"
REMOTE_DIR="/opt/advo-api"
REMOTE_UPLOADS="/var/www/advo/uploads"

echo "Deploying ADVO API to $VPS:$REMOTE_DIR"
echo ""

# 1. Ensure remote directories exist
ssh "$VPS" "mkdir -p $REMOTE_DIR $REMOTE_UPLOADS/{avatars,portfolio,assets}"

# 2. Sync code (exclude node_modules, uploads, .env)
rsync -azP --delete \
  --exclude 'node_modules' \
  --exclude 'uploads' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'dist' \
  ./ "$VPS:$REMOTE_DIR/"

# 3. Install dependencies on remote
ssh "$VPS" "cd $REMOTE_DIR && npm install --production"

# 4. Run migrations
ssh "$VPS" "cd $REMOTE_DIR && npx drizzle-kit push"

# 5. Restart with PM2
ssh "$VPS" "cd $REMOTE_DIR && pm2 restart advo-api 2>/dev/null || pm2 start 'npx tsx src/index.ts' --name advo-api"

echo ""
echo "═══════════════════════════════════════"
echo "  Deployed! API running at $VPS"
echo "═══════════════════════════════════════"
echo ""
echo "Don't forget:"
echo "  1. Set up .env on the VPS: $REMOTE_DIR/.env"
echo "  2. Configure Nginx reverse proxy"
echo "  3. Set up SSL with certbot"
