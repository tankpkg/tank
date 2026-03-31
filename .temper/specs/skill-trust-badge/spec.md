# Skill Trust Badge System

## Problem Statement

The current 0-10 scoring system is **misleading**:

1. **Security is underweighted** - Only 2/10 points (20%) for "no security issues"
2. **Score conflates unrelated concerns** - Documentation quality + package structure + security
3. **"10/10 with notes" is confusing** - A skill can have medium security findings but still score 8/10
4. **PASS_WITH_NOTES ≠ PASS** - But the score doesn't reflect this distinction

### Example
```
Skill A: Perfect docs, perfect structure, 3 medium security findings
Score: 8/10, Verdict: PASS_WITH_NOTES
→ User sees "8/10" and thinks "good to use"

Skill B: Missing README, perfect security
Score: 9/10, Verdict: PASS
→ User sees similar score, doesn't notice security difference
```

## Current System Analysis

### Score Breakdown (`packages/web/lib/audit-score.ts`)
| Check | Points | Category |
|-------|--------|----------|
| SKILL.md present | 1 | Documentation |
| Description present | 1 | Documentation |
| Permissions declared | 1 | Metadata |
| No security issues | 2 | **Security** |
| Permission extraction match | 2 | **Security** |
| File count reasonable | 1 | Hygiene |
| README documentation | 1 | Documentation |
| Package size reasonable | 1 | Hygiene |

**Total: 10 pts** | Security: 4/10 (40%), but "no security issues" only fails for critical/high

### Verdict System (`packages/scanner/lib/scan/verdict.py`)
| Verdict | Condition | Current Score Impact |
|---------|-----------|---------------------|
| PASS | No findings | Full 2 pts |
| PASS_WITH_NOTES | Medium/low findings | Full 2 pts (!) |
| FLAGGED | 1-3 high findings | 0 pts |
| FAIL | Critical OR 4+ high | 0 pts |

**Gap**: Medium/low findings don't reduce score but do affect verdict.

## Proposed Solution: Trust Badge System

Replace the numeric score as the primary trust indicator with a **security-first badge system**.

### 1. Primary Display: Security Badge

```
┌─────────────────────────────────────┐
│  🔒 SECURITY VERIFIED               │  ← Clean scan
│     No security findings detected   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ⚠️ REVIEW RECOMMENDED              │  ← Medium/low findings
│     2 low, 1 medium findings        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  🚨 SECURITY CONCERNS               │  ← High/critical findings
│     1 high, 2 medium findings       │
└─────────────────────────────────────┘
```

### 2. Secondary Display: Quality Checks

**User decision: Option B** - Keep trust badge for security, show quality as a checklist.

Show individual pass/fail for each category:

```
🛡️ VERIFIED

Quality Checks:
✓ Documentation (README + SKILL.md + description)
✓ Package hygiene (size <5MB + file count <100)
✓ Permissions declared
```

**Categories:**

| Category | Checks | Grouping |
|----------|--------|----------|
| **Documentation** | SKILL.md, README, Description | All 3 pass = ✓ |
| **Package Hygiene** | File count <100, Size <5MB | Both pass = ✓ |
| **Permissions** | Declared, Extraction match | Both pass = ✓ |

**Display variants:**
- **Compact (card):** Just trust badge, no quality
- **Standard (detail page sidebar):** Trust badge + compact quality checklist
- **Full (security tab):** Trust badge + detailed breakdown per check

### 3. Score Becomes Optional

- Keep the 0-10 score for backward compatibility
- Show only in detailed view (Security tab)
- Remove from card/list view
- Remove "Highest Score" sort option (or relabel to "Best Quality")

## Implementation

### Phase 1: New Badge Components

**Files to create/modify:**
- `packages/web/components/security/TrustBadge.tsx` - New badge component
- `packages/web/components/security/QualityChecks.tsx` - Quality indicators
- `packages/web/lib/trust-level.ts` - Trust level computation

**Trust Level Logic:**
```typescript
type TrustLevel = 'verified' | 'review_recommended' | 'concerns' | 'unsafe';

function computeTrustLevel(verdict: string, findings: Findings): TrustLevel {
  if (verdict === 'fail') return 'unsafe';
  if (verdict === 'flagged') return 'concerns';
  if (verdict === 'pass_with_notes') return 'review_recommended';
  return 'verified'; // pass
}
```

### Phase 2: Update Display Components

**Skill Card (list/grid view):**
- Replace `ScoreBadge` with `TrustBadge`
- Show security status prominently
- Remove numeric score from cards

**Skill Detail Page:**
- Hero section: Security badge
- Security tab: Keep detailed breakdown + score
- Add "Quality Checks" section

**Version History Table:**
- Replace "Audit Score" column with "Security Status"
- Show badge instead of "8/10"

### Phase 3: Update Data Flow

**No backend changes needed:**
- Verdict already exists in scan results
- Finding counts already available
- Just need to surface differently in UI

## Files to Modify

| File | Change |
|------|--------|
| `packages/web/components/security/TrustBadge.tsx` | **NEW** - Badge component |
| `packages/web/components/security/QualityChecks.tsx` | **NEW** - Quality indicators |
| `packages/web/lib/trust-level.ts` | **NEW** - Trust computation |
| `packages/web/components/security/SecurityOverview.tsx` | Refactor to use badges |
| `packages/web/app/(registry)/skills/skills-results.tsx` | Replace ScoreBadge |
| `packages/web/app/(registry)/skills/[...name]/skill-tabs.tsx` | Update version table |
| `packages/web/app/(registry)/skills/[...name]/page.tsx` | Add hero badge |
| `packages/web/lib/data/skills.ts` | Add trustLevel to SkillSearchResult |

## Alternatives Considered

### A. Keep Score, Increase Security Weight
- Change security to 5/10 points
- Problem: Still conflates unrelated concerns
- Problem: What about medium findings?

### B. Two Scores: Security + Quality
- Show two numbers side by side
- Problem: Cognitive overhead
- Problem: Which one do I trust?

### C. Binary: Verified / Not Verified
- Simple pass/fail based on security only
- Problem: Loses nuance (medium vs high)
- Problem: Doesn't show quality signals

### D. Trust Badge (Recommended)
- Security-first but nuanced
- Quality signals preserved but secondary
- Clear visual hierarchy
- Actionable for users

## Reference Example: `tank/bulletproof`

The `tank/bulletproof` skill should be the gold standard example:
- **PASS** verdict with 0 findings
- All 6 scanner stages completed successfully
- Clean security report
- Used as the "ideal" badge display reference

### Badge API Enhancement

**Current:** `/api/v1/badge/{name}` returns score-based SVG
```svg
[tank | 10/10]  <!-- Misleading if there are findings -->
```

**Proposed:** Trust-aware badge with verdict
```svg
[tank | verified]    <!-- PASS, 0 findings -->
[tank | 2 notes]     <!-- PASS_WITH_NOTES -->
[tank | flagged]     <!-- FLAGGED -->
[tank | pending]     <!-- Not scanned yet -->
```

**Implementation:**
1. Add `verdict` query to badge route
2. Render trust level color instead of score color
3. Show finding count for non-PASS verdicts
4. Keep score in tooltip/title for backward compat

**File:** `packages/web/app/api/v1/badge/[...name]/route.ts`

## Success Criteria

1. Users immediately see security status (not a number to interpret)
2. "10/10 with notes" no longer possible as primary display
3. Quality signals still visible for informed decisions
4. Backward compatible (score still in detailed view)
5. Badge API shows trust level, not just score
6. `tank/bulletproof` displays as "verified" with green badge
