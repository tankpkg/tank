# Tasks: Skill Trust Badge System

## Phase 0: Bulletproof Foundation

### T0: INTENT.md

**File:** `.idd/modules/trust-badge/INTENT.md`

```markdown
# Trust Badge Module

## Purpose

Replace misleading 0-10 score with security-first trust indicators.

## Trust Levels

| Level                | Display               | Verdict         | Findings |
| -------------------- | --------------------- | --------------- | -------- |
| `verified`           | 🛡️ Verified           | pass            | 0        |
| `review_recommended` | ⚠️ Review Recommended | pass_with_notes | any      |
| `concerns`           | 🚨 Concerns           | flagged         | any      |
| `unsafe`             | ✗ Unsafe              | fail            | any      |
| `pending`            | ○ Pending             | null            | -        |

## Constraints

| ID  | Rule                                        | Rationale                  |
| --- | ------------------------------------------- | -------------------------- |
| C1  | Only PASS+0 = verified                      | Unscanned is not verified  |
| C2  | Badge shows trust level, not score          | Score is misleading        |
| C3  | Quality checks are secondary                | Security is primary signal |
| C4  | "Most Secure" sort replaces "Highest Score" | Aligns with new system     |

## Examples

| Scenario                             | Expected Badge                 |
| ------------------------------------ | ------------------------------ |
| Skill with PASS verdict, 0 findings  | 🛡️ Verified (green)            |
| Skill with PASS_WITH_NOTES, 2 medium | ⚠️ Review Recommended (yellow) |
| Skill with FLAGGED verdict           | 🚨 Concerns (orange)           |
| Skill with FAIL verdict              | ✗ Unsafe (red)                 |
| Skill not yet scanned                | ○ Pending (gray)               |
```

### T0.1: Gherkin Feature

**File:** `.bdd/features/trust-badge/trust-badge.feature`

```gherkin
# Intent: .idd/modules/trust-badge/INTENT.md
# Layer: Examples (all rows)

@trust-badge
@real-db
Feature: Trust Badge Display
  As a skill consumer
  I need to see the security status at a glance
  So that I can quickly assess trustworthiness

  Background:
    Given I am on the skills browse page

  # ── Verified badge (C1) ─────────────────────────────────────────────
  @high
  Scenario: Skill with PASS verdict and 0 findings shows verified badge
    Given a public skill "@{testOrg}/verified-skill" exists with verdict "pass" and 0 findings
    When I visit the skills browse page
    Then I see a green "Verified" badge for "@{testOrg}/verified-skill"

  # ── Review Recommended badge ───────────────────────────────────────
  @high
  Scenario: Skill with PASS_WITH_NOTES shows review recommended badge
    Given a public skill "@{testOrg}/review-skill" exists with verdict "pass_with_notes" and 2 medium findings
    When I visit the skills browse page
    Then I see a yellow "Review Recommended" badge for "@{testOrg}/review-skill"

  # ── Concerns badge ──────────────────────────────────────────────────
  @high
  Scenario: Skill with FLAGGED verdict shows concerns badge
    Given a public skill "@{testOrg}/flagged-skill" exists with verdict "flagged"
    When I visit the skills browse page
    Then I see an orange "Concerns" badge for "@{testOrg}/flagged-skill"

  # ── Unsafe badge ─────────────────────────────────────────────────────
  @high
  Scenario: Skill with FAIL verdict shows unsafe badge
    Given a public skill "@{testOrg}/unsafe-skill" exists with verdict "fail"
    When I visit the skills browse page
    Then I see a red "Unsafe" badge for "@{testOrg}/unsafe-skill"

  # ── Pending badge (C1) ───────────────────────────────────────────────
  @high
  Scenario: Skill not yet scanned shows pending badge
    Given a public skill "@{testOrg}/pending-skill" exists with no scan results
    When I visit the skills browse page
    Then I see a gray "Pending" badge for "@{testOrg}/pending-skill"

  # ── Most Secure sort (C4) ────────────────────────────────────────────
  @medium
  Scenario: Sort by Most Secure prioritizes verified skills
    Given a public skill "@{testOrg}/zzz-verified" exists with verdict "pass" and 0 findings
    And a public skill "@{testOrg}/aaa-pending" exists with no scan results
    When I sort skills by "Most Secure"
    Then "@{testOrg}/zzz-verified" appears before "@{testOrg}/aaa-pending"

  # ── Quality checks (C3) ───────────────────────────────────────────────
  @medium
  Scenario: Skill detail page shows quality checks
    Given a public skill "@{testOrg}/quality-skill" exists with README, description, and permissions
    When I visit the skill detail page for "@{testOrg}/quality-skill"
    Then I see quality checks for "Documentation", "Package Hygiene", and "Permissions"

  # ── Badge API (C2) ─────────────────────────────────────────────────────
  @medium
  Scenario: Badge API returns trust level SVG
    Given a public skill "@{testOrg}/badge-skill" exists with verdict "pass" and 0 findings
    When I call GET /api/v1/badge/@{testOrg}/badge-skill
    Then the response is 200
    And the SVG contains "verified"
```

