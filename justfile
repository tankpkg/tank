@_default:
    just --list

# Install all dependencies — Bun workspaces (TS) + uv sync (Python scanner)
[group('setup')]
install:
    bun install
    cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv sync

# On-premises installation — builds from source, generates .env, starts Docker stack
[group('setup')]
onprem-install:
    bash scripts/onprem-install.sh

# Install git pre-push hook — auto-runs lint, typecheck, and tests on changed packages before push
[group('setup')]
hooks:
    ln -sf ../../scripts/pre-push .git/hooks/pre-push
    @echo "Pre-push hook installed"

# Print installed versions of required tools: node, bun, python, uv
[group('setup')]
doctor:
    bash scripts/justfile/doctor.sh

# One command to start everything: infra, schema, seed data, dev server
[group('dev')]
up:
    bash scripts/justfile/up.sh

# Stop all infra containers
[group('dev')]
down:
    docker compose --env-file .env -f infra/docker-compose.yml down

# just dev         - start all dev servers in parallel via turbo
# just dev registry - TanStack Start dev server on :5555
# just dev cli     - CLI in tsdown watch mode
# just dev mcp     - MCP server in tsx watch mode
# just dev scanner - Python scanner via uvicorn on :8000
[group('dev')]
dev target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        registry) bun run --filter registry dev ;;
        cli)     bun run --filter @tankpkg/cli dev ;;
        mcp)     bun run --filter @tankpkg/mcp-server dev ;;
        scanner) cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 ;;
        all)
            cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 &
            bun turbo dev &
            wait
            ;;
        *) echo "Unknown target: {{target}}. Use: registry, cli, mcp, scanner, all" && exit 1 ;;
    esac

# just scan - send a sample skill tarball to the Python scanner API for quick verification
[group('dev')]
scan:
    bash scripts/test-scan.sh

# just build         - build all packages via turbo
# just build registry - TanStack Start production build
# just build cli     - CLI via tsdown
# just build mcp     - MCP server via tsdown
# just build internals-schemas - shared contract schemas via tsdown
# just build internals-helpers - shared helpers via tsdown
# just build adapters - platform adapters via tsdown
# just build binary  - standalone CLI executable (tsdown + esbuild + SEA)
[group('build')]
build target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        registry) bun run --filter registry build ;;
        cli)     bun run --filter @tankpkg/cli build ;;
        mcp)     bun run --filter @tankpkg/mcp-server build ;;
        sdk)     bun run --filter @tankpkg/sdk build ;;
        internals-schemas) bun run --filter @internals/schemas build ;;
        internals-helpers) bun run --filter @internals/helpers build ;;
        adapters) bun run --filter @internals/adapters build ;;
        binary) bun run --filter @tankpkg/cli build:binary ;;
        all)    bun turbo build ;;
        *) echo "Unknown target: {{target}}. Use: registry, cli, mcp, sdk, internals-schemas, internals-helpers, adapters, binary, all" && exit 1 ;;
    esac

