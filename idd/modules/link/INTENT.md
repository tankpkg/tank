# Link / Unlink Module

## Anchor

**Why this module exists:** During local skill development, a developer needs to test their
skill with live AI agents (Claude Code, Cursor, Windsurf) without publishing to the registry.
`tank link` creates agent configuration symlinks from the local skill directory, making the
skill immediately available to all installed agents. `tank unlink` reverses this. This is
the local development workflow equivalent of `npm link`.

**Consumers:** CLI (`tank link`, `tank unlink`), MCP server (`link-skill`, `unlink-skill` tools).

**Single source of truth:**

- `packages/cli/src/commands/link.ts` — `linkCommand()`
- `packages/cli/src/commands/unlink.ts` — `unlinkCommand()`
- `packages/cli/src/lib/linker.ts` — `linkSkillToAgents()`, `unlinkSkillFromAgents()`
- `packages/cli/src/lib/agents.ts` — `detectInstalledAgents()`
- `packages/mcp-server/src/tools/link-skill.ts`, `unlink-skill.ts` — MCP wrappers

---

## Layer 1: Structure

```
packages/
  cli/src/commands/link.ts                # linkCommand() — reads manifest, discovers agents, creates links
  cli/src/commands/unlink.ts             # unlinkCommand() — removes agent links
  cli/src/lib/linker.ts                  # linkSkillToAgents(), unlinkSkillFromAgents()
  cli/src/lib/agents.ts                  # detectInstalledAgents(), getSupportedAgents()
  mcp-server/src/tools/link-skill.ts     # MCP wrapper
  mcp-server/src/tools/unlink-skill.ts   # MCP wrapper
```

---

## Layer 2: Constraints

| #   | Rule                                                                               | Rationale                                                   | Verified by   |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- |
| C1  | Requires a `tank.json` with a `name` field in the working directory                | Name is used as the skill identifier for agent linking      | BDD scenario  |
| C2  | If no AI agents are detected, link reports "no agents detected" but does not error | Non-fatal: developer may install agents later               | BDD scenario  |
| C3  | Successfully linked agents are reported in output                                  | Developer confirmation of which agents have the skill       | BDD assertion |
| C4  | Already-linked agents are reported as skipped (not double-linked)                  | Idempotent; linking twice must not create duplicate entries | BDD scenario  |
| C5  | Failed agent links are reported as warnings, not fatal errors                      | One broken agent should not abort linking to others         | BDD scenario  |
| C6  | `unlink` removes the skill from all agent configurations it was linked to          | Clean removal; agents should not reference removed skills   | BDD assertion |
| C7  | `unlink` reports how many agents were unlinked                                     | Confirmation for the developer                              | BDD assertion |
| C8  | Source type `dev` is recorded in the global links file (`~/.tank/links.json`)      | Doctor command uses source type to classify links           | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                               | Expected Output                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| E1  | `link-skill({ directory: "/path/to/skill" })` with 1 agent detected | Succeeds; reports "Linked @org/skill to 1 agent(s)"               |
| E2  | `link-skill` when no `tank.json` in directory                       | Fails with "No tank.json found" error                             |
| E3  | `link-skill` when no agents detected                                | Reports "no agents detected"; exits cleanly (no error)            |
| E4  | `link-skill` twice for same skill                                   | Second call reports skill as already linked; no duplicate created |
| E5  | `unlink-skill({ name: "@org/skill" })` after linking                | Removes agent link; reports unlink count                          |
| E6  | `unlink-skill` for a skill that was never linked                    | Gracefully handles missing link; no crash                         |
