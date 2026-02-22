#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

echo "Running Drizzle schema push..."
cd "$ROOT_DIR"
pnpm --filter=web exec drizzle-kit push --force

echo "Database initialization completed."