# just sdk-python build          - build tank-sdk wheel + sdist into packages/sdk-python/dist
# just sdk-python publish-test   - upload tank-sdk to TestPyPI (needs TWINE_* env vars)
# just sdk-python publish        - upload tank-sdk to PyPI (local fallback; prefer CI via OIDC)
[group('build')]
sdk-python action='build':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        build)
            python -m pip install --upgrade build twine
            rm -rf packages/sdk-python/dist
            python -m build packages/sdk-python
            python -m twine check packages/sdk-python/dist/*
            ;;
        publish-test)
            python -m pip install --upgrade twine
            python -m twine upload --repository testpypi packages/sdk-python/dist/*
            ;;
        publish)
            python -m pip install --upgrade twine
            python -m twine upload packages/sdk-python/dist/*
            ;;
        *) echo "Unknown action: {{action}}. Use: build, publish-test, publish" && exit 1 ;;
    esac

# just sdk-core-python build         - build tank-core wheel for the current host
# just sdk-core-python develop       - maturin develop (install into current venv for local dev)
# just sdk-core-python sdist         - build tank-core sdist only
# just sdk-core-python publish-test  - upload tank-core to TestPyPI
# just sdk-core-python publish       - upload tank-core to PyPI (local fallback; prefer CI)
[group('build')]
sdk-core-python action='build':
    #!/usr/bin/env bash
    set -euo pipefail
    cd packages/sdk-core/crates/python
    case "{{action}}" in
        build)
            python -m pip install --upgrade maturin
            maturin build --release --out dist --compatibility pypi
            ;;
        develop)
            python -m pip install --upgrade maturin
            maturin develop --release
            ;;
        sdist)
            python -m pip install --upgrade maturin
            maturin sdist --out dist
            ;;
        publish-test)
            python -m pip install --upgrade twine
            python -m twine upload --repository testpypi dist/*
            ;;
        publish)
            python -m pip install --upgrade twine
            python -m twine upload dist/*
            ;;
        *) echo "Unknown action: {{action}}. Use: build, develop, sdist, publish-test, publish" && exit 1 ;;
    esac

# just fmt        - format all code (TypeScript + Python)
# just fmt ts     - Biome format + Prettier for non-Biome files
# just fmt python - Ruff format + autofix on apps/python-api
[group('verify')]
fmt target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    fmt_ts() (bun run format)
    fmt_python() (
        UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff format apps/python-api
        UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff check --fix apps/python-api
    )
    case "{{target}}" in
        ts)     fmt_ts ;;
        python) fmt_python ;;
        all)    fmt_ts; fmt_python ;;
        *) echo "Unknown target: {{target}}. Use: ts, python, all" && exit 1 ;;
    esac

# just lint        - lint + auto-fix all code (TypeScript + Python)
# just lint ts     - Biome lint + auto-fix
# just lint python - Ruff check --fix + format on apps/python-api
[group('verify')]
lint target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    lint_ts() (bun run lint)
    lint_python() (
        UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff check --fix apps/python-api
        UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff format apps/python-api
    )
    case "{{target}}" in
        ts)     lint_ts ;;
        python) lint_python ;;
        all)    lint_ts && lint_python ;;
        *) echo "Unknown target: {{target}}. Use: ts, python, all" && exit 1 ;;
    esac

# Type-check all TypeScript packages using project references (tsc -b)
[group('verify')]
typecheck:
    bun run typecheck

# Lint check without modifying files (TypeScript + Python)
[group('verify')]
lint-readonly target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    lint_ts() (bun run lint:readonly)
    lint_python() (UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff check apps/python-api)
    case "{{target}}" in
        ts)     lint_ts ;;
        python) lint_python ;;
        all)    lint_ts && lint_python ;;
        *) echo "Unknown target: {{target}}. Use: ts, python, all" && exit 1 ;;
    esac

# Format check without modifying files (TypeScript + Python)
[group('verify')]
fmt-readonly target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    fmt_ts() (bun run format:readonly)
    fmt_python() (UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run ruff format --check apps/python-api)
    case "{{target}}" in
        ts)     fmt_ts ;;
        python) fmt_python ;;
        all)    fmt_ts && fmt_python ;;
        *) echo "Unknown target: {{target}}. Use: ts, python, all" && exit 1 ;;
    esac

# Full verification pipeline without modifying files
[group('verify')]
verify-readonly: (fmt-readonly "ts") (lint-readonly "ts") typecheck

# Run the full verification pipeline (auto-fixes lint + format issues)
[group('verify')]
verify: (fmt "ts") (lint "ts") typecheck

# Check that all package versions are synchronized
[group('verify')]
check-versions:
    bash scripts/check-versions.sh

# Bump version across all packages and Chart.yaml
[group('setup')]
bump VERSION:
    #!/usr/bin/env bash
    set -euo pipefail

    # Validate semver format (basic check, or nightly pre-release format)
    if ! [[ "{{VERSION}}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && ! [[ "{{VERSION}}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-nightly\.[0-9]+\.[a-f0-9a-f]+$ ]]; then
      echo "Invalid version format: {{VERSION}} (expected X.Y.Z or X.Y.Z-nightly.YYYYMMDD.SHORT_SHA)"
      exit 1
    fi

    # Update package.json files
    jq ".version = \"{{VERSION}}\"" packages/cli/package.json > packages/cli/package.json.tmp && mv packages/cli/package.json.tmp packages/cli/package.json
    jq ".version = \"{{VERSION}}\"" apps/registry/package.json > apps/registry/package.json.tmp && mv apps/registry/package.json.tmp apps/registry/package.json
    jq ".version = \"{{VERSION}}\"" packages/mcp-server/package.json > packages/mcp-server/package.json.tmp && mv packages/mcp-server/package.json.tmp packages/mcp-server/package.json
    jq ".version = \"{{VERSION}}\"" packages/internals-schemas/package.json > packages/internals-schemas/package.json.tmp && mv packages/internals-schemas/package.json.tmp packages/internals-schemas/package.json
    jq ".version = \"{{VERSION}}\"" packages/internals-helpers/package.json > packages/internals-helpers/package.json.tmp && mv packages/internals-helpers/package.json.tmp packages/internals-helpers/package.json
    jq ".version = \"{{VERSION}}\"" packages/sdk/package.json > packages/sdk/package.json.tmp && mv packages/sdk/package.json.tmp packages/sdk/package.json

    # Update SDK core version (Python pyproject.toml + Rust Cargo.toml)
    sed -i.bak "s/^version = .*/version = \"{{VERSION}}\"/" packages/sdk-core/crates/python/pyproject.toml && rm -f packages/sdk-core/crates/python/pyproject.toml.bak
    sed -i.bak "s/^version = .*/version = \"{{VERSION}}\"/" packages/sdk-core/crates/python/Cargo.toml && rm -f packages/sdk-core/crates/python/Cargo.toml.bak

    # Update tank-sdk Python SDK version (single source: _version.py)
    printf '__version__ = "%s"\n' "{{VERSION}}" > packages/sdk-python/tankpkg/_version.py

    # Pin the [native] extra to the matching tank-core version
    sed -i.bak 's/^native = \["tank-core==.*"\]/native = ["tank-core=={{VERSION}}"]/' packages/sdk-python/pyproject.toml && rm -f packages/sdk-python/pyproject.toml.bak

    # Keep Cargo.lock in sync with the bumped Rust crate version (ignore if cargo missing)
    cargo update -p sdk-python --manifest-path packages/sdk-core/Cargo.toml --precise "{{VERSION}}" 2>/dev/null || true

    # Update Chart.yaml
    sed -i.bak "s/^appVersion: .*/appVersion: \"{{VERSION}}\"/" infra/helm/tank/Chart.yaml && rm -f infra/helm/tank/Chart.yaml.bak

    # Verify all versions match
    bash scripts/check-versions.sh

    echo "Bumped all versions to {{VERSION}}"

