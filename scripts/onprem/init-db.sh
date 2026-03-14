#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/onprem/load-env.sh"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

echo "Running Drizzle schema push..."
DATABASE_URL="$DATABASE_URL" bun "$ROOT_DIR/scripts/ensure-pg-trgm.mjs"
cd "$ROOT_DIR/apps/web"
bunx drizzle-kit push --force

echo "Database initialization completed."
