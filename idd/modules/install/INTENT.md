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
apps/registry/src/api/routes/v1/skills-read.ts  # GET — list versions, fetch metadata + downloadUrl
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
