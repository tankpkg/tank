# Intent: Fix Scan & Navigation Bugs

## Problem

Five bugs blocking core user flows:

1. **Top-skills page shows no external skills** — `external_skills` table is empty because `fetchAndCacheExternalSkills()` is never called at runtime. The function exists but has zero callers outside the service file.
2. **Tank internal skills query is slow** — correlated subquery `SELECT sum(count) FROM skill_download_daily` runs per-row. No index on `(skill_id, date)` for the 30-day window. `count(*) OVER()` adds overhead. No caching layer.
3. **agentskills.co.il direct links don't pre-fill scan** — `/scan` route has no `validateSearch` for URL params. Navigating to `/scan?url=https://agentskills.co.il/...` does nothing — the input stays empty.
4. **detect-secrets doesn't run** — `detect-secrets>=1.5.0` is listed in requirements.txt but may not be installed in the scanner Docker image, or the import path may be wrong for the installed version. The ImportError fallback silently returns a "low" finding instead of real secrets.
5. **Top-skills page unreachable from navigation** — Navbar only has Skills/Scan/Docs. No link to `/scan/top-skills` anywhere in the UI. Page exists but is a dead end.

## Success Criteria

1. External skills populate on top-skills page after first API call (lazy cache warm)
2. Internal skills query returns in <2s for 20 results (index + query optimization)
3. `/scan?url=...` pre-fills the scan input and auto-starts scan
4. detect-secrets runs and reports real findings (verify Docker image has the library)
5. Top-skills accessible via navigation link from scan page

## Constraints

- External skill cache is lazy — warm on first API call, not on server start
- No breaking changes to API response shapes
- detect-secrets fix must work in Docker container (verify build context)
- Navigation changes must work on mobile and desktop

## Complexity: Medium

## Risk: Low — isolated fixes, no cross-cutting concerns
