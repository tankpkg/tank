@_default:
    just --list

# Install all dependencies — Bun workspaces (TS) + uv sync (Python scanner)
[group('setup')]
install:
    bun install
    cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv sync

# Install git pre-push hook — auto-runs lint, typecheck, and tests on changed packages before push
[group('setup')]
hooks:
    ln -sf ../../scripts/pre-push .git/hooks/pre-push
    @echo "Pre-push hook installed"

# Print installed versions of required tools: node, bun, python, uv
[group('setup')]
doctor:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Node: $(node -v)"
    echo "Bun: $(bun -v)"
    echo "Python: $(python3 --version)"
    echo "uv: $(uv --version)"

# just dev         - start all dev servers in parallel via turbo
# just dev web     - Next.js dev server on :3000
# just dev web-astro - Astro dev server on :4321
# just dev web-tanstack - TanStack Start dev server on :3001
# just dev cli     - CLI in tsdown watch mode
# just dev mcp     - MCP server in tsx watch mode
# just dev scanner - Python scanner via uvicorn on :8000
[group('dev')]
dev target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        web)     bun run --filter @tankpkg/web dev ;;
        web-astro) cd apps/web-astro && bun run dev ;;
        web-tanstack) bun run --filter @tankpkg/web-tanstack dev ;;
        cli)     bun run --filter @tankpkg/cli dev ;;
        mcp)     bun run --filter @tankpkg/mcp-server dev ;;
        scanner) cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 ;;
        all)
            cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 &
            bun turbo dev &
            wait
            ;;
        *) echo "Unknown target: {{target}}. Use: web, web-astro, web-tanstack, cli, mcp, scanner, all" && exit 1 ;;
    esac

# just scan - send a sample skill tarball to the Python scanner API for quick verification
[group('dev')]
scan:
    bash scripts/test-scan.sh

# just build         - build all packages via turbo
# just build web     - Next.js production build
# just build web-astro - Astro production build
# just build web-tanstack - TanStack Start production build
# just build cli     - CLI via tsdown
# just build mcp     - MCP server via tsdown
# just build internals-schemas - shared contract schemas via tsdown
# just build internals-helpers - shared helpers via tsdown
# just build binary  - standalone CLI executable (tsdown + esbuild + SEA)
[group('build')]
build target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        web)     bun run --filter @tankpkg/web build ;;
        web-astro) cd apps/web-astro && bun run build ;;
        web-tanstack) bun run --filter @tankpkg/web-tanstack build ;;
        cli)     bun run --filter @tankpkg/cli build ;;
        mcp)     bun run --filter @tankpkg/mcp-server build ;;
        internals-schemas) bun run --filter @internals/schemas build ;;
        internals-helpers) bun run --filter @internals/helpers build ;;
        binary) bun run --filter @tankpkg/cli build:binary ;;
        all)    bun turbo build ;;
        *) echo "Unknown target: {{target}}. Use: web, web-astro, web-tanstack, cli, mcp, internals-schemas, internals-helpers, binary, all" && exit 1 ;;
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

    # Validate semver format (basic check)
    if ! [[ "{{VERSION}}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "Invalid version format: {{VERSION}} (expected X.Y.Z)"
      exit 1
    fi

    # Update package.json files
    jq ".version = \"{{VERSION}}\"" packages/cli/package.json > packages/cli/package.json.tmp && mv packages/cli/package.json.tmp packages/cli/package.json
    jq ".version = \"{{VERSION}}\"" apps/web/package.json > apps/web/package.json.tmp && mv apps/web/package.json.tmp apps/web/package.json
    jq ".version = \"{{VERSION}}\"" apps/web-astro/package.json > apps/web-astro/package.json.tmp && mv apps/web-astro/package.json.tmp apps/web-astro/package.json
    jq ".version = \"{{VERSION}}\"" apps/web-tanstack/package.json > apps/web-tanstack/package.json.tmp && mv apps/web-tanstack/package.json.tmp apps/web-tanstack/package.json
    jq ".version = \"{{VERSION}}\"" packages/mcp-server/package.json > packages/mcp-server/package.json.tmp && mv packages/mcp-server/package.json.tmp packages/mcp-server/package.json
    jq ".version = \"{{VERSION}}\"" packages/internals-schemas/package.json > packages/internals-schemas/package.json.tmp && mv packages/internals-schemas/package.json.tmp packages/internals-schemas/package.json
    jq ".version = \"{{VERSION}}\"" packages/internals-helpers/package.json > packages/internals-helpers/package.json.tmp && mv packages/internals-helpers/package.json.tmp packages/internals-helpers/package.json

    # Update Chart.yaml
    sed -i.bak "s/^appVersion: .*/appVersion: \"{{VERSION}}\"/" infra/helm/tank/Chart.yaml && rm -f infra/helm/tank/Chart.yaml.bak

    # Verify all versions match
    bash scripts/check-versions.sh

    echo "Bumped all versions to {{VERSION}}"

# just test         - run all unit tests via turbo
# just test web     - vitest for Next.js app
# just test web-astro - vitest for Astro app
# just test web-tanstack - vitest for TanStack Start app
# just test cli     - vitest for CLI commands
# just test mcp     - vitest for MCP server tools
# just test internals-schemas - vitest for shared contract schemas
# just test internals-helpers - vitest for shared helpers
# just test scanner - pytest for Python scanner
# just test e2e     - vitest integration tests against live API
# just test e2e-new - e2e tests against Astro app on :4321
# just test bdd     - Playwright + Gherkin browser scenarios
# just test perf    - load/performance tests
[group('test')]
test target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{target}}" in
        web)     bun run --filter @tankpkg/web test ;;
        cli)     bun run --filter @tankpkg/cli test ;;
        mcp)     bun run --filter @tankpkg/mcp-server test ;;
        internals-schemas) bun run --filter @internals/schemas test ;;
        internals-helpers) bun run --filter @internals/helpers test ;;
        scanner) cd apps/python-api && PYTHONPATH=. UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv run pytest -v ;;
        web-astro) cd apps/web-astro && bun run test ;;
        web-tanstack) bun run --filter @tankpkg/web-tanstack test ;;
        e2e)     bun vitest run --config .e2e/vitest.config.ts ;;
        e2e-new) E2E_REGISTRY_URL=http://localhost:4321 bun vitest run --config .e2e/vitest.config.ts ;;
        bdd)     bunx bddgen test -c .e2e/bdd/playwright.config.ts && bunx playwright test -c .e2e/bdd/playwright.config.ts ;;
        perf)    bun run --filter @tankpkg/web perf:test ;;
        all)     bun turbo test ;;
        *) echo "Unknown target: {{target}}. Use: web, web-astro, web-tanstack, cli, mcp, internals-schemas, internals-helpers, scanner, e2e, e2e-new, bdd, perf, all" && exit 1 ;;
    esac

