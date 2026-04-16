# Atom Type Badges

## Anchor

**Why this module exists:** Tank packages can contain up to 7 atom types
(instruction, hook, tool, agent, rule, resource, prompt). Today the registry
shows no visual indicator of what a package contains — a single-instruction
skill looks identical to a composite package with agents, hooks, and rules.
Users cannot tell what they are installing until they read the README. This
module surfaces atom composition everywhere it matters: browse cards, detail
page header, sidebar, and a dedicated Atoms tab.

**Consumers:** Registry frontend (browse, detail), publish API, search data layer.

**Single source of truth:** `apps/registry/src/lib/skills/atoms.ts` for
extraction logic; `@internals/schemas` for `AtomKind` enum.

---

## Layer 2: Constraints

| #   | Rule                                                                                                                                                                       | Rationale                                                                                  | Verified by                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| C1  | `extractAtomKinds(manifest)` returns a deduplicated array of `AtomKind` values found in `manifest.atoms[].kind`                                                            | Callers need unique types, not a count                                                     | E1, E2, system: `extractAtomKinds returns unique kinds` |
| C2  | If `manifest.atoms` is absent, null, or empty, `extractAtomKinds` returns `['skill']`                                                                                      | Legacy packages (pre-atom-architecture) must still show a badge                            | E3, E4, system: `legacy fallback`                       |
| C3  | `isBundle(kinds)` returns `true` iff `kinds.length >= 2` AND `kinds` does not contain `'skill'`                                                                            | `'skill'` is a legacy sentinel, not a real atom type; single-type packages are not bundles | E5, E6, system: `isBundle`                              |
| C4  | At publish time, the server extracts atom kinds from the validated manifest and stores them in `skill_versions.atom_kinds TEXT[]`; legacy packages (no atoms) store `NULL` | Enables efficient DB-level filtering without JSONB traversal on every search               | E7, system: `publish stores atom_kinds`                 |
| C5  | `SkillSearchResult` and `SkillVersionDetail` both expose `atomKinds: string[]`; value is resolved from `atom_kinds` column when present, JSONB fallback otherwise          | Downstream consumers get a uniform field regardless of when the package was published      | E8, system: `search results include atomKinds`          |
| C6  | Every skill card in the browse grid renders an `AtomKindBadges` component with `data-testid="atom-kind-badges"`                                                            | Users can identify package type without opening the detail page                            | E9, browser: `browse card shows badges`                 |
| C7  | The skill detail page header renders atom badges with `data-testid="skill-detail-atom-badges"`                                                                             | Prominent placement confirms package type after navigation                                 | E10, browser: `detail header shows badges`              |
| C8  | The skill sidebar renders a "Type" metadata row containing atom badges                                                                                                     | Consistent with all other metadata (version, license, downloads)                           | E11, browser: `sidebar type row`                        |
| C9  | The Atoms tab (trigger `data-testid="atoms-tab-trigger"`) is visible only when `manifest.atoms` exists and is non-empty; it is hidden for legacy packages                  | Legacy packages have no atoms to display                                                   | E12, E13, browser: `atoms tab visibility`               |
| C10 | The Atoms tab renders an intro callout with `data-testid="atoms-tab-intro"` explaining the concept and linking to `/docs/atoms`                                            | Atoms is a new concept — users need context                                                | E12, browser: `atoms tab intro`                         |
| C11 | Atoms are grouped by kind in the Atoms tab; each atom card has `data-testid="atom-card"`                                                                                   | Grouped display makes composition scannable                                                | E12, browser: `atoms tab grouping`                      |
| C12 | The `SkillsFilters` sidebar contains an "Atom Type" section; selecting a kind sets `?atomKind=<kind>` in the URL                                                           | Users can filter the browse grid by atom type                                              | E14, browser: `atom kind filter`                        |
| C13 | The `atomKind` URL param is applied as a WHERE clause in `searchSkills`; only packages whose `atom_kinds` column contains the requested kind are returned                  | Filter must be enforced server-side                                                        | E14, system: `search filters by atomKind`               |

---

## Layer 3: Examples

| #   | Input                                                                                        | Expected Output                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| E1  | `extractAtomKinds({ atoms: [{ kind: 'hook' }, { kind: 'hook' }, { kind: 'agent' }] })`       | `['hook', 'agent']` (deduplicated, order stable)                                                                                          |
| E2  | `extractAtomKinds({ atoms: [{ kind: 'instruction' }, { kind: 'tool' }, { kind: 'rule' }] })` | `['instruction', 'tool', 'rule']`                                                                                                         |
| E3  | `extractAtomKinds({})`                                                                       | `['skill']`                                                                                                                               |
| E4  | `extractAtomKinds({ atoms: [] })`                                                            | `['skill']`                                                                                                                               |
| E5  | `isBundle(['hook', 'agent'])`                                                                | `true`                                                                                                                                    |
| E6  | `isBundle(['skill'])`                                                                        | `false`; `isBundle(['instruction'])`                                                                                                      | `false` |
| E7  | Publish a package with `atoms: [{ kind: 'hook', ... }, { kind: 'agent', ... }]`              | `skill_versions.atom_kinds = {hook,agent}` in DB                                                                                          |
| E8  | `searchSkills({ q: '' })` response item for a package with hook+agent atoms                  | `{ ..., atomKinds: ['hook', 'agent'] }`                                                                                                   |
| E9  | Browse grid at `/skills`                                                                     | Each card has `[data-testid="atom-kind-badges"]` with at least one badge visible                                                          |
| E10 | Skill detail page for a package with `atoms: [{ kind: 'agent' }]`                            | `[data-testid="skill-detail-atom-badges"]` contains a badge with text "Agent"                                                             |
| E11 | Skill detail sidebar                                                                         | Contains a "Type" dt with atom badges inside `[data-testid="desktop-sidebar"]`                                                            |
| E12 | Skill detail for a package with atoms                                                        | `[data-testid="atoms-tab-trigger"]` visible; clicking it shows `[data-testid="atoms-tab-intro"]` and `[data-testid="atom-card"]` elements |
| E13 | Skill detail for a legacy package (no atoms)                                                 | `[data-testid="atoms-tab-trigger"]` not present                                                                                           |
| E14 | User selects "Agent" in the Atom Type filter sidebar                                         | URL gains `?atomKind=agent`; only packages with agent atoms appear in results                                                             |
