# Development Methodology

Tank uses IDD → BDD → TDD → E2E. This doc maps that workflow to the current repo structure.

## Pipeline

1. IDD: define intent and constraints before implementation
2. BDD: express behavior as scenarios
3. TDD: write failing unit tests, make them pass, then clean up
4. E2E: validate the full stack with real binaries and real services

Use the full pipeline for new capabilities. Skip or compress steps only for narrow bugfixes or low-risk internal refactors.

## Grug Rule

Prefer small, obvious steps over clever process theater. If the spec, tests, or rollout feel too complicated, reduce the design before adding more machinery.

## IDD

Intent-first work means the spec is a first-class artifact, not an afterthought.

- capture the user-facing or system-facing behavior first
- record constraints that must stay true
- add concrete examples that can become tests
- plans must be self-contained enough for a fresh-context agent

Good IDD output for this repo includes:

- goal and success criteria
- constraints around auth, permissions, storage, package boundaries
- examples that map cleanly to CLI/API/MCP behavior
- unresolved questions at the end

## BDD

BDD lives in the root `bdd/` tree.

BDD layout:

- `features → bdd/features/`
- `step definitions → bdd/steps/`
- `support → bdd/support/`
- `interactions → bdd/interactions/`
- `QA findings loop → bdd/qa/`

Current feature groups:

- `admin/`
- `mcp/`
- `search/`

Current BDD conventions:

- scenario language stays behavior-focused, not implementation-focused
- step defs call real infrastructure helpers where possible
- findings discovered by BDD are written to `bdd/qa/findings/`
- fixes are documented in `bdd/qa/resolutions/`

There is a second BDD stack for browser flows in `e2e/bdd/`, driven by Playwright.

## TDD

Unit tests are colocated.

Unit-test layout:

- `CLI → packages/cli/src/__tests__/`
- `Registry → apps/registry/src/__tests__/`
- `Schemas → packages/internals-schemas/src/__tests__/`
- `Helpers → packages/internals-helpers/src/__tests__/`
- `MCP → packages/mcp-server/__tests__/`
- `Scanner → apps/python-api/tests/ + test_*.py`

Current repo rules:

- TypeScript tests use `*.test.ts`, never `*.spec.ts`
- Python tests use `test_*.py`
- bugfixes should start with a failing test when practical
- do not refactor while the fix is still in flight

## E2E

E2E tests live in `e2e/`.

Current top-level files:

- `producer.e2e.test.ts`
- `consumer.e2e.test.ts`
- `integration.e2e.test.ts`
- `admin.e2e.test.ts`
- `search.e2e.test.ts`
- `scan.e2e.test.ts`
- `init.e2e.test.ts`
- `onprem.e2e.test.ts`

Execution is sequential. Tests have ordering dependencies.

Typical order:

1. producer
2. consumer
3. integration
4. admin

Other files cover focused end-to-end flows and still run under the same non-parallel config.

## Real-Infra Helpers

The core CLI helper is `e2e/helpers/cli.ts`.

```ts
runTank(args, { cwd?, home?, env?, timeoutMs?, stdin? })
```

What it really does:

- spawns `node packages/cli/dist/bin/tank.js`
- can override `HOME` for test isolation
- runs real HTTP against the configured registry
- returns `stdout`, `stderr`, and `exitCode`

Other current helpers:

- `e2e/helpers/fixtures.ts` for temp skill/consumer fixtures
- `e2e/helpers/setup.ts` for real test setup and auth/bootstrap flows

## Practical Rules

- prefer real binaries and real services in E2E and BDD
- use `configDir` or `HOME` isolation; never touch the user’s real `~/.tank/` in tests
- build before E2E when the helper needs compiled CLI output
- for bugfixes: smallest failing test, smallest fix, separate refactor later

## Decision Guide

Use IDD + BDD + TDD + E2E for:

- new commands or MCP tools
- auth or permissions changes
- publish/install flow changes
- admin or moderation behavior

Use TDD only, or TDD + focused integration tests, for:

- pure schema updates
- small shared-library logic changes
- isolated parser or formatter fixes
