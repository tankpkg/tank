# e2e — End-to-End Tests

## OVERVIEW

Real CLI-to-registry integration tests. Spawns actual `tank` CLI as child process, hits live (local) API. Tests run **sequentially** — producer flow must complete before consumer flow.

## STRUCTURE

```
e2e/
├── producer.e2e.test.ts   # Publish flow: login → init → publish
├── consumer.e2e.test.ts   # Install flow: search → install → verify → audit
├── helpers/
│   ├── cli.ts             # runTank() — spawns CLI as child process
│   ├── fixtures.ts        # createSkillFixture() — temp skill directories
│   └── setup.ts           # Environment setup and teardown
└── vitest.config.ts       # Sequential execution, long timeouts
```

## CONVENTIONS

- **Sequential execution**: `fileParallelism: false` + `sequence.concurrent: false` — tests depend on ordered state
- **Real CLI spawning**: `runTank()` executes `node dist/bin/tank.js` — no HTTP mocking
- **Temp fixtures**: `createSkillFixture()` creates disposable skill directories, cleaned in `afterEach`
- **Long timeouts**: 60s per test, 120s per hook (real HTTP + CLI startup overhead)
- **Env from root**: loads `.env.local` from project root (`envDir: ..`) — needs real credentials
- **`NO_COLOR=1`**: disables chalk to simplify output assertions
- **File pattern**: `*.e2e.test.ts` (distinguished from unit `*.test.ts`)
- **Run command**: `pnpm test:e2e` from root (NOT via Turbo)

## ANTI-PATTERNS

- **Never run E2E in parallel** — tests share registry state (published skills)
- **Never mock HTTP calls** — the point is real integration
- **Never run without `.env.local`** — needs `DATABASE_URL`, Supabase credentials
- **Never add to Turbo `test` task** — E2E has separate config and credentials requirement
