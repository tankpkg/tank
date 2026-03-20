# API Reference

Current web API surfaces, auth modes, and important implementation facts.

## Auth Modes

The web app accepts two main caller types:

### Browser/session callers

- better-auth session cookies
- used by dashboard/admin/browser flows
- access control is enforced in layouts, route handlers, and admin helpers

### CLI/MCP callers

- `Authorization: Bearer tank_...`
- API keys are verified through `verifyCliAuth()`
- scope checks are route-specific
- blocked users and disabled service accounts are denied

Optional OIDC exists through better-auth configuration in `apps/registry/src/lib/auth/core.ts`.

## Public API (`/api/v1`)

Current route groups under `apps/registry/src/api/routes/v1/`:

- `cli-auth/start`
- `cli-auth/authorize`
- `cli-auth/exchange`
- `skills`
- `skills/[name]`
- `skills/[name]/versions`
- `skills/[name]/star`
- `skills/[name]/[version]`
- `skills/[name]/[version]/files/[...path]`
- `search`
- `scan`
- `badge/[...name]`
- `auth/whoami`

Important behaviors:

- publish validates `skills.json` with shared schemas
- publish checks org membership for scoped names
- publish checks permission escalation against the previous version
- file/content endpoints enforce visibility and access checks

## Admin API (`/api/admin`)

Admin API routes (TODO: not yet fully ported to TanStack):

- `packages`
- `users`
- `users/[userId]/status`
- `orgs`
- `orgs/[orgId]`
- `orgs/[orgId]/members/[memberId]`
- `audit-logs`
- `rescan-skills`
- `service-accounts`
- `service-accounts/[id]`
- `service-accounts/[id]/keys`
- `service-accounts/[id]/keys/[keyId]`

Admin routes depend on admin middleware and audit logging.

## Data And Search

- Drizzle talks to PostgreSQL
- Supabase is only used for tarball/object storage
- search uses Postgres full-text indexing and trigram matching from the DB layer
- optimized browse/search reads live in `apps/registry/src/lib/skills/data.ts`

## Publish-Related Helpers

Important files:

- `apps/registry/src/lib/auth/tokens.ts`
- `apps/registry/src/lib/skills/permission-escalation.ts`
- `apps/registry/src/lib/skills/audit-score.ts`
- `apps/registry/src/services/storage/` (TODO: verify storage provider location)

These files are the source of truth for API-key auth, version-permission checks, audit score rules, and upload/download URL generation.