# just perf        - run performance tests (alias for just perf test)
# just perf seed   - generate deterministic test data in Postgres
# just perf test   - run load tests against web app
# just perf report - generate performance report from results
# just perf all    - full pipeline: seed → test → report
[group('test')]
perf action='test':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        seed)   bun run --filter @tankpkg/web perf:seed ;;
        test)   bun run --filter @tankpkg/web perf:test ;;
        report) bun run --filter @tankpkg/web perf:report ;;
        all)    bun run --filter @tankpkg/web perf:seed && \
                bun run --filter @tankpkg/web perf:test && \
                bun run --filter @tankpkg/web perf:report ;;
        *) echo "Unknown action: {{action}}. Use: seed, test, report, all" && exit 1 ;;
    esac

# just db <action> [app] - database and data operations
# just db generate       - create a new Drizzle migration SQL file (web)
# just db generate-new   - create a new Drizzle migration SQL file (web-astro)
# just db push           - apply current schema directly to Postgres (no migration file)
# just db admin          - bootstrap the first admin user
# just db list           - list all registered users
# just db seed           - populate registry with starter productivity skills
[group('db')]
db action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        generate)     cd apps/web && bunx drizzle-kit generate ;;
        generate-new) cd apps/web-astro && bunx drizzle-kit generate ;;
        push)         bun scripts/ensure-pg-trgm.mjs && cd apps/web && bunx drizzle-kit push ;;
        admin)        bun run --filter @tankpkg/web admin:bootstrap ;;
        list)         bun run --filter @tankpkg/web admin:list ;;
        seed)         bash scripts/seed-productivity-skills.sh ;;
        *) echo "Unknown action: {{action}}. Use: generate, generate-new, push, admin, list, seed" && exit 1 ;;
    esac

# just docker <action> - manage local infra via docker-compose
# just docker up   - start Postgres, Redis, MinIO containers (detached)
# just docker down - stop and remove all infra containers
# just docker logs - follow combined log output from all services
[group('infra')]
docker action:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{action}}" in
        up)   docker compose --env-file .env -f infra/docker-compose.yml up -d ;;
        down) docker compose --env-file .env -f infra/docker-compose.yml down ;;
        logs) docker compose --env-file .env -f infra/docker-compose.yml logs -f ;;
        *) echo "Unknown action: {{action}}. Use: up, down, logs" && exit 1 ;;
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

# just docs <action> - regenerate web app docs (apps/web/content/docs + llms.txt)
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
# just update web      - Next.js app deps
# just update web-astro  - Astro app deps
# just update web-tanstack - TanStack Start app deps
# just update cli      - CLI package deps
# just update mcp      - MCP server deps
# just update scanner  - Python scanner deps (uv sync --upgrade)
[group('deps')]
update target='all':
    #!/usr/bin/env bash
    set -euo pipefail
    update_one() {
        case "$1" in
            root)    echo "→ root" && bun update --latest && bun install ;;
            web)     echo "→ web" && (cd apps/web && bun update --latest && bun install) ;;
            web-astro) echo "→ web-astro" && (cd apps/web-astro && bun update --latest && bun install) ;;
            web-tanstack) echo "→ web-tanstack" && (cd apps/web-tanstack && bun update --latest && bun install) ;;
            cli)     echo "→ cli" && (cd packages/cli && bun update --latest && bun install) ;;
            mcp)     echo "→ mcp-server" && (cd packages/mcp-server && bun update --latest && bun install) ;;
            scanner) echo "→ scanner" && (cd apps/python-api && UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/tank-uv-cache}" uv sync --upgrade) ;;
            *) echo "Unknown target: $1" && exit 1 ;;
        esac
    }
    if [ "{{target}}" = "all" ]; then
        for t in root web web-astro web-tanstack cli mcp scanner; do
            update_one "$t"
        done
    else
        update_one "{{target}}"
    fi

# Remove build artifacts (.next, dist, build, coverage) and turbo cache
[group('clean')]
clean:
    rm -rf dist build .next .turbo coverage
    bun turbo clean 2>/dev/null || true
