# Doctor Module

## Anchor

**Why this module exists:** Tank's state spans multiple locations: manifest, lockfile, skill
directories on disk, agent configuration symlinks, and dev links. When something breaks
(wrong link target, missing extract, agent not detected), the developer has no easy way to
diagnose the problem. The doctor command produces a comprehensive health report: detected
agents, local/global/dev-linked skills, per-skill link status, and actionable suggestions
to fix each issue.

**Consumers:** CLI (`tank doctor`), MCP server (`doctor` tool).

**Single source of truth:**

- `packages/cli/src/commands/doctor.ts` — `doctorCommand()`
- `packages/mcp-server/src/tools/doctor.ts` — MCP wrapper
- `packages/cli/src/lib/linker.ts` — `getSkillLinkStatus()`
- `packages/cli/src/lib/agents.ts` — `detectInstalledAgents()`, `getSupportedAgents()`

---

## Layer 1: Structure

```
packages/
  cli/src/commands/doctor.ts              # doctorCommand() — multi-section health report
  mcp-server/src/tools/doctor.ts         # MCP wrapper
  cli/src/lib/linker.ts                  # getSkillLinkStatus() — per-agent link health
  cli/src/lib/agents.ts                  # detectInstalledAgents(), getSupportedAgents()
```

---

## Layer 2: Constraints

| #   | Rule                                                                                         | Rationale                                                                  | Verified by   |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------- |
| C1  | Doctor reports ALL supported agents with ✅ (installed) or ❌ (not found)                    | Developer knows which agents Tank can target, not just which are installed | BDD assertion |
| C2  | Doctor lists local skills from `tank.json` with their per-agent link status                  | Per-skill link health is the primary debugging view for local installs     | BDD assertion |
| C3  | Doctor lists global skills from the global `tank.lock`                                       | Global and local installs must be separately inspectable                   | BDD assertion |
| C4  | Doctor lists dev-linked skills (source: `dev`) from global links file                        | Dev links are the result of `tank link`; need separate visibility          | BDD assertion |
| C5  | A broken link (symlink target missing) is shown as ⚠️ with a fix suggestion                  | Actionable diagnosis for the most common failure mode                      | BDD scenario  |
| C6  | A skill with no agents linked is shown as ❌ not linked                                      | Helps developer realize they need to run install or link                   | BDD scenario  |
| C7  | Suggestions section lists actionable commands to fix each detected issue                     | Doctor report must guide recovery, not just diagnose                       | BDD assertion |
| C8  | If no issues found, suggestions section shows "none"                                         | Clean state must be clearly indicated                                      | BDD scenario  |
| C9  | Doctor never crashes even if lockfile, manifest, or agent configs are missing or malformed   | Diagnostic tool must work in all states, including corrupted state         | BDD scenario  |
| C10 | With no skills installed and no agents detected, still shows the report sections with "none" | Report structure is always consistent regardless of state                  | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                  | Expected Output                                                             |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| E1  | `doctor` with 1 skill installed and properly linked    | Report shows skill with ✅ linked status; no suggestions                    |
| E2  | `doctor` with 1 skill installed but link target broken | Report shows ⚠️ broken link; suggestion to run `tank install @org/skill`    |
| E3  | `doctor` with no skills installed, no agents detected  | Report shows all sections; "none" under skills; suggestion to install agent |
| E4  | `doctor` with dev-linked skill (from `tank link`)      | Dev Links section shows skill with link status                              |
| E5  | `doctor` with corrupted lockfile                       | Does not crash; reports what it can; suggestion to reinstall                |
