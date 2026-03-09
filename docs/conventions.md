# Conventions

Non-tooling conventions. Formatting, indent, quotes, semicolons, ESM, strict mode are handled by Biome, EditorConfig, and @tsconfig/bun. This doc covers what no linter catches.

## Universal

- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- **Test files** — `__tests__/*.test.ts` colocated with source. Never `.spec.ts`.
- **Vitest** for TypeScript, **pytest** for Python (`test_*.py`)
- **Minimal comments** — only for complex logic that isn't self-evident

## Web App

- **Server Components by default** — `'use client'` only when needed
- **Zod `safeParse()` at every boundary** — never `parse()`, throws = invisible control flow
- **Drizzle ORM only** — never raw SQL, never Prisma
- **Auth in layout components** — never in page components. Route groups handle access control:
  - `(auth)` — login
  - `(dashboard)` — requires session
  - `(admin)` — requires admin role
  - `(registry)` — public
- **Import alias** — `@/*` via tsconfig paths
- **DB singleton** — `globalThis` pattern in `lib/db.ts` for Next.js hot-reload. Never create connections elsewhere.
- **Supabase = file storage only** — tarballs. All queries through Drizzle ORM.
- **`auth-schema.ts` is auto-generated** by better-auth. Never edit manually.
- **Audit logging mandatory** for admin actions

## CLI

- **1-file-per-command** — export async fn, register in `bin/tank.ts`
- **`configDir` injection** — for test isolation, never touch real `~/.tank/`
- **chalk** for user-facing output, **pino** for debug logs (`TANK_DEBUG=1`)
- **Relative `.js` extensions** in import paths
- **Never hardcode registry URL** — use `REGISTRY_URL` from `@internal/shared` or config

## MCP Server

- **1-file-per-tool** — export `registerXxxTool(server)`, register in `index.ts`
- **Markdown output** — tools format results as markdown for editor readability
- **Shares auth with CLI** — reads `~/.tank/config.json`, `TANK_TOKEN` env var overrides

## Python Scanner

- **Pydantic 2** for all models — strict validation
- **Each stage independent** — can error without blocking others
- **Stage 0 (ingest) is mandatory** — all subsequent stages depend on its output
- **Errored stages** report `errored` status, never silently return empty results

## Shared Package

- **Pure library** — zero side-effect dependencies, no runtime deps
- **Barrel export** — all public API through `src/index.ts`
- **Exported constants are frozen** — never mutate
