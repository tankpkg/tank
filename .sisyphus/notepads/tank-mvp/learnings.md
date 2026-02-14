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

## Task 1.2 (Drizzle Rewrite): Drizzle ORM + Supabase Storage Client (2026-02-14)

### What worked
- `postgres` (postgres.js) driver v3.4.8 + `drizzle-orm` v0.45.1 + `drizzle-kit` v0.31.9
- Session mode pooler (port 5432) works perfectly with postgres.js — no `prepare: false` needed
- `drizzle()` from `drizzle-orm/postgres-js` takes the postgres client directly
- Supabase client simplified to Storage-only: single `supabaseAdmin` export, no anon key needed
- Removed `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — not needed when using Drizzle for DB and better-auth for auth
- `drizzle.config.ts` uses `defineConfig()` from `drizzle-kit` — schema path set to `./lib/db/schema.ts` (created in Task 1.3)
- DB connectivity confirmed: `SELECT 1 as ok` returns `[{"ok":1}]` via pooler

### Gotchas
- Mocking `postgres` for vitest requires realistic shape: Drizzle's constructor reads `client.options.parsers` — a bare `vi.fn()` mock causes `Cannot read properties of undefined (reading 'parsers')`
- Fix: mock must include `options: { parsers: {}, serializers: {}, transform: { undefined: undefined } }` and `reserve: vi.fn()`
- `vi.resetModules()` in `beforeEach` is essential when testing module-level env var validation — otherwise cached module from first import persists
- drizzle-kit v0.31.9 pulls in deprecated `@esbuild-kit/core-utils@3.3.2` and `@esbuild-kit/esm-loader@2.6.5` — harmless warnings

### Versions
- drizzle-orm: 0.45.1
- drizzle-kit: 0.31.9
- postgres (postgres.js): 3.4.8
- @supabase/supabase-js: ^2.95.3 (already installed)

## Task 1.3: Drizzle Schema for 5 Tables (2026-02-14)

### What worked
- `pgTable` third argument uses array syntax `(table) => [...]` in Drizzle v0.45 — returns array of indexes/checks/uniques
- `uuid('id').primaryKey().defaultRandom()` generates `gen_random_uuid()` default — no need for `sql` template
- `check()` from `drizzle-orm/pg-core` works with `sql` template for regex constraints: `sql\`${table.name} ~ '^pattern$'\``
- GIN index for full-text search: `index('name').using('gin', sql\`to_tsvector('english', ...)\`)`
- `$onUpdateFn(() => new Date())` on timestamp columns auto-updates on Drizzle `.update()` calls (app-level, not DB trigger)
- `drizzle-kit push --force` skips interactive confirmation — essential for CI/scripted usage
- `source ../../.env.local` before `drizzle-kit push` loads DATABASE_URL correctly
- Schema tests use `getTableName()` and `getTableColumns()` from `drizzle-orm` — no DB connection needed
- Reusable column helpers (id, timestamps, createdAt) reduce duplication across tables

### Gotchas
- `unique()` in the third argument creates a named unique constraint (e.g., `unique('name').on(col1, col2)`)
- `text('col').unique()` on the column itself creates an unnamed unique index — both work but named is clearer for composite
- `relations()` from `drizzle-orm` are separate from table definitions — they enable the relational query API (`db.query.table.findMany({ with: ... })`)
- Relations don't create FK constraints — `references()` on columns does that. Relations are for Drizzle's query builder only
- `$inferSelect` / `$inferInsert` are type-level only — they compile away, no runtime cost

### Schema summary
- 5 tables: publishers, skills, skill_versions, skill_downloads, audit_events
- 13 indexes total (including PKs and unique constraints)
- 2 CHECK constraints on skills.name (format regex + length <= 214)
- 1 GIN index for full-text search on skills (name + description)
- 4 relation definitions connecting all tables
- 21 schema tests verifying exports, columns, constraints, and type inference
## Task 1.5: better-auth Integration (2026-02-14)

### What worked
- `better-auth` v1.4.18 installed cleanly — single dependency, no peer dep issues
- `betterAuth()` config with Drizzle adapter: `drizzle({ client: db, provider: 'pg' })` — straightforward
- `toNextJsHandler(auth)` for App Router catch-all route — exports `{ GET, POST }` directly
- `nextCookies()` plugin (from `better-auth/next-js`) required on server config for App Router cookie sync
- `auth.api.verifyApiKey({ body: { key } })` returns `{ valid: boolean, key?: { userId, id, ... } }` — clean API
- `@better-auth/cli generate --config ./lib/auth.ts --output ./lib/db/auth-schema.ts` auto-generates Drizzle schema
- Non-interactive CLI: pipe `echo "y"` to bypass confirmation prompt
- Drizzle config accepts schema array: `schema: ['./lib/db/schema.ts', './lib/db/auth-schema.ts']`
- `drizzle-kit push` applied 8 new tables (user, session, account, verification, apikey, organization, member, invitation) without issues
- Tests mock `better-auth` and `better-auth/plugins` at module level — no DB connection needed for unit tests

