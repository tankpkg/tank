# Trust Badge Module

## Purpose

Replace misleading 0-10 score with security-first trust indicators.

Add lightweight trust signals that improve install confidence before full reviews:

- Install count visibility on browse cards and detail pages
- Verified publisher indicator for ownership-verified publishers
- Last scan freshness signal on browse cards and detail pages

## Trust Levels

| Level                | Display               | Verdict         | Findings |
| -------------------- | --------------------- | --------------- | -------- |
| `verified`           | 🛡️ Verified           | pass            | 0        |
| `review_recommended` | ⚠️ Review Recommended | pass_with_notes | any      |
| `concerns`           | 🚨 Concerns           | flagged         | any      |
| `unsafe`             | ✗ Unsafe              | fail            | any      |
| `pending`            | ○ Pending             | null            | -        |

## Constraints

| ID  | Rule                                                                      | Rationale                                    |
| --- | ------------------------------------------------------------------------- | -------------------------------------------- |
| C1  | Only PASS+0 = verified                                                    | Unscanned is not verified                    |
| C2  | Badge shows trust level, not score                                        | Score is misleading                          |
| C3  | Quality checks are secondary                                              | Security is primary signal                   |
| C4  | "Most Secure" sort replaces "Highest Score"                               | Aligns with new system                       |
| C5  | Skill cards show install counts                                           | Adoption signal must be visible pre-click    |
| C6  | Skill cards show scan recency                                             | Fresh scans increase trust                   |
| C7  | Detail page shows verified publisher indicator when publisher is verified | Publisher provenance is a trust prerequisite |
| C8  | Detail page keeps install counts and last scan date visible in metadata   | Trust signals must persist on deep view      |

## Examples

| Scenario                                        | Expected Badge                        |
| ----------------------------------------------- | ------------------------------------- |
| Skill with PASS verdict, 0 findings             | 🛡️ Verified (green)                   |
| Skill with PASS_WITH_NOTES, 2 medium            | ⚠️ Review Recommended (yellow)        |
| Skill with FLAGGED verdict                      | 🚨 Concerns (orange)                  |
| Skill with FAIL verdict                         | ✗ Unsafe (red)                        |
| Skill not yet scanned                           | ○ Pending (gray)                      |
| Browse card for scanned skill with 123 installs | Shows install count + "Scanned X ago" |
| Detail page for verified publisher              | Shows "Verified Publisher" indicator  |

## Quality Check Categories

| Category        | Checks                                     |
| --------------- | ------------------------------------------ |
| Documentation   | README present, description set            |
| Package Hygiene | License defined, repository linked         |
| Permissions     | Minimal permissions, no dangerous patterns |
