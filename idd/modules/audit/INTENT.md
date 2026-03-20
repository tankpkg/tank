# Audit Module

## Anchor

**Why this module exists:** After skills are installed, developers and CI need to review
the security audit scores of their installed skills. The audit command reads the lockfile,
fetches the audit score and permissions for each installed skill from the registry, and
displays a consolidated security posture table. A single-skill audit shows full details
including permissions breakdown.

**Consumers:** CLI (`tank audit`, `tank audit @org/skill`), MCP server (`audit-skill` tool).

**Single source of truth:**

- `packages/cli/src/commands/audit.ts` — `auditCommand()`
- `packages/mcp-server/src/tools/audit-skill.ts` — MCP wrapper
- `apps/registry/src/api/routes/v1/skills-read.ts` — source of audit data

---

## Layer 1: Structure

```
packages/
  cli/src/commands/audit.ts              # auditCommand() — reads lockfile, fetches /skills/name/version
  mcp-server/src/tools/audit-skill.ts   # MCP wrapper
apps/registry/src/api/routes/v1/skills-read.ts  # GET — returns auditScore, auditStatus, permissions
```

---

## Layer 2: Constraints

| #   | Rule                                                                                | Rationale                                                                    | Verified by   |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| C1  | Requires a `tank.lock` — exits gracefully if none exists                            | No lockfile = no installed skills to audit                                   | BDD scenario  |
| C2  | With no skills in lockfile, reports "no skills installed" and exits cleanly         | Empty lockfile is valid; not an error                                        | BDD scenario  |
| C3  | All-skills audit displays a table: name, version, score, status for each skill      | At-a-glance security posture for the whole project                           | BDD assertion |
| C4  | Score 0.0–3.9 = issues (red); 4.0–6.9 = warning (yellow); 7.0–10.0 = pass (green)   | Consistent scoring thresholds across CLI and web                             | BDD assertion |
| C5  | If audit score is pending (not yet completed), displays "pending" not a number      | Scanner may not have finished; misleading score must not be shown            | BDD assertion |
| C6  | Single-skill audit displays full details: score, status, permissions breakdown      | Developers need the full risk picture for a specific skill before a decision | BDD assertion |
| C7  | If the named skill is not in the lockfile, reports "skill not installed"            | Clear error; prevents confusion with registry lookup                         | BDD scenario  |
| C8  | Network errors fetching audit data fail fast with a network error message           | Unlike API 404s, network failures indicate a systemic problem                | BDD scenario  |
| C9  | API errors (404, etc.) for individual skills are shown with error status, not crash | One unavailable skill should not abort the audit of all others               | BDD scenario  |
| C10 | Summary line shows: total count, pass count, issues count                           | Compact summary for CI output parsing                                        | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                        | Expected Output                                                              |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| E1  | `audit-skill` with 2 skills in lockfile, both with score 8.0 | Table with both skills; 2 pass in summary                                    |
| E2  | `audit-skill` with 1 skill with score 2.5                    | Skill shown with "issues" status; 0 pass, 1 has issues in summary            |
| E3  | `audit-skill` with audit score still pending                 | Shows "pending" for score; status "pending"; no crash                        |
| E4  | `audit-skill({ name: "@org/skill" })` single skill           | Full details shown: score, status, network/filesystem/subprocess permissions |
| E5  | `audit-skill({ name: "@org/not-installed" })`                | Returns "not installed" message                                              |
| E6  | No lockfile exists                                           | Reports "run: tank install"; exits gracefully                                |
| E7  | Empty lockfile                                               | Reports "no skills installed"; exits cleanly                                 |
