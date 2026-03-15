# Resolution 005: Security score inflated by non-security checks (GH-129)

**Finding:** Security score was too generous. `pass_with_notes` often appeared high, and non-security checks (file count, package size, docs) changed the main security score.
**Issue:** [tankpkg/tank#129](https://github.com/tankpkg/tank/issues/129)
**Date:** 2026-03-14
**Files changed:**

- `.idd/modules/scan/INTENT.md`
- `.idd/modules/scanner-stages/INTENT.md`
- `.bdd/features/scanner-stages/scanner-stages.feature`
- `packages/web/lib/audit-score.ts`
- `packages/web/lib/rescan.ts`
- `packages/web/app/api/v1/skills/confirm/route.ts`
- `packages/web/lib/__tests__/audit-score.test.ts`
- `packages/web/lib/__tests__/audit-score-security-strict.test.ts`

## Root Cause

1. Score computation mixed security and quality/hygiene checks into one 0-10 value.
2. Confirm/rescan flows only passed critical+high findings into the scoring function, ignoring medium/low findings and inflating many `pass_with_notes` scores.

## Fix

1. Reworked `computeAuditScore()` to calculate `score` from security signals only:
   - severity-weighted penalties from scanner findings
   - permission extraction mismatch penalty
   - 10/10 allowed only when scanner findings are present and zero findings exist
2. Marked detail rows with `category: security | quality` so quality checks remain visible but separate from the security score.
3. Updated confirm/rescan call sites to pass all scan findings (not only critical/high) into `analysisResults.securityIssues`.
4. Added strict tests for:
   - clean scan => 10/10
   - notes/findings => score < 10
   - quality-only changes do not alter security score

## Verification

- RED: `bun x vitest packages/web/lib/__tests__/audit-score-security-strict.test.ts` (failed before fix)
- GREEN: `bun x vitest packages/web/lib/__tests__/audit-score.test.ts packages/web/lib/__tests__/audit-score-security-strict.test.ts`
- Scanner suite: `just test-python` => 65 passed, 13 skipped
- LSP diagnostics: clean on all changed TypeScript files

## Follow-up (PR #188 review)

1. **Details breakdown now reconstructs score truthfully**
   - `details.maxPoints` now sums to exactly `10`.
   - `details.points` now reconstructs `score` exactly.
   - Quality checks remain visible but are informational (`maxPoints: 0`) so they do not inflate security scoring.

2. **Null scan fallback decision (documented + implemented)**
   - When scanner output is unavailable (`analysisResults: null`), scoring now supports `previousScore`.
   - Confirm/rescan callers pass the persisted `version.auditScore` as `previousScore`.
   - If no previous score exists, fallback remains `5.0`.
   - This avoids silent score drops for existing published skills during scan outages.

3. **Permission mismatch scoring branch removed**
   - Permission extraction mismatch is kept as an informational detail only.
   - It no longer subtracts points from security score until caller wiring + product decision are ready.

4. **Assertions tightened to exact contract values**
   - Severity mapping is now pinned with exact expectations: low=`8`, medium=`7`, high=`4`, critical=`0`.
   - BDD strictness step now asserts exact medium-finding score (`7`).
