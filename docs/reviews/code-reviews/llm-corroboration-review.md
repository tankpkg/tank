# Code Review: LLM Corroboration Layer

**Date:** 2026-03-04T12:30:00Z
**Branch:** feat/llm-corroboration
**Commit:** 92acbb3 (latest)
**Reviewer:** Claude Opus 4.6

## Summary

This feature adds LLM-based corroboration for security scanning findings, reducing false positives in the Tank package registry. The implementation includes a multi-provider fallback system (BYOLLM, Groq, OpenRouter), smart filtering to only send ambiguous findings to LLM, and graceful degradation when LLM is unavailable.

**`★ Insight ─────────────────────────────────────`**
The LLM corroboration feature uses a **safety-first design pattern** where the LLM can only downgrade finding severity, never upgrade it. This prevents false negatives from LLM hallucinations while still reducing false positives - a clever architectural choice for security tooling.
**`─────────────────────────────────────────────────`**

---

## Issues Found and Fixed

### Critical Issues

**None identified.**

---

### High Priority Issues

#### 1. Code Duplication Between Python API Implementations

**Status:** ✅ FIXED

**Files:**
- `apps/web/api-python/analyze/scan/llm_analyzer.py` (660 lines) - **REMOVED**
- `python-api/lib/scan/llm_analyzer.py` (660 lines) - **CANONICAL**

**Fix:** Removed the entire `apps/web/api-python/` directory. This was dead code not referenced anywhere in the codebase. The Next.js app uses `PYTHON_API_URL` environment variable to call the external Python API service (`python-api/`).

**Evidence:**
```bash
$ grep -r "api-python" apps/web/ --include="*.ts" --include="*.tsx"
apps/web/react-doctor.config.json:4:      "api-python/**",  # Only in ignore list
```

---

#### 2. Missing Return Value Handling in apps/web/api-python

**Status:** ✅ FIXED (by removing dead code)

**Original Problem:** The `stage3_detect_injection` function returns a tuple `(StageResult, Optional[LLMAnalysis])`, but the apps/web version wasn't unpacking it correctly.

**Fix:** Removed the entire `apps/web/api-python/` directory. The canonical implementation in `python-api/api/analyze/scan.py` already handles this correctly:
```python
result, llm_analysis = stage3_detect_injection(ingest_result, llm_analysis)
```

---

### Medium Priority Issues

#### 3. Inconsistent LLM Integration Approaches

**Status:** ✅ FIXED (by removing dead code)

**Original Problem:** Two different integration patterns existed:
- Post-pipeline approach (apps/web)
- In-stage approach (python-api)

**Fix:** Only one implementation remains (`python-api/`), which uses the in-stage approach. This is acceptable since Stage 3 is the only stage that produces ambiguous findings that benefit from LLM corroboration.

---

#### 4. LLMAnalysis Model Fields Differ Between Implementations

**Status:** ✅ FIXED (by removing dead code)

**Fix:** Only one `LLMAnalysis` model remains in `python-api/lib/scan/models.py`.

---

#### 5. Missing LLM Fields in Database Storage

**Status:** ✅ FIXED

**Files Modified:**
- `apps/web/lib/db/schema.ts` - Added `llmVerdict` and `llmReviewed` columns
- `python-api/api/analyze/scan.py` - Updated INSERT to include new fields
- `apps/web/drizzle/0009_llm_analysis_fields.sql` - Created migration

**Fix:**
```sql
ALTER TABLE scan_findings ADD COLUMN llm_verdict text;
ALTER TABLE scan_findings ADD COLUMN llm_reviewed boolean DEFAULT false;
```

```python
# Updated INSERT statement
(f.llm_verdict, f.llm_reviewed)  # Added to finding_values tuple
```

---

### Low Priority Issues

#### 6. Unused Imports

**Status:** ✅ NOT APPLICABLE

The review mentioned unused imports (`hashlib`, `field`), but these don't exist in the current version of the file. The code is clean.

---

#### 7. Hardcoded Timeout Values

**Status:** ⏸️ DEFERRED

**Rationale:** The timeout values are well-documented and environment-configurable via `LLM_SCAN_TIMEOUT_MS`. Centralizing further provides minimal benefit.

---

## Validation Results

```bash
✅ Python Tests: 35/35 passed (0.34s)
✅ Scan module imports: OK
✅ Dead code removed: apps/web/api-python/
✅ Database schema updated: llm_verdict, llm_reviewed columns
✅ Migration created: 0009_llm_analysis_fields.sql
```

---

## Files Modified

| File | Change |
|------|--------|
| `apps/web/api-python/` | **REMOVED** (entire directory - dead code) |
| `apps/web/lib/db/schema.ts` | Added `llmVerdict` and `llmReviewed` columns to `scanFindings` table |
| `python-api/api/analyze/scan.py` | Updated INSERT statement to store LLM fields |
| `apps/web/drizzle/0009_llm_analysis_fields.sql` | **CREATED** - Migration for new columns |

---

## Standards Compliance

| Standard | Status |
|----------|--------|
| TypeScript strict mode (frontend) | ✅ |
| Pydantic models for validation | ✅ |
| Async/await patterns | ✅ |
| Structured logging | ✅ |
| Graceful error handling | ✅ |
| Environment-safe configuration | ✅ |
| DRY principle | ✅ **FIXED** - removed duplicate code |
| Consistent patterns | ✅ **FIXED** - one implementation |

---

## Conclusion

**Overall Assessment:** ✅ PASS

**Summary:** All critical, high, and medium priority issues have been fixed:

1. ✅ Removed dead code (`apps/web/api-python/`)
2. ✅ Added database columns for LLM analysis fields
3. ✅ Updated Python API to persist LLM verdicts
4. ✅ Created database migration

**Remaining (Deferred):**
- Hardcoded timeout values (low priority, minimal benefit to change)

**Next Steps:**
- Run `/piv-speckit:validate` to perform final validation
- Apply database migration before deployment: `pnpm db:migrate`
