#!/usr/bin/env bash
set -euo pipefail

PERF_PORT=3999
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[perf] Stopping server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[perf] Building web app..."
cd "$WEB_DIR"
pnpm build

echo "[perf] Starting production server on port $PERF_PORT..."
TANK_PERF_MODE=1 PORT=$PERF_PORT pnpm start &
SERVER_PID=$!

echo "[perf] Waiting for server readiness..."
TIMEOUT=30
ELAPSED=0
while ! curl -sf "http://localhost:$PERF_PORT" > /dev/null 2>&1; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "[perf] ERROR: Server did not start within ${TIMEOUT}s"
    exit 1
  fi
done
echo "[perf] Server ready after ${ELAPSED}s"

echo "[perf] Running performance tests..."
TANK_PERF_MODE=1 pnpm vitest run --config vitest.perf.config.ts
TEST_EXIT=$?

echo "[perf] Tests completed with exit code $TEST_EXIT"
exit $TEST_EXIT
