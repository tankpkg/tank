# Implementation Plan: Trust Badge System

## Overview

Replace the misleading 0-10 score with a security-first trust badge system. Keep score in detailed view for backward compatibility.

**Design Decision: Option B** - Trust badge for security (primary), quality checks as separate checklist (secondary).

**Methodology: @tank/bulletproof** - INTENT.md first, then Gherkin scenarios, then implementation.

## Complexity Assessment

**Medium** - Multiple component changes but no backend schema changes. UI refactor with existing data.

## Blast Radius

| Area          | Impact                    | Risk               |
| ------------- | ------------------------- | ------------------ |
| UI Components | High - 5+ files           | Low - Pure display |
| Data Types    | Low - Add computed field  | None               |
| Backend       | None                      | None               |
| Tests         | Medium - Update snapshots | Low                |

## Tasks

### Phase 0: Bulletproof Foundation (INTENT → RED → GREEN)

- [ ] **T0**: Create INTENT.md at `.idd/modules/trust-badge/INTENT.md`
  - Define trust levels with examples table
  - Define constraints for badge display
  - Define quality check categories
  - Follow `@tank/bulletproof` methodology

- [ ] **T0.1**: Create Gherkin feature at `.bdd/features/trust-badge/trust-badge.feature`
  - Convert INTENT.md examples to scenarios
  - Scenarios for each trust level
  - Scenarios for quality checks
  - Scenarios for badge API

- [ ] **T0.2**: Create step definitions at `.bdd/steps/trust-badge.steps.ts`
  - Step: skill with trust level exists
  - Step: I visit the skill page
  - Step: I see the trust badge
  - Step: I see the quality checks

### Phase 1: Core Types & Logic

- [ ] **T1**: Create `packages/web/lib/trust-level.ts`
  - Define `TrustLevel` type: `'pending' | 'verified' | 'review_recommended' | 'concerns' | 'unsafe'`
  - Implement `computeTrustLevel(verdict, findings)`
  - Implement `getTrustBadgeConfig(level)` - colors, icons, labels
  - Unit tests

### Phase 2: New Components

- [ ] **T2**: Create `packages/web/components/security/TrustBadge.tsx`
  - Props: `trustLevel`, `verdict`, `findings?`, `size?` (`sm` | `md`)
  - Render appropriate badge with icon and label
  - Finding count badges (optional)

- [ ] **T3**: Create `packages/web/components/security/QualityChecks.tsx`
  - **Option B selected**: Security badge primary, quality as checklist
  - Props: `checks` array of `{ name, passed, details }`
  - Render as compact checkmarks/crosses grouped by category
  - Categories: Documentation, Package Hygiene, Permissions

### Phase 3: Update Existing Components

- [ ] **T4**: Refactor `packages/web/components/security/SecurityOverview.tsx`
  - Replace large score number with TrustBadge
  - Move score to secondary position or collapsible
  - Add QualityChecks section

- [ ] **T5**: Update `packages/web/app/(registry)/skills/skills-results.tsx`
  - Replace `ScoreBadge` with `TrustBadge`
  - Replace "Highest Score" with "Most Secure" sort option
  - Update types in `packages/web/lib/data/skills.ts`

- [ ] **T6**: Update `packages/web/app/(registry)/skills/[...name]/skill-tabs.tsx`
  - Replace "Audit Score" column with "Security Status"
  - Show TrustBadge in version history

- [ ] **T7**: Update `packages/web/app/(registry)/skills/[...name]/page.tsx`
  - Add TrustBadge to hero section
  - Ensure security tab still shows full breakdown

### Phase 4: Testing & Polish

- [ ] **T8**: Run BDD tests (RED → GREEN)
  - Run `.bdd/features/trust-badge/trust-badge.feature`
  - All scenarios must pass
  - Document findings in `.bdd/qa/findings/`

- [ ] **T9**: Update component tests
  - Update component snapshots
  - Add tests for `computeTrustLevel`

### Phase 5: Badge API Enhancement

- [ ] **T10**: Update badge endpoint
  - Query verdict from scan_results
  - Render trust level instead of score
  - Show finding count for non-PASS verdicts
  - Keep score in SVG title for backward compat

- [ ] **T11**: Add verdict to search data
  - Update `searchSkills` query to include verdict
  - Update `SkillSearchResult` type
  - Ensure verdict available for card badges

## Dependencies

- None (uses existing verdict and finding data)

## Design Decisions

| Decision             | Choice                     | Rationale                                                        |
| -------------------- | -------------------------- | ---------------------------------------------------------------- |
| **Sort option**      | Replace with "Most Secure" | Remove "Highest Score", add "Most Secure" sorting by trust level |
| **Score visibility** | Security tab only          | Hidden from cards/list; shown in detailed breakdown              |
| **Badge sizing**     | `sm`, `md` only            | `sm` for cards, `md` for detail pages; no `lg` needed            |
| **LLM indicator**    | Keep alongside TrustBadge  | Brain icon + badge remains unchanged, shows alongside            |
| **Pending state**    | Gray "pending" badge       | Unscanned ≠ verified; only PASS+0 findings = verified            |
| **Methodology**      | `@tank/bulletproof`        | INTENT.md first, then Gherkin scenarios, then implementation     |
| **Quality display**  | Option B checklist         | Security badge primary, quality as separate checklist            |
