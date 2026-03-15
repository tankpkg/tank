# Init Module

## Anchor

**Why this module exists:** Every Tank skill or project starts by creating `tank.json` — the
manifest that declares skill identity, version, permissions, and dependencies. The init
command scaffolds this file interactively or non-interactively (`--yes` flag), validates
the inputs against the shared Zod schema, and writes the result atomically. Without it,
there is no starting point for `install`, `publish`, or `link`.

**Consumers:** CLI (`tank init`), MCP server (`init-skill` tool). The MCP tool is the
primary test target (uses `--yes` equivalent non-interactive mode).

**Single source of truth:**

- `packages/cli/src/commands/init.ts` — `initCommand()`, `validateName()`, `validateVersion()`
- `packages/mcp-server/src/tools/init-skill.ts` — MCP wrapper
- `packages/shared/src/schemas/skills-json.ts` — `skillsJsonSchema` (Zod validation)

---

## Layer 1: Structure

```
packages/
  cli/src/commands/init.ts              # initCommand(), validateName(), validateVersion()
  mcp-server/src/tools/init-skill.ts   # MCP wrapper (non-interactive, yes-mode)
shared/src/schemas/skills-json.ts      # skillsJsonSchema — Zod schema for tank.json
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                 | Rationale                                                               | Verified by   |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| C1  | Skill name must be lowercase, alphanumeric + hyphens, optionally scoped (`@org/name`)                | Registry naming convention enforced at creation time                    | BDD scenario  |
| C2  | Unscoped names are allowed (e.g. `my-skill` without `@org/` prefix)                                  | Not all skills are org-scoped; solo developers use unscoped names       | BDD scenario  |
| C3  | Version must be valid semver (e.g. `1.0.0`, `0.1.0-beta.1`)                                          | Registry requires semver; prevents unparseable versions at publish time | BDD scenario  |
| C4  | If `tank.json` already exists and `--force` not set, init fails with "already exists" error          | Prevents accidental overwrites                                          | BDD scenario  |
| C5  | With `--force`, existing `tank.json` is overwritten                                                  | Allows re-initialization without manual deletion                        | BDD scenario  |
| C6  | Generated manifest is validated against `skillsJsonSchema` before writing                            | Invalid manifests are caught at init time, not publish time             | BDD assertion |
| C7  | Generated manifest includes default `permissions` block: network/filesystem/subprocess               | Every manifest starts with an explicit permissions declaration          | BDD assertion |
| C8  | Generated manifest includes `skills: {}` (empty dependency map)                                      | Ready to declare dependencies immediately                               | BDD assertion |
| C9  | `visibility` defaults to `public` for unscoped names, `private` for scoped names in interactive mode | Sensible defaults aligned with typical use cases                        | BDD assertion |
| C10 | Invalid name or version inputs return a clear validation error message                               | Developer knows exactly what format is required                         | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                         | Expected Output                                                             |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| E1  | `init-skill({ name: "@org/my-skill", version: "1.0.0" })`     | Creates `tank.json` with name, version, permissions block, empty skills map |
| E2  | `init-skill({ name: "my-skill" })` (unscoped)                 | Creates valid `tank.json` with unscoped name                                |
| E3  | `init-skill({ name: "UPPERCASE" })`                           | Fails with name validation error (must be lowercase)                        |
| E4  | `init-skill({ version: "not-semver" })`                       | Fails with version validation error                                         |
| E5  | `init-skill` when `tank.json` already exists                  | Fails with "already exists" error; file not modified                        |
| E6  | `init-skill({ force: true })` when `tank.json` already exists | Overwrites existing file; reports "Created tank.json"                       |
| E7  | `init-skill({ name: "@org/skill", description: "My skill" })` | `tank.json` includes description field                                      |
