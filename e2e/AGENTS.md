# E2E — Integration Tests

## OVERVIEW

Real CLI-to-registry integration tests. Spawns the actual `tank` binary against a live registry with real database. Zero mocks. Tests run sequentially — producer tests (publish) must complete before consumer tests (install).

## STRUCTURE

```
e2e/
├── producer.e2e.test.ts          # Publish flow (runs first)
├── consumer.e2e.test.ts          # Install flow (runs second)
├── integration.e2e.test.ts       # Cross-cutting scenarios
├── admin.e2e.test.ts             # Admin operations (730 lines)
├── helpers/
│   ├── cli.ts                    # runTank() — spawns real CLI binary
│   ├── fixtures.ts               # createSkillFixture(), createConsumerFixture()
│   └── setup.ts                  # setupE2E() — creates user + API key + org
├── bdd/                          # BDD feature files + step definitions
│   ├── features/                 # Gherkin feature files (private-packages)
│   └── steps/                    # Step definitions (8 files)
└── vitest.config.ts              # Sequential execution, extended timeouts
```

### BDD Tests (Root `.bdd/` Directory)

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
│   └── mcp/                      # MCP tool scenarios
├── support/                      # Test support utilities
└── vitest.config.ts              # Sequential, 60s timeout
```

## TEST FILES

| File                      | Lines | Tests | Purpose                                |
| ------------------------- | ----- | ----- | -------------------------------------- |
| `producer.e2e.test.ts`    | ~400  | 8     | Publish skills, verify in registry     |
| `consumer.e2e.test.ts`    | ~500  | 10    | Install, update, verify, remove skills |
| `integration.e2e.test.ts` | ~300  | 6     | Search, permissions, audit             |
| `admin.e2e.test.ts`       | 730   | 12    | Admin operations, moderation           |

## KEY PATTERNS

### runTank() Helper

```typescript
export async function runTank(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; configDir?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }>;
```

Spawns `node dist/bin/tank.js` as a subprocess with real network calls.

### Test Isolation

- **Unique `runId`**: Generated per test run (UUID)
- **Separate `configDir`**: Each test gets its own `~/.tank/` equivalent
- **Temp fixtures**: Created in `os.tmpdir()`, cleaned in `afterEach`
- **Unique skill names**: Prefixed with `runId` to avoid collisions

## WHERE TO LOOK

| Task                 | Location                  | Notes                     |
| -------------------- | ------------------------- | ------------------------- |
| Add producer test    | `producer.e2e.test.ts`    | Tests that create skills  |
| Add consumer test    | `consumer.e2e.test.ts`    | Tests that install skills |
| Add integration test | `integration.e2e.test.ts` | Cross-cutting scenarios   |
| Add admin test       | `admin.e2e.test.ts`       | Admin-only operations     |
| Add BDD step         | `.bdd/steps/*.steps.ts`   | Root `.bdd/` directory    |
| Add BDD feature      | `.bdd/features/`          | Gherkin scenarios         |
| Modify CLI helper    | `helpers/cli.ts`          | runTank() implementation  |

## CONVENTIONS

- **Sequential execution** — `fileParallelism: false`, producer before consumer
- **Real CLI spawning** — `node dist/bin/tank.js` (requires `bun build` first)
- **Zero mocks** — real HTTP, real DB, real Supabase storage
- **Unique `runId`** per test run — prevents collision between runs
- **File pattern** — `*.e2e.test.ts` (not `.test.ts`)
- **Timeout**: 60s per test, 120s for hooks

## ANTI-PATTERNS

- **Never run in parallel** — tests have ordering dependencies
- **Never mock HTTP or DB** — defeats the purpose
- **Never add to Turbo `test` task** — E2E runs via `bun test:e2e` separately
- **Never skip cleanup** — fixtures accumulate and pollute runs
- **Never share `runId` between test files** — each file gets its own

## RUNNING TESTS

```bash
# E2E tests
bun build && bun test:e2e

# BDD tests
bun test:bdd

# Specific E2E file
bun vitest run e2e/producer.e2e.test.ts

# Debug output
TANK_DEBUG=1 bun test:e2e
```

## TEST ORDER

```
1. producer.e2e.test.ts   → login, init, publish, info
2. consumer.e2e.test.ts   → install, update, verify, permissions, remove
3. integration.e2e.test.ts → search, audit, full lifecycle
4. admin.e2e.test.ts      → user CRUD, org management, package moderation
```
