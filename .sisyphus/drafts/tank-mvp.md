# Draft: Tank MVP Implementation

## Requirements (confirmed)
- CLI-first approach, starting with login and publish token creation
- Browser OAuth login flow (modern, PKCE-based, like `gh auth login`)
- Minimal web UI at MVP (auth pages, dashboard, org management, skill browse)
- TypeScript CLI (same language as registry)
- Monorepo structure (Turborepo + pnpm)
- TDD test strategy

## Technical Decisions
- **Domain**: tankpkg.dev (bought, on Cloudflare DNS)
- **Auth**: better-auth (GitHub OAuth + API keys with `tank_` prefix + organizations plugin)
- **Database**: Supabase PostgreSQL
- **File storage**: Supabase Storage (private bucket for .tgz packages)
- **Hosting**: Vercel
- **Web framework**: Next.js 15 (App Router)
- **CLI framework**: commander.js
- **Security analysis**: Vercel Python functions + OpenRouter free tier LLMs
- **Search**: PostgreSQL full-text search (vector search later)
- **UI**: Tailwind + shadcn/ui
- **ORM**: None for MVP (raw SQL via Supabase client, Drizzle later if needed)
- **Package manager**: pnpm

## Research Findings
- **better-auth + Supabase**: Use pg.Pool with connection pooler. API keys plugin supports `tank_` prefix, hashed storage, rate limiting. Organization plugin handles @org scoping. Need to manage RLS separately.
- **better-auth + Next.js**: Mount at /api/auth/[...all], use nextCookies() plugin, validate sessions in Server Components (not middleware).
- **Supabase Storage**: Private buckets, signed URLs (1hr expiry), 50MB limit per file, service role key for server uploads.
- **Vercel Python functions**: Same repo in api/*.py, auto-detected, FastAPI works. 250MB bundle limit.
- **OpenRouter free**: 26 free models, up to 262K context. 1000 req/day with $10 balance. Best models: qwen3-coder:free (permissions), deepseek-r1:free (security).

## Division of Labor
- **User (Elad)**: Next.js app, CLI, Supabase schema, better-auth, publish/install flows, web UI
- **Partner**: Vercel Python functions (security analysis, permission extraction, LLM audit scoring)
- **Shared interface**: Publish pipeline calls Python analysis endpoint, receives structured results

## Scope Boundaries
- INCLUDE: Auth, CLI (login/init/publish/install/remove/update/search/info/audit/permissions), Registry API, Web UI (auth pages, dashboard, browse, skill detail), Supabase schema, lockfile, semver resolution, permission budget validation, basic security analysis pipeline
- EXCLUDE: Code signing (Sigstore), SBOM generation, enforced semver (reject wrong bumps), WASM sandbox, verified publisher badges, private registries, transitive dependency resolution, rate limiting (runtime), Firecracker

## Sprint Plan
1. Scaffolding + Auth (Week 1-2)
2. CLI + Publish (Week 3-4)
3. Install + Lockfile (Week 5-6)
4. Discovery + Web Browse (Week 7-8)
5. Security Analysis Pipeline (Week 9-10) [Partner's domain]

## Test Strategy Decision
- **Infrastructure exists**: NO (greenfield)
- **User wants tests**: YES (TDD)
- **Framework**: vitest (or bun test — TBD in plan)
- **QA approach**: TDD (RED-GREEN-REFACTOR for each task)
