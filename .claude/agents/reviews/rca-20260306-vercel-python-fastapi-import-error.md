# Root Cause Analysis: Vercel Python API FastAPI Import Error

**Date:** 2026-03-06 15:40 CET
**Issue:** FastAPI module not found on Vercel deployment
**Severity:** Critical (Production deployment broken)
**Status:** Root Cause Identified
**Tracker:** Direct (Vercel runtime error)

---

## Issue Summary

**Description:**
When accessing the Python API on Vercel, the deployment fails with a `ModuleNotFoundError: No module named 'fastapi'`. The error occurs during module import when Vercel's Python runtime attempts to execute `index.py`.

**Error Log:**
```
2026-03-06 14:37:54.318 [error] could not import "index.py":
Traceback (most recent call last):
  File "/var/task/_vendor/vercel_runtime/vc_init.py", line 588, in <module>
    __vc_spec.loader.exec_module(__vc_module)
  File "<frozen importlib._bootstrap_external>", line 999, in exec_module
  File "<frozen importlib._bootstrap>", line 488, in _call_with_frames_removed
  File "/var/task/index.py", line 2, in <module>
    from api.main import app
  File "/var/task/api/main.py", line 13, in <module>
    from fastapi import FastAPI
ModuleNotFoundError: No module named 'fastapi'
Python process exited with exit status: 1
```

**Expected Behavior:**
Vercel should install Python dependencies from `requirements.txt` and the FastAPI app should start successfully.

**Actual Behavior:**
Vercel fails to install dependencies, resulting in a module import error.

**Impact:**
- **Affected users:** All users attempting to use the Python API endpoints
- **Affected features:** All security scanning endpoints (`/api/analyze/scan`, `/api/analyze/security`, `/api/analyze/permissions`)
- **Severity:** Critical - Production API is completely non-functional

---

## Reproduction

**Can Reproduce:** Yes (Consistent)

**Reproduction Steps:**
1. Deploy current main branch to Vercel
2. Access any Python API endpoint (e.g., `https://python-api.tankpkg.dev/health`)
3. Observe 500 error with module import failure in logs

**Environment:**
- Mode: PRODUCTION (Vercel serverless)
- Runtime: Python 3.12 (as specified in `python-api/runtime.txt`)
- Platform: Vercel Serverless Functions

---

## Analysis

### Related Files

| File | Role | Status |
|------|------|--------|
| `requirements.txt` (root) | **MISSING** - Redirect to python-api/requirements.txt | Deleted (uncommitted) |
| `python-api/requirements.txt` | Contains actual dependencies including fastapi | Exists |
| `python-api/index.py` | Vercel entrypoint (imports api.main) | Exists |
| `python-api/api/main.py` | FastAPI application (imports fastapi) | Exists |
| `api/index.py` | Alternative entrypoint (adds python-api to path) | Exists |
| `python-api/runtime.txt` | Specifies Python 3.12 | Exists |
| `vercel.json` (root) | Monorepo build configuration | Exists |

### Code Flow

```
Vercel Request
    ↓
/var/task/index.py (Vercel copies python-api/index.py or api/index.py)
    ↓
from api.main import app
    ↓
python-api/api/main.py
    ↓
from fastapi import FastAPI  ← FAILS HERE (fastapi not installed)
    ↓
ModuleNotFoundError
```

### Dependency Resolution Chain

```
Vercel Build
    ↓
Looks for requirements.txt at project root
    ↓
NOT FOUND (file was deleted)
    ↓
No dependencies installed
    ↓
Runtime fails on import
```

---

## Root Cause

### Root Cause Statement

**The `vercel.json` rewrites configuration was removed** in commit 8b7faa3, preventing Vercel from routing requests to the FastAPI application. Without the rewrites, Vercel doesn't know how to forward requests to the Python serverless function.

### Secondary Issue (Initial Misdiagnosis)

The initial error (`ModuleNotFoundError: No module named 'fastapi'`) from 14:37 was caused by the `requirements.txt` not being deployed. This was resolved in commit 8b7faa3. However, a **new issue emerged**: the removal of `vercel.json` broke request routing.

### Why This Happened

1. **Premature Removal:** Commit 8b7faa3 removed `python-api/vercel.json` to "let Vercel auto-detect FastAPI"
2. **Incorrect Assumption:** The commit message assumed Vercel would auto-configure FastAPI routing
3. **Missing Validation:** No deployment test was performed after removing the configuration

### Git History Analysis

```
Recent commits affecting Vercel Python:
8b7faa3 fix(vercel): force dependency installation (#45)
2b634c9 fix(vercel): remove pyproject.toml, use requirements.txt only (#44)
c2e1975 fix(vercel): add build-system section to pyproject.toml (#43)

Current uncommitted changes:
 D requirements.txt  ← THIS IS THE PROBLEM
```

The deleted file content was:
```
# Vercel Python dependencies - redirects to python-api
-r python-api/requirements.txt
```

