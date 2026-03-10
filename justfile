@_default:
    just --list

# Install all dependencies
[group('setup')]
install:
    bun install

# Verify toolchain versions
[group('setup')]
doctor:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Node: $(node -v)"
    echo "Bun: $(bun -v)"
    echo "Python: $(python3 --version)"

# Start all workspaces in dev mode
[group('dev')]
dev:
    bun turbo dev

# Start web app only
[group('dev')]
dev-web:
    bun --filter @internal/web run dev

# Start CLI in dev/watch mode
[group('dev')]
dev-cli:
    bun --filter @tankpkg/cli run dev

# Build all workspaces
[group('build')]
build:
    bun turbo build

# Build CLI standalone binary
[group('build')]
build-binary:
    bun --filter @tankpkg/cli run build:binary

# Run Biome check (lint + format validation)
[group('verify')]
check:
    bun biome check .

# Format all code (Biome + Prettier for Markdown)
[group('verify')]
fmt:
    bun biome format --write .
    bun prettier --write '**/*.md' '**/*.feature' '**/*.yaml' '**/*.yml'

# Lint all workspaces
[group('verify')]
lint:
    bun turbo lint

# Fix all lint issues
[group('verify')]
lint-fix:
    bun biome check --fix .

# Type-check all TypeScript
[group('verify')]
typecheck:
    bun tsc -b --noEmit

# Run full verification pipeline: typecheck → fmt → lint
[group('verify')]
verify:
    just typecheck
    just fmt
    just lint

# Run all unit tests
[group('test')]
test:
    bun turbo test

# Run end-to-end tests
[group('test')]
test-e2e:
    bun vitest run --config e2e/vitest.config.ts

# Run BDD tests
[group('test')]
test-bdd:
    bunx bddgen test -c e2e/bdd/playwright.config.ts && bunx playwright test -c e2e/bdd/playwright.config.ts

# Run performance tests
[group('test')]
test-perf:
    bun --filter @internal/web run perf:test

# Run Python scanner tests
[group('test')]
test-python:
    #!/usr/bin/env bash
    cd packages/scanner && PYTHONPATH=. uv run pytest -v

# Format Python code with Ruff
[group('verify')]
fmt-python:
    uv run ruff format packages/scanner
    uv run ruff check --fix packages/scanner

# Lint Python code with Ruff
[group('verify')]
check-python:
    uv run ruff check packages/scanner
    uv run ruff format --check packages/scanner

# Generate Drizzle migration
[group('db')]
db-generate:
    bun --filter @internal/web exec drizzle-kit generate

# Push Drizzle schema to database
[group('db')]
db-push:
    bun --filter @internal/web exec drizzle-kit push

# Bootstrap admin user
[group('db')]
db-admin:
    bun --filter @internal/web run admin:bootstrap

# Start infrastructure (Postgres, Redis, MinIO)
[group('docker')]
docker-up:
    docker compose -f infra/docker-compose.yml up -d

# Stop infrastructure
[group('docker')]
docker-down:
    docker compose -f infra/docker-compose.yml down

# Follow infrastructure logs
[group('docker')]
docker-logs:
    docker compose -f infra/docker-compose.yml logs -f

# Generate all docs (CLI, API, llms.txt)
[group('docs')]
docs-gen:
    node scripts/gen-cli-docs.mjs && node scripts/gen-api-docs.mjs && node scripts/gen-llms-txt.mjs

# Check for documentation drift
[group('docs')]
docs-check:
    #!/usr/bin/env bash
    set -euo pipefail
    node scripts/gen-cli-docs.mjs && node scripts/gen-api-docs.mjs && node scripts/gen-llms-txt.mjs
    git diff --exit-code || (echo "Docs are out of sync!" && exit 1)

# Remove build artifacts
[group('clean')]
clean:
    rm -rf dist build .next .turbo coverage
    bun turbo clean 2>/dev/null || true
