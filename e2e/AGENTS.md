# E2E — Integration Tests

## OVERVIEW

Real CLI-to-registry integration tests. Spawns the actual `tank` binary against a live registry with real database. Zero mocks.

## STRUCTURE

```
e2e/
├── producer.e2e.test.ts          # Publish flow (runs first)
├── consumer.e2e.test.ts          # Install flow (runs second)
├── integration.e2e.test.ts       # Cross-cutting scenarios
├── helpers/
│   ├── cli.ts                    # runTank() — spawns real CLI binary
│   ├── fixtures.ts               # createSkillFixture(), createConsumerFixture()
│   └── setup.ts                  # setupE2E() — creates user + API key + org
└── vitest.config.ts              # Sequential, 60s/120s timeouts
```

## CONVENTIONS

- **Sequential execution** — `fileParallelism: false`, producer before consumer
- **Real CLI spawning** — `node dist/bin/tank.js` (requires `pnpm build` first)
- **Zero mocks** — real HTTP, real DB, real Supabase storage
- **Unique `runId`** per test run — prevents collision between runs
- **Temp fixtures** — created in `os.tmpdir()`, cleaned in `afterEach`
- **File pattern** — `*.e2e.test.ts` (not `.test.ts`)
- **NO_COLOR=1** — disables chalk for parseable output
- **Env from root `.env.local`** — needs real credentials

## ANTI-PATTERNS

- **Never run in parallel** — tests have ordering dependencies
- **Never mock HTTP or DB** — defeats the purpose
- **Never add to Turbo `test` task** — E2E runs via `pnpm test:e2e` separately
- **Never skip cleanup** — fixtures accumulate and pollute runs
