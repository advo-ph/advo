#!/bin/bash

# Combined development script that starts all services and cleans up on exit
# Usage: ./scripts/dev.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting development environment...${NC}"

# Track PIDs for cleanup
VITE_PID=""

# Cleanup function - called on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down all services...${NC}"
    
    # Kill Vite dev server
    if [ -n "$VITE_PID" ] && kill -0 "$VITE_PID" 2>/dev/null; then
        echo -e "${YELLOW}Stopping Vite...${NC}"
        kill "$VITE_PID" 2>/dev/null || true
        wait "$VITE_PID" 2>/dev/null || true
    fi
    
    # Stop Supabase
    echo -e "${YELLOW}Stopping Supabase...${NC}"
    npx supabase stop 2>/dev/null || true
    
    echo -e "${GREEN}✅ All services stopped.${NC}"
    exit 0
}

# Set up trap to catch SIGINT (Ctrl+C), SIGTERM, and EXIT
trap cleanup SIGINT SIGTERM EXIT

# Start Supabase
echo -e "${GREEN}📦 Starting Supabase...${NC}"
npx -y supabase start

# Start Vite dev server in background
echo -e "${GREEN}⚡ Starting Vite dev server...${NC}"
npm run dev &
VITE_PID=$!

echo -e "\n${GREEN}✅ All services started!${NC}"
echo -e "${GREEN}   Press Ctrl+C to stop all services${NC}\n"

# Wait for Vite process (keeps script running)
wait $VITE_PID
