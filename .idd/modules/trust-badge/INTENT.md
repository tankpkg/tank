# Trust Badge Module

## Purpose

Replace misleading 0-10 score with security-first trust indicators.

## Trust Levels

| Level | Display | Verdict | Findings |
|-------|---------|---------|----------|
| `verified` | 🛡️ Verified | pass | 0 |
| `review_recommended` | ⚠️ Review Recommended | pass_with_notes | any |
| `concerns` | 🚨 Concerns | flagged | any |
| `unsafe` | ✗ Unsafe | fail | any |
| `pending` | ○ Pending | null | - |

## Constraints

| ID | Rule | Rationale |
|----|------|-----------|
| C1 | Only PASS+0 = verified | Unscanned is not verified |
| C2 | Badge shows trust level, not score | Score is misleading |
| C3 | Quality checks are secondary | Security is primary signal |
| C4 | "Most Secure" sort replaces "Highest Score" | Aligns with new system |

## Examples

| Scenario | Expected Badge |
|----------|---------------|
| Skill with PASS verdict, 0 findings | 🛡️ Verified (green) |
| Skill with PASS_WITH_NOTES, 2 medium | ⚠️ Review Recommended (yellow) |
| Skill with FLAGGED verdict | 🚨 Concerns (orange) |
| Skill with FAIL verdict | ✗ Unsafe (red) |
| Skill not yet scanned | ○ Pending (gray) |

## Quality Check Categories

| Category | Checks |
|----------|--------|
| Documentation | README present, description set |
| Package Hygiene | License defined, repository linked |
| Permissions | Minimal permissions, no dangerous patterns |