# just test         - run all unit tests via turbo
# just test registry - vitest for TanStack Start app
# just test registry-e2e - registry-specific e2e tests (admin, search)
# just test cli     - vitest for CLI commands
# just test mcp     - vitest for MCP server tools
# just test internals-schemas - vitest for shared contract schemas
# just test internals-helpers - vitest for shared helpers
# just test scanner - pytest for Python scanner
# just test e2e     - vitest cross-system integration tests (CLI ↔ registry)
# just test bdd         - system BDD + browser BDD
# just test bdd-system  - Vitest executable behavior specs
# just test bdd-browser - Playwright browser behavior specs
# just test e2e-onprem  - on-prem Docker Compose E2E (needs running stack)
[group('test')]
test target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        cli)     bun run --filter @tankpkg/cli test ;;
        mcp)     bun run --filter @tankpkg/mcp-server test ;;
        internals-schemas) bun run --filter @internals/schemas test ;;
        internals-helpers) bun run --filter @internals/helpers test ;;
        scanner) cd apps/python-api && PYTHONPATH=. UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run pytest -v ;;
        registry) bun run --filter registry test ;;
        registry-e2e) bun run --filter registry test:e2e ;;
        e2e)     bun run --filter @internal/e2e test:run ;;
        bdd-system) bun run --filter @internal/bdd test:system ;;
        bdd-browser) bunx bddgen test -c bdd/playwright.config.ts && bunx playwright test -c bdd/playwright.config.ts ;;
        bdd)     bun run --filter @internal/bdd test:system && bunx bddgen test -c bdd/playwright.config.ts && bunx playwright test -c bdd/playwright.config.ts ;;
        e2e-onprem) BASE="${BASE:-http://localhost:3000}" bash e2e/onprem-e2e.sh ;;
        all)     bun turbo test ;;
        *) echo "Unknown target: {{target}}. Use: registry, registry-e2e, cli, mcp, internals-schemas, internals-helpers, scanner, e2e, e2e-onprem, bdd, bdd-system, bdd-browser, all" && exit 1 ;;
    esac

