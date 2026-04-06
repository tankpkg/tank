# Tasks: Scan Bugfixes Trio

## Phase 1: detect-secrets Import Failure (Bug 1)

### T1: Diagnose the actual import failure

- **Files:** `apps/python-api/Dockerfile`, `apps/python-api/pyproject.toml`, `uv.lock`
- **What:**
  1. Build the Docker image locally: `docker build -f apps/python-api/Dockerfile .`
  2. Run: `docker run --rm <image> python -c "import detect_secrets; print(detect_secrets.__version__)"`
  3. Check `uv sync` output for errors
  4. Test with `python:3.12-alpine` to compare
- **Validate:** Identify the exact dependency that causes detect-secrets to be missing

### T2: Fix Dockerfile for reliable package installation

- **Files:** `apps/python-api/Dockerfile`
- **What:**
  - Downgrade to `python:3.12-alpine` (stable, broad wheel coverage, pyproject says `>=3.12`)
  - Add build-time health check: `RUN python -c "import detect_secrets; print('OK')"`
- **Validate:** `docker run --rm <image> python -c "from detect_secrets.core.scan import get_files_to_scan, scan_file; print('OK')"`

### T3: Improve detect-secrets error handling

- **Files:** `apps/python-api/lib/scan/stage4_secrets.py`
- **What:**
  1. In ImportError handler, add `sys.version` and `sys.platform` to the warning
  2. Change finding severity from `"low"` to `"medium"` (missing scanner = real gap)
  3. Add startup-time import check in `api/main.py`
- **Validate:** Failed import logs Python version, platform, full traceback

## Phase 2: GitHub Default Branch Resolution (Bug 2)

### T4: Add GitHub API default branch resolver

- **Files:** `apps/registry/src/lib/scan/url-expander.ts`
- **What:**
  1. Add `resolveDefaultBranch(owner, repo): Promise<string>`
  2. Call `GET api.github.com/repos/{owner}/{repo}` with 5s timeout
  3. In-memory cache: `Map<string, { branch: string; expires: number }>` with 10-min TTL
  4. Fallback chain on failure: HEAD probe `main` -> HEAD probe `master` -> return `"main"`
- **Validate:** `resolveDefaultBranch("contextLabs", "context7-docs")` returns `"master"`

### T5: Update all four hardcoded `main` references

- **Files:** `apps/registry/src/lib/scan/url-expander.ts`
- **What:** Make `expandGitHubFolder`, `expandSkillsShUrl`, `fetchSkillFileFromGitHub`, `scrapeAgentskillsGithub` async and use `resolveDefaultBranch()`
- **Validate:** All four paths resolve correct branch

### T6: Update expandScanUrl for async callers

- **Files:** `apps/registry/src/lib/scan/url-expander.ts`
- **What:** Since sub-functions are now async, ensure `expandScanUrl()` awaits them (already async)
- **Validate:** Full scan flow works for `main`, `master`, and other default branches

## Phase 3: Broken Links Verification (Bug 3)

### T7: Verify CWE links and scan page links after Bug 2 fix

- **Files:** `apps/registry/src/components/skills/findings-table.tsx`, `apps/registry/src/screens/scan-screen.tsx`
- **What:**
  1. After Bug 2 is fixed, test the originally failing scan URL
  2. Verify CWE link format: `https://cwe.mitre.org/data/definitions/${id}.html`
  3. Verify findings have `cwe_id` populated
  4. Verify all navigation links work
- **Validate:** All interactive elements on scan results page function correctly

### T8: Fix any identified link issues

- **Files:** TBD based on T7 findings
- **What:** Implement fixes for any actual broken links
- **Validate:** All links functional

## Dependencies

```
T1 -> T2 -> T3
T4 -> T5 -> T6
T6 -> T7 -> T8

Phase 1 (Bug 1) and Phase 2 (Bug 2) are independent.
Phase 3 (Bug 3) depends on Phase 2 completion.
```
