# Security Tab Simplification + Badge in List

> **Parent Feature:** `skill-trust-badge` — This is Phase 2, applying trust badges to remaining views.

## Intent

Remove all misleading numeric scores from user-facing views. Users should see **security status at a glance** (Verified/Review Recommended/Concerns/Unsafe), not a number they have to interpret.

**Goal:** Every place a user sees skill trust information shows the badge system, not the 0-10 score.

## Reference: `tank/bulletproof`

The `tank/bulletproof` skill is the gold standard for how badges should display:
- **PASS** verdict → **Verified** badge (green)
- 0 findings → Clean trust indicator
- All quality checks pass → Full quality checklist

After this feature, visiting `/skills/tank/bulletproof` should show:
1. Skill list: **Verified** badge (not "Score: 10")
2. Security tab: **Verified** badge prominently, no 0-10 number
3. Quality checks: ✓ Documentation, ✓ Package Hygiene, ✓ Permissions, ✓ Security Scan

## Problem

1. **Skill list shows numeric score** - `skills/page.tsx` displays "Score: 8" instead of trust badge
2. **Security tab has numeric scoring** - Score breakdown with points is misleading

## Alternatives Considered

### A. Keep score in security tab only
- Show badge in list, keep 0-10 in security tab
- **Rejected:** "10/10 with notes" is still confusing. Score conflates unrelated concerns.

### B. Show score on hover/tooltip
- Badge primary, score as secondary info
- **Rejected:** Adds complexity, score is misleading regardless of prominence.

### C. Full badge replacement (Recommended)
- Remove score from all views
- Keep score in database for backward compatibility
- Badge + quality checks give users actionable info

## Current State

### Skill List (skills/page.tsx)
```tsx
// Line 225 - Shows numeric score
{skill.auditScore !== null && <ScoreBadge score={skill.auditScore} />}

// ScoreBadge component (lines 241-252)
function ScoreBadge({ score }: { score: number }) {
  if (score >= 7) return <Badge>Score: {score}</Badge>;
  if (score >= 4) return <Badge>Score: {score}</Badge>;
  return <Badge>Score: {score}</Badge>;
}
```

### Security Tab (skills/[...name]/page.tsx)
- `SecurityOverview` - Large 0-10 score, progress bar, verdict badge
- `ScoreBreakdown` - 8 criteria with points (e.g., "+1/1")
- `ScanningToolsStrip`, `FindingsList`, `ScanPipeline` - Keep

## Proposed Solution

### Part 1: Replace ScoreBadge with TrustBadge in List

The `skills-results.tsx` already uses `TrustBadge` correctly. Update `skills/page.tsx` to match.

```tsx
// Before
{skill.auditScore !== null && <ScoreBadge score={skill.auditScore} />}

// After
<TrustBadge
  trustLevel={computeTrustLevel(
    skill.verdict,
    skill.criticalCount,
    skill.highCount,
    skill.mediumCount,
    skill.lowCount
  )}
  findings={{
    critical: skill.criticalCount,
    high: skill.highCount,
    medium: skill.mediumCount,
    low: skill.lowCount
  }}
  size="sm"
/>
```

### Part 2: Simplify Security Tab

Replace numeric scoring with pass/fail indicators.

**New Security Tab Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  🛡️ VERIFIED                                            │
│     No security findings detected                       │
│     Scanned 2h ago • Duration: 3.2s                    │
└─────────────────────────────────────────────────────────┘

┌─ Quality Checks ────────────────────────────────────────┐
│  ✓ Documentation (SKILL.md, README, Description)       │
│  ✓ Package Hygiene (23 files, 1.2MB)                   │
│  ✓ Permissions (Network, File read, Subprocess)        │
│  ✓ Security Scan (No critical/high findings)           │
└─────────────────────────────────────────────────────────┘

[Scanning Tools Strip]
[Findings List]
[Scan Pipeline]
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/web/app/(registry)/skills/page.tsx` | Replace `ScoreBadge` with `TrustBadge` |
| `packages/web/components/security/SecurityOverview.tsx` | Remove score, show TrustBadge prominently |
| `packages/web/components/security/ScoreBreakdown.tsx` | → `QualityChecks.tsx`, remove points |
| `packages/web/app/(registry)/skills/[...name]/page.tsx` | Use new QualityChecks component |

## Files to Remove

| File | Reason |
|------|--------|
| `ScoreBadge` function in `skills/page.tsx` | Replaced by TrustBadge |

## Data Requirements

The `SkillSearchResult` type already includes:
- `verdict: string | null`
- `criticalCount: number`
- `highCount: number`
- `mediumCount: number`
- `lowCount: number`

No backend changes needed.

## Success Criteria

**Verify with `tank/bulletproof`:**

1. `/skills` list shows **Verified** badge (not "Score: 10")
2. No numeric score visible anywhere in skill list
3. Security tab shows **Verified** badge prominently (no 0-10 number)
4. Quality checks shown as pass/fail (no points like "+1/1")
5. Findings list and pipeline unchanged
6. All 4 quality check categories show ✓ for bulletproof:
   - ✓ Documentation
   - ✓ Package Hygiene
   - ✓ Permissions
   - ✓ Security Scan
