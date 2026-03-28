# Skills Browse Page — Mobile Filter Bar

## Layer 1: Purpose

The skills browse page filter sidebar must not dominate the mobile viewport. On narrow screens, filters render as a horizontally scrollable row of compact `<Select>` dropdowns above the results grid. On desktop, the full vertical sidebar stays in its left column. Skill cards must be immediately visible on mobile without scrolling past filters.

Reference: Airbnb mobile search filters, Amazon mobile category filters, GitHub mobile issue filters.

## Layer 2: Constraints

| Constraint              | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Breakpoint              | `lg` (1024px) — below this is "mobile"                                                          |
| Desktop                 | 220px left sidebar, vertical filter groups, always visible                                      |
| Mobile                  | Horizontal scrollable row of `<Select>` dropdowns, always visible                               |
| Mobile height           | Single row, ~40px. No vertical stacking of filter groups                                        |
| Overflow                | `overflow-x-auto` — swipe to see more filters if they exceed viewport width                     |
| Component               | shadcn `<Select>` for each filter group                                                         |
| Active state            | Non-default filter values should be visually distinct (e.g. primary text color)                 |
| Navigation              | Selecting a filter value navigates with the same URL param logic as the desktop sidebar         |
| Documentation filter    | Rendered as a checkbox-style toggle, not a select (binary on/off)                               |
| No duplication of logic | Both mobile and desktop filters use the same URL param navigation. Extract shared filter config |

## Layer 3: Examples

| Input                              | Expected Output                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| 375px viewport, default filters    | Horizontal row of selects visible: Score, Freshness, Popularity, Docs. Skill cards below |
| 375px viewport, logged in          | Visibility select also appears in the row                                                |
| 375px viewport, tap Score select   | Dropdown opens with: All scores, High (7+), Medium (4-6), Low (<4)                       |
| 375px viewport, select "High (7+)" | Page navigates with `?score=high&page=1`, select shows "High (7+)"                       |
| 375px viewport, active filter      | Select trigger text shows current value, visually distinct from default                  |
| 1280px viewport                    | Full vertical sidebar visible, no horizontal select row                                  |
| 1280px viewport                    | Mobile filter bar hidden                                                                 |
