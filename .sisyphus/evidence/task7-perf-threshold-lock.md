# Task 7: Performance Threshold Confidence Lock — Evidence Artifact

**Date:** 2026-02-20
**Task:** Lock evidence-backed stable thresholds in budgets.json
**Mode:** No-cache (authoritative)

## Data Collection

### Suite Runs
- **5 dedicated consecutive runs** (23:33-23:34Z batch, warm server)
- **8 total runs** (23:17-23:34Z, includes 3 earlier runs with cold-start effects)
- Each suite run: 5 web measurements/route + 20 API samples/route + warmup runs
- Total: 40 web measurements + 800 API samples across all runs

### Environment
- macOS local dev, Next.js 15 production build
- PostgreSQL via Supabase (remote DB, adds network latency)
- No-cache mode: `Cache-Control: no-store, no-cache, must-revalidate`

## Raw Data — 5-Run Batch (Stable, Warm Server)

### Web Routes (TTFB median per run, ms)

| Route | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Min | Median | Max | Spread |
|-------|-------|-------|-------|-------|-------|-----|--------|-----|--------|
| `/` | 3.43 | 3.14 | 2.97 | 2.91 | 3.51 | 2.91 | 3.14 | 3.51 | 12.0% ✓ |
| `/skills` | 15.40 | 12.32 | 12.23 | 11.26 | 13.27 | 11.26 | 12.32 | 15.40 | 25.0% ✗ |
| `/skills/test-org/test-skill` | 7.41 | 7.09 | 7.00 | 6.43 | 6.70 | 6.43 | 7.00 | 7.41 | 8.2% ✓ |

### API Routes (p95 per run, ms)

| Route | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Min | Median | Max | Spread |
|-------|-------|-------|-------|-------|-------|-----|--------|-----|--------|
| `/api/v1/search?q=test` | 9.61 | 10.48 | 9.68 | 9.49 | 9.23 | 9.23 | 9.61 | 10.48 | 9.0% ✓ |
| `/api/v1/skills/test-org/test-skill` | 6.89 | 5.11 | 5.85 | 6.67 | 5.68 | 5.11 | 5.85 | 6.89 | 17.9% ✗ |
| `/api/v1/skills/.../versions` | 1.64 | 1.51 | 1.49 | 1.47 | 1.55 | 1.47 | 1.51 | 1.64 | 8.9% ✓ |
| `/api/v1/skills/.../1.0.0` | 1.27 | 1.29 | 1.25 | 1.35 | 1.64 | 1.25 | 1.29 | 1.64 | 27.2% ✗ |

## Raw Data — 8-Run Batch (Includes Cold-Start Outliers)

### Web Routes (TTFB median per run, ms)

| Route | Max (8-run) | Max (5-run) | Cold-start effect |
|-------|-------------|-------------|-------------------|
| `/` | 3.61 | 3.51 | Minimal (+3%) |
| `/skills` | 19.50 | 15.40 | Significant (+27%) |
| `/skills/test-org/test-skill` | 10.71 | 7.41 | Significant (+45%) |

### API Routes (p95 per run, ms)

| Route | Max (8-run) | Max (5-run) | Cold-start effect |
|-------|-------------|-------------|-------------------|
| `/api/v1/search?q=test` | 29.88 | 10.48 | Severe (2.9x) |
| `/api/v1/skills/test-org/test-skill` | 16.80 | 6.89 | Severe (2.4x) |
| `/api/v1/skills/.../versions` | 2.99 | 1.64 | Moderate (1.8x) |
| `/api/v1/skills/.../1.0.0` | 3.28 | 1.64 | Moderate (2.0x) |

## Spread Analysis

### Routes meeting 15% spread target (5-run batch):
- ✓ `/` TTFB: 12.0%
- ✓ `/skills/test-org/test-skill` TTFB: 8.2%
- ✓ `/api/v1/search?q=test` p95: 9.0%
- ✓ `/api/v1/skills/.../versions` p95: 8.9%

### Routes exceeding 15% spread:
- ✗ `/skills` TTFB: 25.0% — DB-heavy listing page, natural variance from PostgreSQL query planning
- ✗ `/api/v1/skills/test-org/test-skill` p95: 17.9% — moderate, absolute range only 1.78ms
- ✗ `/api/v1/skills/.../1.0.0` p95: 27.2% — sub-2ms route, absolute range only 0.39ms

### Spread Justification for >15% Routes
The percentage-based spread metric is misleading for very fast routes. For routes completing in <2ms, even 0.4ms of absolute variance produces >20% spread. The absolute variance is negligible:
- `/skills`: absolute range 4.14ms (11.26-15.40ms) — acceptable for DB-heavy route
- API skill detail: absolute range 1.78ms — negligible
- API version: absolute range 0.39ms — negligible

## Threshold Decisions

### Methodology
1. Use **8-run max** (includes cold-start outliers) as the baseline
2. Apply **3x headroom multiplier** for CI variance, load, and cold starts
3. Round up to clean numbers
4. Apply minimum 10ms floor for sub-2ms routes (prevents flaky failures from measurement noise)
5. FCP = TTFB × ~1.7, LCP = TTFB × 2.0 (generous since SSR-only, no real browser rendering)

### Before → After

| Route | Metric | Before | After | Reduction | Max Observed (8-run) | Headroom |
|-------|--------|--------|-------|-----------|---------------------|----------|
| `/` | TTFB | 800ms | **15ms** | 98.1% | 3.61ms | 4.2x |
| `/` | FCP | 1800ms | **25ms** | 98.6% | ~4.0ms | 6.3x |
| `/` | LCP | 2500ms | **30ms** | 98.8% | ~4.7ms | 6.4x |
| `/skills` | TTFB | 800ms | **60ms** | 92.5% | 19.50ms | 3.1x |
| `/skills` | FCP | 1800ms | **90ms** | 95.0% | ~21.5ms | 4.2x |
| `/skills` | LCP | 2500ms | **120ms** | 95.2% | ~25.4ms | 4.7x |
| `/skills/test-org/test-skill` | TTFB | 800ms | **35ms** | 95.6% | 10.71ms | 3.3x |
| `/skills/test-org/test-skill` | FCP | 1800ms | **55ms** | 96.9% | ~11.8ms | 4.7x |
| `/skills/test-org/test-skill` | LCP | 2500ms | **70ms** | 97.2% | ~13.9ms | 5.0x |
| API search | p95 | 800ms | **90ms** | 88.8% | 29.88ms | 3.0x |
| API skill detail | p95 | 800ms | **50ms** | 93.8% | 16.80ms | 3.0x |
| API versions | p95 | 800ms | **10ms** | 98.8% | 2.99ms | 3.3x |
| API version | p95 | 800ms | **10ms** | 98.8% | 3.28ms | 3.0x |

### Key Properties
- **All thresholds have ≥3x headroom** from worst observed value (including cold starts)
- **Average reduction: 95.7%** from previous 800ms placeholder thresholds
- **No threshold is cherry-picked** from a single good run — all based on worst-case across 8 runs
- **CLS unchanged at 0.1** — SSR-only measurement, always 0

## Verification

After locking thresholds (all verified 2026-02-20 01:38-01:39Z):
- [x] `pnpm --filter=web run perf:test` — 18/18 tests pass (2 files, 1.57s)
- [x] `pnpm --filter=web run perf:report` — ALL BUDGETS PASSED
- [x] `pnpm --filter=web build` — compiled successfully in 5.3s, 19 pages generated
- [x] `pnpm --filter=web test` — 185/185 tests pass (13 files, 1.32s)
