# Permissions Module

## Anchor

**Why this module exists:** After installing skills, the agent operator needs to understand
exactly what permissions their installed skills collectively require, and whether those
permissions stay within the declared budget in `tank.json`. The permissions command
collects all permission requirements from the lockfile, displays them grouped by category,
and runs a budget compliance check — a critical security review step before running agents.

**Consumers:** CLI (`tank permissions`), MCP server (`skill-permissions` tool).

**Single source of truth:**

- `packages/cli/src/commands/permissions.ts` — `permissionsCommand()`
- `packages/mcp-server/src/tools/skill-permissions.ts` — MCP wrapper
- Permission data stored per-version in `tank.lock` entries

---

## Layer 1: Structure

```
packages/
  cli/src/commands/permissions.ts              # permissionsCommand() — reads lockfile + manifest, displays summary
  mcp-server/src/tools/skill-permissions.ts   # MCP wrapper
```

---

## Layer 2: Constraints

| #   | Rule                                                                                               | Rationale                                                                        | Verified by   |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| C1  | Reads permissions from `tank.lock` entries — no registry API call needed                           | Permissions are frozen at install time; lockfile is the ground truth             | BDD scenario  |
| C2  | If no lockfile exists, reports "no skills installed" and exits cleanly                             | Graceful handling of empty project                                               | BDD scenario  |
| C3  | Groups permissions by category: network (outbound), filesystem (read/write), subprocess            | Structured output matches the permission schema                                  | BDD assertion |
| C4  | Each permission entry attributes which skills request it                                           | Essential for understanding which skill requires a given permission              | BDD assertion |
| C5  | When `tank.json` has a `permissions` budget, runs a budget compliance check                        | Security enforcement: agent cannot exceed declared permission scope              | BDD scenario  |
| C6  | Budget status PASS: all skill permissions are within the declared budget                           | Clear signal that the install is safe to run                                     | BDD assertion |
| C7  | Budget status FAIL: lists each out-of-budget permission with the skills that requested it          | Actionable output — operator knows exactly what to fix or allow                  | BDD assertion |
| C8  | Wildcard domain matching: `*.example.com` allows `sub.example.com` in the budget check             | Avoids overly strict subdomain listing                                           | BDD scenario  |
| C9  | Path prefix matching: `./src/**` in budget allows `./src/components/index.ts`                      | Glob-style path allowances in filesystem budget                                  | BDD scenario  |
| C10 | Subprocess permission: if any skill requests subprocess and budget does not allow it, budget fails | Subprocess is high-risk; explicit consent required                               | BDD scenario  |
| C11 | No budget in `tank.json`: displays warning "No budget defined" but does not fail                   | Operators without a budget file should see permissions; warning is informational | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                                            | Expected Output                                                                |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| E1  | Lockfile with 1 skill needing `*.anthropic.com`; budget allows `*.anthropic.com` | PASS; network outbound shows `*.anthropic.com ← @org/skill`                    |
| E2  | Lockfile with 1 skill needing `evil.com`; budget allows only `*.anthropic.com`   | FAIL; lists `evil.com` as out of budget                                        |
| E3  | Lockfile with skill needing subprocess; budget has `subprocess: false`           | FAIL; subprocess listed as budget violation                                    |
| E4  | Lockfile with skill needing subprocess; budget has `subprocess: true`            | PASS; subprocess listed under subprocess section                               |
| E5  | No `tank.json` permissions budget                                                | Shows permissions table; budget status: "No budget defined" (warning)          |
| E6  | No lockfile                                                                      | Reports "no skills installed"; exits cleanly                                   |
| E7  | Empty lockfile                                                                   | Reports "no skills installed"; exits cleanly                                   |
| E8  | Two skills with same network domain; one skill with unique domain outside budget | Attribution shows both skills for shared domain; FAIL for out-of-budget domain |