### T0.2: Step Definitions

**File:** `.bdd/steps/trust-badge.steps.ts`

```typescript
import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "vitest";

Given(
  "a public skill {string} exists with verdict {string} and {int} findings",
  async function (name: string, verdict: string, findingCount: number) {
    // Create skill with specific verdict and findings
  },
);

Given("a public skill {string} exists with no scan results", async function (name: string) {
  // Create skill without scan results
});

Then("I see a {string} {string} badge for {string}", async function (color: string, label: string, skillName: string) {
  // Verify badge color and label
});
```

## Phase 1: Core Logic

### T1: Trust Level Logic

**File:** `packages/web/lib/trust-level.ts`

```typescript
export type TrustLevel = "pending" | "verified" | "review_recommended" | "concerns" | "unsafe";

export interface TrustBadgeConfig {
  level: TrustLevel;
  icon: string;
  label: string;
  bgClass: string;
  textClass: string;
  color: string; // For SVG badges
}

export function computeTrustLevel(
  verdict: string | null,
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  lowCount: number,
): TrustLevel {
  if (!verdict) return "pending";
  if (verdict === "fail") return "unsafe";
  if (verdict === "flagged") return "concerns";
  if (verdict === "pass_with_notes") return "review_recommended";
  // PASS with 0 findings = truly verified
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;
  if (verdict === "pass" && totalFindings === 0) return "verified";
  return "review_recommended"; // PASS with findings
}

export function getTrustBadgeConfig(level: TrustLevel): TrustBadgeConfig {
  const configs: Record<TrustLevel, TrustBadgeConfig> = {
    verified: {
      level: "verified",
      icon: "shield-check",
      label: "Verified",
      bgClass: "bg-green-100 dark:bg-green-900/30",
      textClass: "text-green-700 dark:text-green-400",
      color: "#4c1",
    },
    review_recommended: {
      level: "review_recommended",
      icon: "alert-triangle",
      label: "Review Recommended",
      bgClass: "bg-yellow-100 dark:bg-yellow-900/30",
      textClass: "text-yellow-700 dark:text-yellow-400",
      color: "#dfb317",
    },
    concerns: {
      level: "concerns",
      icon: "alert-octagon",
      label: "Concerns",
      bgClass: "bg-orange-100 dark:bg-orange-900/30",
      textClass: "text-orange-700 dark:text-orange-400",
      color: "#e05d44",
    },
    unsafe: {
      level: "unsafe",
      icon: "x-circle",
      label: "Unsafe",
      bgClass: "bg-red-100 dark:bg-red-900/30",
      textClass: "text-red-700 dark:text-red-400",
      color: "#e05d44",
    },
    pending: {
      level: "pending",
      icon: "clock",
      label: "Pending",
      bgClass: "bg-gray-100 dark:bg-gray-900/30",
      textClass: "text-gray-600 dark:text-gray-400",
      color: "#9f9f9f",
    },
  };
  return configs[level];
}

// Badge API helper (no React dependency)
export function getTrustBadgeApiConfig(
  verdict: string | null,
  totalFindings: number,
): { label: string; color: string; value: string } {
  const level = computeTrustLevel(verdict, 0, 0, 0, 0);
  const config = getTrustBadgeConfig(level);

  if (level === "verified") {
    return { label: "tank", color: config.color, value: "verified" };
  }
  if (level === "review_recommended") {
    return { label: "tank", color: config.color, value: `${totalFindings} notes` };
  }
  return { label: "tank", color: config.color, value: config.label.toLowerCase() };
}
```

## Phase 2: New Components

### T2: TrustBadge Component

**File:** `packages/web/components/security/TrustBadge.tsx`

