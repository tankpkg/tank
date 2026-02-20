#!/usr/bin/env bash
set -euo pipefail

# Repeated perf suite runner for threshold locking (Task 7).
# Builds once, starts server, runs perf suite N times, collects all results.

NUM_RUNS=${1:-5}
PERF_PORT=3999
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_PID=""
RESULTS_DIR="$WEB_DIR/perf/results"

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[perf] Stopping server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$WEB_DIR"

echo "[perf] Building web app..."
pnpm build

echo "[perf] Starting production server on port $PERF_PORT..."
TANK_PERF_MODE=1 PORT=$PERF_PORT pnpm start &
SERVER_PID=$!

echo "[perf] Waiting for server readiness..."
TIMEOUT=60
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

PASS_COUNT=0
FAIL_COUNT=0

for i in $(seq 1 "$NUM_RUNS"); do
  echo ""
  echo "=========================================="
  echo "[perf] Suite run $i of $NUM_RUNS"
  echo "=========================================="
  
  if TANK_PERF_MODE=1 pnpm vitest run --config vitest.perf.config.ts 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "[perf] Run $i: PASS"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "[perf] Run $i: FAIL"
  fi
  
  # Small pause between runs to avoid resource contention
  if [ "$i" -lt "$NUM_RUNS" ]; then
    sleep 2
  fi
done

echo ""
echo "=========================================="
echo "[perf] SUMMARY: $PASS_COUNT/$NUM_RUNS passed, $FAIL_COUNT/$NUM_RUNS failed"
echo "=========================================="
echo "[perf] Results saved in $RESULTS_DIR"
ls -la "$RESULTS_DIR"/*.json 2>/dev/null | tail -$((NUM_RUNS * 2 + 2))

exit 0
