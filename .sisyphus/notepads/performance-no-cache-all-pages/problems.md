# Problems

## Task 1 — Performance Test Harness

### No real browser metrics (LCP/CLS approximated)
- Without Playwright or Lighthouse, LCP and CLS are approximated, not measured from real paint events.
- LCP is estimated from TTFB + content transfer time. CLS is hardcoded to 0 for SSR pages.
- If real browser metrics become required, Task 1 harness would need Playwright integration added.
- **Status**: Accepted trade-off for Task 1. Can revisit if budget assertions prove unreliable.

### Root `test:perf` proxy is slow
- `pnpm run test:perf` at root level triggers full Turbo pipeline including rebuild.
- Direct `pnpm --filter=web run perf:test` is faster for iterative development.
- **Status**: Known, documented. Not blocking.

### Perf test flakiness risk on resource-constrained CI
- Tight budgets (TTFB < 800ms) may flake on slow CI runners.
- `maxVariancePct: 15` in budgets.json provides some tolerance.
- May need CI-specific budget overrides or runner pinning in Task 3.
- **Status**: Deferred to Task 3 (CI gates).