# Test a published binary on separate real filesystems; CI uses Linux /dev/shm.
[group('test')]
ci-test-upgrade-filesystem:
    #!/usr/bin/env bash
    set -euo pipefail
    bun run --filter @tankpkg/cli build:binary
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$(uname -m)" in
      x86_64) arch=x64 ;;
      arm64|aarch64) arch=arm64 ;;
      *) echo "Unsupported test architecture" >&2; exit 1 ;;
    esac
    TANK_UPGRADE_TEST_BINARY="$PWD/packages/cli/build/tank-$os-$arch" \
      TANK_UPGRADE_CROSS_DEVICE_TMPDIR="${TANK_UPGRADE_CROSS_DEVICE_TMPDIR:-/dev/shm}" \
      bun run --filter @internal/bdd test:system steps/system/upgrade-filesystem.steps.ts --no-passWithNoTests

# Verify the PostgreSQL-backed login store against an isolated test database.
[group('test')]
ci-test-login-store:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      DOCKER_HOST="$host" E2E_AUTH_TEST_POSTGRES_IMAGE="${E2E_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" \
      E2E_LOGIN_DATABASE_URL="${DATABASE_URL:?DATABASE_URL must point to a local test database}" \
      bun --no-env-file --no-install --config=/dev/null run --filter @internal/bdd test:system steps/system/login-store.steps.ts --no-passWithNoTests

# Verify concurrent CLI authentication against isolated PostgreSQL and Redis.
[group('test')]
ci-test-login-atomic:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    for test in cli/cli-auth-atomic.e2e.test.ts cli/postgres-rate-window.e2e.test.ts; do
      env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
        DOCKER_HOST="$host" E2E_AUTH_TEST_POSTGRES_IMAGE="${E2E_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" \
        E2E_ATOMIC_LOGIN=1 E2E_AUTH_DATABASE_URL="${DATABASE_URL:?DATABASE_URL must point to a local test database}" \
        E2E_AUTH_REDIS_URL="${E2E_AUTH_REDIS_URL:?E2E_AUTH_REDIS_URL must point to an isolated local Redis instance}" \
        bun --no-env-file --no-install --config=/dev/null run --filter @internal/e2e test:run "$test" --no-passWithNoTests
    done