### Gotchas
- **`defaultPrefix` not `prefix`**: The apiKey plugin option for key prefix is `defaultPrefix: 'tank_'`, not `prefix`. TypeScript type `ApiKeyOptions` confirms this. The skill reference and task spec both had it wrong.
- **Lazy DB initialization for Next.js build**: `next build` evaluates route handler modules at build time. If `db.ts` throws on missing `DATABASE_URL` at module level, the build fails. Solution: Proxy-based lazy initialization that defers the error to actual property access.
- **Re-exporting auth-schema from schema.ts**: Adding `export * from './auth-schema'` to `schema.ts` makes all tables available from a single import, and Drizzle's relational query API sees all tables.
- **13 tables total in DB**: 5 original (publishers, skills, skill_versions, skill_downloads, audit_events) + 8 better-auth (user, session, account, verification, apikey, organization, member, invitation)

### Files created
- `apps/web/lib/auth.ts` — Server-side better-auth config
- `apps/web/lib/auth-client.ts` — Client-side auth with React hooks
- `apps/web/lib/auth-helpers.ts` — `verifyCliAuth()` for Bearer token + API key verification
- `apps/web/lib/db/auth-schema.ts` — Auto-generated Drizzle schema for 8 auth tables
- `apps/web/app/api/auth/[...all]/route.ts` — Auth API catch-all route
- `apps/web/lib/__tests__/auth.test.ts` — 4 tests
- `apps/web/lib/__tests__/auth-helpers.test.ts` — 7 tests

### Versions
- better-auth: 1.4.18

## Task 1.9: CLI Auth Endpoint (2026-02-14)

### What worked
- In-memory `Map<sessionCode, CliAuthSession>` with TTL cleanup on every access — simple, no dependencies
- `crypto.randomUUID()` for session codes — built-in, no extra deps
- Storing user info (name, email) in the CLI auth session at authorize time avoids needing `auth.api.getUser()` at exchange time
- `next/headers` `headers()` function returns a `Headers` object that can be passed directly to `auth.api.getSession()`
- Vitest `@/` path alias requires `resolve.alias` in `vitest.config.ts` — tsconfig paths alone don't work for vitest
- `Suspense` wrapper required for `useSearchParams()` in Next.js 15 client components — otherwise build warns/errors
- Inline styles (React.CSSProperties) work well for simple pages when Tailwind/shadcn availability is uncertain

### Gotchas
- **`auth.api.getUser()` does NOT exist** in base better-auth — it's only available with the `admin` plugin. User info must be obtained from the session at authorize time or queried from DB directly
- **`auth.api.createApiKey()`** returns `{ key: string }` where `key` is the full token value (e.g., `tank_abc123...`)
- **vitest.config.ts needs path alias**: Added `resolve.alias: { '@': path.resolve(__dirname, '.') }` to support `@/` imports in tests. Existing tests used relative imports so this wasn't needed before
- **`next build` type-checks more strictly than LSP** — LSP showed no errors for `auth.api.getUser()` but `next build` caught the type error. Always run build to verify.

### Security design
- Token NEVER in URLs — session code is in URL, token only in POST response body
- Session code expires after 5 minutes (TTL)
- One-time use: `consumeSession()` deletes the session immediately after successful exchange
- State parameter CSRF protection: must match between start and exchange
- Session must be in "authorized" status before exchange (prevents unauthorized code exchange)

### Files created
- `apps/web/lib/cli-auth-store.ts` — In-memory store with TTL, cleanup, CRUD operations
- `apps/web/app/api/v1/cli-auth/start/route.ts` — POST: creates session, returns authUrl + sessionCode
- `apps/web/app/api/v1/cli-auth/authorize/route.ts` — POST: requires auth session, marks CLI session as authorized
- `apps/web/app/api/v1/cli-auth/exchange/route.ts` — POST: consumes session, creates API key, returns token + user info
- `apps/web/app/cli-login/page.tsx` — Client component: Authorize/Deny buttons, auth redirect, success/error states
- `apps/web/app/api/v1/cli-auth/__tests__/cli-auth.test.ts` — 31 tests covering store + all 3 route handlers

### Test coverage (31 tests)
- cli-auth-store: 14 tests (create, get, authorize, consume, expiry, replay)
- POST /start: 4 tests (valid, missing state, wrong type, invalid JSON)
- POST /authorize: 4 tests (unauth, missing code, nonexistent, valid)
- POST /exchange: 9 tests (missing fields, invalid/expired/pending/state-mismatch, valid exchange, replay, expiry)

## Task 1.6: Tailwind CSS + shadcn/ui + Auth Pages (2026-02-14)

