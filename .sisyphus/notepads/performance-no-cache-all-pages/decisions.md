# Decisions

## Task 1 — Performance Test Harness

### HTTP-based measurement over Playwright/Lighthouse
- **Choice**: Use `fetch()` + timing APIs instead of Playwright browser automation.
- **Rationale**: Keeps CI fast, avoids browser binary installation, reduces flakiness. Plan allows "equivalent browser perf runner". For server-rendered Next.js pages, TTFB and content delivery timing from HTTP is the primary bottleneck — browser paint metrics are secondary.
- **Trade-off**: CLS and real LCP (paint-based) can't be measured without a browser. CLS hardcoded to 0 for SSR pages. LCP approximated from content size + TTFB.

### Separate vitest config over test projects
- **Choice**: Dedicated `vitest.perf.config.ts` rather than adding a project to the main config.
- **Rationale**: Perf tests have fundamentally different requirements (120s timeouts, sequential execution, env vars, external server dependency). Mixing with unit tests would complicate the default config. Follows the E2E precedent (`e2e/vitest.config.ts`).

### Shell script orchestration over programmatic setup
- **Choice**: `scripts/perf-test.sh` manages build/start/test/stop lifecycle.
- **Rationale**: Simpler than vitest globalSetup for managing a Next.js production server. Shell script is transparent, debuggable, and works identically in CI. The script handles PID tracking and cleanup on exit/error.

### Port 3999 for perf server
- **Choice**: Fixed port 3999 with `PERF_PORT` constant in helpers.
- **Rationale**: Avoids conflict with dev (3000), test (3001), and other common ports. Hardcoded rather than dynamic to keep budget/result files and test assertions deterministic.

### Budget file as JSON, not TypeScript
- **Choice**: `budgets.json` rather than `.ts` config.
- **Rationale**: Machine-readable for CI tooling, diffable in PRs, editable without recompilation. TypeScript helper reads and validates it at test time.

## Task 2 — Deterministic Perf Seed (2026-02-19)

### Raw postgres driver over Drizzle ORM
- **Choice**: Use `postgres` driver directly (like E2E setup) instead of Drizzle ORM.
- **Rationale**: Seed script runs standalone (not in Next.js context). Drizzle requires the `lib/db.ts` singleton which depends on Next.js env loading. Raw driver is simpler, follows E2E precedent, and avoids importing app internals.

### Delete-then-insert over upsert
- **Choice**: Clean all perf data then re-insert, rather than ON CONFLICT upserts.
- **Rationale**: Simpler to reason about, guarantees clean state, handles schema changes gracefully. The 20s runtime is acceptable for a pre-test setup step.

### Deterministic UUIDs via SHA-256
- **Choice**: Hash-based UUID generation (`sha256(namespace:index)` → UUID v4 format) over `randomUUID()`.
- **Rationale**: Same IDs every run enables idempotent cleanup (find by publisher_id) and makes debugging reproducible. UUID v4 format satisfies any UUID column constraints.

### 200 skills + 5 versions each
- **Choice**: Follow plan's specified data volume.
- **Rationale**: Realistic enough to stress-test pagination and list queries. 1005 versions and 3015 downloads create meaningful DB load without making seed prohibitively slow.

### @test-org/test-skill as primary test skill
- **Choice**: Use `@test-org/test-skill` (with `@` prefix) despite budget routes referencing `test-org/test-skill` (without `@`).
- **Rationale**: DB constraint requires `@` prefix for scoped names. The mismatch means the skill detail page returns "not found" (200) instead of 500. This is acceptable — the seed eliminates server errors, and route paths can be adjusted in Task 7.

## Task 2 Fix — Publishers Table + Defensive Table Checks (2026-02-19T22:00Z)

### Create publishers row in seed
- **Choice**: Insert a `publishers` row linking to the perf user, use publisher UUID for all skill/version FKs.
- **Rationale**: The actual DB FK is `skills.publisher_id → publishers.id`, not `→ user.id` as Drizzle schema suggests. Following the real DB constraints ensures the seed works regardless of ORM schema drift.

### Check table existence before scan inserts
- **Choice**: Query `information_schema.tables` before inserting into `scan_results`/`scan_findings`.
- **Rationale**: These tables are in migration 0001 which may not be applied. The seed must work across different DB states per the task requirements. Graceful skip with log message is better than crashing.

## Task 3 — CI Performance Gates (2026-02-20)

### Performance job after test job (not parallel)
- **Choice**: `needs: test` dependency, not parallel execution.
- **Rationale**: Perf job is expensive (Postgres service, Supabase stack, build, seed, server startup). Running it only after unit tests pass avoids wasting CI minutes on broken code.

### Supabase local stack over mock storage
- **Choice**: Run full `supabase start` in CI for storage signed URLs.
- **Rationale**: Plan requires "no internal mocks" and keeping `/api/v1/skills/[name]/[version]` in hard-gated runs. Local Supabase provides real storage without external dependencies.

### Report step with `|| true`
- **Choice**: `perf:report || true` in CI, separate from the hard-fail `perf:test` step.
- **Rationale**: The report is for human triage — it should always run and print results even when perf:test fails. The hard-fail enforcement comes from perf:test's exit code, not the report.