# Pin login fixtures to the trusted default daemon. The socket path itself cannot attest its daemon.
[group('test')]
ci-test-docker-host:
    #!/usr/bin/env bash
    set -euo pipefail
    case "$(uname -s)" in
      Darwin)
        account_home="$(env -i PATH="$PATH" HOME="${HOME:?}" node -e 'process.stdout.write(require("node:os").userInfo().homedir)')"
        socket="$account_home/.colima/default/docker.sock"
        ;;
      Linux) socket='/var/run/docker.sock' ;;
      *) echo 'Login tests require the default Colima or Linux Docker socket' >&2; exit 1 ;;
    esac
    if [[ "$socket" == *$'\n'* || "$socket" == *$'\r'* || "$socket" == *'%'* || "$socket" == *'?'* || "$socket" == *'#'* || "$socket" == *'\'* ]]; then
      echo 'The trusted Docker socket path is invalid' >&2
      exit 1
    fi
    resolved="$(cd -P "$(dirname "$socket")" && pwd -P)/$(basename "$socket")"
    if [[ ! -S "$resolved" || -L "$resolved" ]]; then
      echo 'The trusted Docker socket is unavailable or not a Unix socket' >&2
      exit 1
    fi
    host="${DOCKER_HOST:-unix://$socket}"
    if [[ "$host" != "unix://$socket" && "$host" != "unix://$resolved" ]]; then
      echo 'Login tests require the trusted default Docker socket' >&2
      exit 1
    fi
    printf '%s' "$host"

# Prepare the images used by the owned login-test services.
[group('test')]
ci-prepare-login-images:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    config="$(mktemp -d "${TMPDIR:-/tmp}/tank-login-docker-config-XXXXXXXX")"
    trap 'rm -rf -- "$config"' EXIT
    for image in postgres:16 postgres:17-alpine redis:7-alpine; do
      env -i PATH="$PATH" HOME="${HOME:?}" DOCKER_HOST="$host" DOCKER_CONFIG="$config" docker image inspect "$image" >/dev/null 2>&1 || \
        env -i PATH="$PATH" HOME="$HOME" DOCKER_HOST="$host" DOCKER_CONFIG="$config" docker pull "$image"
    done
# Exercise deadline and rate-window races against owned PostgreSQL and Redis.
[group('test')]
ci-test-login-deadline:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    if [[ -n "${TANK_AUTH_DEADLINE_DOCKER_HOST:-}" && "$TANK_AUTH_DEADLINE_DOCKER_HOST" != "$host" ]]; then
      echo 'The deadline test must use the prepared local Docker daemon' >&2
      exit 1
    fi
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      DOCKER_HOST="$host" TANK_AUTH_DEADLINE_DOCKER_HOST="$host" TANK_AUTH_DEADLINE_RACE_TEST=1 \
      bun --no-env-file --no-install --config=/dev/null run --filter registry test src/lib/auth/__tests__/cli-store-deadline-race.test.ts --no-passWithNoTests

# Exercise retry, clock and counter behavior against independently owned services.
[group('test')]
ci-test-login-reliability:
    #!/usr/bin/env bash
    set -euo pipefail
    just --quiet ci-test-docker-host >/dev/null
    cd apps/registry
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      NODE_ENV=test BUN_CONFIG_NO_DOTENV=1 BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
      bun --no-env-file --no-install ./node_modules/vitest/vitest.mjs run \
      --config src/services/kv/__tests__/pr492-isolated.vitest.config.ts --no-passWithNoTests

# Verify API-key ownership against both migrated and schema-pushed databases.
[group('test')]
ci-test-api-key-ownership:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      DOCKER_HOST="$host" E2E_AUTH_TEST_POSTGRES_IMAGE="${E2E_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" \
      E2E_MIGRATED_API_KEYS=1 bun --no-env-file --no-install --config=/dev/null run --filter @internal/e2e test:run \
      cli/pr492-migrated-api-keys.e2e.test.ts --no-passWithNoTests

# Verify the resolved server-function packages include the CVE-2026-102989 fix.
[group('test')]
ci-test-server-function-security:
    bun run --filter @internal/bdd test:system steps/system/server-function-security.steps.ts --no-passWithNoTests

# Exercise server rendering against the built registry and isolated PostgreSQL.
[group('test')]
ci-test-registry-render:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      DOCKER_HOST="$host" E2E_AUTH_TEST_POSTGRES_IMAGE="${E2E_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" E2E_PRODUCTION_RENDER=1 \
      bun --no-env-file --no-install --config=/dev/null run --filter @internal/bdd test:system steps/system/registry-render.steps.ts --no-passWithNoTests

# Install a dedicated, pinned Chrome Headless Shell for the browser login test.
[group('test')]
ci-install-cli-login-browser:
    env -i PATH="$PATH" HOME="${HOME:?}" node e2e/helpers/browser-binary.mjs --install

# Exercise the CLI login flow against an owned production-build registry.
[group('test')]
ci-test-cli-login:
    #!/usr/bin/env bash
    set -euo pipefail
    host="$(just --quiet ci-test-docker-host)"
    browser="${TANK_TEST_BROWSER_PATH:-$(env -i PATH="$PATH" HOME="${HOME:?}" node e2e/helpers/browser-binary.mjs --path)}"
    env -i PATH="$PATH" HOME="${HOME:?}" TMPDIR="${TMPDIR:-}" CI="${CI:-}" NO_COLOR="${NO_COLOR:-}" \
      DOCKER_HOST="$host" E2E_AUTH_TEST_POSTGRES_IMAGE="${E2E_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}" \
      E2E_FULL_LOGIN=1 E2E_LOGIN_DATABASE_URL="${DATABASE_URL:?DATABASE_URL must point to a local test database}" \
      TANK_TEST_BROWSER_PATH="$browser" bun --no-env-file --no-install --config=/dev/null run --filter @internal/e2e test:run cli/login-flow.e2e.test.ts --no-passWithNoTests

# just db <action> - database and data operations
# just db generate          - create a new Drizzle migration SQL file (registry)
# just db push              - apply current schema directly to Postgres (no migration file)
# just db seed              - populate registry with starter productivity skills
[group('db')]
db action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        generate)        cd apps/registry && bunx drizzle-kit generate ;;
        push)            bun scripts/ensure-pg-trgm.mjs && (cd apps/registry && bunx drizzle-kit push) ;;
        seed)            bash scripts/seed-productivity-skills.sh ;;
        *) echo "Unknown action: {{action}}. Use: generate, push, seed" && exit 1 ;;
    esac