```typescript
'use client';

import { Shield, AlertTriangle, AlertOctagon, XCircle, Clock } from 'lucide-react';
import type { TrustLevel } from '@/lib/trust-level';
import { getTrustBadgeConfig } from '@/lib/trust-level';

const ICONS = {
  'shield-check': Shield,
  'alert-triangle': AlertTriangle,
  'alert-octagon': AlertOctagon,
  'x-circle': XCircle,
  'clock': Clock
};

interface TrustBadgeProps {
  trustLevel: TrustLevel;
  findings?: { critical: number; high: number; medium: number; low: number };
  size?: 'sm' | 'md';
}

export function TrustBadge({ trustLevel, findings, size = 'sm' }: TrustBadgeProps) {
  const config = getTrustBadgeConfig(trustLevel);
  const Icon = ICONS[config.icon];
  const totalFindings = findings
    ? findings.critical + findings.high + findings.medium + findings.low
    : 0;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-1.5 py-0.5 gap-1'
    : 'text-sm px-2 py-1 gap-1.5';

  return (
    <span className={`inline-flex items-center rounded ${config.bgClass} ${config.textClass} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      <span className="font-medium">{config.label}</span>
      {trustLevel === 'review_recommended' && totalFindings > 0 && (
        <span className="opacity-75">({totalFindings})</span>
      )}
    </span>
  );
}
```

### T3: QualityChecks Component

**File:** `packages/web/components/security/QualityChecks.tsx`

```typescript
'use client';

import { Check, X } from 'lucide-react';

interface QualityCategory {
  name: 'Documentation' | 'Package Hygiene' | 'Permissions';
  passed: boolean;
  details: string;
}

interface QualityChecksProps {
  checks: QualityCategory[];
  variant?: 'compact' | 'full';
}

export function QualityChecks({ checks, variant = 'compact' }: QualityChecksProps) {
  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-sm">
            {c.passed ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <X className="w-4 h-4 text-red-600" />
            )}
            <span className={c.passed ? '' : 'text-muted-foreground'}>{c.name}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((c) => (
        <div key={c.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
          <div className="flex items-center gap-2">
            {c.passed ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <X className="w-4 h-4 text-red-600" />
            )}
            <span className={`font-medium ${c.passed ? '' : 'text-muted-foreground'}`}>{c.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">{c.details}</span>
        </div>
      ))}
    </div>
  );
}
```

## Phase 3: Update Existing Components

### T5: Skills Results Update

**File:** `packages/web/app/(registry)/skills/skills-results.tsx`

Replace `ScoreBadge` with `TrustBadge`:

```tsx
// Remove
import { ScoreBadge } from './score-badge';

// Add
import { TrustBadge } from '@/components/security/TrustBadge';
import { computeTrustLevel } from '@/lib/trust-level';

// In SORT_OPTIONS, replace:
{ value: 'score', label: 'Highest Score' }
// With:
{ value: 'security', label: 'Most Secure' }

// In SkillCard, replace:
{skill.auditScore !== null && <ScoreBadge score={skill.auditScore} />}
// With:
<TrustBadge
  trustLevel={computeTrustLevel(skill.verdict, skill.criticalCount, skill.highCount, skill.mediumCount, skill.lowCount)}
  findings={{ critical: skill.criticalCount, high: skill.highCount, medium: skill.mediumCount, low: skill.lowCount }}
  size="sm"
/>
```

**Update types in `packages/web/lib/data/skills.ts`:**

```typescript
export interface SkillSearchResult {
  // ... existing fields
  verdict: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}
```

### T10: Badge API Update

**File:** `packages/web/app/api/v1/badge/[...name]/route.ts`

```typescript
import { getTrustBadgeApiConfig } from "@/lib/trust-level";

// Query verdict and finding counts
const results = await db.execute(sql`
  SELECT
    sv.audit_score AS "auditScore",
    sr.verdict,
    sr.critical_count AS "criticalCount",
    sr.high_count AS "highCount",
    sr.medium_count AS "mediumCount",
    sr.low_count AS "lowCount"
  FROM ${skills} s
  LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    AND sv.created_at = (SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id)
  LEFT JOIN scan_results sr ON sr.version_id = sv.id
  WHERE s.name = ${name}
  LIMIT 1
`);

const row = results[0] as Record<string, unknown>;
const verdict = row.verdict as string | null;
const totalFindings =
  (Number(row.criticalCount) || 0) +
  (Number(row.highCount) || 0) +
  (Number(row.mediumCount) || 0) +
  (Number(row.lowCount) || 0);

const badgeConfig = getTrustBadgeApiConfig(verdict, totalFindings);
const svg = renderBadge(badgeConfig.label, badgeConfig.value, badgeConfig.color);
```
