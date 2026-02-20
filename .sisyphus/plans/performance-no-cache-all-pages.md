# Performance No-Cache All Pages

## Context

### Original Request
Create performance tests for the app and resolve page loads taking over 3 seconds. Performance must improve even without caching.

### Interview Summary
**Key Discussions**:
- User requires no-cache performance, not cache masking.
- User clarified scope is broad: all pages should be fast and preserve good UI/UX behavior.

**Research Findings**:
- Existing test stack exists (Vitest + E2E), but no performance gates in CI.
- Significant latency risks are in API route query patterns and render-path blocking.
- `apps/web/lib/data/skills.ts` already documents/implements query-consolidation strategy and warns that `Promise.all` is not true parallelism with current DB client behavior.

### Metis Review
**Identified Gaps (addressed)**:
- Gap: ambiguous route priority for "all pages". Resolved via route tiering (P0/P1/P2) while maintaining all-pages scope.
- Gap: unclear perf targets. Resolved with explicit no-cache budgets and CI fail thresholds.
- Gap: risk of false optimization via `Promise.all`. Resolved with guardrail: use query consolidation, not pseudo-parallel fanout.
- Gap: CI realism. Resolved by adding seeded, deterministic test data + explicit perf measurement workflow.

---

## Work Objectives

### Core Objective
Establish enforceable no-cache performance tests and reduce worst page-load/API latency below agreed budgets, with measurable regression protection in CI.

### Concrete Deliverables
- Performance test suite for web routes and API routes (no-cache baseline).
- CI performance gate configuration and thresholds.
- Data seeding workflow for deterministic perf runs.
- Backend query-path optimizations on high-impact read endpoints.
- UI/perceived-load safeguards aligned with UX (loading boundaries, stable rendering behavior).

### Definition of Done
- [x] No-cache P0 route checks pass in CI with thresholds defined below.
- [x] Before/after metrics are stored and show material improvement from baseline.
- [x] P0 and P1 API/read paths meet response targets under seeded dataset.
- [x] Performance regressions fail CI on threshold breach.

### Must Have
- Real E2E/perf checks through public interfaces (browser/HTTP), no internal mocks.
- Deterministic seeded dataset for repeatable measurements.
- Explicit per-route budget thresholds.

### Must NOT Have (Guardrails)
- Do not add Redis/CDN/external caching to "solve" baseline speed.
- Do not use `Promise.all` as primary DB optimization strategy where client/connection semantics serialize round-trips.
- Do not optimize infrequent write routes as primary page-load fix.
- Do not break existing `apps/web/lib/db.ts` singleton connection pattern.

### Route Tiers (All-Pages Coverage)
- **P0 (hard gate now)**: `apps/web/app/page.tsx`, `apps/web/app/(registry)/skills/page.tsx`, `apps/web/app/(registry)/skills/[...name]/page.tsx`.
- **P1 (hard gate now)**: `GET /api/v1/search`, `GET /api/v1/skills/[name]`, `GET /api/v1/skills/[name]/versions`, `GET /api/v1/skills/[name]/[version]`.
- **P2 (track now, gate after stabilization)**: authenticated dashboard routes and deep registry subviews.

### Defaults Applied (Ambiguity Resolved)
- Data volume baseline for perf runs: deterministic medium-volume fixture (for example: 200 skills, 5 versions/skill, and realistic download rows) to expose round-trip costs.
- Performance measurement mode: no-cache baseline as authoritative; any warm/cached run is informational only.
- Initial optimization focus: read-heavy paths that impact page load first; write/publish endpoints are deprioritized.

### No-Cache Operational Definition
- Add explicit switch `TANK_PERF_MODE=1` for perf runs.
- When `TANK_PERF_MODE=1`, bypass in-process TTL caches in `apps/web/lib/data/skills.ts` (`queryCache`) by short-circuiting cache read/write helpers.
- Apply App Router no-store behavior explicitly at page/data entry points:
  - `apps/web/app/page.tsx`
  - `apps/web/app/(registry)/skills/page.tsx`
  - `apps/web/app/(registry)/skills/[...name]/page.tsx`
  - shared data calls in `apps/web/lib/data/skills.ts` used by these pages
