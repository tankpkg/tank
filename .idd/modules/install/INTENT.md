# Install Module

## Anchor

**Why this module exists:** An AI agent or developer declares a skill dependency by name
and semver range. The install module resolves the dependency graph, downloads and verifies
each tarball, writes a reproducible lockfile, and links the skill to detected AI agents —
all in one atomic command. Without this, there is no way to add skills to a project.

**Consumers:** CLI (`tank install @org/skill`), MCP server (`install-skill` tool via stdio),
CI/CD pipelines (`tank install` from lockfile). The MCP variant is the primary test target;
the CLI delegates to the same internal pipeline.

**Single source of truth:**

- `packages/cli/src/commands/install.ts` — `installCommand()`, `installFromLockfile()`, `installAll()`
- `packages/cli/src/lib/install-pipeline.ts` — download, extract, verify, write lockfile
- `packages/cli/src/lib/dependency-resolver.ts` — semver resolution
- `packages/mcp-server/src/tools/install-skill.ts` — MCP wrapper

---

## Layer 1: Structure

```
packages/
  cli/src/commands/install.ts          # installCommand(), installFromLockfile(), installAll()
  cli/src/lib/
    install-pipeline.ts                # downloadAllParallel(), extractSafely(), writeLockfileWithResolvedGraph()
    dependency-resolver.ts             # resolveDependencyTree(), buildSkillKey()
    permission-checker.ts              # checkPermissionBudget()
    packer.ts                          # (used by publish, not install)
  mcp-server/src/tools/install-skill.ts  # MCP wrapper
web/app/api/v1/skills/
  [name]/versions/route.ts             # GET — list available versions for a skill
  [name]/[version]/route.ts            # GET — fetch metadata + downloadUrl for a version
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                   | Rationale                                                                     | Verified by   |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------- |
| C1  | Skill name must be scoped (`@org/name`) — unscoped names are rejected at MCP tool input validation     | Enforces registry naming convention; prevents ambiguous installs              | BDD scenario  |
| C2  | Latest version is resolved via semver when no version or range is specified                            | Predictable installs without knowing exact versions                           | BDD scenario  |
| C3  | A specific semver version or range (e.g. `^1.0.0`) can be requested                                    | Supports pinning for reproducibility                                          | BDD scenario  |
| C4  | If the skill is already at the requested version, install is a no-op with "already installed" message  | Prevents redundant downloads; idempotent                                      | BDD scenario  |
| C5  | Lockfile (`tank.lock`) is written after successful install with `sha512-<hash>` integrity field        | Reproducible installs; integrity verification on subsequent installs          | BDD assertion |
| C6  | `tank.json` skills map is updated with the installed skill and version range                           | Manifest stays in sync with installed state                                   | BDD assertion |
| C7  | If the registry is unreachable, install fails with a network error — no partial state is written       | No corrupted lockfiles from partial installs                                  | BDD scenario  |
| C8  | If the requested skill does not exist, install fails with "not found" message                          | Clear error; prevents silent failures                                         | BDD scenario  |
| C9  | If the requested version does not satisfy the available range, install fails with an informative error | Clear error; prevents installing wrong versions                               | BDD scenario  |
| C10 | Without auth token, install for private skills fails; public skills can install unauthenticated        | Public registry is open; private requires identity                            | BDD scenario  |
| C11 | `installFromLockfile` re-downloads and re-verifies all skills pinned in `tank.lock`                    | CI mode: deterministic re-installs from lockfile without semver re-resolution | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                        | Expected Output                                                                  |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| E1  | `install-skill({ name: "@org/react" })`                      | Installs latest version; lockfile entry with `sha512-...` integrity              |
| E2  | `install-skill({ name: "@org/react", version: "1.0.0" })`    | Installs exactly `1.0.0`; lockfile key `@org/react@1.0.0`                        |
| E3  | `install-skill({ name: "@org/react", version: "^1.0.0" })`   | Resolves best version satisfying `^1.0.0`; lockfile entry written                |
| E4  | `install-skill` when skill already at same version           | Returns "already installed" without modifying lockfile or manifest               |
| E5  | `install-skill({ name: "web-search" })` (unscoped)           | Fails with validation error mentioning `@org/name` format                        |
| E6  | `install-skill` with no auth token                           | Fails with "not authenticated" or "log in" message                               |
| E7  | `install-skill({ name: "@acme/nonexistent-bdd-test" })`      | Fails with "not found" message containing the skill name                         |
| E8  | `install-skill` with registry URL set to unreachable address | Fails with network/connection error; skill dir NOT created on disk               |
| E9  | `install-skill({ name: "@org/skill", version: "99.0.0" })`   | Fails with "no version satisfies range" or "version not found" message           |
| E10 | `installFromLockfile` with a valid `tank.lock`               | Re-downloads and re-verifies all skills; succeeds with count of installed skills |

---

## Layer 2 Addendum: Interactive Permission Budget Expansion (Issue #169)

| #   | Rule                                                                                                                              | Rationale                                                                      | Verified by |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| C12 | When a skill's permissions exceed the project budget in interactive mode, prompt the user to expand the budget instead of failing | Reduces friction — users shouldn't need to hand-edit tank.json for permissions | Unit test   |
| C13 | All violations are collected before prompting — never prompt one-by-one per violation                                             | Single decision point; user sees the full security impact at once              | Unit test   |
| C14 | If the user accepts, tank.json permissions are merged (additive) and the install continues                                        | Expanding budget is an explicit, auditable user decision                       | Unit test   |
| C15 | If the user declines, install fails with the same error as today                                                                  | Declining = current behavior preserved                                         | Unit test   |
| C16 | With `--yes` flag, violations are auto-accepted and tank.json is updated without prompting                                        | Enables scripted/automated installs that accept permission expansion           | Unit test   |
| C17 | In non-interactive environments (CI, no TTY) without `--yes`, install fails as today — no prompt                                  | CI pipelines must not hang on stdin; explicit opt-in only                      | Unit test   |
| C18 | The prompt displays which skill requests which permission type and value                                                          | User must understand what they're granting before accepting                    | Unit test   |

## Layer 3 Addendum: Interactive Permission Budget Expansion

| #   | Input                                                                                    | Expected Output                                                                          |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E11 | Install skill requesting `filesystem.read: ["*/"]`, budget has no `filesystem.read`, TTY | Prompt shown; user accepts → tank.json gains `filesystem.read: ["*/"]`, install succeeds |
| E12 | Same as E11 but user declines                                                            | Install fails with "Permission denied" error, tank.json unchanged                        |
| E13 | Install skill requesting `subprocess: true`, budget has `subprocess: false`, `--yes`     | No prompt; tank.json updated to `subprocess: true`, install succeeds                     |
| E14 | Install skill requesting `network.outbound: ["api.example.com"]`, CI=true, no `--yes`    | Install fails with "Permission denied" — no prompt shown                                 |
| E15 | Install skill requesting both `filesystem.read` and `network.outbound` outside budget    | Single prompt listing both violations; user accepts → both merged into tank.json         |
| E16 | Install skill whose permissions are within budget                                        | No prompt shown; install proceeds normally (existing behavior unchanged)                 |
