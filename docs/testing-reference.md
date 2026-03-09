# Testing Reference

Tank has three testing layers: unit tests (Vitest/pytest, mocked), E2E tests (real CLI against live registry), and BDD tests (Gherkin scenarios via Playwright). E2E and BDD tests use zero mocks -- real HTTP, real database, real storage.

## E2E Test Execution Order

Tests run sequentially (`fileParallelism: false`) because they have ordering dependencies. Producer tests publish skills that consumer tests later install.

```
1. producer.e2e.test.ts    -> login, init, publish, info
2. consumer.e2e.test.ts    -> install, update, verify, permissions, remove
3. integration.e2e.test.ts -> search, audit, full lifecycle
4. admin.e2e.test.ts       -> user CRUD, org management, package moderation
```

| File                      | Tests | Purpose                                |
| ------------------------- | ----- | -------------------------------------- |
| `producer.e2e.test.ts`    | 8     | Publish skills, verify in registry     |
| `consumer.e2e.test.ts`    | 10    | Install, update, verify, remove skills |
| `integration.e2e.test.ts` | 6     | Search, permissions, audit             |
| `admin.e2e.test.ts`       | 12    | Admin operations, moderation           |

Timeouts: 60s per test, 120s for hooks.

## runTank() Helper

The core E2E helper in `e2e/helpers/cli.ts` spawns the real CLI binary as a subprocess:

```typescript
export async function runTank(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; configDir?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }>;
```

Runs `node dist/bin/tank.js` with real network calls. Requires `bun build` to have been run first so the compiled binary exists. The `configDir` option redirects the CLI's config directory away from the real `~/.tank/` for test isolation.

### Supporting Helpers

| Helper                   | File              | Purpose                             |
| ------------------------ | ----------------- | ----------------------------------- |
| `runTank()`              | `helpers/cli.ts`  | Spawn real CLI binary               |
| `createSkillFixture()`   | `helpers/fixtures.ts` | Create temp skill directory      |
| `createConsumerFixture()`| `helpers/fixtures.ts` | Create temp consumer directory   |
| `setupE2E()`             | `helpers/setup.ts`    | Create user + API key + org      |

## Test Isolation Pattern

Every test run is fully isolated from other runs:

- **Unique `runId`**: UUID generated per test run, used as prefix for all skill names to avoid collisions
- **Separate `configDir`**: Each test gets its own `~/.tank/` equivalent directory, preventing state leakage
- **Temp fixtures**: Created in `os.tmpdir()`, cleaned up in `afterEach` hooks
- **Unique skill names**: Prefixed with `runId` so parallel CI runs never collide

Never share a `runId` between test files. Never skip cleanup -- fixtures accumulate and pollute subsequent runs.

## BDD Test Structure

BDD tests live in two locations: root `.bdd/` for MCP/admin scenarios and `e2e/bdd/` for web-facing Playwright scenarios.

### Root `.bdd/` Directory

```
.bdd/
├── steps/                        # 12 step definition files
│   ├── auth.steps.ts             # Login/logout/whoami
│   ├── install.steps.ts          # Install flow
│   ├── init.steps.ts             # Init flow
│   ├── scan.steps.ts             # Security scanning
│   ├── audit.steps.ts            # Audit display
│   ├── verify.steps.ts           # Lockfile verification
│   ├── link.steps.ts             # Agent linking
│   ├── permissions.steps.ts      # Permission checking
│   ├── remove.steps.ts           # Skill removal
│   ├── update.steps.ts           # Update flow
│   ├── doctor.steps.ts           # Diagnostics
│   └── admin-rescan.steps.ts     # Admin rescan
├── features/                     # Gherkin feature files
│   ├── admin/                    # Admin scenarios
│   └── mcp/                      # MCP tool scenarios (12 features)
├── support/                      # Test support utilities + hooks
└── vitest.config.ts              # Sequential, 60s timeout
```

### E2E BDD Directory (`e2e/bdd/`)

```
e2e/bdd/
├── features/                     # Gherkin feature files
│   ├── cookie-consent/           # Cookie consent flows
│   ├── download-counting/        # Download tracking
│   ├── homepage-seo/             # SEO validation
│   └── private-packages/         # Access control, API bypass, publish, search
├── steps/                        # Step definitions (8 files)
│   ├── access-control.steps.ts
│   ├── api-bypass.steps.ts
│   ├── cookie-consent.steps.ts
│   ├── download.steps.ts
│   ├── homepage-seo.steps.ts
│   ├── publish.steps.ts
│   ├── search.steps.ts
│   └── fixtures.ts
└── playwright.config.ts
```

## Running Tests

```bash
# Unit tests (all workspaces)
just test

# E2E tests (requires build + .env.local)
just build && just test-e2e

# BDD tests
just test-bdd

# Specific E2E file
bun vitest run e2e/producer.e2e.test.ts

# Debug output
TANK_DEBUG=1 just test-e2e

# Python scanner tests
just test-python
```

## Key Rules

- Never run E2E tests in parallel -- they have ordering dependencies
- Never mock HTTP or DB in E2E -- defeats the purpose
- Never add E2E to the Turbo `test` task -- runs separately via `just test-e2e`
- File pattern: `*.e2e.test.ts` for E2E, `*.test.ts` for unit tests (never `.spec.ts`)