---

## Fix Strategy

### Recommended Fix: Restore vercel.json Rewrites Configuration

**Approach:**
Restore the `python-api/vercel.json` file with proper rewrites configuration to route all requests to the FastAPI application.

**Why This Fix:**
- Directly addresses the routing issue
- Required for Vercel to forward requests to Python serverless function
- Minimal configuration change
- Proven working pattern from earlier deployments

### Implementation Steps

1. **Create python-api/vercel.json:**
   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index" }
     ]
   }
   ```

2. **Commit and push:**
   ```bash
   git add python-api/vercel.json
   git commit -m "fix(vercel): restore rewrites configuration for FastAPI routing"
   git push
   ```

3. **Verify deployment:**
   - Wait for Vercel to rebuild
   - Test `/health` endpoint
   - Test `/api/analyze/scan/health` endpoint

### Files to Modify

| File | Change |
|------|--------|
| `python-api/vercel.json` | Create with rewrites configuration |

### Testing Strategy

**Unit tests:** Not applicable (deployment configuration issue)

**Integration tests:**
1. Verify Vercel build succeeds
2. Verify `/health` returns `{"status": "healthy"}`
3. Verify `/api/analyze/scan/health` returns health status
4. Verify security scanning endpoints work end-to-end

**Edge cases to test:**
- Cold start (first request after deployment)
- Multiple concurrent requests
- Request timeout scenarios

**Validation:**
- Monitor Vercel deployment logs for successful build
- Check Vercel function logs for successful startup
- Test all documented API endpoints

---

## Impact

### Current Impact

| Aspect | Impact |
|--------|--------|
| **Users affected** | All users of the Python API |
| **Features affected** | All security scanning endpoints |
| **Data impact** | None (no data corruption) |
| **Severity** | Critical - Complete service outage |

### Potential Side Effects

**None expected** - This is a straightforward restoration of a deleted file. The fix:
- Does not modify any application code
- Does not change dependency versions
- Does not affect other services (Next.js web app)

---

## Prevention

### How to Prevent This in Future

- [ ] **Add documentation:** Document Vercel's requirements.txt requirements in README
- [ ] **Add pre-commit hook:** Warn if requirements.txt at root is deleted
- [ ] **Improve deployment validation:** Add smoke test that checks API health after deployment
- [ ] **Add CI check:** Verify Python dependencies are installable before merging

### Recommended Documentation Addition

Add to `python-api/README.md`:
```markdown
## Vercel Deployment

The root `requirements.txt` file is required for Vercel's Python runtime.
It contains a redirect to this package's dependencies:

    -r python-api/requirements.txt

**Do not delete this file** or Vercel will fail to install dependencies.
```

---

## Alternative Solutions Considered

### Option 1: Let Vercel Auto-Detect (Current State - FAILED)
- **Approach:** Remove vercel.json and let Vercel auto-configure
- **Pros:** No configuration file needed
- **Cons:** Doesn't work for FastAPI - requests not routed correctly
- **Risk:** High - Already proven to fail (current state)

### Option 2: Use Vercel API Routes Configuration
- **Approach:** Configure routes in Vercel dashboard instead of vercel.json
- **Pros:** No file in repository
- **Cons:** Configuration drift between code and Vercel dashboard, not version controlled
- **Risk:** Medium - Harder to maintain and reproduce

### Option 3: Use Different Entrypoint Structure
- **Approach:** Restructure to put FastAPI app directly in index.py
- **Pros:** Simpler file structure
- **Cons:** Doesn't solve routing issue, adds complexity
- **Risk:** High - Unnecessary refactoring

**Chosen:** Restore `vercel.json` with rewrites (lowest risk, proven working pattern)

---

## Timeline

| Time | Event |
|------|-------|
| 2026-03-06 14:37 | Initial error: `ModuleNotFoundError: No module named 'fastapi'` |
| 2026-03-06 15:20 | Commit 8b7faa3: Fixed dependencies but removed vercel.json |
| 2026-03-06 15:40 | RCA created (misdiagnosed as requirements.txt issue) |
| 2026-03-06 15:55 | Testing revealed `FUNCTION_INVOCATION_FAILED` - actual issue identified |
| 2026-03-06 15:58 | Fix implemented: Restore vercel.json with rewrites |

---

## Next Steps

1. **Deploy fix:** Push changes to trigger Vercel rebuild
2. **Validate deployment:** Test `/health` and `/api/analyze/scan/health` endpoints
3. **Update documentation:** Add deployment notes to prevent recurrence
4. **Add monitoring:** Set up alerts for deployment failures
5. **Post-mortem:** Review deployment process for similar risks

---

**RCA Status:** Corrected and Implementation Ready
**Recommended Action:** Deploy fix immediately (Critical severity)
**Actual Fix:** Restore `python-api/vercel.json` with rewrites configuration
