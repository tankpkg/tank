# Development Methodology

Tank uses IDD → BDD → TDD → E2E.

## Pipeline

1. IDD: define intent, constraints, examples, and success criteria.
2. BDD: express behavior as executable scenarios.
3. TDD: add or update narrow tests close to the changed logic.
4. E2E: validate the full stack with real binaries and real services.

Use the full pipeline for new capabilities, auth/permissions work, publish/install changes, and cross-surface behavior changes.

## IDD

IDD lives in `idd/`.

- `idd/modules/<capability>/INTENT.md` for capability-level intent
- `idd/active/` for migrations and cross-cutting initiatives

Good IDD output includes:

- goal and success criteria
- constraints that must stay true
- concrete examples that become tests
- unresolved questions at the end

## BDD

BDD lives in `bdd/`.

- `bdd/features/system/` + `bdd/steps/system/` for CLI, API, MCP, scanner, and admin behavior
- `bdd/features/browser/shared/` for cross-app browser behavior
- `bdd/features/browser/next/` for Next-only browser behavior
- `bdd/features/browser/tanstack/` for TanStack-only browser behavior
- `bdd/support/`, `bdd/interactions/`, `bdd/qa/`

Rules:

- scenario language stays behavior-first, not implementation-first
- shared browser scenarios cover only intentional shared contracts
- target-specific browser behavior must stay target-specific
- findings discovered by BDD go in `bdd/qa/findings/`
- fixes and follow-ups go in `bdd/qa/resolutions/`

## TDD

Unit tests stay colocated:

- CLI → `packages/cli/src/__tests__/`
- MCP → `packages/mcp-server/__tests__/`
- shared TS → `packages/internals-*/src/__tests__/`
- web app logic → app-local `__tests__`
- scanner → `apps/python-api/tests/`

Rules:

- TypeScript uses `*.test.ts`
- Python uses `test_*.py`
- bugfixes start with a failing test when practical

## E2E

E2E lives in `e2e/`.

- `e2e/cli/`
- `e2e/api/`
- `e2e/admin/`
- `e2e/onprem/`
- shared helpers in `e2e/helpers/`
- target contract in `e2e/targets.ts`

Execution stays sequential for order-dependent flows. Use `TANK_APP_TARGET=next|tanstack|all` when target selection matters.

## Practical Rules

- prefer real binaries and real services in BDD and E2E
- isolate `HOME` / config; never touch the real `~/.tank/`
- build before E2E when the helper requires compiled output
- for bugfixes: smallest failing test, smallest fix, separate refactor later

## Traceability

- BDD feature files reference their IDD source: `# Intent: idd/modules/<name>/INTENT.md`
- BDD scenarios reference constraint IDs inline: `# ── Permission rules (C3, C4) ──`
- Unit test files reference IDD constraints in header comments
- E2E test files reference which IDD modules they validate
