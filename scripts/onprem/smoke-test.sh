#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

echo "Starting on-prem stack..."
docker compose up -d --build

echo "Waiting for services..."
sleep 15

echo "Checking health endpoints..."
curl --fail --silent http://localhost:${APP_PORT:-3000}/api/health > /dev/null

echo "Checking container health status..."
docker compose ps

echo "Smoke test passed."
