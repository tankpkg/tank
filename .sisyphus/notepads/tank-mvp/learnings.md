# Tank MVP — Learnings

## Environment
- Node.js: v24.11.0
- pnpm: 10.29.3
- Platform: macOS (darwin)
- Project root: /Users/eladbenhaim/dev/personal/safe-skills-directory

## Conventions
- TDD: RED-GREEN-REFACTOR with vitest
- Commits: conventional commits (feat/fix/docs)
- Auth: better-auth with GitHub OAuth + API keys + organizations
- DB: Supabase PostgreSQL (raw SQL, no ORM)
- Storage: Supabase Storage (private bucket)
- Hosting: Vercel
- Monorepo: Turborepo + pnpm workspaces

## Skills Used
- modern-frontend-ui: Frontend components, Tailwind, shadcn
- nextjs-ai-mcp: Next.js App Router patterns
- better-auth-mastery: Auth integration
- git-master: All git operations
- e2e-test-creator: Test patterns
- saas-ux-expert: Dashboard/web UI

## Turborepo Monorepo Init (2026-02-14)

### What worked
- Turbo v2 with `turbo.json` tasks config (no pipeline key — that's v1)
- pnpm workspaces with `pnpm-workspace.yaml` — simple `packages: ["apps/*", "packages/*"]`
- Next.js 15.5.12 resolved from `^15`, React 19 from `^19`
- Vitest 3.2.4 resolved from `^3` — works well across all packages
- `turbo run build` correctly orders: shared → cli/web (respects `^build` dependsOn)
- `.js` extension in test imports (`from '../index.js'`) works fine with vitest for ESM packages

### Gotchas
- **vitest exits code 1 with no test files by default** — must add `passWithNoTests: true` in vitest.config.ts for packages without tests yet (cli, web)
- **pnpm 10.29.3 blocks build scripts by default** — esbuild and sharp need `pnpm approve-builds`. For now builds work without approving (Next.js uses pre-built binaries), but may need approval later for native modules
- **turbo.json v2 uses `tasks` not `pipeline`** — the v1→v2 migration renamed the key

### Versions locked
- turbo: 2.8.8
- typescript: 5.9.3
- next: 15.5.12
- react/react-dom: 19.1.0
- vitest: 3.2.4
- pnpm: 10.29.3 (via packageManager field)

## Task 1.2: Shared Package Foundation (2026-02-14)

- Turbo filter uses package name `@tank/shared`, not directory name `shared`
- tsconfig uses `moduleResolution: "bundler"` — imports need `.js` extensions for ESM compat
- Zod `.strict()` is critical for security schemas — rejects unknown fields
- All 3 schema files + 3 test files + 2 type files + 2 constant files + index.ts = 11 files total
- 49 tests covering: valid inputs, boundary values, strict mode rejection, missing fields
- Build produces `dist/` with `.d.ts` declarations — other packages import via `@tank/shared`
- `lockedSkillSchema` uses `permissionsSchema` (not optional) — locked skills always have permissions recorded
- `skillsJsonSchema` uses `.strict()` at all levels to prevent unknown fields sneaking in

## Task 1.2: Supabase Project Setup (2026-02-14)

### What worked
- `@supabase/supabase-js` installed in `apps/web` only (not shared or cli)
- Two clients: `supabaseClient` (anon key) and `supabaseAdmin` (service role key)
- `supabaseAdmin` disables `autoRefreshToken` and `persistSession` — server-side only, no session management
- Storage bucket created via REST API: `POST /storage/v1/bucket` with service role key as both `Authorization` and `apikey` headers
- Bucket config also declared in `supabase/config.toml` under `[storage.buckets.packages]` for persistence across `supabase db reset`
- Local Supabase keys use `sb_publishable_` and `sb_secret_` prefixes (not standard JWT format)
- `.env.local` uses `NEXT_PUBLIC_` prefix for URL and anon key (browser-safe), no prefix for service role key (server-only)
- Tests use dynamic `import()` with `beforeAll` to set env vars before module loads (module validates env on import)
- `.gitignore` already covers `.env.*` except `.env.example` — no changes needed

### Gotchas
- Supabase module throws on import if env vars are missing — tests must set `process.env` in `beforeAll` before dynamic `import()`
- `require()` in vitest with ESM modules can be tricky — `await import()` is more reliable
- Storage bucket API needs both `Authorization: Bearer <key>` AND `apikey: <key>` headers
- `file_size_limit` in REST API is in bytes (52428800), but in config.toml it's a string ("50MiB")

### Versions
- @supabase/supabase-js: resolved from latest (installed via pnpm)
