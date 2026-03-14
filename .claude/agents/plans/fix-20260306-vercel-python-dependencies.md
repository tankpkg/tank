# Fix Plan: Vercel Python API Routing

**Issue:** Direct - FastAPI function invocation failed on Vercel
**Date:** 2026-03-06
**Branch:** fix/vercel-python-dependencies

---

## Root Cause

The `python-api/vercel.json` file was removed in commit 8b7faa3, breaking request routing to the FastAPI application. Without the rewrites configuration, Vercel doesn't forward requests to the Python serverless function, resulting in `FUNCTION_INVOCATION_FAILED`.

---

## Fix Strategy

Restore the `python-api/vercel.json` file with proper rewrites configuration to route all requests to the FastAPI application. This is a minimal, low-risk change that:

- Directly addresses the routing issue
- Required for Vercel to forward requests to Python serverless function
- Proven working pattern from earlier deployments

---

## Files to Modify

- `python-api/vercel.json` - Create with rewrites configuration
- `python-api/README.md` - Add documentation about Vercel deployment requirements

---

## Implementation Steps

1. **Create python-api/vercel.json** with rewrites
2. **Verify file creation** - Check that file exists and has correct content
3. **Add documentation** - Update README with deployment notes
4. **Commit and deploy** - Push changes to trigger Vercel rebuild

---

## Testing Strategy

**Integration tests (production):**

1. Wait for Vercel to rebuild after commit
2. Test `/health` endpoint returns `{"status": "healthy"}`
3. Test `/api/analyze/scan/health` endpoint
4. Verify security scanning endpoints work end-to-end

---

## Validation

**Validation steps:**

1. File created successfully
2. File has correct content
3. Git shows file as new/modified
4. Vercel deployment succeeds
5. All API endpoints accessible

---

## Prevention Measures

- [x] Add documentation to python-api/README.md about Vercel requirements
- [ ] Consider pre-commit hook to warn if vercel.json is deleted
- [ ] Add deployment smoke tests

---

## Acceptance Criteria

- [ ] `python-api/vercel.json` exists with rewrites
- [ ] Documentation added to README
- [ ] Files committed to feature branch
- [ ] PR created for review
- [ ] Vercel deployment succeeds after merge
- [ ] All API endpoints accessible
