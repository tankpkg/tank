# Implementation Plan: Badge in List + Security Tab Simplification

## Overview

1. Replace `ScoreBadge` with `TrustBadge` in skill list (`skills/page.tsx`)
2. Remove numeric score from security tab, use existing `QualityChecks` instead of `ScoreBreakdown`

## Complexity Assessment

**Simple** - UI changes only. All components and data exist.

## Blast Radius

| Area                                 | Impact                      | Risk |
| ------------------------------------ | --------------------------- | ---- |
| `skills/page.tsx`                    | Medium - Replace ScoreBadge | Low  |
| `SecurityOverview.tsx`               | High - Remove score display | Low  |
| Security tab in `[...name]/page.tsx` | Medium - Use QualityChecks  | Low  |

## Tasks

### Phase 1: Fix Skill List Badge

- [ ] **T1**: Update `apps/registry/app/(registry)/skills/page.tsx`
  - Import `TrustBadge` from `@/components/security`
  - Import `computeTrustLevel` from `@/lib/trust-level`
  - Replace `<ScoreBadge score={skill.auditScore} />` with `<TrustBadge trustLevel={...} findings={...} size="sm" />`
  - Delete `ScoreBadge` function (lines 241-252)

### Phase 2: Simplify Security Overview

- [ ] **T2**: Update `apps/registry/components/security/SecurityOverview.tsx`
  - Remove score display (`text-5xl` number)
  - Remove progress bar
  - Add `TrustBadge` component prominently at top
  - Keep: verdict badge, finding counts, scan metadata, LLM indicator

### Phase 3: Use QualityChecks in Security Tab

- [ ] **T3**: Update `apps/registry/app/(registry)/skills/[...name]/page.tsx`
  - Import `QualityChecks`, `computeQualityChecks` from `@/components/security`
  - Replace `ScoreBreakdown` with `QualityChecks`
  - Build checks data from existing skill data
  - Add "Security Scan" category (no critical/high findings)

### Phase 4: Cleanup

- [ ] **T4**: Consider removing `ScoreBreakdown.tsx`
  - Check if used elsewhere
  - Remove or deprecate if unused

## Existing Components to Use

| Component              | Location                                | Usage                               |
| ---------------------- | --------------------------------------- | ----------------------------------- |
| `TrustBadge`           | `components/security/TrustBadge.tsx`    | Already exists, use in list         |
| `QualityChecks`        | `components/security/QualityChecks.tsx` | Already exists, use in security tab |
| `computeTrustLevel`    | `lib/trust-level.ts`                    | Already exists                      |
| `computeQualityChecks` | `components/security/QualityChecks.tsx` | Already exists                      |

## Code Changes Summary

### T1: skills/page.tsx

```diff
- import { Badge } from '@/components/ui/badge';
+ import { TrustBadge } from '@/components/security';
+ import { computeTrustLevel } from '@/lib/trust-level';

- {skill.auditScore !== null && <ScoreBadge score={skill.auditScore} />}
+ <TrustBadge
+   trustLevel={computeTrustLevel(
+     skill.verdict,
+     skill.criticalCount,
+     skill.highCount,
+     skill.mediumCount,
+     skill.lowCount
+   )}
+   findings={{
+     critical: skill.criticalCount,
+     high: skill.highCount,
+     medium: skill.mediumCount,
+     low: skill.lowCount
+   }}
+   size="sm"
+ />

- function ScoreBadge({ score }: { score: number }) { ... }
```

### T3: Security Tab

```diff
- import { ScoreBreakdown } from '@/components/security';
+ import { QualityChecks, computeQualityChecks } from '@/components/security';

- <ScoreBreakdown criteria={[...]} totalScore={...} llmAnalysis={...} />
+ <QualityChecks
+   checks={[
+     ...computeQualityChecks({
+       readme: data.latestVersion?.readme,
+       description: data.description,
+       license: data.license,
+       repositoryUrl: data.repositoryUrl,
+       permissions: data.latestVersion?.permissions ?? {}
+     }),
+     {
+       name: 'Security Scan',
+       passed: no critical/high findings,
+       details: 'No critical/high findings'
+     }
+   ]}
+   variant="full"
+ />
```

## Verification

1. Visit `/skills` → TrustBadge shows (Verified/Review Recommended/etc.)
2. Visit skill detail → Security tab
3. No numeric score visible anywhere
4. Pass/fail indicators for each quality category
5. Findings list and pipeline unchanged
