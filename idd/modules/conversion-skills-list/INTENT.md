# Conversion: Skills List

## Anchor

**Why this module exists:** `/skills` gets 41% of all traffic (117 pageviews/30 days) but provides zero context about _why_ Tank is different from any other registry. Users browse packages and leave without understanding the platform's value proposition. The skills list page needs to bridge discovery to understanding.

**Consumers:** Visitors browsing packages, logged-in users, CLI users transitioning to web.

**Single source of truth:** `apps/registry/src/screens/skills-list-screen.tsx`.

---

## Layer 1: Structure

```
apps/registry/src/screens/skills-list-screen.tsx   # Banner, sidebar, card changes
apps/registry/src/components/skills/value-banner.tsx         # NEW: dismissible value prop banner
apps/registry/src/components/skills/getting-started.tsx      # NEW: sidebar getting-started card
apps/registry/src/components/skills/install-snippet.tsx      # NEW: shared install snippet (also used by skill-detail)
```

---

## Layer 2: Constraints

| #   | Rule                                                                                         | Rationale                                                              |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | Value-proposition banner must appear below `<h1>` and above search bar                       | Users must see it before they start browsing                           |
| C2  | Banner must link to `/docs/overview`                                                         | Bridges discovery users to understanding                               |
| C3  | Banner must be dismissible, stored in `localStorage`                                         | Returning users don't need to re-read                                  |
| C4  | Getting-started sidebar card must appear in the filter sidebar on desktop (hidden on mobile) | Desktop filter sidebar has empty space; mobile uses the banner instead |
| C5  | Getting-started card must show 3-step flow: Install CLI → Search → Install                   | CLI workflow is the primary conversion path                            |
| C6  | CLI install command must be copyable via `useClipboard`                                      | Must match existing copy pattern across the site                       |
| C7  | Each SkillCard must show a copyable `tank install <name>` snippet at the bottom              | Users should see the install path without clicking through to detail   |
| C8  | Install snippet in card must use `useClipboard` hook                                         | Consistent UX across the site                                          |
| C9  | Install snippet must not interfere with the card's full-overlay `<Link>`                     | Clicking the snippet copy button must not trigger card navigation      |

---

## Layer 3: Examples

| #   | Visitor action                             | Expected behavior                                                                                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| E1  | First visit to `/skills`                   | Sees banner: "Every package scanned through a 6-stage security pipeline. Learn more →" linking to `/docs/overview` |
| E2  | Dismiss banner                             | Banner disappears; revisit does not show it (`localStorage` key set)                                               |
| E3  | Second visit to `/skills` after dismissing | Banner does not appear                                                                                             |
| E4  | Desktop visitor looks at filter sidebar    | Sees "Getting Started" card with 3 steps: `npm i -g @tankpkg/cli` → `tank search` → `tank install <name>`          |
| E5  | Click copy on CLI install in sidebar       | Command copied, "Copied!" feedback shown                                                                           |
| E6  | Browse skill cards grid                    | Each card shows `tank install <name>` snippet with copy button at bottom                                           |
| E7  | Click copy on card install snippet         | Command copied, button shows check icon briefly; card navigation NOT triggered                                     |
| E8  | Mobile visitor                             | Banner visible; getting-started card hidden (mobile filter area too small)                                         |
| E9  | Logged-in visitor (already authenticated)  | Getting-started card adapts: step 1 shows "You're authenticated — skip" or similar                                 |
