#!/bin/sh
set -e

TANK_CONFIG="/app/data/.tank-bootstrap"
TANK_ENV_FILE="${TMPDIR:-/tmp}/tank-env.txt"

if [ -z "$DATABASE_URL" ] && [ -f "$TANK_CONFIG" ]; then
  . "$TANK_CONFIG"
  echo "[Tank] Loaded DATABASE_URL from $TANK_CONFIG"
fi

if [ -z "$BETTER_AUTH_SECRET" ]; then
  export BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
  echo "[Tank] Auto-generated BETTER_AUTH_SECRET (sessions reset on restart — set explicitly for persistence)"
fi

if [ "$AUTO_MIGRATE" = "true" ]; then
  echo "[Tank] AUTO_MIGRATE=true — running headless setup..."

  echo "[Tank] Ensuring pg_trgm extension..."
  bun ./scripts/ensure-pg-trgm.mjs 2>&1 || {
    echo "[Tank] ERROR: Failed to enable pg_trgm. Is DATABASE_URL correct and extension creation allowed?"
    exit 1
  }

  echo "[Tank] Pushing database schema..."
  bun ./node_modules/drizzle-kit/bin.cjs push --force --config=drizzle.config.js 2>&1 || {
    echo "[Tank] ERROR: Schema push failed. Is DATABASE_URL correct?"
    exit 1
  }

  if [ -n "$FIRST_ADMIN_EMAIL" ]; then
    if [ -z "$FIRST_ADMIN_PASSWORD" ]; then
      echo "[Tank] ERROR: FIRST_ADMIN_PASSWORD required for headless setup"
      exit 1
    fi
    echo "[Tank] Creating admin: $FIRST_ADMIN_EMAIL"
    bun run scripts/bootstrap-headless.ts 2>&1 || {
      echo "[Tank] WARNING: Admin bootstrap failed (user may already exist)"
    }
  fi

  echo "[Tank] Headless setup complete."
fi

if [ -n "$DATABASE_URL" ]; then
  if [ "${DATABASE_SSL_CA+x}" = "x" ]; then
    bun run scripts/load-settings-from-db.ts > "$TANK_ENV_FILE" 2>/dev/null || {
      echo "[Tank] ERROR: Could not load settings with verified PostgreSQL TLS."
      exit 1
    }
  else
    bun run scripts/load-settings-from-db.ts > "$TANK_ENV_FILE" 2>/dev/null || true
  fi
fi

if [ -f "$TANK_ENV_FILE" ] && [ -s "$TANK_ENV_FILE" ]; then
  exec env $(cat "$TANK_ENV_FILE" | grep -E '^[A-Z_]+=' | tr '\n' ' ') bun .output/server/index.mjs
else
  exec bun .output/server/index.mjs
fi
