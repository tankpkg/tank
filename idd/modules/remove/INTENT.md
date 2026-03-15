# Remove Module

## Anchor

**Why this module exists:** When a skill is no longer needed, it must be removed from the
project cleanly: deleted from `tank.json` skills map, removed from `tank.lock`, unlinked
from AI agent configurations, and the skill directory deleted from disk. Partial removal
creates orphaned state that breaks verify and permissions commands.

**Consumers:** CLI (`tank remove @org/skill`), MCP server (`remove-skill` tool).

**Single source of truth:**

- `packages/cli/src/commands/remove.ts` — `removeCommand()`
- `packages/mcp-server/src/tools/remove-skill.ts` — MCP wrapper

---

## Layer 1: Structure

```
packages/
  cli/src/commands/remove.ts              # removeCommand() — removes from manifest, lockfile, disk, agents
  mcp-server/src/tools/remove-skill.ts   # MCP wrapper
```

---

## Layer 2: Constraints

| #   | Rule                                                                                       | Rationale                                                                 | Verified by   |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------- |
| C1  | Skill must exist in `tank.json` — if not found, fails with "not installed" error           | Prevents confusing success messages for no-op removes                     | BDD scenario  |
| C2  | Removes the skill entry from `tank.json` skills map                                        | Manifest stays in sync with installed state                               | BDD assertion |
| C3  | Removes ALL lockfile entries for the skill name from `tank.lock`                           | Scoped packages have `@org/skill@version` lock keys — all must be cleaned | BDD assertion |
| C4  | Deletes the `.tank/skills/@org/skill` directory (or `.tank/skills/skillname` for unscoped) | Disk space reclaimed; no orphaned files                                   | BDD assertion |
| C5  | Unlinks the skill from all detected AI agent configurations                                | Agents don't attempt to load a removed skill                              | BDD assertion |
| C6  | If no manifest exists, fails with "No tank.json found"                                     | Cannot remove from an uninitialized project                               | BDD scenario  |
| C7  | Removal is idempotent at the lockfile level — double-remove of lockfile entries is safe    | Defensive coding; no panic on missing lockfile key                        | BDD scenario  |
| C8  | Remaining skills in lockfile and manifest are preserved exactly                            | Remove must be surgical; no side-effects on other skills                  | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                          | Expected Output                                                                |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| E1  | `remove-skill({ name: "@org/skill" })` when skill is installed | Succeeds; skill removed from manifest, lockfile, disk, agent links             |
| E2  | `remove-skill({ name: "@org/not-installed" })`                 | Fails with "not installed" error                                               |
| E3  | No `tank.json` in directory                                    | Fails with "No tank.json found"                                                |
| E4  | Remove when 2 skills installed; remove 1                       | Only the named skill is removed; other skill still in manifest, lockfile, disk |
| E5  | Remove when no lockfile exists                                 | Succeeds; manifest entry removed; no lockfile errors                           |
| E6  | `remove-skill` when MCP server running without auth            | Removes skill (remove is a local operation, no auth required)                  |
