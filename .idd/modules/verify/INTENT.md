# Verify Module

## Anchor

**Why this module exists:** After install, the skill files on disk must match the lockfile.
Files can be deleted, corrupted, or tampered with between installs. The verify command
checks each lockfile entry against the actual skill directory on disk and reports any
discrepancies — missing files, empty directories — so the developer or CI knows whether
the installed state is trustworthy.

**Consumers:** CLI (`tank verify`), MCP server (`verify-skills` tool). The MCP tool is
the primary test target.

**Single source of truth:**

- `packages/cli/src/commands/verify.ts` — `verifyCommand()`
- `packages/mcp-server/src/tools/verify-skills.ts` — MCP wrapper

---

## Layer 1: Structure

```
packages/
  cli/src/commands/verify.ts              # verifyCommand() — reads lockfile, checks each skill dir
  mcp-server/src/tools/verify-skills.ts  # MCP wrapper
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                | Rationale                                                                       | Verified by   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| C1  | For each lockfile entry, the skill directory must exist under `.tank/skills/`                       | Missing directory = skill is not installed                                      | BDD scenario  |
| C2  | An existing but empty skill directory is reported as FAIL                                           | Empty dirs indicate failed extraction or intentional tampering                  | BDD scenario  |
| C3  | Verification reports per-skill PASS/FAIL status with the skill name and status label                | Fine-grained output so the developer knows which skills passed and which failed | BDD assertion |
| C4  | When ALL skills pass, the command succeeds and reports all-passed                                   | Success path must be unambiguous                                                | BDD scenario  |
| C5  | When ANY skill fails, the command exits with error and lists all failures                           | CI must fail-fast on integrity issues                                           | BDD scenario  |
| C6  | The total failure count is reported in the error message                                            | At-a-glance summary for multi-skill projects                                    | BDD assertion |
| C7  | Verifying an empty lockfile reports "no skills to verify" and succeeds                              | Empty lockfile is a valid state, not an error                                   | BDD scenario  |
| C8  | If no lockfile exists, the command fails with a message instructing the user to run `install-skill` | Verification without a lockfile has no ground truth to check against            | BDD scenario  |
| C9  | A specific skill name can be passed to verify only that skill                                       | Allows targeted verification without checking all installed skills              | BDD scenario  |
| C10 | Missing skills include a hint to reinstall                                                          | Actionable error message guides recovery                                        | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                                               | Expected Output                                                |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| E1  | Lockfile with 2 skills; both have non-empty dirs on disk                            | PASS for both; "all verified" message                          |
| E2  | Lockfile with 2 skills; one has an empty dir (tampered)                             | FAIL for empty dir skill; PASS for the other; exits with error |
| E3  | Lockfile with 1 skill; skill dir does not exist                                     | FAIL with MISSING status; "reinstall" hint in message          |
| E4  | Lockfile with 3 skills; 2 have empty dirs; 1 has files                              | 2 FAILs, 1 PASS; "2 issue(s)" in error message                 |
| E5  | Empty lockfile `{ skills: {} }`                                                     | "no skills to verify" or "empty"; succeeds (no error)          |
| E6  | No lockfile on disk                                                                 | Fails; message mentions lockfile not found and install-skill   |
| E7  | Lockfile with `@acme/web-search@2.1.0`; skill dir exists with files; verify by name | PASS for `@acme/web-search`; succeeds                          |