# just docker <action> - manage local infra via docker-compose
# just docker up             - start Postgres, MinIO containers (detached)
# just docker down           - stop and remove all infra containers
# just docker logs           - follow combined log output from all services
# just docker build          - build all Docker images
# just docker build-registry - build TanStack registry image
# just docker build-scanner  - build Python scanner image
[group('infra')]
docker action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        up)              docker compose --env-file .env -f infra/docker-compose.yml up -d ;;
        down)            docker compose --env-file .env -f infra/docker-compose.yml down ;;
        logs)            docker compose --env-file .env -f infra/docker-compose.yml logs -f ;;
        build)           docker compose --env-file .env -f infra/docker-compose.yml build ;;
        build-registry)  docker compose --env-file .env -f infra/docker-compose.yml build registry ;;
        build-scanner)   docker compose --env-file .env -f infra/docker-compose.yml build scanner ;;
        *) echo "Unknown action: {{action}}. Use: up, down, logs, build, build-registry, build-scanner" && exit 1 ;;
    esac

# just onprem <action>   - on-prem deployment operations
# just onprem first-run  - initialize full stack: health checks, migrations, MinIO buckets
# just onprem init-db    - run Drizzle migrations against Postgres
# just onprem doctor     - validate environment variables and service config
# just onprem backup     - full backup of Postgres database + MinIO objects
# just onprem smoke-test - quick health check of all running services
[group('infra')]
onprem action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        first-run)  bash scripts/onprem/first-run.sh ;;
        init-db)    bash scripts/onprem/init-db.sh ;;
        doctor)     bash scripts/onprem/config-doctor.sh ;;
        backup)     bash scripts/onprem/backup-all.sh ;;
        smoke-test) bash scripts/onprem/smoke-test.sh ;;
        *) echo "Unknown action: {{action}}. Use: first-run, init-db, doctor, backup, smoke-test" && exit 1 ;;
    esac

# just docs <action> - regenerate docs (apps/registry/public/docs + llms.txt)
# just docs gen   - regenerate CLI reference, API reference, and llms.txt from source
# just docs check - regenerate + git diff to verify no drift from source
[group('docs')]
docs action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        gen)   node scripts/gen-cli-docs.mjs && node scripts/gen-api-docs.mjs && node scripts/gen-llms-txt.mjs ;;
        check) node scripts/gen-cli-docs.mjs && node scripts/gen-api-docs.mjs && node scripts/gen-llms-txt.mjs && \
               git diff --exit-code || (echo "Docs are out of sync!" && exit 1) ;;
        *) echo "Unknown action: {{action}}. Use: gen, check" && exit 1 ;;
    esac

