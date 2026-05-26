#!/bin/bash
# Boot the local advo-api, wait for /api/health, run vitest, kill the API.
# Lets you get a clean 68/68 without polluting prod with test data.
#
# Usage: ./scripts/test-local.sh [vitest-args...]
#   ./scripts/test-local.sh                      # full suite
#   ./scripts/test-local.sh src/test/e2e-flow    # one file

set -euo pipefail

API_DIR="$(cd "$(dirname "$0")/../apps/api" && pwd)"
API_URL="http://localhost:6107"
LOG_FILE="/tmp/advo-api-test.log"

if [ ! -d "$API_DIR" ]; then
  echo "✗ advo-api not found at $API_DIR"
  exit 1
fi

API_PID=""
cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "→ Stopping advo-api (PID $API_PID)"
    kill "$API_PID" 2>/dev/null || true
    # Give it a moment, then SIGKILL stragglers (tsx spawns a child)
    sleep 1
    pkill -P "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# If something is already on 6107, assume the user is running their own API.
if curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
  echo "✓ advo-api already running on 6107 — reusing"
else
  echo "→ Starting advo-api (logs: $LOG_FILE)"
  (cd "$API_DIR" && npm run dev) > "$LOG_FILE" 2>&1 &
  API_PID=$!

  # Wait up to 30s for /api/health to come up
  for i in $(seq 1 30); do
    if curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
      echo "✓ advo-api ready (after ${i}s)"
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "✗ advo-api crashed before becoming healthy. Last 30 log lines:"
      tail -30 "$LOG_FILE"
      exit 1
    fi
    sleep 1
  done

  if ! curl -sf "$API_URL/api/health" >/dev/null 2>&1; then
    echo "✗ advo-api never became healthy after 30s. Last 30 log lines:"
    tail -30 "$LOG_FILE"
    exit 1
  fi
fi

echo ""
echo "→ Running vitest"
echo ""

# Pass through any args so you can target specific files
VITE_API_URL="$API_URL" npx vitest run "$@"