- Force request-level no-store semantics for measured runs:
  - API handlers measured in P1 set `Cache-Control: no-store` explicitly (`search`, `skills/[name]`, `skills/[name]/versions`, `skills/[name]/[version]`).
  - P0 page measurements run with dynamic/no-store data path behavior enabled under `TANK_PERF_MODE=1`.
- Perf pass criteria must come from cold/no-cache runs only; warm-cache runs are logged separately and ignored for gate decisions.

### Budget File Contract (Concrete)
- File path: `apps/web/perf/budgets.json`.
- Result path: `apps/web/perf/results/latest.json` and CI artifact upload of `apps/web/perf/results/*.json`.
- Budget schema:
  - `webRoutes[]`: `{ route, ttfbMs, lcpMs, fcpMs, cls }`
  - `apiRoutes[]`: `{ route, p95Ms, sampleCount }`
  - `runs`: `{ webRunsPerRoute, apiRunsPerRoute, warmupRuns }`
  - `gating`: `{ webAggregation: "median", apiAggregation: "p95", maxVariancePct }`

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Vitest + E2E structure exists).
- **User wants tests**: YES (TDD mode for perf suite + optimization tasks).
- **Framework**: Vitest + Playwright/Lighthouse CI integration where applicable.

### TDD Workflow
For each perf/optimization task:
1. **RED**: Add failing budget/assertion test.
2. **GREEN**: Implement minimal optimization to pass threshold.
3. **REFACTOR**: Clean up implementation while keeping thresholds green.

### No-Cache Budget Defaults (Applied)
- P0 web pages: `TTFB < 800ms`, `LCP < 2.5s`, `FCP < 1.8s`, `CLS < 0.1`.
- P1 read APIs: `p95 < 800ms` with seeded dataset.
- P2 authenticated pages: `interactive <= 1.5s` target (tracked; gated after stabilization).

### Perf Harness Specification (Concrete)
- Runner: add Playwright-based perf project (or equivalent browser perf runner) integrated with existing test scripts.
- Dependencies: add required browser perf tooling and install browser binaries in CI before perf stage.
- Server mode for perf: run built app (`next build` + `next start`) for reproducible results.
- Artifacts: emit machine-readable metrics JSON (per route, per run) and a summarized comparison report for CI upload.
- Measurement profile: fixed environment profile (same browser/device mode, same number of runs, same seeded DB state).
- Measurement collection method:
  - Web metrics: collect TTFB/FCP/LCP/CLS via Performance APIs (`PerformanceNavigationTiming` + `PerformanceObserver`) from the browser context.
  - API metrics: collect route latency with repeated real HTTP calls and compute p95 from raw samples.
- Aggregation for gate: web uses median of 5 measured runs after 1 warm-up; API uses p95 of 20 samples after 2 warm-up calls.
- File placement:
  - Perf tests: `apps/web/tests/perf/**/*.test.ts`.
  - Perf helpers: `apps/web/tests/perf/helpers/*.ts`.
  - Perf config/utilities: `apps/web/perf/*.ts` and `apps/web/perf/budgets.json`.

### Server Orchestration Contract (Concrete)
- Perf tests are isolated from default unit test command.
- Command contract:
  - `pnpm --filter=web test` = existing unit/integration tests only.
  - `pnpm --filter=web run perf:test` = perf suite only.
  - root `pnpm run test:perf` = forwards to web perf command.
- `perf:test` script responsibilities:
  - build app (`pnpm --filter=web build`),
  - start app on fixed perf port,
  - wait for readiness endpoint,
  - run perf tests,
  - stop server cleanly and persist metrics artifact.

### CI Perf Environment Specification (Concrete)
- Provision PostgreSQL service container in CI perf job.
- Run schema provisioning with explicit command sequence:
  1. `pnpm --filter=web drizzle-kit push`
  2. `pnpm --filter=web run perf:seed`
