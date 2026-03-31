# Remove Security Score from Skill Page Sidebar

## Status: ✅ Complete

## Problem

The sidebar on skill pages displayed a numeric security score (e.g., "8/10") with a progress bar. This was **misleading** because:

1. **"8" looks like "8 failed"** - Users misinterpreted the number as a count
2. **Score doesn't match verdict** - A skill can score 6/10 but show "PASS WITH NOTES"
3. **Trust badge is clearer** - The SecurityOverview component already shows the correct status

## Solution

Replaced the numeric score display with a **trust-level-based description** using the existing `computeTrustLevel` function.

### Before (sidebar)
```
Security
─────────
8/10  [=====-====]
PASS WITH NOTES
● 2 medium findings
```

### After (sidebar)
```
Security
─────────
⚠️ Review Recommended
2 medium findings
```

## Files Changed

| File | Change |
|------|--------|
| `packages/web/components/security/SecuritySidebarSummary.tsx` | **NEW** - Compact trust badge display |
| `packages/web/components/security/index.ts` | Added export |
| `packages/web/app/(registry)/skills/[...name]/page.tsx` | Replaced score display with SecuritySidebarSummary |

## Verification

- ✅ Build passes
- ✅ Lint passes
- ✅ All 295 tests pass