### What worked
- Tailwind CSS v4 (`tailwindcss@4.1.18`) with `@tailwindcss/postcss@4.1.18` — uses `@import "tailwindcss"` in CSS, no `tailwind.config.ts` needed
- `postcss.config.mjs` with `{ plugins: { '@tailwindcss/postcss': {} } }` — minimal config for Tailwind v4
- `shadcn@3.8.4` auto-detected Tailwind v4 and Next.js — `npx shadcn@latest init -d --base-color slate` worked cleanly
- shadcn v4 generates `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` in globals.css — new v4 pattern
- shadcn uses oklch color space for CSS variables — modern, perceptually uniform
- `components/ui/button.tsx` and `components/ui/card.tsx` generated with `class-variance-authority` and `radix-ui`
- `lib/utils.ts` generated with `cn()` helper using `clsx` + `tailwind-merge`
- Inter font via `next/font/google` — applied to body with `antialiased` class
- Auth route group `(auth)` with centered layout — `flex min-h-screen items-center justify-center`
- Login page as Client Component with `authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' })`
- Build produces `/login` as static page (11.1 kB first load JS)
- All 68 existing tests still pass — no regressions

### Gotchas
- **`npx shadcn@latest init -d --css-variables true` fails** — the `true` gets interpreted as a component name, causing a 404 on the registry. Use `--css-variables` without a value, or just `-d` (defaults include CSS variables)
- **shadcn generates duplicate `@apply` lines** in globals.css `@layer base` — both `border-border` and `bg-background` lines appear twice. Manual cleanup needed.
- **No `tailwind.config.ts` with Tailwind v4** — configuration is done via CSS `@theme` blocks in globals.css, not a JS config file. shadcn handles this automatically.

### Versions
- tailwindcss: 4.1.18
- @tailwindcss/postcss: 4.1.18
- postcss: 8.5.6
- shadcn CLI: 3.8.4
- class-variance-authority: (installed by shadcn)
- tailwind-merge: (installed by shadcn)
- clsx: (installed by shadcn)
- radix-ui: (installed by shadcn)
- tw-animate-css: (installed by shadcn)

