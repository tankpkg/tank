# Web Registry Module

## Anchor

**Why this module exists:** The Tank registry exposes a public REST API for reading skill metadata. This API is the authoritative data source for `tank install`, `tank info`, `tank search`, and the web UI. It must enforce visibility rules (public vs. private) and return well-shaped JSON for all consumers.

**Consumers:** CLI (`tank install`, `tank info`), MCP server, web UI Server Components, and third-party integrations.

**Single source of truth:**

- `packages/web/app/api/v1/skills/[name]/route.ts` — single skill metadata
- `packages/web/app/api/v1/skills/[name]/[version]/route.ts` — version detail with permissions
- `packages/web/app/api/v1/skills/[name]/versions/route.ts` — list all versions
- `packages/web/app/api/v1/skills/[name]/[version]/files/[...path]/route.ts` — file content

---

## Layer 1: Structure

```
packages/web/app/api/v1/skills/
  [name]/route.ts               # GET — skill metadata + latestVersion
  [name]/[version]/route.ts     # GET — version detail: permissions, auditScore, downloadUrl
  [name]/versions/route.ts      # GET — list all versions for a skill
  [name]/[version]/files/       # GET — serve file content from tarball
  [name]/star/route.ts          # GET/POST/DELETE — star counts and toggle
packages/web/app/api/v1/badge/[...name]/route.ts # GET — SVG badge for auditScore
```

---

## Layer 2: Constraints

| #   | Rule                                                                                          | Rationale                                              | Verified by  |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| C1  | `GET /skills/[name]` returns 404 for unknown or private-to-others skills                      | Privacy must not leak existence of private skills      | BDD scenario |
| C2  | `GET /skills/[name]` returns `latestVersion` derived from the most recently created version   | Consumers need the current version without listing all | BDD scenario |
| C3  | `GET /skills/[name]/[version]` includes `permissions`, `auditScore`, `integrity`              | Installers use these to verify safety before install   | BDD scenario |
| C4  | `GET /skills/[name]/versions` returns all versions in descending creation order               | Version list must be stable and paginated              | BDD scenario |
| C5  | Unauthenticated requests can read public skills; private skills require the publisher's token | Visibility enforcement at the API layer                | BDD scenario |
| C6  | Skill name is URL-decoded before DB lookup                                                    | `@org/skill` must survive URL encoding in path params  | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                   | Expected Output                                                     |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| E1  | `GET /api/v1/skills/@org/react` (public, exists)        | 200: `{ name, description, latestVersion, publisher, createdAt }`   |
| E2  | `GET /api/v1/skills/@org/nonexistent`                   | 404: `{ error: "Skill not found" }`                                 |
| E3  | `GET /api/v1/skills/@org/react/1.0.0`                   | 200: `{ version, permissions, auditScore, integrity, downloadUrl }` |
| E4  | `GET /api/v1/skills/@org/react/versions`                | 200: array of version objects                                       |
| E5  | `GET /api/v1/skills/@org/private-skill` unauthenticated | 404 (same as not found)                                             |
