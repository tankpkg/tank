#!/bin/sh
set -e

if [ "$AUTO_MIGRATE" = "true" ]; then
  echo "[Tank] AUTO_MIGRATE=true — running headless setup..."

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
  DB_EXPORTS=$(bun run scripts/load-settings-from-db.ts 2>/dev/null) || true
  if [ -n "$DB_EXPORTS" ]; then
    eval "$(echo "$DB_EXPORTS" | sed 's/^/export /')"
  fi
fi

exec bun .output/server/index.mjs