# just update          - update all dependencies to latest
# just update root     - root workspace only (bun update --latest)
# just update registry  - TanStack Start app deps
# just update cli      - CLI package deps
# just update mcp      - MCP server deps
# just update scanner  - Python scanner deps (uv sync --upgrade)
[group('deps')]
update target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    update_one() {
        case "$1" in
            root)     (bun update --latest && bun install) ;;
            registry) (cd apps/registry && bun update --latest && bun install) ;;
            cli)      (cd packages/cli && bun update --latest && bun install) ;;
            mcp)      (cd packages/mcp-server && bun update --latest && bun install) ;;
            scanner)  (cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv sync --upgrade) ;;
            *)        echo "Unknown target: $1" && exit 1 ;;
        esac
    }
    if [ "{{target}}" = "all" ]; then
        for t in root registry cli mcp scanner; do
            update_one "$t"
        done
    else
        update_one "{{target}}"
    fi

# ── CI/CD recipes (used by GitHub Actions, testable locally) ──

[group('ci')]
ci-test:
    bun turbo test

[group('ci')]
ci-lint:
    just verify-readonly

[group('ci')]
ci-build-cli VERSION:
    just bump {{VERSION}}
    just build internals-schemas
    just build internals-helpers
    just build adapters
    just build sdk
    just build cli
    just build mcp

[group('ci')]
ci-build-cli-binary VERSION PLATFORM:
    #!/usr/bin/env bash
    set -euo pipefail
    just ci-build-cli {{VERSION}}
    cd packages/cli && bun run build:bundle
    TARGET="bun-{{PLATFORM}}" OUTPUT_NAME="tank-{{PLATFORM}}" bun run build:sea

[group('ci')]
ci-publish-npm-nightly:
    #!/usr/bin/env bash
    set -euo pipefail
    SHORT_SHA=$(git rev-parse --short HEAD)
    NIGHTLY_VERSION="0.0.0-nightly.$(date -u +%Y%m%d).${SHORT_SHA}"
    just bump "${NIGHTLY_VERSION}"
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build internals-schemas
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build internals-helpers
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build adapters
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build sdk
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build cli
    TANK_REGISTRY_URL=https://nightly.tankpkg.dev just build mcp
    bash scripts/justfile/rewrite-workspace-deps.sh packages/cli "${NIGHTLY_VERSION}"
    bash scripts/justfile/rewrite-workspace-deps.sh packages/mcp-server "${NIGHTLY_VERSION}"
    bash scripts/justfile/rewrite-workspace-deps.sh packages/sdk "${NIGHTLY_VERSION}"
    (cd packages/cli && npm publish --no-git-checks --access public --tag nightly --provenance)
    (cd packages/mcp-server && npm publish --no-git-checks --access public --tag nightly --provenance)
    (cd packages/sdk && npm publish --no-git-checks --access public --tag nightly --provenance)

[group('ci')]
ci-publish-npm VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    just ci-build-cli {{VERSION}}
    (cd packages/sdk && bun run build)
    bash scripts/justfile/rewrite-workspace-deps.sh packages/cli "{{VERSION}}"
    bash scripts/justfile/rewrite-workspace-deps.sh packages/mcp-server "{{VERSION}}"
    bash scripts/justfile/rewrite-workspace-deps.sh packages/sdk "{{VERSION}}"
    (cd packages/cli && npm publish --no-git-checks --access public --provenance)
    (cd packages/mcp-server && npm publish --no-git-checks --access public --provenance)
    (cd packages/sdk && npm publish --no-git-checks --access public --provenance)

