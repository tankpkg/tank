> Routes below exist in both `apps/registry-legacy` (Next.js) and `apps/registry` (TanStack Start).
> TanStack routes live in `apps/registry/src/api/routes/`. For new work, use TanStack.
> Admin API is scaffolded in TanStack but not yet fully ported.

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

Optional OIDC exists through better-auth configuration in `apps/registry-legacy/lib/auth.ts`.

## Public API (`/api/v1`)

Current route groups under `apps/registry-legacy/app/api/v1/`:

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

Current route groups under `apps/registry-legacy/app/api/admin/`:

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

Admin routes depend on `apps/registry-legacy/lib/admin-middleware.ts` and audit logging.

## Data And Search

- Drizzle talks to PostgreSQL
- Supabase is only used for tarball/object storage
- search uses Postgres full-text indexing and trigram matching from the DB layer
- optimized browse/search reads live in `apps/registry-legacy/lib/data/skills.ts`

## Publish-Related Helpers

Important files:

- `apps/registry-legacy/lib/auth-helpers.ts`
- `apps/registry-legacy/lib/permission-escalation.ts`
- `apps/registry-legacy/lib/audit-score.ts`
- `apps/registry-legacy/lib/storage/provider.ts`

These files are the source of truth for API-key auth, version-permission checks, audit score rules, and upload/download URL generation.
