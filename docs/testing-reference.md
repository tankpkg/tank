# Testing Reference

Current testing layers, helper entrypoints, and repo-specific constraints.

## Layers

Layer map:
- `unit → narrow logic and schema checks → package-local __tests__ + Python test_*.py`
- `BDD → executable behavior specs → .bdd/ + e2e/bdd/`
- `E2E → full-stack regression checks → e2e/`

## E2E Constraints

- E2E runs sequentially
- producer/consumer/admin flows have ordering dependencies
- use real binaries and real HTTP
- isolate home/config state per test run

## CLI Helper

Primary helper: `e2e/helpers/cli.ts`

```ts
runTank(args, { cwd?, home?, env?, timeoutMs?, stdin? })
```

Key behavior:

- executes `node packages/cli/dist/bin/tank.js`
- overrides `HOME` when requested
- captures stdout/stderr/exitCode
- supports stdin-driven interactive flows

## BDD Helpers

Root BDD support:

- `.bdd/interactions/mcp-client.ts`
- `.bdd/interactions/admin-api-client.ts`
- `.bdd/support/setup.ts`
- `.bdd/support/hooks.ts`

Browser BDD support:

- `e2e/bdd/playwright.config.ts`
- `e2e/bdd/steps/`

## Commands

- `just test`
- `just test-bdd`
- `just test-e2e`
- `just test-python`

## Testing Smells

- touching the real `~/.tank/`
- parallelizing order-dependent E2E files
- mocking away the behavior the test is supposed to validate
- documenting a helper signature that no longer matches the file
