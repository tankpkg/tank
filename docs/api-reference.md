# API Reference

Tank registry exposes two API surfaces: a public REST API (`/api/v1/`) consumed by the CLI and MCP server, and an admin API (`/api/admin/`) for moderation and user management. Authentication supports three modes depending on the caller.

## Authentication Modes

### Web Sessions (better-auth)

Browser-based authentication using GitHub OAuth. Sessions are managed by better-auth with cookie-based storage. Layout-level guards enforce access control across route groups:

- `(auth)` -- login page
- `(dashboard)` -- requires active session
- `(admin)` -- requires admin role
- `(registry)` -- public, no auth required

### CLI Bearer Tokens

API keys prefixed with `tank_*`, issued through the CLI OAuth flow:

1. CLI calls `POST /api/v1/cli-auth/start` -- receives a poll token
2. User opens browser, completes GitHub OAuth at `/api/v1/cli-auth/authorize`
3. CLI polls `POST /api/v1/cli-auth/exchange` -- receives API key

Keys carry scopes: `skills:read`, `skills:publish`, `skills:admin`. Validated server-side by `verifyCliAuth()` in `lib/auth-helpers.ts`.

### OIDC SSO

Enterprise single sign-on via OpenID Connect providers. Configured through `OIDC_*` environment variables and the `genericOAuth` better-auth plugin in `lib/auth.ts`.

## Public API (`/api/v1/`)

| Endpoint                                   | Methods      | Purpose                              |
| ------------------------------------------ | ------------ | ------------------------------------ |
| `/cli-auth/start`                          | POST         | Begin OAuth flow, returns poll token |
| `/cli-auth/authorize`                      | GET          | User grants access                   |
| `/cli-auth/exchange`                       | POST         | Exchange poll token for API key      |
| `/skills`                                  | GET, POST    | Search skills, publish new skill     |
| `/skills/confirm`                          | POST         | Finalize publish after upload        |
| `/skills/[name]`                           | GET          | Get skill metadata                   |
| `/skills/[name]/versions`                  | GET          | List all versions                    |
| `/skills/[name]/star`                      | POST, DELETE | Star/unstar skill                    |
| `/skills/[name]/[version]`                 | GET          | Get version metadata                 |
| `/skills/[name]/[version]/files/[...path]` | GET          | Get file content                     |
| `/search`                                  | GET          | Full-text search with GIN index      |
| `/badge/[...name]`                         | GET          | SVG badge generation                 |
| `/scan`                                    | POST         | Security scan (upload tarball)       |

## Admin API (`/api/admin/`)

All admin endpoints require admin role. Access is enforced by `requireAdmin()` / `withAdminAuth()` in `lib/admin-middleware.ts`. All admin actions are audit-logged.

| Endpoint                              | Methods          | Purpose                                              |
| ------------------------------------- | ---------------- | ---------------------------------------------------- |
| `/packages`                           | GET              | List all packages for moderation                     |
| `/packages/[...segments]`             | GET, PUT, DELETE | Package CRUD                                         |
| `/users`                              | GET              | List all users                                       |
| `/users/[userId]`                     | GET, PUT         | User CRUD                                            |
| `/users/[userId]/status`              | PUT              | Enable/disable/ban user                              |
| `/orgs`                               | GET              | List organizations                                   |
| `/orgs/[orgId]`                       | GET, PUT, DELETE | Organization CRUD                                    |
| `/orgs/[orgId]/members/[memberId]`    | PUT, DELETE      | Member management                                    |
| `/audit-logs`                         | GET              | Query audit logs (action, actor, target, date range) |
| `/rescan-skills`                      | POST             | Bulk security rescan                                 |
| `/service-accounts`                   | GET, POST        | Service account CRUD                                 |
| `/service-accounts/[id]`              | GET, PUT, DELETE | Service account management                           |
| `/service-accounts/[id]/keys`         | GET, POST        | API key management                                   |
| `/service-accounts/[id]/keys/[keyId]` | DELETE           | Revoke API key                                       |

## Audit Score

Every published skill receives a score from 0 to 10, computed in `lib/audit-score.ts`. Always 8 entries, max 10 points total:

| Check                      | Points | Criteria                |
| -------------------------- | ------ | ----------------------- |
| SKILL.md present           | 1      | Manifest file exists    |
| Description present        | 1      | Non-empty description   |
| Permissions declared       | 1      | Explicit capability list |
| No security issues         | 2      | Clean scan result       |
| Permission extraction match| 2      | Declared matches actual |
| File count reasonable      | 1      | Under 100 files         |
| README documentation       | 1      | README exists           |
| Package size reasonable    | 1      | Under 5 MB              |

## Permission Escalation Rules

Defined in `lib/permission-escalation.ts`. Prevents silent permission creep across version bumps:

- `determineBump()` detects whether a version change is major, minor, or patch
- **PATCH** bumps with ANY new permissions are **rejected**
- **MINOR** bumps with dangerous permissions (network, subprocess) are **rejected**
- **MAJOR** bumps allow any permission changes

## Database Singleton Pattern

The database connection is a `globalThis` singleton in `lib/db.ts` to prevent connection leaks during Next.js hot-reload in development. The schema is split into two files:

- `lib/db/schema.ts` -- domain tables (skills, versions, downloads, audit, scans)
- `lib/db/auth-schema.ts` -- auto-generated by better-auth (never edit manually)

All database access uses Drizzle ORM. Supabase is used exclusively for file storage (tarballs), never for queries. Optimized combined queries live in `lib/data/skills.ts`.

## Full-Text Search

- `searchVector` column on the skills table
- GIN index for fast lookups
- Trigram similarity for fuzzy matching
- Exposed via `GET /api/v1/search` and `GET /api/search` (web UI)
