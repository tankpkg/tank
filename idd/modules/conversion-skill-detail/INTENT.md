# Conversion: Skill Detail

## Anchor

**Why this module exists:** The skill detail page is where conversion happens — a user has found a package they're interested in. Currently: (1) the install command is hidden on desktop (`lg:hidden`), (2) the default tab is README, not Security, meaning the trust signal is buried behind a click. Both reduce conversion from browsing to installing.

**Consumers:** Visitors viewing package details, CLI users looking for install instructions.

**Single source of truth:** `apps/registry/src/screens/skill-detail-screen.tsx`.

---

## Layer 1: Structure

```
apps/registry/src/screens/skill-detail-screen.tsx       # Install visibility, tab default, trust card
apps/registry/src/components/skills/install-snippet.tsx  # Shared install snippet component
```

---

## Layer 2: Constraints

| #   | Rule                                                                                     | Rationale                                                                                             |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| C1  | Install command with copy button must be visible on both mobile AND desktop              | Desktop users (majority) should not lose the primary conversion action                                |
| C2  | Install snippet must show `tank install <name>` and a copy button                        | Matches existing MobileActionBar pattern                                                              |
| C3  | Desktop install snippet must appear in header area (name/version row)                    | High visibility, near package name                                                                    |
| C4  | Default tab must be `readme` regardless of scan presence                                 | Users came to learn how to use the skill; trust signal delivered via summary card above tabs (see C6) |
| C5  | Trust summary card "View details →" button must switch to the security tab               | Allows users who want trust details to reach them in one click                                        |
| C6  | A trust summary card must appear above the tabs when security data exists                | Delivers at-a-glance trust signal without forcing tab change                                          |
| C7  | Trust summary must show: verdict badge, finding counts (critical/high/medium), scan date | Users need at-a-glance trust signal                                                                   |
| C8  | Trust summary must have visible spacing (margin) between itself and the tabs             | Avoids visual collision between two stacked content blocks                                            |
| C9  | `useClipboard` hook must be used for copy (shared component)                             | Consistent UX                                                                                         |

---

## Layer 3: Examples

| #   | Visitor action                                  | Expected behavior                                                                                                          |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| E1  | Opens skill detail on desktop with scan data    | Sees install command in header area (not hidden), trust summary card with spacing above tabs, README tab active by default |
| E2  | Opens skill detail on desktop without scan data | Sees install command in header area, README tab active by default, no trust card                                           |
| E3  | Opens skill detail on mobile with scan data     | Sees install command in mobile action bar (existing), trust summary card, README tab active                                |
| E4  | Clicks "View details →" in trust summary card   | Security tab becomes active                                                                                                |
| E5  | Copies install command from desktop header      | Command copies, button shows check icon                                                                                    |
| E6  | Switches between tabs                           | Tab content updates normally                                                                                               |
