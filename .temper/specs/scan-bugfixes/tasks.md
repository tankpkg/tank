# Tasks: Scan & Navigation Bugfixes

## Phase 1: External Skills Cache Warm (Bug 1)

### T1: Warm external skills cache on top-skills API call
- **Files:** `apps/registry/src/api/routes/v1/top-skills.ts`
- **What:** Call `fetchAndCacheExternalSkills()` before querying `getTopExternalSkills()`. Use a module-level `lastCacheWarm` timestamp to avoid re-fetching on every request — cache for 1 hour. If cache is empty (first call ever), fetch synchronously. Subsequent calls serve from DB until TTL expires.
- **Validate:** Hit `GET /api/v1/skills/top?source=external` — external skills appear

### T2: Add cache warm guard to prevent thundering herd
- **Files:** `apps/registry/src/services/external-skills.ts`
- **What:** Add `isCacheWarming` mutex flag. If a cache warm is already in progress, skip and serve stale data. Prevents multiple concurrent requests from all hitting the skills.sh API simultaneously.
- **Validate:** Concurrent requests don't all trigger fetch

## Phase 2: Internal Skills Query Optimization (Bug 2)

### T3: Optimize internal skills query
- **Files:** `apps/registry/src/api/routes/v1/top-skills.ts`
- **What:**
  1. Replace correlated subquery with a CTE that pre-aggregates download counts: `WITH download_counts AS (SELECT skill_id, sum(count)::int AS total FROM skill_download_daily WHERE date >= CURRENT_DATE - 30 GROUP BY skill_id)`
  2. LEFT JOIN the CTE instead of per-row subquery
  3. Keep `count(*) OVER()` for total (acceptable overhead)
- **Validate:** Query plan shows single pass over download table, not nested loop

### T4: Add composite index for download aggregation
- **Files:** `apps/registry/src/lib/db/schema.ts`, migration
- **What:** The existing unique index `skill_download_daily_skill_date_idx` on `(skill_id, date)` should cover the 30-day window query. Verify it's being used via `EXPLAIN`. If not, add an explicit index on `(skill_id, date, count)` for covering scans.
- **Validate:** `EXPLAIN` shows index scan, not seq scan

## Phase 3: agentskills.co.il Deep Link (Bug 3)

### T5: Add URL search param support to scan route
- **Files:** `apps/registry/src/routes/scan/index.tsx`
- **What:** Add `validateSearch` to the TanStack Router route config:
  ```ts
  export const Route = createFileRoute('/scan/')({
    validateSearch: z.object({ url: z.string().optional() }),
    component: ScanPage
  });
  ```
  This makes `/scan?url=...` work as a valid route with typed params.

### T6: Pre-fill and auto-scan from URL param
- **Files:** `apps/registry/src/screens/scan-screen.tsx`
- **What:**
  1. Accept `initialUrl` prop (or use `useSearch()` from TanStack Router)
  2. On mount, if `initialUrl` is set, populate the input and auto-trigger `handleScan()`
  3. This makes agentskills.co.il direct links work: external sites link to `/scan?url=https://agentskills.co.il/he/skills/...` and the scan auto-starts
- **Validate:** Navigate to `/scan?url=https://agentskills.co.il/he/skills/food-and-dining/israeli-grocery-price-intelligence` — scan auto-starts

## Phase 4: detect-secrets Fix (Bug 4)

### T7: Verify detect-secrets in Docker build
- **Files:** `apps/python-api/requirements.txt`, Dockerfile (or equivalent)
- **What:**
  1. Check `detect-secrets>=1.5.0` is in requirements.txt (confirmed: it is)
  2. Verify the Docker image build installs requirements.txt correctly
  3. Check if there's a version mismatch — `detect-secrets` v1.5.0+ changed the import path from `detect_secrets.core.scan` to `detect_secrets.main` or similar. Test the import in the container.
  4. The code at line 126 imports `from detect_secrets.core.scan import get_files_to_scan, scan_file` — verify these exist in the installed version
- **Validate:** Run `python -c "from detect_secrets.core.scan import get_files_to_scan, scan_file"` in the scanner container

### T8: Add detect-secrets version check + better fallback
- **Files:** `apps/python-api/lib/scan/stage4_secrets.py`
- **What:**
  1. Add explicit logging at import time showing detect-secrets version
  2. In the ImportError handler, log the full traceback at WARNING level (not just a silent low-severity finding)
  3. If detect-secrets imports but `get_files_to_scan` or `scan_file` don't exist, catch the AttributeError and fall back to custom-patterns-only mode with a clear log message
- **Validate:** `just test python-api`

## Phase 5: Navigation Link to Top-Skills (Bug 5)

### T9: Add top-skills link to scan page
- **Files:** `apps/registry/src/screens/scan-screen.tsx`
- **What:** Add a link below the scan page description: "Browse top skills" linking to `/scan/top-skills`. Use a subtle inline link, not a full nav item.
  ```tsx
  <p className="mt-1 text-muted-foreground">
    ...description...
    <Link to="/scan/top-skills" className="ml-1 text-blue-500 hover:underline">Browse top skills</Link>
  </p>
  ```
- **Validate:** Click "Browse top skills" from scan page — navigates to `/scan/top-skills`

### T10: Add back-link from top-skills to scan page
- **Files:** `apps/registry/src/screens/top-skills-screen.tsx`
- **What:** Add a link in the top-skills page header back to the scan page:
  ```tsx
  <Link to="/scan/" className="text-sm text-muted-foreground hover:text-foreground">Back to Scanner</Link>
  ```
- **Validate:** Navigate between scan and top-skills pages

## Dependencies

```
T1 -> T2 (cache warm first, then add guard)
T3, T4 (independent — query optimization)
T5 -> T6 (route param first, then UI consumption)
T7 -> T8 (verify first, then improve fallback)
T9, T10 (independent — navigation links)
```

## Open Questions

1. **Cache TTL** — 1 hour TTL for external skills. Is this right, or should it be configurable?
2. **Auto-scan UX** — Should auto-scan from URL param show a confirmation first, or just start immediately? Leaning toward immediate for deep-link use case.
3. **detect-secrets version** — Need to check what version is actually in the Docker image. If it's <1.5.0, the import path might be different.
