#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/onprem/load-env.sh"

cd "$ROOT_DIR"

echo "Starting on-prem stack..."
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/docker-compose.yml" up -d --build

echo "Waiting for services..."
sleep 15

echo "Checking health endpoints..."
curl --fail --silent http://localhost:${APP_PORT:-3000}/api/health > /dev/null

echo "Checking container health status..."
docker compose --env-file "$ROOT_DIR/.env" -f "$ROOT_DIR/infra/docker-compose.yml" ps

echo "Smoke test passed."
