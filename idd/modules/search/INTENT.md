# Search Module

## Anchor

**Why this module exists:** Users, CLI agents, and MCP tools need to discover
skills in the Tank registry by name, organization, description keywords, or
approximate/misspelled queries. The old full-text-only search was unusable —
`@tank`, partial names like `rea`, and typos like `recat` all returned zero
results. This module provides hybrid search that works the way humans think:
partial typing, org browsing, typo tolerance, and keyword relevance.

**Consumers:** Web UI (Server Component `searchSkills()`), CLI (`tank search`
via `GET /api/v1/search`), MCP server (`search-skills` tool via same API).

**Single source of truth:** `apps/registry/src/lib/skills/data.ts` — the `searchSkills()`
function. The API route at `apps/registry/src/api/routes/v1/search.ts` is a thin
delegation layer.

---

## Layer 1: Structure

```
apps/registry/
  src/lib/skills/data.ts             # searchSkills(), escapeLike(), mapSearchResults()
  src/api/routes/v1/search.ts        # GET handler — delegates to searchSkills()
  src/lib/db/schema.ts               # skills_name_trgm_idx index definition
```

No new tables. Extends the existing `skills` table with a GIN trigram index.

---

## Layer 2: Constraints

| #   | Rule                                                                                                   | Rationale                                                                                             | Verified by        |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------ |
| C1  | Search uses three strategies in union: ILIKE, pg_trgm similarity, FTS plainto_tsquery                  | Each strategy covers a different user intent — partial names, typos, and description keywords         | BDD scenario       |
| C2  | Trigram similarity threshold is 0.15 on both full name AND skill-name part (after `/`)                 | Scoped names like `@org/skill` dilute trigram scores; checking `split_part(name, '/', 2)` compensates | BDD scenario       |
| C3  | Ranking weights: exact=1000, starts-with=800, skill-part=600, contains=400, trigram=0-300, FTS=0-100   | Exact name match must always rank first; name matches always beat description-only hits               | BDD scenario       |
| C4  | `%` and `_` in user input are escaped before ILIKE                                                     | Prevents SQL LIKE injection / wildcard abuse                                                          | BDD scenario       |
| C5  | Empty query returns all public skills (paginated, newest first)                                        | Browse mode — no search filtering applied                                                             | BDD scenario       |
| C6  | Only `visibility = 'public'` skills appear for unauthenticated users                                   | Private skills must not leak through search                                                           | BDD step assertion |
| C7  | Results include: name, description, visibility, latestVersion, auditScore, publisher, downloads, stars | CLI and web UI depend on this response shape                                                          | Unit test          |
| C8  | Requires `pg_trgm` extension and GIN index on `skills.name`                                            | Without the extension, `similarity()` calls fail at runtime                                           | Migration + CI     |
| C9  | API route delegates entirely to `searchSkills()` — no duplicated SQL                                   | Prevents logic drift between API and Server Component consumers                                       | Code review        |
| C10 | Bare org name (without `@`) must match the org portion of scoped names                                 | Users type "tank" not "@tank" — the search must split on `@`/`/` and match the org segment            | BDD scenario       |

---

## Layer 3: Examples

| #   | Input                                                                                  | Expected Output                                                                       |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E1  | `searchSkills("@org/react", ...)`                                                      | First result is the exact skill `@org/react` (score includes exact=1000)              |
| E2  | `searchSkills("rea", ...)`                                                             | Returns skills whose names contain "rea" — e.g. `@org/react`, `@org/react-hooks`      |
| E3  | `searchSkills("@org", ...)`                                                            | Returns all skills in the `@org` organization                                         |
| E4  | `searchSkills("recat", ...)`                                                           | Trigram similarity on the skill-name part matches `react` despite the typo            |
| E5  | `searchSkills("refactoring", ...)`                                                     | FTS matches `@org/clean-code` via description "Code quality and refactoring patterns" |
| E6  | `searchSkills("clean-code", ...)`                                                      | Skill-name-part match (`split_part` after `/`) surfaces the skill directly            |
| E7  | `searchSkills("@org/react", ...)` where both `react` and `react-hooks` exist           | `react` ranks above `react-hooks` (exact > prefix > contains)                         |
| E8  | `searchSkills("auth", ...)` where `auth-patterns` exists plus a description-only match | Name-contains match ranks above description-only match                                |
| E9  | `searchSkills("zzzyyyxxx-nonexistent", ...)`                                           | Returns zero results for the seeded org                                               |
| E10 | `searchSkills("'; DROP TABLE skills;--", ...)`                                         | No SQL error, returns empty or unrelated results — input safely escaped               |
| E11 | `searchSkills("myorg", ...)` where 5 `@myorg/*` skills exist                           | Returns all 5 skills — bare org name matches the org segment before `/`               |
| E12 | `searchSkills("myorg", ...)` ranking                                                   | Org-prefix matches rank above unrelated description-only hits                         |
| E13 | `searchSkills("Myorg", ...)` (mixed case)                                              | Case-insensitive — returns same results as lowercase                                  |
