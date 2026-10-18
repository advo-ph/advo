#!/usr/bin/env bash
#
# Downloads the current month's DB-IP City Lite database (CC BY 4.0, no account/API key
# required) and atomically swaps it into place at GEO_DB_PATH, same atomic-swap discipline
# deploy.sh uses for the web dist dir — a partial download must never become the file the
# running API process reads mid-write.
#
# Run monthly on the VPS via cron, then restart the API so the new reader is picked up
# (services/geo.service.ts opens the reader once per process lifetime):
#
#   0 3 1 * * /path/to/scripts/update-geo-db.sh >> /var/log/advo-geo-update.log 2>&1 && \
#     pm2 restart advo-api --update-env
#
# Exits non-zero and leaves the existing file untouched if the download or decompression
# fails — never swap in a corrupt/partial file.
#
# Usage:
#   bash scripts/update-geo-db.sh [target-path]
#   # target-path defaults to apps/api/data/geo/dbip-city-lite.mmdb (matches
#   # GEO_DB_PATH's default in apps/api/.env.example)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET="${1:-$REPO_ROOT/apps/api/data/geo/dbip-city-lite.mmdb}"
TARGET_DIR="$(dirname "$TARGET")"
MONTH_TAG="$(date -u +%Y-%m)"
URL="https://download.db-ip.com/free/dbip-city-lite-${MONTH_TAG}.mmdb.gz"

TMP_GZ="$(mktemp /tmp/dbip-city-lite.XXXXXX.mmdb.gz)"
TMP_MMDB="$(mktemp /tmp/dbip-city-lite.XXXXXX.mmdb)"
cleanup() { rm -f "$TMP_GZ" "$TMP_MMDB"; }
trap cleanup EXIT

mkdir -p "$TARGET_DIR"

echo "update-geo-db: downloading $URL"
if ! curl -fsSL "$URL" -o "$TMP_GZ"; then
  echo "update-geo-db: download failed -- leaving existing file at $TARGET untouched" >&2
  exit 1
fi

echo "update-geo-db: decompressing"
if ! gunzip -c "$TMP_GZ" > "$TMP_MMDB"; then
  echo "update-geo-db: decompression failed -- leaving existing file at $TARGET untouched" >&2
  exit 1
fi

if [ ! -s "$TMP_MMDB" ]; then
  echo "update-geo-db: decompressed file is empty -- refusing to swap it in" >&2
  exit 1
fi

# Atomic swap: mv within the same filesystem is a rename, not a copy, so a reader mid-open
# never observes a partially-written file.
mv "$TMP_MMDB" "$TARGET"
echo "update-geo-db: installed $TARGET ($(date -u +%Y-%m-%d))"
