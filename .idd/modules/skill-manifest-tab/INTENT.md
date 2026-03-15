# Skill Manifest Tab

## Anchor

**Why this module exists:** Developers inspecting a skill on the registry need to see the parsed `skills.json` manifest in a structured, readable format — not raw JSON. The Manifest tab surfaces name, version, description, permissions, dependencies (skills), and entry points so users can understand what a skill declares before installing it.

**Consumers:** Web registry skill detail page (`packages/web/app/(registry)/skills/[...name]/`).

**Single source of truth:** `packages/web/app/(registry)/skills/[...name]/skill-manifest-tab.tsx` — renders manifest data passed from `page.tsx` via `SkillTabs`.

---

## Layer 1: Structure

```
packages/web/app/(registry)/skills/[...name]/
  skill-manifest-tab.tsx   # NEW — Manifest tab component
  skill-tabs.tsx           # MODIFIED — add Manifest tab trigger + content
  page.tsx                 # MODIFIED — pass skillsJsonContent to SkillTabs
```

Data flow:

```
page.tsx
  → getSkillDetail() → latestVersion.manifest (JSONB)
  → safeParseJson(manifest) → latestManifest
  → SkillTabs(manifest=latestManifest)
    → SkillManifestTab(manifest)
      → renders: name, version, description, permissions, skills (deps), repository, visibility, audit
```

---

## Layer 2: Constraints

| #   | Rule                                                                           | Rationale                                       | Verified by  |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------- | ------------ |
| C1  | Tab is always shown (not conditional on data)                                  | Users should always be able to navigate to it   | BDD scenario |
| C2  | When manifest is null/undefined, show a graceful empty state                   | Not all skills have a parseable manifest        | BDD scenario |
| C3  | Permissions are rendered with human-readable descriptions, not raw keys        | Users need to understand what access is granted | BDD scenario |
| C4  | Dependencies (skills field) are shown as a list with name + version constraint | Users need to see transitive skill requirements | BDD scenario |
| C5  | No raw JSON dump — every field is rendered in a structured layout              | Raw JSON is already available in the Files tab  | BDD scenario |
| C6  | Component is `'use client'` — no new server-side data fetching                 | Data is already available from page.tsx         | Architecture |
| C7  | Tab label is "Manifest"                                                        | Consistent with skills.json terminology         | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                         | Expected Output                       |
| --- | ------------------------------------------------------------- | ------------------------------------- |
| E1  | Manifest with name, version, description, permissions, skills | All sections rendered with labels     |
| E2  | Manifest is null                                              | "No manifest available" empty state   |
| E3  | Manifest has no skills field                                  | Dependencies section hidden           |
| E4  | Manifest has no permissions field                             | Permissions section hidden            |
| E5  | Manifest has network outbound permissions                     | Shows domain list under "Network"     |
| E6  | Manifest has filesystem read/write permissions                | Shows path globs under "Filesystem"   |
| E7  | Manifest has subprocess: true                                 | Shows "Subprocess execution allowed"  |
| E8  | Manifest has skills with version constraints                  | Shows each dep as "@org/name: ^1.0.0" |
