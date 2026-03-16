# Testing Reference

Current testing layers, helper entrypoints, and repo-specific constraints.

## Layers

- `unit` → narrow logic and schema checks
- `BDD` → executable behavior specs in `bdd/`
- `E2E` → full-stack regression checks in `e2e/`

## BDD Layout

- system behavior → `bdd/features/system/` + `bdd/steps/system/`
- browser shared behavior → `bdd/features/browser/shared/`
- browser Next-only behavior → `bdd/features/browser/next/`
- browser TanStack-only behavior → `bdd/features/browser/tanstack/`
- Playwright browser config → `bdd/playwright.config.ts`
- Vitest system behavior config → `bdd/vitest.config.ts`

## E2E Layout

- `e2e/cli/`
- `e2e/api/`
- `e2e/admin/`
- `e2e/onprem/`
- shared helpers → `e2e/helpers/`
- target contract → `e2e/targets.ts`

## Helpers

Primary CLI helper: `e2e/helpers/cli.ts`

```ts
runTank(args, { cwd?, home?, env?, timeoutMs?, stdin? })
```

Key behavior:

- executes the built CLI
- overrides `HOME` when requested
- captures stdout/stderr/exitCode
- supports stdin-driven flows

Primary test setup helpers:

- `e2e/helpers/setup.ts`
- `bdd/support/setup.ts`
- `bdd/support/hooks.ts`

## Targeting

- `TANK_APP_TARGET=next` → run against the maintained Next app
- `TANK_APP_TARGET=tanstack` → run against TanStack
- `TANK_APP_TARGET=all` → run both target lanes when supported by the command

## Commands

- `bun run test:bdd:system`
- `bun run test:bdd:browser`
- `bun run test:bdd`
- `bun run test:e2e`
- `bun run test:e2e:tanstack`
- `bun run test:e2e:all`
- `just test bdd`
- `just test e2e`

## Smells

- touching the real `~/.tank/`
- parallelizing order-dependent E2E files
- reusing Next selectors in TanStack coverage without verifying the real UI
- documenting a helper signature that no longer matches the file

## Execution Notes

- `bun run test:bdd:browser` requires `bunx bddgen` first (generates step wiring from .feature files)
- Browser tests need a running dev server (`just dev registry` or `just dev registry-legacy`)
- E2E tests need built CLI (`bun run build` in packages/cli first)
- Admin E2E is opt-in: `RUN_ADMIN_E2E=1 bun run test:e2e`
- Never reuse Next.js selectors in TanStack tests — verify actual DOM first
