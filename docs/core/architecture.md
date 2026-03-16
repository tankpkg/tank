# Architecture

Tank is a Bun workspace monorepo with a TypeScript control plane and a separate Python scanner service.

## Runtime Topology

- `packages/cli` is the user entrypoint for install, publish, verify, scan, and discovery.
- `packages/mcp-server` exposes the same core capabilities to editor clients over MCP.
- `apps/registry` is the active registry target for public UI, docs, API, and dashboard/admin migration.
- `apps/registry-legacy` remains live during cutover and is still a real behavior surface.
- `apps/python-api` performs multi-stage security scanning.
- `packages/internals-schemas` and `packages/internals-helpers` are the only shared TS layers.

## Data And Auth Boundaries

- PostgreSQL + Drizzle are the application data layer.
- Supabase or S3-compatible backends are storage only.
- Better Auth owns browser sessions and API key plumbing.
- MCP and CLI both anchor auth in `~/.tank/config.json`.
- `auth-schema.ts` is generated. Never edit it.

## Package Boundaries

- CLI, web, and MCP do not import each other directly.
- Shared TS code only flows through `@internals/*`.
- Scanner stays independent from the TS packages.

## TanStack Start Patterns

- File-based routing via TanStack Router in `src/routes/`
- API routes via Hono in `src/api/routes/` (catch-all at `/api/$`)
- Server functions in `src/query/` (createServerFn)
- Auth: Better Auth with session cookies + API key middleware
- Components in `src/components/`, screens in `src/screens/`

## Testing Topology

- `idd/` = intent
- `bdd/` = executable behavior
- `e2e/` = full-stack regression

Browser behavior is split into shared, Next-specific, and TanStack-specific lanes. Do not collapse that split unless the product behavior converges first.
