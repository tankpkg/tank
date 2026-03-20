#!/usr/bin/env bash
set -euo pipefail
set -a; source .env; set +a

echo "▸ Starting infra (Postgres, MinIO)..."
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres minio

echo "▸ Waiting for Postgres..."
until docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres pg_isready -U tank -d tank 2>/dev/null; do sleep 1; done

echo "▸ Pushing DB schema..."
bun scripts/ensure-pg-trgm.mjs && (cd apps/registry && bunx drizzle-kit push)

echo "▸ Seeding skills..."
if [ ! -d /tmp/tank-skills ]; then
  git clone --depth 1 https://github.com/tankpkg/skills.git /tmp/tank-skills
fi
bun run scripts/seed-docker.ts

echo "▸ Starting TanStack dev server on :5555..."
bun run --filter registry dev
