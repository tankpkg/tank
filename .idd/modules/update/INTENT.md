# Update Module

## Anchor

**Why this module exists:** After installing skills, versions become outdated as publishers
release new versions. The update command resolves the latest version satisfying each skill's
declared semver range, compares it to the currently installed version, and installs only
what changed — either for a single named skill or all skills at once.

**Consumers:** CLI (`tank update`, `tank update @org/skill`), MCP server (`update-skill` tool).

**Single source of truth:**

- `packages/cli/src/commands/update.ts` — `updateCommand()`, `updateSingle()`, `updateAll()`
- `packages/cli/src/commands/install.ts` — delegates to `installCommand()` for the actual install
- `packages/mcp-server/src/tools/update-skill.ts` — MCP wrapper

---

## Layer 1: Structure

```
packages/
  cli/src/commands/update.ts              # updateCommand() — check versions, delegate to installCommand()
  mcp-server/src/tools/update-skill.ts   # MCP wrapper
web/app/api/v1/skills/[name]/versions/route.ts  # GET — returns available versions for semver resolution
```

---

## Layer 2: Constraints

| #   | Rule                                                                                          | Rationale                                                | Verified by   |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| C1  | If no manifest exists, update fails with "No tank.json found"                                 | Cannot update a project that was never initialized       | BDD scenario  |
| C2  | If the named skill is not in the manifest, update fails with "not installed" message          | Prevents updating skills that don't exist in the project | BDD scenario  |
| C3  | If already at the latest version satisfying the range, reports "already at latest" with no-op | Idempotent; CI-safe                                      | BDD scenario  |
| C4  | When a newer version is available, installs the new version and reports "Updated X to Y"      | Explicit confirmation of what changed                    | BDD assertion |
| C5  | `update` with no name argument updates ALL skills in the manifest                             | Batch updates for project maintenance                    | BDD scenario  |
| C6  | If all skills are up to date, reports "All skills up to date"                                 | Clear terminal output for CI logs                        | BDD scenario  |
| C7  | Network errors fetching available versions fail with a network error message                  | Transparent failure, not silent success                  | BDD scenario  |
| C8  | Lockfile and manifest are updated after a successful update                                   | State files stay in sync with installed versions         | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                               | Expected Output                                                |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| E1  | `update-skill({ name: "@org/skill" })` when newer version available | Installs new version; reports "Updated @org/skill to X.Y.Z"    |
| E2  | `update-skill({ name: "@org/skill" })` when already at latest       | Reports "already at latest: @org/skill@X.Y.Z"; no file changes |
| E3  | `update-skill` (no name) when 2 skills need updating                | Updates both; reports count of updated skills                  |
| E4  | `update-skill` (no name) when all skills up to date                 | Reports "All skills up to date"                                |
| E5  | `update-skill({ name: "@org/not-installed" })`                      | Fails with "not installed" error                               |
| E6  | No `tank.json` in directory                                         | Fails with "No tank.json found"                                |
| E7  | `update-skill` when registry unreachable                            | Fails with network error                                       |