[group('ci')]
ci-build-pypi-sdk VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    python -m pip install --upgrade build twine packaging
    rm -rf packages/sdk-python/dist
    python -m build packages/sdk-python
    python -m twine check packages/sdk-python/dist/*
    ACTUAL=$(python -c "import os, glob; from packaging.utils import parse_wheel_filename; w = glob.glob('packages/sdk-python/dist/*.whl')[0]; print(parse_wheel_filename(os.path.basename(w))[1].public)")
    if [ "${ACTUAL}" != "{{VERSION}}" ]; then echo "Built version ${ACTUAL} != expected {{VERSION}}" >&2; exit 1; fi
    echo "tank-sdk ${ACTUAL} built"

[group('ci')]
ci-build-pypi-core-wheel TARGET:
    #!/usr/bin/env bash
    set -euo pipefail
    python -m pip install --upgrade maturin
    cd packages/sdk-core/crates/python
    maturin build --release --out dist --target "{{TARGET}}" --compatibility pypi

[group('ci')]
ci-build-pypi-core-sdist:
    #!/usr/bin/env bash
    set -euo pipefail
    python -m pip install --upgrade maturin
    cd packages/sdk-core/crates/python
    maturin sdist --out dist

[group('ci')]
ci-release-tag VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    TAG="v{{VERSION}}"
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git push origin HEAD:refs/heads/release/${TAG}
    just bump {{VERSION}}
    git add -A && git diff --cached --quiet || git commit -m "chore: bump version to {{VERSION}}"
    git tag -a "${TAG}" -m "Release ${TAG}"
    git push origin "${TAG}"
    git push origin HEAD

[group('ci')]
ci-merge-stable:
    #!/usr/bin/env bash
    set -euo pipefail
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git checkout stable
    git merge main --no-edit
    git push origin stable
    git checkout main

# Remove build artifacts (.next, dist, build, coverage) and turbo cache
[group('clean')]
clean:
    rm -rf dist build .next .turbo coverage .tanstack .output
    bun turbo clean 2>/dev/null || true

# Create the Cloudflare cache rule that makes public skill reads (/api/v1/skills/*)
# CDN-cacheable. The registry already emits Cloudflare-CDN-Cache-Control on
# anonymous reads, but Cloudflare ignores it without a matching cache rule — so
# retry storms hit Postgres and exhaust the Supabase pooler ("Tank network error
# after 6 attempts"). Idempotent-ish: creating a duplicate rule is safe to skip.
# Requires CLOUDFLARE_API_TOKEN (Zone > Cache Rules: Edit) and CLOUDFLARE_ZONE_ID.
[group('ops')]
cf-cache-rule:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
    : "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID}"
    RULESET_PHASE="http_request_cache_settings"
    api() { curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "$@"; }
    BASE="https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/rulesets"
    RULESET_ID=$(api "${BASE}/phases/${RULESET_PHASE}/entrypoint" | bun -e 'const d=await Bun.stdin.json(); process.stdout.write(d?.result?.id ?? "")' || true)
    RULE_BODY='{"expression":"(starts_with(http.request.uri.path, \"/api/v1/skills/\") and http.request.method eq \"GET\")","description":"tank: cache public skill reads","action":"set_cache_settings","action_parameters":{"cache":true,"edge_ttl":{"mode":"respect_origin"},"browser_ttl":{"mode":"respect_origin"}},"enabled":true}'
    if [ -z "${RULESET_ID}" ]; then
        echo "Creating cache ruleset + rule..."
        api -X POST "${BASE}" --data "{\"name\":\"Tank cache\",\"kind\":\"zone\",\"phase\":\"${RULESET_PHASE}\",\"rules\":[${RULE_BODY}]}" | bun -e 'const d=await Bun.stdin.json(); console.log(d.success ? "created" : JSON.stringify(d.errors))'
    else
        echo "Appending rule to ruleset ${RULESET_ID}..."
        api -X POST "${BASE}/${RULESET_ID}/rules" --data "${RULE_BODY}" | bun -e 'const d=await Bun.stdin.json(); console.log(d.success ? "added" : JSON.stringify(d.errors))'
    fi