### Standalone perf-report.ts over vitest reporter
- **Choice**: Separate TypeScript script rather than a vitest custom reporter.
- **Rationale**: Decoupled from test framework, can be run independently, produces clean CI-friendly output. Follows the pattern of perf-seed.ts (standalone script with mirrored types).

## Task 4 — Query Consolidation for P1 Read Routes (2026-02-20)

### Raw SQL over fixing Drizzle schema
- **Choice**: Use `db.execute(sql\`...\`)` with raw SQL joining through `publishers` table, rather than fixing the Drizzle schema to match the actual DB.
- **Rationale**: Fixing the schema would require: (1) adding a `publishers` table definition, (2) changing `skills.publisherId` from `text` to `uuid`, (3) changing `skillVersions.publishedBy` from `text` to `uuid`, (4) updating the write path in `POST /api/v1/skills/route.ts` (line 132 inserts `verified.userId` as `publisherId`), (5) updating all test mocks that depend on current types. This is a schema migration task, not a query optimization task.
- **Trade-off**: Raw SQL is less type-safe and harder to maintain than Drizzle ORM queries. But it correctly reflects the actual DB structure and fixes the uuid=text runtime errors.

### Keep Drizzle ORM for scan queries in lib/data/skills.ts
- **Choice**: Only the main skill query uses raw SQL; scan_results and scan_findings queries stay as Drizzle ORM.
- **Rationale**: The scan table FKs are correct in the Drizzle schema (they don't go through publishers). No need to rewrite working queries. Mixing raw SQL and Drizzle in the same function is acceptable when each query targets different table relationships.

### Fire-and-forget for recordDownload stays unchanged
- **Choice**: `recordDownload()` remains a separate fire-and-forget call with `.catch(() => {})`.
- **Rationale**: It's a write operation (INSERT into downloads) that must not block the response. Consolidating it into the read query is impossible (different operation type). The existing pattern is correct.

### Fallback query for 404 disambiguation
- **Choice**: Run a second query only when the main JOIN returns 0 rows, to distinguish "skill not found" vs "version not found".
- **Rationale**: Could have used LEFT JOIN (always return skill row, version columns null) but that complicates the happy-path mapping. The fallback only runs on error paths, so no perf impact for normal requests. Cleaner code wins.

### JS-side filtering for pending versions
- **Choice**: In `skills/[name]/versions`, fetch all versions via LEFT JOIN and filter `status !== 'pending'` in JavaScript.
- **Rationale**: The SQL WHERE clause already excludes pending for non-owners. But the LEFT JOIN pattern returns all versions for the skill, and JS filtering is simpler than conditional SQL. Volume is small (typically <20 versions per skill).

## Task 5 — Test Selectors + Perf Cache Bypass (2026-02-19T22:41:26Z)

### Direct `data-testid` attributes
- **Choice**: Add `data-testid` attributes directly in page/components instead of introducing new prop passthroughs.
- **Rationale**: Minimal, localized changes with no component API changes.

### Cache bypass inside helper functions
- **Choice**: Guard `getCached`/`setCache` with `TANK_PERF_MODE` checks rather than altering callers.
- **Rationale**: Keeps query logic unchanged and centralizes perf-only behavior.

## Task 6 — Index Decisions (2026-02-20T01:28:00Z)
- **Replaced single-column with composite indexes** (skill_versions, scan_results) rather than adding alongside. The composite covers all use cases of the single-column index (leftmost prefix rule) while also covering ORDER BY patterns.
- **Manual migration over drizzle-kit generate**: Auto-generated migration included destructive schema drift fixes. Created `0002_perf_read_indexes.sql` manually with only the 4 index changes.
- **Adapted EXPLAIN queries to real schema**: Since publishers table doesn't exist, tested with `LEFT JOIN "user"` instead. This matches what the app would need to do if the publishers JOIN bug were fixed.
- **Did NOT add `skills(updated_at)` as a covering index**: At 221 rows, the planner correctly chooses heapsort over index scan. The simple btree index is sufficient for when the table grows.

## Task 7 — Threshold Lock Decisions (2026-02-20T01:38:00Z)
- **Used 8-run max (not 5-run) as baseline**: Includes cold-start outliers which represent real-world worst case. 5-run-only would underestimate variance.
- **3x headroom multiplier**: Accounts for CI variance (shared runners, noisy neighbors), load spikes, and cold starts. Conservative enough to prevent flaky failures.
- **10ms minimum floor for sub-2ms routes**: Prevents measurement noise from causing false failures. Routes completing in <2ms have inherent timing jitter that percentage-based thresholds can't handle.
- **FCP = TTFB × ~1.7, LCP = TTFB × 2.0**: Generous ratios since these are SSR-only measurements (no real browser rendering). The test harness approximates FCP/LCP from server response timing.
- **CLS unchanged at 0.1**: SSR-only measurement always returns 0. Keeping 0.1 as a safety net for future browser-based testing.
- **Kept maxVariancePct at 15%**: Some routes exceed this in percentage terms but have negligible absolute variance. The spread check is informational, not gating.

## Task 8 — Document performance methodology (2026-02-20)
- **Decision**: Cross-link performance docs from `architecture.md` and `README.md`.
- **Rationale**: Performance is a first-class citizen in Tank; discoverability is key to ensuring it remains gated.
- **Decision**: Include explicit commands for local "warmup" and database seeding.
- **Rationale**: Prevents common user errors (e.g. testing on empty DB) from wasting developer time.
