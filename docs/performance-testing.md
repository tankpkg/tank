# Performance Testing Methodology & Regression Protocol

This document outlines the performance testing workflow for the Tank Registry, specifically focused on non-cached, production-like environments.

## Overview

Tank uses a custom performance harness that executes repeated runs against a production build of the web application. To ensure realistic "worst-case" scenarios, tests are run with `TANK_PERF_MODE=1`, which disables application-level caching (e.g., skill metadata and search results).

### Core Components

- **Harness**: Vitest-based tests located in `apps/web/tests/perf/`.
- **Budgets**: Defined in `apps/web/perf/budgets.json`.
- **Scripts**: 
  - `pnpm run perf:test`: Builds, starts the server, and runs measurements.
  - `pnpm run perf:report`: Compares latest results against budgets and exits with non-zero on failure.
  - `pnpm run perf:seed`: Seeds a deterministic database state for stable measurements.
- **Artifacts**: Results are saved to `apps/web/perf/results/*.json`. `latest.json` always points to the most recent run.

---

## Local Development Workflow

To verify performance changes locally:

1. **Seed the database**:
   ```bash
   pnpm --filter=web run perf:seed
   ```
2. **Run the performance suite**:
   ```bash
   pnpm run test:perf
   ```
   *Note: This will build the app and start a production server on port 3999.*
3. **Generate a report**:
   ```bash
   pnpm --filter=web run perf:report
   ```

### Disabling Cache (`TANK_PERF_MODE=1`)
When this environment variable is set:
- Skill detail lookups bypass internal caches and hit the database/storage directly.
- Search queries skip result caching.
- This ensures that code changes (e.g., inefficient SQL) are visible in performance metrics even if they would otherwise be hidden by cache.

---

## CI/CD Expectations

The `performance` job runs in CI after the standard test suite passes.

- **Hard Fail**: If any metric (TTFB, FCP, LCP, CLS for web; p95 for API) exceeds the budget defined in `budgets.json`, the `perf:report` step will fail, blocking the PR.
- **Environment**: CI runs against a real PostgreSQL instance and a local Supabase stack to ensure high-fidelity measurements.
- **Artifacts**: Every CI run uploads the JSON results as a workflow artifact named `perf-results`.

---

## Regression Protocol (Failure Triage)

When the performance gate fails in CI or locally, follow this protocol:

### 1. Inspect the Report
Run `pnpm run perf:report` (or check the CI log for the "Generate performance report" step). Identify which route and which metric failed.

- **TTFB Fail**: Likely a slow DB query, inefficient middleware, or expensive server-side computation.
- **FCP/LCP Fail**: Likely a large bundle size, slow-loading assets, or heavy hydration.
- **CLS Fail**: Layout shift caused by dynamic content or missing image dimensions.
- **High Variance**: If the absolute variance (Max - Min) is high (e.g., >20ms), ensure the server was "warmed up" before measurement. CI runs typically include warmup runs, but local development might need a second pass.

### 2. Compare with `latest.json`
Look at `apps/web/perf/results/latest.json`. Compare the `aggregated` values with previous runs (available in CI artifacts or your local history).
- Is it a slight drift (e.g., 5-10ms) or a major spike?
- Check the `runs` array to see if a single outlier skewed the median/p95.

### 3. Check for Cache Bypassing
Ensure your changes didn't accidentally introduce "cache-only" logic that performs poorly when `TANK_PERF_MODE=1` is active. Performance-critical paths MUST be efficient even when hitting the database.

### 4. Trace the Source
- **Database**: Use `EXPLAIN ANALYZE` on queries modified in the PR.
- **Frontend**: Run a local Lighthouse report or use React DevTools to find expensive re-renders or large components.

### 5. Adjusting Budgets
Budgets should only be adjusted if:
- A new feature intentionally increases the baseline (e.g., adding a complex chart to the dashboard).
- The infrastructure baseline has shifted.
- **Never** increase a budget to silence a regression without an architectural justification.
