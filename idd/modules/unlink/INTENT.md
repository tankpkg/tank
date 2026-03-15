# Unlink Module

## Anchor

**Why this module exists:** When a developer is done testing a locally-linked skill, they need to cleanly remove it — restoring `skills.json` and deleting the symlink from `.tank/skills/`. `tank unlink` is the reverse of `tank link`, scoped to a single skill. It must be idempotent: unlinking a skill that isn't linked is a no-op, not an error.

**Consumers:** CLI (`tank unlink` / `unlinkCommand()`), MCP server (`unlink-skill` tool).

**Single source of truth:**

- `packages/cli/src/commands/unlink.ts` — `unlinkCommand()`
- `packages/cli/src/lib/linker.ts` — `unlinkSkillFromAgents()`
- `packages/mcp-server/src/tools/unlink-skill.ts` — MCP wrapper

---

## Layer 1: Structure

```
packages/
  cli/src/commands/unlink.ts              # unlinkCommand() — resolves skill name, removes symlink, updates skills.json
  cli/src/lib/linker.ts                   # unlinkSkillFromAgents() — agent config cleanup
  mcp-server/src/tools/unlink-skill.ts    # MCP wrapper
```

---

## Layer 2: Constraints

| #   | Rule                                                                       | Rationale                                                   | Verified by   |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- |
| C1  | Must remove the symlink from `.tank/skills/`                               | The skill directory link must not persist after unlink      | BDD scenario  |
| C2  | Must update `skills.json` to remove the entry                              | Manifest must reflect actual installed/linked state         | BDD assertion |
| C3  | Idempotent — unlinking an already-unlinked skill is a no-op (not an error) | Repeated unlink should be safe in scripts and automation    | BDD scenario  |
| C4  | Must not touch other linked or installed skills                            | Scoped removal; unlink is surgical, not bulk                | BDD assertion |
| C5  | Must warn if the skill was never linked                                    | Developer feedback — they may have a typo in the skill name | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                          | Expected Output                                                  |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| E1  | `unlink-skill({ name: "@org/skill" })` after linking           | Symlink removed, `skills.json` entry removed, success message    |
| E2  | `unlink-skill({ name: "@org/skill" })` when skill never linked | Warning: "skill @org/skill is not linked"; exits cleanly         |
| E3  | `unlink-skill({ name: "@org/skill" })` called twice            | Second call is a no-op; no error, warning about not being linked |
| E4  | `unlink-skill({ name: "@org/a" })` with `@org/b` also linked   | Only `@org/a` is removed; `@org/b` remains untouched             |
