# Skill Detail Page — Mobile Responsiveness

## Layer 1: Purpose

The skill detail page must be fully usable on mobile viewports (375px–768px). All content — tabs, sidebar, file explorer, versions table, trigger badges — must adapt to narrow screens without horizontal overflow, content overlap, or unreadable text.

Reference: npm package page on mobile, GitHub repo page on mobile.

## Layer 2: Constraints

| Constraint               | Value                                                                      |
| ------------------------ | -------------------------------------------------------------------------- |
| Breakpoint               | `lg` (1024px) — below this is "mobile"                                     |
| Sidebar on mobile        | Hidden. Replaced by compact action bar above tabs                          |
| Sidebar on desktop       | Right column, sticky, 288px (`w-72`)                                       |
| File explorer on mobile  | Tree panel collapsed behind toggle button. Editor takes full width         |
| File explorer on desktop | Side-by-side split: 260px tree + flex editor                               |
| Versions table on mobile | Horizontally scrollable (`overflow-x-auto`)                                |
| Trigger badges           | Max 6 visible initially. "+N more" toggle to expand                        |
| Title                    | `text-lg` on mobile, `text-2xl` on desktop                                 |
| Mobile action bar        | Shows: star, download, trust badge, audit score, install command with copy |
| No horizontal overflow   | No element causes the page to scroll horizontally on 375px viewport        |

## Layer 3: Examples

| Input                                      | Expected Output                                                       |
| ------------------------------------------ | --------------------------------------------------------------------- |
| 375px viewport, Readme tab                 | Content full-width, compact action bar above tabs, no sidebar visible |
| 375px viewport, Files tab                  | Editor full-width, tree toggle button visible, no split panel         |
| 375px viewport, Files tab, tap tree toggle | Tree panel drops down above editor, tap file closes tree              |
| 375px viewport, Versions tab               | Table scrolls horizontally if needed, no overflow                     |
| 375px viewport, Security tab               | Security content full-width, no sidebar                               |
| 375px viewport, 20+ triggers               | Shows 6 badges + "+14 more" button                                    |
| 375px viewport, tap "+14 more"             | All badges visible, "show less" button appears                        |
| 1280px viewport, Readme tab                | Content left + sidebar right, no action bar                           |
| 1280px viewport, Files tab                 | Side-by-side tree + editor, no toggle button                          |
