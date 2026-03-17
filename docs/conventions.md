# Conventions

Non-tooling conventions that agents should follow in this repo.

## Universal

- Conventional commits only: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- Tests use `*.test.ts` for TypeScript and `test_*.py` for Python
- Use comments sparingly; only where the code is not already obvious
- Prefer `safeParse()` at validation boundaries; avoid thrown validation control flow

## Web

- Server Components by default
- auth checks belong in layouts/route groups, not page components
- Drizzle is the query layer; no raw SQL unless there is a clear reason
- `auth-schema.ts` is generated; do not edit it
- `lib/db.ts` owns the database singleton
- Supabase is storage, not the query layer
- `@/` is the local import alias

## CLI

- one file per command under `src/commands/`
- register commands in `src/bin/tank.ts`
- support `configDir`/homedir-style isolation for tests
- keep user-facing output simple; debug detail goes through the logger path
- use `@internals/schemas` for shared schemas and constants

## MCP Server

- one file per tool under `src/tools/`
- register tools from `src/index.ts`
- return markdown-friendly text payloads
- reuse Tank config auth; `TANK_TOKEN` overrides file config

## Scanner

- Pydantic 2 models are the API contract
- Stage 0 is required input to later stages
- later stages may `errored`; do not hide failures as empty success
- findings should include stage, severity, description, and location when available

## Shared

- keep the package pure
- export public API through `src/index.ts`
- avoid side effects and runtime-only assumptions
