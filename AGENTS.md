# TANK — PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-14
**Commit:** 5dec4f6
**Branch:** main

## OVERVIEW

Security-first package manager for AI agent skills. Monorepo: CLI (`tank` command) + Next.js 15 web registry + shared schemas package. TypeScript-first with a Python security analysis module.

## STRUCTURE

```
tank/
├── apps/
│   ├── cli/          # `tank` CLI — Commander.js, 13 commands
│   └── web/          # Next.js 15 registry + API + Python analyzer
├── packages/
│   └── shared/       # @tank/shared — Zod schemas, types, constants, resolver
├── e2e/              # End-to-end tests (sequential, real CLI spawning)
├── docs/             # Product brief, architecture, roadmap
├── infra/            # Loki + Grafana configs (docker-compose)
├── supabase/         # Supabase local dev config
├── scripts/          # One-off utilities (backfill-readme.mjs)
└── test-skill/       # Fixture skill for E2E testing
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add CLI command | `apps/cli/src/commands/` | Register in `bin/tank.ts` |
| Add API endpoint | `apps/web/app/api/v1/` | Next.js Route Handler pattern |
| Add UI page | `apps/web/app/` | Route groups: `(auth)`, `(dashboard)`, `(registry)` |
| Modify DB schema | `apps/web/lib/db/schema.ts` | Run `drizzle-kit generate` after |
| Add shared type/schema | `packages/shared/src/` | Export from `index.ts` |
| Add UI component | `apps/web/components/ui/` | `npx shadcn add <component>` |
| Modify permissions model | `packages/shared/src/schemas/permissions.ts` | Zod schema |
| Auth configuration | `apps/web/lib/auth.ts` | better-auth with GitHub OAuth |
| Environment variables | `.env.local` (root) | Copy from `.env.example` |
| E2E tests | `e2e/` | Needs `.env.local` with real credentials |

## DEPENDENCY GRAPH

```
@tank/shared (schemas, types, constants)
     ↑                    ↑
     │                    │
  apps/cli            apps/web
 (9 files import)   (1 file imports)
```

No circular dependencies. CLI and Web are independent consumers of shared.

## CONVENTIONS

- **Strict TypeScript** — `strict: true` everywhere, no `as any`, no `@ts-ignore`
- **ESM only** — `"type": "module"` in all packages
- **2-space indent, LF line endings** — enforced via `.editorconfig`
- **pnpm 10.29.3** — enforced via `packageManager` field (run `corepack enable`)
- **Turbo** orchestrates `build`, `test`, `lint`, `dev` across workspaces
- **No ESLint/Prettier configured** — relies on TypeScript strict mode + `.editorconfig`
- **Import alias** — Web app uses `@/*` (tsconfig paths), CLI uses relative `.js` extensions
- **Test files** — `__tests__/*.test.ts` colocated with source. Never `.spec.ts`
- **Vitest** for TypeScript, **pytest** for Python

## ANTI-PATTERNS

- **Never suppress types** — no `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never use `.spec.ts`** — always `.test.ts`
- **Never import between apps** — CLI and Web must not import from each other, use `@tank/shared`
- **Never commit `.env.local`** — contains real credentials
- **Never use `require()`** — ESM only
- **Never create DB connections outside `apps/web/lib/db.ts`** — hot-reload singleton
- **Never use Supabase for DB queries** — Supabase is storage-only, use Drizzle ORM
- **Never expose `supabaseAdmin` to browser** — service-role key is server-only

## COMMANDS

```bash
# Setup
pnpm install                      # Install all dependencies
cp .env.example .env.local        # Configure credentials

# Development
pnpm dev                          # Start all dev servers (Turbo)
pnpm build                        # Build all packages
pnpm test                         # Run all unit tests (445 TS + 16 Python)
pnpm test:e2e                     # Run E2E tests (needs .env.local)

# Per-package
pnpm test --filter=cli            # CLI tests only
pnpm test --filter=web            # Web tests only
pnpm test --filter=shared         # Shared package tests only

# Database
pnpm --filter=web drizzle-kit generate  # Generate migration
pnpm --filter=web drizzle-kit push      # Push schema to DB

# Infrastructure
docker-compose up                 # Start Loki + Grafana (port 4000)
```

## NOTES

- **Node.js 24+** and **Python 3.14+** required
- **Supabase** is for file storage (tarballs) only — Drizzle + `postgres` connects directly to PostgreSQL
- **Python API** (`apps/web/api-python/`) is a FastAPI stub for security analysis — not yet fully implemented
- **CLI auth flow**: browser OAuth → API key stored in `~/.tank/config.json`
- **E2E tests run sequentially** — producer must finish before consumer
- **Two logging tiers**: user-facing (`chalk`) and debug (`pino` → Loki). Enable debug: `TANK_DEBUG=1`
- **Web app imports `@tank/shared` but doesn't declare it** in its `package.json` — works via pnpm workspace hoisting
