#!/bin/bash
# Stale standalone path. Production is the monorepo at /opt/advo/apps/api.
# Forwards to repo-root deploy.sh --api-only so `cd apps/api && ./deploy.sh` still works.
# Do not rsync to /opt/advo-api — that directory is a rollback artifact only.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/deploy.sh" --api-only
