# Security Tab Simplification Module

## Purpose

Remove all misleading numeric scores from user-facing views. Users should see security status at a glance (Verified/Review Recommended/Concerns/Unsafe), not a number they have to interpret.

## Reference Skill

The `@tank/bulletproof` skill is the gold standard for verification:
- PASS verdict → Verified badge (green)
- 0 findings → Clean trust indicator
- All quality checks pass → Full quality checklist

## Constraints

| ID | Rule | Rationale |
|----|------|-----------|
| C1 | No numeric score in skill list | Score is misleading |
| C2 | No 0-10 number in security tab | Score conflates unrelated concerns |
| C3 | Quality checks are pass/fail | No points like "+1/1" |
| C4 | Four quality categories required | Documentation, Package Hygiene, Permissions, Security Scan |

## Examples

| Location | Before | After |
|----------|--------|-------|
| Skills list | "Score: 10" | "🛡️ Verified" badge |
| Security tab header | Large "10" number | TrustBadge prominent |
| Quality section | "+1/1" points | "✓ Documentation" pass/fail |

## Verification

After implementation, visiting `/skills/@tank/bulletproof` should show:
1. Skill list: **Verified** badge (not "Score: 10")
2. Security tab: **Verified** badge prominently, no 0-10 number
3. Quality checks: ✓ Documentation, ✓ Package Hygiene, ✓ Permissions, ✓ Security Scan