- Run deterministic perf seeding step before measurements.
- Start web server in production mode and wait for readiness.
- Execute perf suite, enforce hard thresholds, and upload metric artifacts.
- Provision Supabase Storage dependency for routes requiring signed URLs:
  - Start local Supabase stack in CI (`supabase start`) before app startup.
  - Install/pin Supabase CLI version in CI before calling `supabase start`.
  - Export app env vars for perf job: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from local Supabase status output.
  - Keep `/api/v1/skills/[name]/[version]` in hard-gated perf runs (no route exclusion).

### Deterministic Seed Contract (Concrete)
- Seed tables (minimum): `skills`, `skill_versions`, `skill_downloads`, and required linked auth/org entities.
- Cardinality baseline: 200 skills, 5 versions per skill, and deterministic download rows per version.
- Idempotency strategy: truncate/clear perf-seed rows in fixed order then insert deterministic IDs (stable prefixes), not random UUID-only generation.
- CI invocation: explicit `perf:seed` command before perf tests.
- Storage seed contract:
  - For each seeded `skill_versions.tarball_path`, upload/create corresponding object in Supabase `packages` bucket.
  - Validate signed URL generation pre-check before perf run to avoid false 500s in perf gate.

---

## Task Flow

```
Task 1 -> Task 2 -> Task 3 -> Task 4
                           -> Task 5
Task 4 + Task 5 -> Task 6 -> Task 7 -> Task 8 -> Task 9
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 4, 5 | API and UI/perceived-load analysis can proceed independently once baseline exists |

| Task | Depends On | Reason |
|------|------------|--------|
| 2 | 1 | Need seeded deterministic dataset before reliable perf baselines |
| 3 | 2 | CI gates require validated baseline and chosen metrics |
| 6 | 4,5 | Regression tests and optimizations need upstream changes complete |

---

## TODOs

- [x] 1. Add deterministic performance test harness (RED-first)

  **What to do**:
  - Add perf-test structure for browser + API checks using existing test framework and browser perf tooling.
  - Add scripts to run perf tests against a production-started web server.
  - Install and configure required browser runtime for local and CI perf runs.
  - Add initial failing no-cache tests for P0 pages and P1 API reads.
  - Add budget/result file readers/writers at `apps/web/perf/budgets.json` and `apps/web/perf/results/*.json`.
  - Add explicit scripts:
    - `apps/web/package.json`: `perf:test`, `perf:seed`, `perf:report`
    - root `package.json`: `test:perf` proxy script

  **Must NOT do**:
  - No mocking of internal services/DB/auth.

  **Parallelizable**: NO (foundation task)

  **References**:
  - `e2e/vitest.config.ts` - existing E2E execution model/timeouts to extend for perf runs.
  - `apps/web/vitest.config.ts` - web Vitest config integration point for perf test project.
  - `package.json` - top-level scripts where perf commands will be introduced.
  - `apps/web/package.json` - web app script integration for build/start/perf orchestration.
  - `apps/web/app/page.tsx` - home page target in P0 no-cache measurements.
  - `apps/web/app/(registry)/skills/page.tsx` - listing page P0 target.
  - `apps/web/app/(registry)/skills/[...name]/page.tsx` - detail page P0 target.

  **Acceptance Criteria**:
  - [x] RED: Perf tests fail with current implementation and threshold assertions active.
  - [x] Command: `pnpm --filter=web run perf:test` executes perf suite and reports failures on budget breaches.
  - [x] Command: `pnpm --filter=web build && pnpm --filter=web start` is usable as perf target server.

- [x] 2. Seed deterministic dataset for reproducible no-cache measurements

  **What to do**:
  - Create/update repeatable seed mechanism for realistic fixed volume (skills/versions/downloads/users/org associations as needed).
  - Ensure test runs start from known state.
  - Define explicit dataset cardinality and keep it constant in CI.
  - Implement seed command that can be rerun safely with identical resulting dataset.

  **Must NOT do**:
  - No hidden dependence on production/stale local data.

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `e2e/helpers/setup.ts` - existing real-DB setup/cleanup pattern to adapt for deterministic perf seeding.
  - `apps/web/lib/db/schema.ts` - schema to generate realistic cardinality.
  - `apps/web/drizzle.config.ts` - DB environment assumptions for test data setup.

  **Acceptance Criteria**:
  - [x] Seed command creates deterministic dataset and is idempotent.
  - [x] Command: `pnpm --filter=web run perf:seed` succeeds from clean and pre-seeded states.
  - [x] Baseline run on same commit produces stable metric spread within agreed variance window.

- [x] 3. Add CI performance gates and budget enforcement

  **What to do**:
  - Add perf stage in CI to run no-cache perf suite and fail on threshold breaches.
  - Add budget config file with explicit route/metric thresholds.
  - Add concrete CI setup for perf: Postgres service, migration step, deterministic seed step, production server startup, and artifact upload.
  - Configure gate to read `apps/web/perf/budgets.json` and fail on aggregation breach.

  **Must NOT do**:
  - No advisory-only checks for P0/P1; threshold violation must fail CI.

  **Parallelizable**: NO (depends on Task 2)

  **References**:
  - `.github/workflows/ci.yml` - integration point for new perf job.
  - `package.json` - scripts to add/compose perf commands.
  - `apps/web/package.json` - app-local script hooks for perf test execution.

  **Acceptance Criteria**:
  - [x] CI has dedicated performance job and hard fail behavior.
  - [x] CI stores `apps/web/perf/results/*.json` as artifacts.
  - [x] Running CI locally/branch pipeline demonstrates fail/pass by threshold.

- [x] 4. Optimize P1 read API routes by query consolidation (not pseudo-parallel)

  **What to do**:
  - Refactor high-latency read endpoints to reduce DB round-trips (JOIN/subquery/CTE approach).
  - Prioritize `GET /api/v1/search`, `GET /api/v1/skills/[name]`, `GET /api/v1/skills/[name]/versions`, and `GET /api/v1/skills/[name]/[version]`.
  - For detail path used by `apps/web/app/(registry)/skills/[...name]/page.tsx`, explicitly reduce critical-path query count in `getSkillDetail()` and route handlers (including scan results/findings lookups where possible).

  **Must NOT do**:
  - Do not claim optimization by replacing sequential awaits with `Promise.all` if round-trips are still serialized.

  **Parallelizable**: YES (with Task 5)

  **References**:
  - `apps/web/lib/data/skills.ts` - proven consolidated-query pattern and perf commentary.
  - `apps/web/app/api/v1/search/route.ts` - current read/search hotspot.
  - `apps/web/app/api/v1/skills/[name]/route.ts` - skill metadata read path.
  - `apps/web/app/api/v1/skills/[name]/versions/route.ts` - versions list read path.
  - `apps/web/app/api/v1/skills/[name]/[version]/route.ts` - route with blocking query path.

  **Acceptance Criteria**:
  - [x] RED->GREEN: API perf tests pass with p95 threshold.
  - [x] Before/after report shows reduced DB round-trips and latency.

- [x] 5. Improve P0/P2 perceived-load UX without cache dependency

  **What to do**:
  - Add/adjust loading boundaries and eliminate avoidable render-blocking waterfalls in selected routes.
  - Ensure perceived responsiveness improves while preserving existing behavior.
  - Introduce stable `data-testid` targets for perf interaction checks where missing:
    - home primary action: `home-primary-cta`
    - skills list root/filter controls: `skills-list-root`, `skills-filter-input`
    - skill detail/readme/file explorer: `skill-detail-root`, `readme-root`, `file-explorer-root`

  **Must NOT do**:
  - No broad component architecture rewrite in this plan.

  **Parallelizable**: YES (with Task 4)

  **References**:
  - `apps/web/app/(dashboard)/layout.tsx` - blocking session call in layout.
  - `apps/web/app/(dashboard)/tokens/page.tsx` - client-fetch on mount pattern.
  - `apps/web/app/(registry)/skills/[...name]/skill-readme.tsx` - heavy render path candidate.

  **Acceptance Criteria**:
  - [x] UX remains functionally correct by executing objective route checks:
    - `/`: assert `home-primary-cta` visible and click causes observable state transition (URL/navigation or explicit UI state change).
    - `/skills`: assert `skills-list-root` visible; interact with `skills-filter-input` and verify list result state changes.
    - `/skills/[...name]`: assert `skill-detail-root` + `readme-root` + `file-explorer-root` visible; first explorer interaction updates selected item label/content region.
  - [x] P0 web vitals assertions pass in no-cache mode.

- [x] 6. Add/verify DB indexes for read-heavy paths used by perf targets

  **What to do**:
  - Add missing indexes supporting key read queries.
  - Generate migration and verify query plan improvement for targeted endpoints.

  **Must NOT do**:
  - No speculative index sprawl unrelated to measured hotspots.

  **Parallelizable**: NO (depends on Tasks 4 and 5)

  **References**:
  - `apps/web/lib/db/schema.ts` - existing index conventions.
  - `apps/web/drizzle/*.sql` - migration history pattern.

  **Acceptance Criteria**:
  - [x] Migration generated and applied in test environment.
  - [x] `EXPLAIN (ANALYZE, BUFFERS)` captured for targeted read queries before/after index changes.
  - [x] Measured route/query timings improve or remain stable with no regressions.

- [x] 7. Re-run full no-cache perf suite and lock final thresholds

  **What to do**:
  - Execute at least 5 web runs per P0 route and 20 API samples per P1 route (with warm-up) and finalize budget values based on stable post-optimization distribution.
  - Update budget config and test assertions to fixed values.

  **Must NOT do**:
  - No cherry-picked single-run threshold selection.

  **Parallelizable**: NO

  **References**:
  - Perf suite files from Task 1.
  - CI config from Task 3.

  **Acceptance Criteria**:
  - [x] Thresholds are evidence-backed and stable across repeated runs (max spread <= 15% for primary metrics, per budget contract).
  - [x] CI passes with optimized code and fails when thresholds are intentionally exceeded.

- [x] 8. Document performance methodology and regression protocol

  **What to do**:
  - Add concise docs for running perf tests locally and in CI.
  - Define what to do when perf gate fails (triage flow, required artifacts, owners).

  **Must NOT do**:
  - No vague “rerun until pass” guidance.

  **Parallelizable**: NO

  **References**:
  - `README.md` and `docs/` conventions.
  - `.github/workflows/ci.yml` final perf step details.

  **Acceptance Criteria**:
  - [x] New contributor can run perf checks from docs with exact commands.
  - [x] Failure protocol is explicit and actionable.

- [x] 9. Final validation and readiness gate

  **What to do**:
  - Run full verification matrix and capture final summary artifact.
  - Confirm “no-cache fast” goal is met for all defined route tiers.

  **Must NOT do**:
  - No release-ready claim without measured evidence.

  **Parallelizable**: NO

  **References**:
  - All prior task outputs and perf reports.

  **Acceptance Criteria**:
  - [x] Verification commands below all pass.
  - [x] Final report includes baseline vs optimized comparison per route tier.

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-2 | `test(perf): add no-cache baseline perf harness and seeded dataset` | perf tests + seed scripts | perf suite RED then deterministic baseline |
| 3 | `ci(perf): add performance budgets and fail gates` | CI workflow + scripts | CI perf job fail/pass check |
| 4-6 | `perf(api): consolidate read queries and add supporting indexes` | API routes + db schema/migrations | p95 route checks + migration verify |
| 5 | `perf(ui): reduce render-path blocking and add loading boundaries` | page/layout components | vitals assertions |
| 7-9 | `docs(perf): lock thresholds and document regression protocol` | budgets + docs | full matrix pass |

---

## Success Criteria

### Verification Commands
```bash
pnpm --filter=web test
pnpm run test:perf
pnpm test:e2e
pnpm build
```

### Final Checklist
- [x] All P0 pages meet no-cache budget thresholds.
- [x] P1 read APIs meet latency targets under seeded dataset.
- [x] CI enforces performance budgets with hard fail.
- [x] No reliance on new external caching layers.
- [x] UX remains stable and responsive under new performance changes.