### Files created/modified
- `apps/web/postcss.config.mjs` — PostCSS config for Tailwind v4
- `apps/web/app/globals.css` — Tailwind directives + shadcn CSS variables (oklch)
- `apps/web/components.json` — shadcn config (new-york style, slate base, Tailwind v4)
- `apps/web/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `apps/web/components/ui/button.tsx` — shadcn Button with CVA variants
- `apps/web/components/ui/card.tsx` — shadcn Card components
- `apps/web/app/layout.tsx` — Updated with Inter font + globals.css import
- `apps/web/app/(auth)/layout.tsx` — Centered card layout for auth pages
- `apps/web/app/(auth)/login/page.tsx` — Client Component with GitHub OAuth button

## Task 1.7: Dashboard with Token Management (2026-02-14)

### What worked
- Dashboard route group `(dashboard)` with server-side session check in layout — `auth.api.getSession({ headers: await headers() })` + `redirect('/login')` if null
- `signOut` from `auth-client.ts` needs `fetchOptions.onSuccess` callback for client-side redirect after sign-out
- better-auth API key methods (server-side):
  - `auth.api.createApiKey({ body: { name, userId, expiresIn } })` — returns object with `key` field (full token value)
  - `auth.api.listApiKeys({ headers })` — requires session cookies via headers, returns `ApiKey[]` (no full key value)
  - `auth.api.deleteApiKey({ body: { keyId }, headers })` — requires session cookies, returns `{ success: boolean }`
- `expiresIn` is in **seconds** (not milliseconds) for `createApiKey` — 90 days = `90 * 24 * 60 * 60`
- Server actions (`'use server'`) can be called directly from client components — no API route needed
- shadcn `npx shadcn@latest add table dialog input label badge separator -y` installs all 6 components in one command
- Token page as Client Component with `useState`/`useEffect` calling server actions — simple pattern, no React Query needed
- Build correctly marks `/dashboard` and `/tokens` as `ƒ` (Dynamic) due to `headers()` usage in server components/actions

### Gotchas
- **`listApiKeys` requires `headers` parameter** — unlike `createApiKey` which uses `body.userId`, `listApiKeys` uses session cookies to determine the user. Must pass `headers: await headers()` from `next/headers`
- **`deleteApiKey` also requires `headers`** — session cookies needed for authorization check
- **Sign-out button must be a Client Component** — `signOut` from `better-auth/react` uses browser APIs. Extracted to `sign-out-button.tsx` to keep layout as Server Component
- **`BetterAuthError` warnings during build** are expected — `BETTER_AUTH_SECRET` not set during `next build`, but lazy DB proxy prevents actual failures

### Files created
- `apps/web/app/(dashboard)/layout.tsx` — Dashboard layout with sidebar nav, session check, responsive mobile header
- `apps/web/app/(dashboard)/sign-out-button.tsx` — Client Component for sign-out with redirect
- `apps/web/app/(dashboard)/dashboard/page.tsx` — Welcome page with quick link cards
- `apps/web/app/(dashboard)/tokens/page.tsx` — Token management page (client component, table, create/revoke dialogs)
- `apps/web/app/(dashboard)/tokens/actions.ts` — Server actions: createToken, listTokens, revokeToken
- `apps/web/app/(dashboard)/tokens/__tests__/actions.test.ts` — 6 tests for server actions
- `apps/web/components/ui/table.tsx` — shadcn Table component
- `apps/web/components/ui/dialog.tsx` — shadcn Dialog component
- `apps/web/components/ui/input.tsx` — shadcn Input component
- `apps/web/components/ui/label.tsx` — shadcn Label component
- `apps/web/components/ui/badge.tsx` — shadcn Badge component
- `apps/web/components/ui/separator.tsx` — shadcn Separator component

### Test coverage (6 new tests, 74 total)
- createToken: creates token with tank_ prefix, throws on unauthenticated
- listTokens: returns array of keys, throws on unauthenticated
- revokeToken: calls deleteApiKey correctly, throws on unauthenticated

## Task 1.8: Dashboard Organization Management (2026-02-14)

### What worked
- better-auth organization plugin server-side API methods:
  - `auth.api.createOrganization({ body: { name, slug }, headers })` — creates org, requires session cookies
  - `auth.api.listOrganizations({ headers })` — lists user's orgs, requires session cookies
  - `auth.api.getFullOrganization({ query: { organizationSlug }, headers })` — gets org with members
  - `auth.api.createInvitation({ body: { email, role, organizationId }, headers })` — invites member
  - `auth.api.removeMember({ body: { memberIdOrEmail, organizationId }, headers })` — removes member
- Client-side: `authClient.organization.create()`, `authClient.organization.list()`, `authClient.useListOrganizations()`
- Slug auto-generation from name: lowercase, replace non-alphanumeric with hyphens, trim hyphens, max 39 chars
- Same test mocking pattern as tokens: mock `@/lib/auth`, `next/headers`, and `postgres` at module level
- Dynamic imports in tests (`await import('../actions')`) work well with vitest module mocking

### Gotchas
- **`'use server'` files require ALL exports to be async** — Next.js build fails with "Server Actions must be async functions" if any sync function is exported. Solution: keep sync helpers as non-exported (private) and wrap in async exported function (`validateOrgSlug` wraps `validateSlug`)
- **`getFullOrganization` uses `query` not `body`** — it's a GET-style endpoint, so parameters go in `query: { organizationSlug }` not `body`
- **`createInvitation` is the server-side method name** — client uses `inviteMember`, server uses `createInvitation`
- **`removeMember` uses `memberIdOrEmail`** — can accept either member ID or email address

### Files created
- `apps/web/app/(dashboard)/orgs/actions.ts` — Server actions: createOrg, listOrgs, getOrgDetails, inviteMember, removeMember, validateOrgSlug
- `apps/web/app/(dashboard)/orgs/page.tsx` — Org list page with create dialog, slug auto-generation
- `apps/web/app/(dashboard)/orgs/[slug]/page.tsx` — Org detail page with member table, invite dialog, remove button
- `apps/web/app/(dashboard)/orgs/__tests__/actions.test.ts` — 16 tests for server actions + slug validation

### Test coverage (16 new tests, 90 total)
- validateOrgSlug: 6 tests (valid slugs, empty, >39 chars, spaces, special chars, leading/trailing hyphens)
- createOrg: 4 tests (normalizes slug, rejects invalid, rejects >39 chars, throws on unauth)
- listOrgs: 2 tests (returns array, throws on unauth)
- inviteMember: 2 tests (calls createInvitation correctly, throws on unauth)
- removeMember: 2 tests (calls removeMember correctly, throws on unauth)

## Task 2.1: CLI Scaffolding (2026-02-14)

### What worked
- `commander@14.0.3` — clean API, `.name()`, `.description()`, `.version()` chain, `.parse()` at end
- `chalk@5.6.2` — ESM-only (v5+), works fine with `type: "module"` in package.json
- `ora@9.3.0` — installed for future spinner use, not used yet
- Config module with `configDir` parameter override — enables testing without touching real `~/.tank/`
- `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })` creates directory with correct permissions
- `fs.writeFileSync(path, data, { mode: 0o600 })` sets file permissions atomically on write
- `vi.stubGlobal('fetch', mockFetch)` — clean way to mock global fetch in vitest without importing node-fetch
- `vi.spyOn(console, 'log').mockImplementation(() => {})` — captures console output for logger tests
- `.js` extensions in imports (`./config.js`) required for NodeNext module resolution — vitest handles them fine
- `getConfig()` returns spread of defaults + parsed config — missing fields get defaults automatically

### Gotchas
- **chalk v5 is ESM-only** — cannot use `require('chalk')`. Must have `"type": "module"` in package.json (already set)
- **`console.log` with chalk returns two args** — `console.log(chalk.blue('ℹ'), msg)` passes 2 args. Test uses `spy.mock.calls[0].join(' ')` to combine them for assertion
- **File permission test needs platform check** — `process.platform === 'win32'` skip for Windows since `mode` is Unix-only

### Files created
- `apps/cli/src/bin/tank.ts` — CLI entry point with shebang, --version, --help
- `apps/cli/src/lib/config.ts` — Read/write ~/.tank/config.json with 0600 permissions
- `apps/cli/src/lib/api-client.ts` — HTTP client with auto Bearer token, User-Agent header
- `apps/cli/src/lib/logger.ts` — Colored output helpers (info, success, error, warn)
- `apps/cli/src/index.ts` — Re-exports all modules
- `apps/cli/src/__tests__/config.test.ts` — 12 tests
- `apps/cli/src/__tests__/api-client.test.ts` — 8 tests
- `apps/cli/src/__tests__/logger.test.ts` — 4 tests

### Test coverage (24 tests)
- config: 12 tests (getConfigDir, getConfigPath, getConfig defaults/read/merge, setConfig create/merge/overwrite/json/permissions)
- api-client: 8 tests (auth header with/without token, User-Agent on GET/POST, GET/POST/PUT methods, Content-Type)
- logger: 4 tests (info/success/warn use console.log, error uses console.error, icons present)

### Versions
- commander: 14.0.3
- chalk: 5.6.2
- ora: 9.3.0
- @types/node: 22.19.11

## Task 2.3: `tank init` Command (2026-02-14)

### What worked
- `@inquirer/prompts` v8.2.0 — modern ESM-compatible prompts, clean API: `input()`, `confirm()` as standalone functions
- `vi.mock('@inquirer/prompts')` at module level + dynamic `await import()` in tests — standard pattern for mocking ESM modules
- `process.cwd = () => tmpDir` override in tests — simple way to control working directory without mocking `fs`
- `skillsJsonSchema.safeParse()` validates output before writing — catches schema violations at generation time
- `void author` to suppress unused variable warning — author is prompted but not included in output (schema is `.strict()`)
- `mockInput.mockResolvedValueOnce()` chaining for sequential prompt answers — clean, readable test setup
- Capturing `validate` function from mock implementation to test validation logic separately — avoids needing to trigger real prompt validation

### Gotchas
- **`skillsJsonSchema` uses `.strict()` — no `author` field allowed**: The schema only allows `name`, `version`, `description`, `skills`, `permissions`, `audit`. Adding `author` to the output would fail validation. Author is prompted for future use but excluded from the manifest.
- **`@tank/shared` is a workspace package** — must install with `pnpm add '@tank/shared@workspace:*' --filter=tank` (quoted to prevent shell glob expansion)
- **pnpm filter uses package name not directory name** — `--filter=tank` (package.json name), not `--filter=cli` (directory name)
- **`mockInput.mockImplementation()` overrides all `mockResolvedValueOnce()` calls** — when testing validation, use a single `mockImplementation` that handles all 4 prompt calls via a counter, don't mix with `mockResolvedValueOnce`

### Files created
- `apps/cli/src/commands/init.ts` — Interactive init command with validation
- `apps/cli/src/__tests__/init.test.ts` — 11 tests

### Files modified
- `apps/cli/src/bin/tank.ts` — Registered `init` command
- `apps/cli/package.json` — Added `@inquirer/prompts` and `@tank/shared` dependencies

### Test coverage (11 new tests, 67 total)
- creates skills.json with prompted values
- omits description when empty
- generates output that passes strict schema validation
- writes pretty-printed JSON with trailing newline
- supports scoped package names
- prints success message
- asks to overwrite when skills.json exists and user confirms
- aborts when user declines overwrite
- validates name: rejects uppercase, spaces, empty, too long
- validates version: rejects non-semver
- does not include author in output (strict schema)

### Versions
- @inquirer/prompts: 8.2.0

## Task 2.4: Packer Module (2026-02-14)

### What worked
- `tar@7.5.7` — ESM-compatible, `create()` is a named export from `'tar'`
- `tar.create({ gzip: true, cwd, portable: true }, files)` without `file` option returns a readable stream — collect chunks to get Buffer
- `ignore@7.0.5` — CJS module with `export =` syntax, works with `import ignore from 'ignore'` thanks to `esModuleInterop: true`
- `ignore().add(content)` accepts raw .gitignore file content as string — handles comments, negation, etc.
- `ignore().ignores(path)` for files, `ignore().ignores(path + '/')` for directories — trailing slash is important for directory-only patterns
- `fs.lstatSync()` (not `statSync()`) correctly detects symlinks without following them
- `portable: true` in tar options omits system-specific metadata (uid, gid, uname, gname, dev, ino, nlink) — good for reproducible builds
- `crypto.createHash('sha512').update(buffer).digest('base64')` for integrity hash — standard SRI format `sha512-{base64}`
- `@types/tar@6.1.13` works fine with `tar@7.5.7` — the types are compatible enough
- Tests use `fs.mkdtempSync(path.join(os.tmpdir(), 'tank-packer-test-'))` for isolated temp dirs — cleaned up in `afterEach`
- All 18 tests passed on first implementation run — no iteration needed

### Gotchas
- **`tar.create()` returns a Pack stream, not a standard Readable** — need `as unknown as Readable` cast for TypeScript, but `data`/`end`/`error` events work fine
- **`ignore` package requires relative paths without `./` prefix** — `path.relative()` output works directly
- **Pre-existing build error in `login.ts`** — `POLL_INTERVAL_MS` undefined (should be `pollInterval`). Not introduced by packer changes. `tsc --noEmit` filtering out login.ts shows zero errors for packer code.
- **`ignore` treats `foo` as file and `foo/` as directory** — must append `/` when checking directories to match patterns like `node_modules/`

### Security validations implemented
1. `skills.json` exists + valid against `skillsJsonSchema` (Zod `.strict()`)
2. `SKILL.md` exists
3. No symlinks (checked via `fs.lstatSync().isSymbolicLink()`)
4. No `..` path components (path traversal prevention)
5. No absolute paths
6. File count <= 1000
7. Tarball size <= 50MB
8. Ignore patterns: `.tankignore` > `.gitignore` > defaults
9. Always ignore: `node_modules`, `.git` (even if not in ignore file)

### Files created
- `apps/cli/src/lib/packer.ts` — Pack module with `pack()` function
- `apps/cli/src/__tests__/packer.test.ts` — 18 tests

### Dependencies added
- tar: ^7.5.7
- @types/tar: ^6.1.13 (devDep)
- ignore: ^7.0.5

### Test coverage (18 tests, 67 total for CLI)
- valid directory: 3 tests (produces tarball, correct sha512, valid gzip)
- missing files: 4 tests (no skills.json, no SKILL.md, invalid skills.json, bad JSON)
- security symlinks: 1 test (symlink detection)
- security path traversal: 1 test (.. component detection)
- file count limit: 1 test (>1000 files)
- ignore patterns: 6 tests (.tankignore, .gitignore fallback, default ignores, forced ignores, .DS_Store, .tank dir)
- directory validation: 1 test (nonexistent directory)
- totalSize accuracy: 1 test (matches sum of file sizes)

## Task 2.2: tank login + tank whoami Commands (2026-02-14)

### What worked
- Polling-based auth flow: POST /start → open browser → poll POST /exchange until authorized → write config
- `open@11.0.0` (ESM-compatible) for opening browser — `vi.mock('open', ...)` works cleanly in vitest
- `vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: vi.fn() })` to mock crypto.randomUUID
- `vi.stubGlobal('fetch', mockFetch)` pattern from existing tests works perfectly
- `pollInterval` option on loginCommand enables fast tests (10ms) vs production (2000ms)
- Exchange endpoint returns 400 while session is pending (not yet authorized) — polling treats 400 as "keep trying"
- Non-400 errors (500, etc.) are treated as fatal and thrown immediately
- Network errors during polling are silently retried (transient failures)
- whoami falls back to cached user info when server is unreachable or returns non-401 errors
- Commander `.command()` + `.description()` + `.action()` chain for subcommand registration
- `configDir` parameter threading through all commands enables isolated testing with temp directories

### Gotchas
- **Exchange endpoint returns 400 for BOTH "not yet authorized" AND "invalid session"** — the CLI treats all 400s as "keep polling" which is correct since the session code was just created and is valid. If the session expires (5 min TTL), the timeout will catch it.
- **`open` package default export** — must mock as `{ default: vi.fn() }` not `vi.fn()` since it's ESM
- **Polling tests were slow (2s each)** until adding `pollInterval` option — always make timing configurable for tests
- **`mockFetch.mockResolvedValue()` (without Once)** creates a persistent mock — useful for the timeout test where every exchange call should return 400
- **`mockFetch.mockResolvedValueOnce()` queues responses** — first call gets first mock, second gets second, etc. Perfect for simulating start → exchange sequences

### Design decisions
- **Polling over localhost server**: The existing cli-login page doesn't redirect to localhost after authorization, so polling the exchange endpoint is the natural fit. Simpler, more testable, no port conflicts.
- **5-minute timeout**: Matches the server-side session TTL (SESSION_TTL_MS = 5 * 60 * 1000)
- **whoami verifies token via API**: Even though we have cached user info, we verify the token is still valid. Falls back to cached info on network errors.
- **Error re-throw pattern**: `catch (err) { if (err.message.startsWith('Exchange failed:')) throw err; }` — distinguishes our own thrown errors from transient network errors during polling

### Files created
- `apps/cli/src/commands/login.ts` — Login command with polling-based OAuth flow
- `apps/cli/src/commands/whoami.ts` — Whoami command with token verification + cached fallback
- `apps/cli/src/__tests__/login.test.ts` — 9 tests (full flow, start/exchange calls, errors, polling, timeout, browser failure, browser open)
- `apps/cli/src/__tests__/whoami.test.ts` — 5 tests (no token, valid token, auth header, expired token, network error)

### Files modified
- `apps/cli/src/bin/tank.ts` — Registered login + whoami commands
- `apps/cli/package.json` — Added `open@^11.0.0` dependency

### Test coverage (14 new tests, 67 total)
- login: 9 tests (full flow, start call, exchange call, start failure, exchange server error, polling, timeout, browser failure, browser open)
- whoami: 5 tests (no token, valid token, auth header verification, expired token, network error)

### Versions
- open: 11.0.0

## Task 2.7: `tank logout` Command (2026-02-14)

### What worked
- TDD approach: Write failing tests first, then implement — all 4 tests passed on first implementation
- `setConfig({ token: undefined, user: undefined }, configDir)` correctly removes fields from JSON — JavaScript's `JSON.stringify` omits `undefined` values, so the merged object loses those keys
- Command registration pattern identical to login/whoami: `.command()` + `.description()` + `.action(async () => { try { await logoutCommand() } catch (err) { ... } })`
- `configDir` parameter threading enables isolated testing with temp directories (same pattern as login/whoami)
- Logger methods (`logger.warn()`, `logger.success()`) work perfectly for user feedback
- 4 test cases cover: logout when logged in, logout when not logged in, success message, config file preservation

### Gotchas
- None — implementation was straightforward following established patterns

### Files created
- `apps/cli/src/commands/logout.ts` — Logout command with token/user removal
- `apps/cli/src/__tests__/logout.test.ts` — 4 tests

### Files modified
- `apps/cli/src/bin/tank.ts` — Imported and registered logout command

### Test coverage (4 new tests, 75 total)
- removes token and user from config when logged in
- prints "Not logged in" when no token exists
- prints success message when logout succeeds
- keeps config file intact after logout (just removes token/user)

### Build & Test Results
- `pnpm test --filter=tank`: 71 tests passed (4 new logout tests included)
- `pnpm build --filter=tank`: Succeeded with no errors
- All existing tests still pass — no regressions

## Task 2.5: Two-Step Publish API Endpoint (2026-02-14)

### What worked
- Two-step publish flow: POST /api/v1/skills (validate + get upload URL) → CLI uploads to Supabase → POST /api/v1/skills/confirm (finalize)
- Chainable mock pattern for Drizzle: `mockInsert → mockValues → mockReturning`, `mockSelect → mockFrom → mockWhere → mockLimit` — each mock returns the next in the chain
- `skillsJsonSchema.safeParse()` with `.strict()` catches unknown fields at validation time
- Name normalization (lowercase + trim) happens BEFORE schema validation — so uppercase names get normalized then pass the regex check
- Scoped package org check: parse `@org/name` with regex, then `auth.api.getFullOrganization({ query: { organizationSlug }, headers })` to verify membership
- `supabaseAdmin.storage.from('packages').createSignedUploadUrl(path)` returns `{ data: { signedUrl, token }, error }` — the signedUrl is what the CLI uses to upload directly
- Version record created with `auditStatus: 'pending-upload'` and placeholder values (integrity: 'pending', tarballSize: 0, fileCount: 0) — confirm endpoint fills in real values
- Dynamic `await import('../route')` in tests works with vitest module mocking — mocks are hoisted before dynamic imports

### Gotchas
- **`getFullOrganization` requires `headers` parameter** — TypeScript type has `requireHeaders: true`. Must pass `request.headers` from the API route handler. Without headers, `next build` type-check fails even though LSP doesn't catch it.
- **`supabase.ts` throws at module level** — `next build` evaluates route handler modules at build time. If `SUPABASE_URL` is missing, the throw kills the build. Fixed by applying the same lazy Proxy pattern as `db.ts`: warn instead of throw, create Proxy that throws on access.
- **Test relative import paths**: From `skills/__tests__/publish.test.ts`, the route is at `../route` (one level up), NOT `../../route` (two levels up). Easy to get wrong.
- **`toContain` is case-sensitive** — error message "Version 1.0.0 already exists" doesn't match `toContain('version')` (lowercase v). Use the exact case from the error message.
- **Drizzle mock chain must be carefully ordered** — `mockLimit` is shared between select queries, so `mockResolvedValueOnce` calls must be in the exact order the route handler makes DB queries (publisher lookup → skill lookup → version conflict check)

### Files created
- `apps/web/app/api/v1/skills/route.ts` — POST handler: validate manifest, check org membership, find/create publisher+skill, check version conflict, create pending version, generate signed upload URL
- `apps/web/app/api/v1/skills/confirm/route.ts` — POST handler: verify version exists + is pending-upload, update with integrity/fileCount/tarballSize, set auditStatus to 'published'
- `apps/web/app/api/v1/skills/__tests__/publish.test.ts` — 20 tests covering both endpoints

### Files modified
- `apps/web/lib/supabase.ts` — Changed from throw-on-missing-env to lazy Proxy pattern (same as db.ts) to prevent build failures

### Test coverage (20 new tests, 110 total)
- POST /api/v1/skills: 14 tests (401 missing/invalid auth, 400 invalid manifest x3, 400 invalid JSON, name normalization, 403 non-member/missing org, 409 duplicate version, 200 valid publish, publisher creation, scoped package, existing skill reuse)
- POST /api/v1/skills/confirm: 6 tests (401 missing auth, 400 missing versionId, 404 nonexistent version, 400 already published, 200 success, 400 invalid JSON)

### Design decisions
- **Signed upload URL bypasses Vercel 4.5MB body limit**: CLI uploads tarball directly to Supabase Storage, not through our API. Only the manifest (small JSON) goes through our endpoint.
- **Publisher auto-creation**: If user has no publisher record, one is created with userId as displayName. This simplifies the first-publish experience.
- **Org membership check uses better-auth API**: `getFullOrganization` returns members array, we check if userId is in it. No direct DB query needed.
- **Version conflict check before insert**: Even though DB has a unique constraint on (skillId, version), we check first to return a clean 409 error instead of a DB constraint violation.

## Task 2.6: `tank publish` CLI Command (2026-02-14)

### What worked
- TDD approach: 11 failing tests first, then implementation — all passed on first run
- `ora@9.3.0` spinner mocked cleanly: `vi.mock('ora', () => { const spinner = { start, stop, succeed, fail, text }; return { default: vi.fn(() => spinner) }; })`
- `vi.mock('../lib/packer.js')` + `vi.mocked(pack)` for type-safe mock access — clean pattern
- `vi.stubGlobal('fetch', vi.fn())` for mocking all HTTP calls (API + upload)
- Three-step publish flow: POST /api/v1/skills → PUT tarball to signed URL → POST /api/v1/skills/confirm
- Raw `fetch()` for upload step (not ApiClient) since we need to send Buffer body, not JSON
- `new Uint8Array(tarball)` conversion needed for `fetch()` body — Node.js `Buffer` is not assignable to `BodyInit` in strict TypeScript
- `formatSize()` exported separately for unit testing — bytes → KB → MB formatting
- Error handling maps HTTP status codes to user-friendly messages: 401 → auth, 403 → permission, 409 → version conflict
- `configDir` parameter threading enables isolated testing with temp directories
- Commander `--dry-run` option auto-converts to `dryRun` camelCase in opts object

### Gotchas
- **`Buffer` is not `BodyInit`**: TypeScript strict mode rejects `body: tarball` (Buffer) in `fetch()`. Must wrap with `new Uint8Array(tarball)`. Tests also need to compare with `new Uint8Array()` wrapper.
- **Test assertion for Uint8Array body**: `expect(step2Opts.body).toEqual(mockPackResult.tarball)` fails because Buffer !== Uint8Array. Use `expect(new Uint8Array(step2Opts.body)).toEqual(new Uint8Array(mockPackResult.tarball))`.
- **pnpm filter uses package name**: `pnpm test --filter=tank` (package.json name), NOT `--filter=cli` (directory name)

### Files created
- `apps/cli/src/commands/publish.ts` — Publish command with 3-step flow, dry-run, error handling, spinner
- `apps/cli/src/__tests__/publish.test.ts` — 11 tests

### Files modified
- `apps/cli/src/bin/tank.ts` — Imported and registered publish command with --dry-run option

### Test coverage (11 new tests, 82 total)
- Successful publish flow (pack → API step 1 → upload → confirm)
- Dry run (pack only, no API calls)
- Not logged in → error message
- Missing skills.json → error message
- API 401 → auth error message
- API 403 → permission error message
- API 409 → version conflict message
- Upload failure → error message
- Confirm step failure → error message
- Generic API error with message from response
- formatSize utility (bytes, KB, MB)

### Build & Test Results
- `pnpm test --filter=tank`: 82 tests passed (11 new publish tests)
- `pnpm build --filter=tank`: Succeeded with no errors
- All existing tests still pass — no regressions
