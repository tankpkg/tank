# Info Module

## Anchor

**Why this module exists:** Users need to inspect a skill's metadata — version, description, publisher, audit score, and declared permissions — before deciding to install it. The `tank info` command fetches this data from the registry API and formats it for the terminal.

**Consumers:** CLI (`tank info @org/skill` / `infoCommand()`), MCP server (`skill-info` tool).

**Single source of truth:** `packages/cli/src/commands/info.ts` → `GET /api/v1/skills/[name]` (metadata) + `GET /api/v1/skills/[name]/[version]` (version details including permissions).

---

## Layer 1: Structure

```
packages/cli/src/commands/info.ts               # CLI: fetch meta + version, format output
packages/web/app/api/v1/skills/[name]/route.ts  # GET — skill metadata, latestVersion
packages/web/app/api/v1/skills/[name]/[version]/route.ts # GET — version details, permissions, auditScore
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                  | Rationale                                                | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------ |
| C1  | `GET /api/v1/skills/[name]` returns 404 for unknown skills                                            | CLI must print "Skill not found" and exit cleanly        | BDD scenario |
| C2  | Response includes `name`, `description`, `visibility`, `latestVersion`, `publisher.name`, `createdAt` | CLI formats each field in the output                     | BDD scenario |
| C3  | Private skills are invisible to unauthenticated requests (same as 404)                                | Privacy must not leak via the info command               | BDD scenario |
| C4  | Auth token is sent as `Authorization: Bearer` if present in config                                    | Allows viewing own private skills                        | BDD scenario |
| C5  | Permissions block is only shown when the version has non-empty permissions                            | Zero-permission skills should not show an empty block    | BDD scenario |
| C6  | Network errors produce a descriptive error message, not a raw exception                               | CLI must never crash with an unhandled promise rejection | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                      | Expected Output                                 |
| --- | ---------------------------------------------------------- | ----------------------------------------------- |
| E1  | `tank info @org/react` for a published skill               | Prints name, version, publisher, audit score    |
| E2  | `tank info @org/nonexistent`                               | Prints "Skill not found: @org/nonexistent"      |
| E3  | `tank info @org/skill` where skill has network permissions | Permissions block printed with outbound domains |
| E4  | `tank info @org/skill` for private skill, unauthenticated  | "Skill not found" (not a permissions error)     |
| E5  | Registry unreachable                                       | Error: "Network error fetching skill info: ..." |
