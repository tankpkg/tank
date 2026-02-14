# Tank MVP — Complete Implementation Plan

## Context

### Original Request
Build the complete MVP for Tank — a security-first package manager and registry for AI agent skills. Two developers: Elad handles web + CLI + infrastructure, partner handles Python security analysis pipeline.

### Interview Summary
**Key Discussions**:
- CLI-first approach, auth is the foundation everything else depends on
- Partner handles security tests in Vercel Python functions
- Browser OAuth login flow (modern, PKCE-based, like `gh auth login`)
- Minimal web UI at MVP for account/org/token management + skill browsing
- TDD throughout

**Research Findings**:
- better-auth API Keys plugin: hashed storage, `tank_` prefix, rate limiting built-in. Org plugin: slug-based scoping for `@org/skill`
- Supabase Storage: private buckets, signed URLs, 50MB file limit. Connection pooler required for serverless
- OpenRouter free tier: 1000 req/day with $10 balance, models up to 262K context (qwen3-coder, deepseek-r1)
- Vercel Python functions: same repo in `api/*.py`, auto-detected, FastAPI works. 250MB bundle limit, 4.5MB request body limit
- Vercel request body limit is 4.5MB — skill packages MUST upload directly to Supabase Storage via signed upload URLs, not through Vercel API routes

### Metis Review
**Identified Gaps** (all addressed below):
- CLI login must not pass tokens via querystring — use one-time code exchange
- Vercel 4.5MB body limit means publish must use direct-to-Supabase signed upload URLs
- Tar extraction safety (path traversal, symlinks, decompression bombs) must be handled
- Package name normalization (casing, Unicode confusables, reserved names)
- Org membership must be checked on every publish, not just at token creation
- Permission model must be pinned to a minimal testable subset
- `skills.lock` determinism requires defined key ordering + normalization rules
- Token storage must be OS-appropriate with restrictive file permissions
- Scan pipeline failures must not block publish — publish with "pending-audit" status

---

## Work Objectives

### Core Objective
Build a working package registry where developers can create accounts, publish AI agent skills from a CLI, and install them with deterministic, hash-verified lockfiles.

### Concrete Deliverables
- Turborepo monorepo with `apps/web`, `apps/cli`, `packages/shared`
- Next.js 15 web app deployed on Vercel at `tankpkg.dev`
- TypeScript CLI published as `tank` npm package
- Supabase PostgreSQL database with full schema
- Supabase Storage bucket for skill packages
- better-auth integration (GitHub OAuth + API keys + organizations)
- Registry API (publish, install, search, info)
- `skills.json` and `skills.lock` schemas with Zod validation
- Permission budget validation
- Basic security analysis pipeline (Vercel Python + OpenRouter)

### Definition of Done
- [ ] `tank login` authenticates via browser and stores token securely
- [ ] `tank publish` uploads a skill package to the registry
- [ ] `tank install @org/skill` downloads, extracts, and locks a skill
- [ ] `tank install` (no args) reproduces exact same install from lockfile
- [ ] Permission budget violations block installation
- [ ] Published skills receive automated security analysis and audit score
- [ ] Web UI allows account creation, org management, token management, skill browsing
- [ ] All commands have passing test suites (TDD)

### Must Have
- Browser OAuth login with secure token exchange (no tokens in URLs)
- API key auth for all CLI operations (`Authorization: Bearer tank_xxx`)
- Org-scoped publishing with membership check on every request
- Deterministic lockfile with sha512 integrity hashes
- Permission budget validation that blocks installs exceeding budget
- Secure tar extraction (path traversal protection, symlink blocking, size limits)
- Package name normalization (lowercase, no Unicode confusables)
- OS-appropriate token storage with restrictive permissions (0600)
- Direct-to-Supabase upload for packages (bypassing Vercel 4.5MB limit)

### Must NOT Have (Guardrails)
- **No code signing / Sigstore** — Phase 2
- **No SBOM generation** — Phase 2
- **No enforced semver rejection** (wrong bump type) — Phase 2
- **No WASM sandbox / runtime enforcement** — Phase 3
- **No verified publisher badges** — Phase 2
- **No private registries** — Post-v1
- **No transitive dependency resolution** — direct dependencies only for MVP
- **No multi-registry support** — hardcode `tankpkg.dev`, single `--registry` override flag
- **No dist-tags, deprecations, or npm feature parity** — defer
- **No semantic/vector search** — PostgreSQL FTS only
- **No resumable uploads** — standard upload sufficient for MVP (50MB limit)
- **No device flow auth** — browser OAuth only; CI auth via pre-generated token
- **No complex org roles** — MVP has two roles: `owner` and `member` (both can publish)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (greenfield)
- **User wants tests**: YES (TDD)
- **Framework**: vitest (fast, TypeScript-native, Vite-compatible)
- **CLI test approach**: vitest + mock HTTP responses (msw or manual mocks)
- **API test approach**: vitest + supertest for Next.js API routes
- **E2E**: Manual verification for MVP (browser flows, full publish→install cycle)

### TDD Task Structure
Each TODO follows RED-GREEN-REFACTOR:
1. **RED**: Write failing test first. Run `pnpm test --filter=<package>` → FAIL
2. **GREEN**: Implement minimum code to pass. Run test → PASS
3. **REFACTOR**: Clean up while keeping green. Run test → PASS (still)

### Test Setup Task (Sprint 1)
- Install vitest in each workspace package
- Configure `vitest.config.ts` per package
- Add `test` script to each `package.json`
- Add root `pnpm test` that runs all workspace tests
- Verify: `pnpm test` → 0 tests, 0 failures (clean baseline)

---

## Task Flow

```
Sprint 1: Scaffolding + Auth
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9

Sprint 2: CLI + Publish
  2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8

Sprint 3: Install + Lockfile
  3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7

Sprint 4: Discovery + Web
  4.1 ──→ 4.3 → 4.4 → 4.5
  4.2 ──↗ (parallel with 4.1)

Sprint 5: Security Pipeline (Partner)
  5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 4.1, 4.2 | CLI search and API search endpoint are independent |
| B | Sprint 5 tasks are partner's domain | Can overlap with Sprint 4 if partner starts early |

| Task | Depends On | Reason |
|------|------------|--------|
| 1.3 (Supabase schema) | 1.1, 1.2 | Needs monorepo structure and Supabase project |
| 1.5 (better-auth) | 1.3 | Needs DB schema for auth tables |
| 2.2 (tank login) | 1.8 (CLI auth endpoint) | CLI login needs server-side auth flow |
| 2.6 (tank publish) | 2.5 (publish API) | CLI needs API endpoint |
| 3.2 (tank install) | 2.6 (tank publish) | Need published packages to install |
| 5.5 (pipeline integration) | 2.5 (publish API) | Security hooks into publish flow |

---

## TODOs

---

### Sprint 1: Scaffolding + Auth (Week 1-2)

---

- [x] 1.1. Monorepo Setup

  **What to do**:
  - Initialize Turborepo with pnpm workspaces
  - Create workspace structure: `apps/web`, `apps/cli`, `packages/shared`
  - Configure `turbo.json` with `build`, `test`, `lint`, `dev` pipelines
  - Configure `pnpm-workspace.yaml`
  - Set up root `package.json` with workspace scripts
  - Set up TypeScript project references (`tsconfig.json` in each package)
  - Set up vitest in each workspace (`vitest.config.ts`, test scripts)
  - Set up shared ESLint config
  - Move existing docs/assets into the monorepo cleanly
  - Add `.env.example` with all required env vars documented

  **Must NOT do**:
  - No complex build pipelines — keep it simple
  - No lerna, nx, or other monorepo tools — Turborepo only
  - No pre-commit hooks yet — add later

  **Parallelizable**: NO (everything depends on this)

  **References**:
  - `turbo.json` reference: https://turbo.build/repo/docs/reference/configuration
  - `pnpm-workspace.yaml` reference: https://pnpm.io/workspaces
  - Existing project structure in repo root (README.md, docs/, assets/, .github/)

  **Acceptance Criteria**:
  - [ ] RED: Create test file `packages/shared/src/__tests__/index.test.ts` with `expect(true).toBe(false)`
  - [ ] GREEN: Fix test to pass
  - [ ] `pnpm install` completes without errors
  - [ ] `pnpm build` builds all packages
  - [ ] `pnpm test` runs vitest across all workspaces
  - [ ] `pnpm dev --filter=web` starts Next.js dev server
  - [ ] Existing docs/assets are accessible from their original paths
  - [ ] `.env.example` lists: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`

  **Commit**: YES
  - Message: `feat(infra): initialize turborepo monorepo with web, cli, and shared packages`
  - Files: `turbo.json`, `pnpm-workspace.yaml`, `package.json`, `apps/*/package.json`, `packages/*/package.json`, `tsconfig.json`, all config files

---

- [x] 1.2. Supabase Project Setup

  **What to do**:
  - Create Supabase project (via dashboard or CLI)
  - Get connection strings (pooler for serverless, direct for migrations)
  - Configure environment variables locally and in `.env.example`
  - Create Supabase Storage bucket `packages` (private, 50MB file size limit, allowed mimetypes: `application/gzip`, `application/x-tar`, `application/octet-stream`)
  - Test connection from a simple script

  **Must NOT do**:
  - No RLS policies yet — add with each table as needed
  - No Supabase Auth (we use better-auth instead)

  **Parallelizable**: YES (with 1.1 if Supabase project created via dashboard)

  **References**:
  - Supabase connection pooling docs: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
  - Supabase Storage docs: https://supabase.com/docs/guides/storage

  **Acceptance Criteria**:
  - [ ] RED: Write test that imports Supabase client and expects connection to succeed
  - [ ] GREEN: Configure client with correct connection string, test passes
  - [ ] Supabase project exists and is accessible
  - [ ] Connection string works with `pg.Pool` (pooler mode)
  - [ ] Storage bucket `packages` exists with private access
  - [ ] `pnpm test --filter=web` → passes connection test
  - [ ] Environment variables documented in `.env.example`

  **Commit**: YES
  - Message: `feat(infra): configure supabase project with database and storage bucket`
  - Files: `apps/web/lib/supabase.ts`, `.env.example`, migration files

---

- [x] 1.3. Database Schema + Migrations

  **What to do**:
  - Create SQL migration files in `supabase/migrations/`
  - Tables: `publishers`, `skills`, `skill_versions`, `skill_downloads`, `audit_events`
  - All UUIDs use `gen_random_uuid()`
  - All timestamps use `TIMESTAMPTZ DEFAULT NOW()`
  - Add indexes for search (GIN on name+description), lookups (skill_id, name, org_id)
  - Package name constraints: lowercase, alphanumeric + hyphens, max 214 chars (npm convention), scoped names `@org/name`
  - Add CHECK constraint on `skills.name`: must match `^(@[a-z0-9-]+\/)?[a-z0-9-]+$`
  - Version string CHECK: basic semver pattern validation
  - Apply migrations via Supabase CLI or direct SQL

  **Must NOT do**:
  - No ORM — raw SQL migrations
  - No RLS on these tables for MVP (service role key used server-side)
  - No full-text search config yet — just the GIN index (search query comes in Sprint 4)

  **Parallelizable**: NO (depends on 1.2)

  **References**:
  - Schema design from interview (see Context section above)
  - `docs/architecture.md:118-166` — existing data model (to be updated with final schema)
  - npm naming rules: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#name

  **Acceptance Criteria**:
  - [ ] RED: Write tests that query each table (expect them to exist with correct columns)
  - [ ] GREEN: Apply migrations, tests pass
  - [ ] All 5 tables created with correct columns and types
  - [ ] Name CHECK constraint rejects `@ORG/skill` (uppercase), accepts `@org/skill`
  - [ ] Foreign key relationships work (can insert publisher → skill → version)
  - [ ] Indexes exist on: `skills.name`, `skills.org_id`, `skill_versions.skill_id`, `skill_downloads.skill_id`
  - [ ] GIN index exists for full-text search

  **Commit**: YES
  - Message: `feat(db): add initial database schema with skills, versions, publishers, audit tables`
  - Files: `supabase/migrations/*.sql`

---

- [x] 1.4. Shared Package Foundation

  **What to do**:
  - Create `packages/shared/src/schemas/skills-json.ts` — Zod schema for `skills.json` manifest
  - Create `packages/shared/src/schemas/skills-lock.ts` — Zod schema for `skills.lock`
  - Create `packages/shared/src/schemas/permissions.ts` — permission type definitions
  - Create `packages/shared/src/types/skill.ts` — Skill, SkillVersion, Publisher types
  - Create `packages/shared/src/types/api.ts` — API request/response types
  - Create `packages/shared/src/constants/permissions.ts` — permission categories
  - Create `packages/shared/src/constants/registry.ts` — registry URL, version, limits
  - Export everything from `packages/shared/src/index.ts`

  **Skills.json minimal schema**:
  ```
  {
    name: string (scoped: @org/name or unscoped: name),
    version: semver string,
    description?: string,
    skills: Record<string, semver range>,
    permissions: {
      network?: { outbound?: string[] },
      filesystem?: { read?: string[], write?: string[] },
      subprocess?: boolean
    },
    audit?: { min_score?: number (0-10) }
  }
  ```

  **Skills.lock minimal schema**:
  ```
  {
    lockfileVersion: 1,
    skills: Record<nameAtVersion, {
      resolved: URL string,
      integrity: "sha512-" + base64,
      permissions: PermissionObject,
      audit_score: number
    }>
  }
  ```
  Keys in `skills` object MUST be sorted alphabetically for determinism.

  **Permission types (MVP subset — pinned, do not expand)**:
  - `network:outbound` — domain allowlist with glob matching (`*.example.com`)
  - `filesystem:read` — glob patterns relative to project root
  - `filesystem:write` — glob patterns relative to project root
  - `subprocess` — boolean (allowed or not)

  **Must NOT do**:
  - No `network:inbound`, `secrets`, or rate-limit fields — defer to Phase 2
  - No JSON Schema generation from Zod yet — just TypeScript types + Zod validation
  - No complex glob matching library — use `minimatch` or `picomatch`

  **Parallelizable**: YES (with 1.3, shares no files)

  **References**:
  - `docs/product-brief.md:46-111` — skills.json and skills.lock examples
  - `docs/product-brief.md:162-179` — permission model spec
  - npm `package.json` name rules for naming conventions

  **Acceptance Criteria**:
  - [ ] RED: Write tests for each Zod schema (valid input passes, invalid input fails with descriptive errors)
  - [ ] GREEN: Implement schemas, all tests pass
  - [ ] `skillsJsonSchema.parse(validManifest)` succeeds
  - [ ] `skillsJsonSchema.parse({name: "@ORG/test"})` fails (uppercase)
  - [ ] `skillsJsonSchema.parse({name: "a".repeat(215)})` fails (too long)
  - [ ] `skillsLockSchema.parse(validLockfile)` succeeds
  - [ ] Permission schema validates all 4 MVP permission types
  - [ ] Permission schema rejects unknown permission types
  - [ ] `pnpm test --filter=shared` → all tests pass

  **Commit**: YES
  - Message: `feat(shared): add zod schemas for skills.json, skills.lock, and permission model`
  - Files: `packages/shared/src/**`

---

- [x] 1.5. Better-Auth Integration

  **What to do**:
  - Install `better-auth` in `apps/web`
  - Create `apps/web/lib/auth.ts` — server config with:
    - `pg.Pool` database connection (Supabase pooler URL)
    - `nextCookies()` plugin
    - `apiKey()` plugin with `tank_` prefix, 64-char key length
    - `organization()` plugin with `allowUserToCreateOrganization: true`
    - GitHub social provider (OAuth app, callback at `tankpkg.dev/api/auth/callback/github`)
  - Create `apps/web/lib/auth-client.ts` — client config with React hooks
  - Create `apps/web/app/api/auth/[...all]/route.ts` — mount handler
  - Run `npx @better-auth/cli generate` to get schema, then apply to Supabase
  - Test: sign up, sign in, create org, create API key, verify API key

  **Auth header convention**: `Authorization: Bearer tank_xxx` (NOT `x-api-key`)
  - Create a small helper `verifyCliAuth(request: Request)` that extracts Bearer token and calls `auth.api.verifyApiKey`

  **Must NOT do**:
  - No email/password auth — GitHub OAuth only for MVP
  - No 2FA, magic link, or passkey — defer
  - No Redis for API key caching — Supabase is fast enough for MVP
  - No admin plugin yet — add when moderation is needed

  **Parallelizable**: NO (depends on 1.3 for DB schema)

  **References**:
  - better-auth docs: https://www.better-auth.com/docs
  - better-auth Next.js integration: https://www.better-auth.com/docs/integrations/next-js
  - better-auth API keys plugin: https://www.better-auth.com/docs/plugins/api-keys
  - better-auth organization plugin: https://www.better-auth.com/docs/plugins/organization
  - Research findings from librarian agent (see Context section)

  **Acceptance Criteria**:
  - [ ] RED: Write test that calls `auth.api.verifyApiKey` with invalid key → rejects
  - [ ] GREEN: Configure better-auth, test passes
  - [ ] GitHub OAuth flow works end-to-end (sign up → profile created in DB)
  - [ ] `auth.api.createApiKey()` returns key with `tank_` prefix
  - [ ] `auth.api.verifyApiKey({ body: { key: "tank_xxx" } })` returns `{ valid: true, key: { userId, ... } }`
  - [ ] `verifyCliAuth(mockRequest)` extracts Bearer token and validates correctly
  - [ ] Organization creation works (create org with slug → org exists in DB)
  - [ ] `pnpm test --filter=web` → auth tests pass

  **Commit**: YES
  - Message: `feat(auth): integrate better-auth with github oauth, api keys, and organizations`
  - Files: `apps/web/lib/auth.ts`, `apps/web/lib/auth-client.ts`, `apps/web/app/api/auth/[...all]/route.ts`, migration files

---

- [ ] 1.6. Auth Web Pages

  **What to do**:
  - Create login page: `apps/web/app/(auth)/login/page.tsx`
    - "Sign in with GitHub" button
    - Redirects to dashboard on success
  - Create register page (or combine with login — GitHub OAuth handles both)
  - Create auth layout: `apps/web/app/(auth)/layout.tsx`
    - Centered card, Tank logo, minimal styling
  - Install and configure Tailwind CSS + shadcn/ui
  - Create basic `components/ui/` with button, card, input from shadcn

  **Must NOT do**:
  - No elaborate design — functional and clean only
  - No email/password forms
  - No "forgot password" flow

  **Parallelizable**: NO (depends on 1.5)

  **References**:
  - shadcn/ui installation: https://ui.shadcn.com/docs/installation/next
  - `assets/logo.png` — Tank logo for auth pages

  **Acceptance Criteria**:
  - [ ] RED: Write test that renders login page, expects "Sign in with GitHub" button
  - [ ] GREEN: Implement page, test passes
  - [ ] Login page renders at `/login`
  - [ ] "Sign in with GitHub" button triggers OAuth flow
  - [ ] After successful OAuth, user redirected to `/dashboard`
  - [ ] Unauthenticated users redirected from `/dashboard` to `/login`

  **Commit**: YES
  - Message: `feat(web): add auth pages with github login and tailwind/shadcn setup`
  - Files: `apps/web/app/(auth)/**`, `apps/web/components/**`, tailwind config

---

- [ ] 1.7. Dashboard — Token Management

  **What to do**:
  - Create dashboard layout: `apps/web/app/(dashboard)/layout.tsx`
    - Sidebar nav: Dashboard, Tokens, Organizations
    - Session check in layout (redirect to /login if unauthenticated)
  - Create dashboard page: `apps/web/app/(dashboard)/dashboard/page.tsx`
    - Welcome message, quick links
  - Create tokens page: `apps/web/app/(dashboard)/tokens/page.tsx`
    - List existing API keys (name, prefix, created date, last used)
    - "Create new token" button → modal/form (name, optional expiry)
    - Show full token ONCE on creation (then only show prefix `tank_abc1...`)
    - Revoke button per token
  - Server actions for: createToken, revokeToken, listTokens

  **Must NOT do**:
  - No token scoping (read-only vs publish) — all tokens are full-access for MVP
  - No token rotation — manual revoke + recreate

  **Parallelizable**: NO (depends on 1.6)

  **References**:
  - better-auth API keys plugin docs
  - npm token management UI as reference: https://www.npmjs.com/settings/~/tokens

  **Acceptance Criteria**:
  - [ ] RED: Write test for createToken server action → returns key with `tank_` prefix
  - [ ] GREEN: Implement server action, test passes
  - [ ] Dashboard shows user info after login
  - [ ] Tokens page lists all user's API keys
  - [ ] Create token shows full token value once, then only prefix
  - [ ] Revoke token removes it; subsequent API calls with that token fail
  - [ ] Revoking a token → `auth.api.verifyApiKey` returns `{ valid: false }`

  **Commit**: YES
  - Message: `feat(web): add dashboard with api token management`
  - Files: `apps/web/app/(dashboard)/**`

---

- [ ] 1.8. Dashboard — Organization Management

  **What to do**:
  - Create orgs page: `apps/web/app/(dashboard)/orgs/page.tsx`
    - List user's organizations (name, slug, member count)
    - "Create organization" form (name, slug)
    - Slug validation: lowercase, alphanumeric + hyphens, 1-39 chars (GitHub convention)
    - Slug becomes the `@org` scope for publishing
  - Create org detail page: `apps/web/app/(dashboard)/orgs/[slug]/page.tsx`
    - Member list (name, role: owner/member)
    - Invite member by GitHub username (MVP: just add by username, no email invite)
    - Remove member
  - Server actions for: createOrg, inviteMember, removeMember, listOrgs

  **Must NOT do**:
  - No complex roles — just `owner` (can manage org) and `member` (can publish)
  - No org settings page
  - No org avatar/logo
  - No email invitations — simple add-by-username

  **Parallelizable**: NO (depends on 1.7 for dashboard layout)

  **References**:
  - better-auth organization plugin docs
  - GitHub org creation flow as UX reference

  **Acceptance Criteria**:
  - [ ] RED: Write test for createOrg server action → returns org with correct slug
  - [ ] GREEN: Implement server action, test passes
  - [ ] Create org "My Company" with slug "mycompany" → org exists
  - [ ] Slug "MyCompany" gets normalized to "mycompany"
  - [ ] Slug with spaces/special chars is rejected
  - [ ] Add member to org → they appear in member list
  - [ ] Remove member → they no longer appear
  - [ ] Org slug is unique (duplicate creation fails)

  **Commit**: YES
  - Message: `feat(web): add organization management with member invitations`
  - Files: `apps/web/app/(dashboard)/orgs/**`

---

- [x] 1.9. CLI Auth Endpoint

  **What to do**:
  - Create `apps/web/app/api/v1/cli-auth/route.ts`
  - Flow:
    1. CLI calls `POST /api/v1/cli-auth/start` with `{ port: 9876, state: "random" }`
    2. Server stores the pending auth request (in-memory map or DB, TTL 5 minutes)
    3. Server returns `{ authUrl: "https://tankpkg.dev/cli-login?session=xxx" }`
    4. CLI opens browser to `authUrl`
    5. User logs in via GitHub OAuth (uses existing auth pages)
    6. After login, server creates API key for the user
    7. Server redirects to `POST /api/v1/cli-auth/exchange` which the CLI calls with the session code
    8. CLI receives `{ token: "tank_xxx", user: { name, email } }`
  - **Security**: Token is NEVER in a URL/querystring. Use a one-time session code that the CLI exchanges via POST request. Session code expires after 5 minutes or first use.
  - Create a dedicated CLI login page: `apps/web/app/cli-login/page.tsx`
    - Shows "Authorize Tank CLI" with user info
    - "Authorize" button completes the flow
    - "Deny" button cancels

  **Must NOT do**:
  - No device flow (RFC 8628) — simpler localhost callback for MVP
  - No refresh tokens — API keys are long-lived (90 days default)

  **Parallelizable**: NO (depends on 1.5 for better-auth)

  **References**:
  - GitHub CLI auth flow: https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-cli-with-a-github-app
  - better-auth API key creation: `auth.api.createApiKey()`

  **Acceptance Criteria**:
  - [ ] RED: Write test that calls `/api/v1/cli-auth/start` → returns `authUrl`
  - [ ] GREEN: Implement endpoint, test passes
  - [ ] `POST /api/v1/cli-auth/start` returns auth URL with session code
  - [ ] Session code expires after 5 minutes
  - [ ] Session code can only be exchanged once (replay protection)
  - [ ] `POST /api/v1/cli-auth/exchange` with valid code returns `{ token: "tank_xxx" }`
  - [ ] `POST /api/v1/cli-auth/exchange` with expired/invalid code returns 401
  - [ ] Token is NEVER present in any URL or querystring

  **Commit**: YES
  - Message: `feat(api): add cli auth endpoints with secure one-time code exchange`
  - Files: `apps/web/app/api/v1/cli-auth/**`, `apps/web/app/cli-login/**`

---

### Sprint 2: CLI + Publish (Week 3-4)

---

- [ ] 2.1. CLI Scaffolding

  **What to do**:
  - Set up `apps/cli` as a TypeScript CLI package
  - Install `commander` for command parsing
  - Install `chalk` for colored output, `ora` for spinners
  - Create bin entry: `apps/cli/bin/tank.ts` with shebang `#!/usr/bin/env node`
  - Configure `package.json` with `bin: { "tank": "./dist/bin/tank.js" }`, name: `tank`
  - Create base command structure with `--version`, `--help`
  - Create `apps/cli/src/lib/config.ts` — manages `~/.tank/config.json`:
    - Token storage path: `~/.tank/config.json` (Unix) or `%APPDATA%/tank/config.json` (Windows)
    - File permissions: `0600` on Unix (owner read/write only)
    - Config shape: `{ token: string, user: { name, email }, registry: string }`
  - Create `apps/cli/src/lib/api-client.ts` — HTTP client wrapper:
    - Base URL from config (default: `https://tankpkg.dev`)
    - Auto-attaches `Authorization: Bearer <token>` header
    - Error handling with user-friendly messages
  - Create `apps/cli/src/lib/logger.ts` — colored output helpers (info, success, error, warn)

  **Must NOT do**:
  - No oclif — too heavy for MVP
  - No interactive shell / REPL mode
  - No config file in project directory — only global `~/.tank/`
  - No token in environment variables for MVP (add `TANK_TOKEN` env var support later for CI)

  **Parallelizable**: NO (first CLI task)

  **References**:
  - commander.js docs: https://github.com/tj/commander.js
  - npm CLI structure as reference
  - `packages/shared` for importing types

  **Acceptance Criteria**:
  - [ ] RED: Write test that executes `tank --version` → outputs version string
  - [ ] GREEN: Implement CLI entry, test passes
  - [ ] `tank --version` prints version from package.json
  - [ ] `tank --help` shows available commands
  - [ ] Config module reads/writes `~/.tank/config.json`
  - [ ] Config file created with `0600` permissions on Unix
  - [ ] API client attaches auth header from config
  - [ ] `pnpm test --filter=cli` → passes

  **Commit**: YES
  - Message: `feat(cli): scaffold tank cli with commander, config management, and api client`
  - Files: `apps/cli/**`

---

- [ ] 2.2. `tank login`

  **What to do**:
  - Create `apps/cli/src/commands/login.ts`
  - Flow:
    1. Call `POST /api/v1/cli-auth/start` with random state + port
    2. Start temporary localhost HTTP server on random available port
    3. Open browser to the returned `authUrl` (use `open` npm package)
    4. Wait for callback (max 5 minute timeout)
    5. Receive session code on localhost callback
    6. Exchange session code via `POST /api/v1/cli-auth/exchange`
    7. Receive token + user info
    8. Write to `~/.tank/config.json`
    9. Print `✓ Logged in as {name}`
    10. Kill localhost server
  - Handle errors: browser fails to open (print URL manually), timeout, server errors
  - Add `tank whoami` command — reads config, calls API to verify token is still valid, prints user info

  **Must NOT do**:
  - No headless/CI login flow yet — users can manually create token on web and write config
  - No token refresh — tokens are long-lived

  **Parallelizable**: NO (depends on 2.1 + 1.9)

  **References**:
  - `apps/web/app/api/v1/cli-auth/route.ts` from task 1.9
  - `open` npm package: https://github.com/sindresorhus/open
  - GitHub CLI login as UX reference

  **Acceptance Criteria**:
  - [ ] RED: Write test that mocks auth endpoints, calls login flow → expects config file written
  - [ ] GREEN: Implement login command, test passes
  - [ ] `tank login` opens browser (or prints URL if browser fails)
  - [ ] After authenticating in browser, CLI receives token
  - [ ] Token written to `~/.tank/config.json` with `0600` permissions
  - [ ] `tank login` prints `✓ Logged in as {name}`
  - [ ] `tank whoami` prints username and email
  - [ ] `tank whoami` without login prints `✗ Not logged in. Run: tank login`
  - [ ] Login with timeout prints helpful error message

  **Commit**: YES
  - Message: `feat(cli): add tank login with browser oauth and tank whoami`
  - Files: `apps/cli/src/commands/login.ts`, `apps/cli/src/commands/whoami.ts`

---

- [ ] 2.3. `tank init`

  **What to do**:
  - Create `apps/cli/src/commands/init.ts`
  - Interactive prompt (use `inquirer` or `@inquirer/prompts`):
    1. Skill name (default: directory name, validate against naming rules)
    2. Version (default: `0.1.0`)
    3. Description (optional)
    4. Author (default: from `~/.tank/config.json` user)
  - Generate `skills.json` in current directory
  - Validate output against `skillsJsonSchema` from `packages/shared`
  - If `skills.json` already exists, warn and ask to overwrite

  **Must NOT do**:
  - No `--yes` flag for non-interactive mode yet
  - No template selection

  **Parallelizable**: YES (with 2.2, independent command)

  **References**:
  - `packages/shared/src/schemas/skills-json.ts` — Zod schema from task 1.4
  - `npm init` as UX reference

  **Acceptance Criteria**:
  - [ ] RED: Write test that runs init with mock prompts → expects valid `skills.json` written
  - [ ] GREEN: Implement command, test passes
  - [ ] `tank init` creates `skills.json` in current directory
  - [ ] Generated file validates against `skillsJsonSchema`
  - [ ] Existing `skills.json` prompts for overwrite confirmation
  - [ ] Skill name validation rejects invalid names (uppercase, special chars, >214 chars)

  **Commit**: YES
  - Message: `feat(cli): add tank init to create skills.json`
  - Files: `apps/cli/src/commands/init.ts`

---

- [ ] 2.4. Packer — Create Skill Tarball

  **What to do**:
  - Create `apps/cli/src/lib/packer.ts`
  - Reads current directory, packages into `.tgz`:
    1. Verify `skills.json` exists and is valid
    2. Verify `SKILL.md` exists (required file)
    3. Collect all files (respect `.tankignore` if present, else `.gitignore`, else default ignores)
    4. Default ignores: `node_modules`, `.git`, `.env*`, `*.log`
    5. Create tarball using `tar` npm package
    6. Compute `sha512` integrity hash of the tarball
    7. Enforce size limit: 50MB max (Supabase Storage limit)
    8. Enforce file count limit: 1000 files max
  - Return: `{ tarball: Buffer, integrity: string, fileCount: number, totalSize: number }`

  **Tar safety (on extraction side — relevant for install, enforced here on pack)**:
  - No absolute paths in tar entries
  - No `..` path components
  - No symlinks or hardlinks
  - Validate all paths are within package root

  **Must NOT do**:
  - No compression options — always gzip
  - No custom include patterns — pack everything not ignored

  **Parallelizable**: YES (with 2.2/2.3, independent module)

  **References**:
  - `tar` npm package: https://github.com/isaacs/node-tar
  - npm pack behavior as reference

  **Acceptance Criteria**:
  - [ ] RED: Write test with a mock directory → expects valid .tgz with correct hash
  - [ ] GREEN: Implement packer, test passes
  - [ ] Packs directory into valid `.tgz`
  - [ ] Rejects if no `skills.json` present
  - [ ] Rejects if no `SKILL.md` present
  - [ ] Rejects if tarball > 50MB
  - [ ] Rejects if > 1000 files
  - [ ] Computes correct `sha512` hash
  - [ ] Respects `.tankignore` / `.gitignore`
  - [ ] No absolute paths, no `..`, no symlinks in tarball
  - [ ] `pnpm test --filter=cli` → packer tests pass

  **Commit**: YES
  - Message: `feat(cli): add skill packer with integrity hashing and safety validation`
  - Files: `apps/cli/src/lib/packer.ts`

---

- [ ] 2.5. Publish API Endpoint

  **What to do**:
  - Create `apps/web/app/api/v1/skills/route.ts` — `POST` handler
  - Flow:
    1. Verify CLI auth (Bearer token → `verifyCliAuth`)
    2. Parse multipart form: `manifest` (JSON string) + metadata
    3. Validate manifest against `skillsJsonSchema`
    4. Check org access: if scoped name `@org/skill`, verify user is member of org
    5. Check for version conflicts (same name+version already exists → 409 Conflict)
    6. Name normalization: lowercase, trim whitespace
    7. Generate signed upload URL for Supabase Storage
    8. Return `{ uploadUrl: string, uploadHeaders: object, skillId: string, versionId: string }` to CLI
    9. CLI uploads tarball directly to Supabase Storage using signed URL
    10. CLI calls `POST /api/v1/skills/confirm` with `{ versionId, integrity }` to finalize
    11. Server verifies file exists in Storage, records in DB, sets status to `published`
  - Two-step publish (to bypass Vercel 4.5MB limit):
    - Step 1: `POST /api/v1/skills` — validate + get upload URL
    - Step 2: CLI uploads directly to Supabase Storage
    - Step 3: `POST /api/v1/skills/confirm` — finalize publish

  **Must NOT do**:
  - No security analysis in the publish flow yet — Sprint 5
  - No enforced semver validation (checking if bump matches changes) — Phase 2
  - No SBOM — Phase 2
  - No signature verification — Phase 2

  **Parallelizable**: NO (critical path for publish)

  **References**:
  - Supabase Storage signed upload URLs: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
  - `apps/web/lib/auth.ts` — `verifyCliAuth` helper from task 1.5
  - `packages/shared` — schemas and types

  **Acceptance Criteria**:
  - [ ] RED: Write test that POSTs valid manifest with auth → expects upload URL returned
  - [ ] GREEN: Implement endpoint, test passes
  - [ ] `POST /api/v1/skills` with valid auth + manifest returns `{ uploadUrl, versionId }`
  - [ ] Returns 401 for invalid/missing token
  - [ ] Returns 403 for publishing to org user doesn't belong to
  - [ ] Returns 409 for duplicate name+version
  - [ ] Returns 400 for invalid manifest
  - [ ] `POST /api/v1/skills/confirm` with valid versionId finalizes publish
  - [ ] Skill and version records exist in DB after confirmation
  - [ ] Name is normalized to lowercase in DB

  **Commit**: YES
  - Message: `feat(api): add two-step publish endpoint with signed upload urls`
  - Files: `apps/web/app/api/v1/skills/route.ts`, `apps/web/app/api/v1/skills/confirm/route.ts`

---

- [ ] 2.6. `tank publish`

  **What to do**:
  - Create `apps/cli/src/commands/publish.ts`
  - Flow:
    1. Check auth (token exists in config)
    2. Run packer (task 2.4) → get tarball + integrity hash
    3. Read `skills.json` for manifest data
    4. Call `POST /api/v1/skills` with manifest → get upload URL
    5. Upload tarball directly to Supabase Storage via signed URL
    6. Call `POST /api/v1/skills/confirm` with versionId + integrity
    7. Print success: `✓ Published @org/skill@1.0.0 (1.2MB, 15 files)`
  - `tank publish --dry-run`: packs and validates but doesn't upload
  - Progress output: packing → validating → uploading → confirming → done

  **Must NOT do**:
  - No `--tag` flag (dist-tags)
  - No `--access public/private` (all public for MVP)
  - No interactive permission review

  **Parallelizable**: NO (depends on 2.4, 2.5)

  **References**:
  - `apps/cli/src/lib/packer.ts` — packer from task 2.4
  - `apps/cli/src/lib/api-client.ts` — API client from task 2.1

  **Acceptance Criteria**:
  - [ ] RED: Write integration test that mocks API → expects full publish flow to succeed
  - [ ] GREEN: Implement command, test passes
  - [ ] `tank publish` in a directory with `skills.json` + `SKILL.md` succeeds
  - [ ] `tank publish` without `skills.json` fails with helpful error
  - [ ] `tank publish` without auth fails with `Not logged in. Run: tank login`
  - [ ] `tank publish --dry-run` validates without uploading
  - [ ] Progress spinner shows each step
  - [ ] Success message includes name, version, size, file count

  **Commit**: YES
  - Message: `feat(cli): add tank publish with dry-run support`
  - Files: `apps/cli/src/commands/publish.ts`

---

- [ ] 2.7. `tank logout`

  **What to do**:
  - Create `apps/cli/src/commands/logout.ts`
  - Delete token from `~/.tank/config.json`
  - Optionally revoke the API key server-side (call revoke endpoint if reachable)
  - Print `✓ Logged out`

  **Parallelizable**: YES (trivial, independent)

  **Acceptance Criteria**:
  - [ ] RED: Write test that writes config, calls logout → expects config cleared
  - [ ] GREEN: Implement, test passes
  - [ ] `tank logout` removes token from config
  - [ ] `tank whoami` after logout shows "Not logged in"

  **Commit**: YES (groups with 2.6)
  - Message: `feat(cli): add tank logout`
  - Files: `apps/cli/src/commands/logout.ts`

---

- [ ] 2.8. Publish End-to-End Verification

  **What to do**:
  - Manual E2E test (not automated):
    1. `tank login` → authenticate via browser
    2. Create test skill directory with `SKILL.md` + `skills.json`
    3. `tank publish` → verify success
    4. Check Supabase dashboard: Storage bucket has `.tgz`, DB has records
    5. `tank publish` same version again → verify 409 error
    6. Bump version, `tank publish` → verify second version exists
  - Document the E2E test steps in a `docs/e2e-test-publish.md` (for repeating manually)

  **Parallelizable**: NO (end of sprint verification)

  **Acceptance Criteria**:
  - [ ] Full publish flow works from CLI to storage
  - [ ] Tarball exists in Supabase Storage at correct path
  - [ ] Skill + version records exist in DB with correct data
  - [ ] Integrity hash in DB matches computed hash
  - [ ] Duplicate version publish returns 409

  **Commit**: YES
  - Message: `docs: add end-to-end publish test procedure`
  - Files: `docs/e2e-test-publish.md`

---

### Sprint 3: Install + Lockfile (Week 5-6)

---

- [ ] 3.1. Registry Read API Endpoints

  **What to do**:
  - `GET /api/v1/skills/:name` — return skill metadata + latest version
  - `GET /api/v1/skills/:name/:version` — return specific version metadata + signed download URL
    - Download URL: Supabase Storage signed URL (1 hour expiry)
  - `GET /api/v1/skills/:name/versions` — list all versions (for semver resolution)
  - Response shapes defined in `packages/shared/src/types/api.ts`
  - Handle scoped names in URL: `GET /api/v1/skills/@org/skill-name` (encode `@` and `/`)
  - Return 404 for non-existent skills with helpful message

  **Must NOT do**:
  - No CDN/caching layer — direct Supabase queries for MVP
  - No download counting yet — Sprint 4

  **Parallelizable**: NO (first install task, but independent of CLI)

  **References**:
  - npm registry API as reference: https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md
  - `packages/shared/src/types/api.ts` — response types

  **Acceptance Criteria**:
  - [ ] RED: Write test that GETs a known skill → expects correct response shape
  - [ ] GREEN: Implement endpoints, tests pass
  - [ ] `GET /api/v1/skills/@org/my-skill` returns metadata + latest version
  - [ ] `GET /api/v1/skills/@org/my-skill/1.0.0` returns version + download URL
  - [ ] Download URL is a valid Supabase signed URL
  - [ ] `GET /api/v1/skills/@org/nonexistent` returns 404
  - [ ] Response matches API types from `packages/shared`

  **Commit**: YES
  - Message: `feat(api): add skill metadata and version endpoints with signed download urls`
  - Files: `apps/web/app/api/v1/skills/[name]/route.ts`, `apps/web/app/api/v1/skills/[name]/[version]/route.ts`, `apps/web/app/api/v1/skills/[name]/versions/route.ts`

---

- [ ] 3.2. Semver Resolver

  **What to do**:
  - Create `packages/shared/src/lib/resolver.ts`
  - Use `semver` npm package for parsing and resolution
  - Given a version range (e.g., `^2.1.0`) and a list of available versions, return the best match
  - Support: `^` (compatible), `~` (patch), exact, `>=`, `<`, `*`
  - Handle pre-release versions (exclude from range matching unless explicitly requested)
  - Return `null` if no version satisfies the constraint (caller handles error messaging)

  **Must NOT do**:
  - No transitive dependency resolution — just direct version matching
  - No conflict resolution between multiple skills needing different versions of the same dep

  **Parallelizable**: YES (pure logic, no I/O)

  **References**:
  - `semver` npm package: https://github.com/npm/node-semver
  - npm semver range docs: https://docs.npmjs.com/cli/v6/using-npm/semver

  **Acceptance Criteria**:
  - [ ] RED: Write tests for each range type (`^`, `~`, exact, `>=`, `*`)
  - [ ] GREEN: Implement resolver, tests pass
  - [ ] `resolve("^2.1.0", ["2.0.0", "2.1.0", "2.1.3", "2.2.0", "3.0.0"])` → `"2.2.0"`
  - [ ] `resolve("~2.1.0", ["2.1.0", "2.1.3", "2.2.0"])` → `"2.1.3"`
  - [ ] `resolve("2.1.0", ["2.1.0", "2.1.3"])` → `"2.1.0"`
  - [ ] `resolve("^5.0.0", ["1.0.0", "2.0.0"])` → `null`
  - [ ] Pre-release versions excluded from `^` matching by default

  **Commit**: YES
  - Message: `feat(shared): add semver resolver for version range matching`
  - Files: `packages/shared/src/lib/resolver.ts`

---

- [ ] 3.3. `tank install @org/skill`

  **What to do**:
  - Create `apps/cli/src/commands/install.ts`
  - Flow for `tank install @org/skill-name` (add new skill):
    1. Parse skill name and optional version range (default: `^latest`)
    2. Fetch available versions: `GET /api/v1/skills/@org/skill-name/versions`
    3. Resolve best version using semver resolver
    4. Fetch version metadata + download URL: `GET /api/v1/skills/@org/skill-name/1.0.0`
    5. Download tarball from signed URL
    6. Verify integrity hash (sha512 from metadata vs computed from download)
    7. Extract tarball safely:
       - Reject absolute paths
       - Reject `..` path traversal
       - Reject symlinks/hardlinks
       - Enforce max uncompressed size (100MB)
    8. Install to `.tank/skills/@org/skill-name/` in project directory
    9. Update `skills.json` — add skill to `skills` field with resolved range
    10. Update `skills.lock` — add entry with resolved version, integrity hash, permissions
  - Permission budget check:
    1. Read project permissions from `skills.json`
    2. Read skill permissions from metadata
    3. If skill permissions exceed budget → print warning and abort install
    4. If no budget defined → install with warning about missing budget

  **Must NOT do**:
  - No parallel downloads (sequential for MVP)
  - No global install cache — project-local only
  - No progress bars for download — just spinner

  **Parallelizable**: NO (depends on 3.1, 3.2)

  **References**:
  - `packages/shared/src/schemas/skills-lock.ts` — lockfile schema
  - `packages/shared/src/lib/resolver.ts` — semver resolver
  - `apps/cli/src/lib/packer.ts` — tar safety patterns (reuse for extraction)

  **Acceptance Criteria**:
  - [ ] RED: Write test with mock API → expects skill installed to correct path with correct lockfile entry
  - [ ] GREEN: Implement command, test passes
  - [ ] `tank install @org/skill` downloads and extracts to `.tank/skills/@org/skill/`
  - [ ] `skills.json` updated with new dependency
  - [ ] `skills.lock` updated with resolved version, integrity hash, permissions
  - [ ] Integrity mismatch → install aborted with error
  - [ ] Permission budget exceeded → install aborted with clear message showing which permissions conflict
  - [ ] Path traversal in tarball → install aborted with security warning
  - [ ] Non-existent skill → 404 error with helpful message

  **Commit**: YES
  - Message: `feat(cli): add tank install with integrity verification and permission budget check`
  - Files: `apps/cli/src/commands/install.ts`

---

- [ ] 3.4. `tank install` (from lockfile)

  **What to do**:
  - When `tank install` is run with no arguments and `skills.lock` exists:
    1. Read `skills.lock`
    2. For each locked skill: download from `resolved` URL, verify `integrity` hash
    3. Extract to `.tank/skills/`
    4. If any hash mismatch → abort entire install (fail closed)
    5. Print summary: `✓ Installed 5 skills from lockfile`
  - This is the CI-safe, deterministic install path
  - If no `skills.lock` and no `skills.json` → error: "No skills.json found. Run: tank init"
  - If `skills.json` exists but no `skills.lock` → resolve and create lockfile (like first install)

  **Must NOT do**:
  - No partial installs — all or nothing
  - No `--production` flag
  - No `--frozen-lockfile` flag yet (always frozen when lockfile exists)

  **Parallelizable**: NO (depends on 3.3)

  **References**:
  - `packages/shared/src/schemas/skills-lock.ts` — lockfile schema
  - `npm ci` behavior as reference

  **Acceptance Criteria**:
  - [ ] RED: Write test with mock lockfile + mock downloads → expects deterministic install
  - [ ] GREEN: Implement, test passes
  - [ ] `tank install` with lockfile downloads exact versions listed
  - [ ] Integrity hash mismatch on any skill → entire install aborted
  - [ ] Installed files match exactly what was published (byte-for-byte via hash)
  - [ ] No `skills.json` → helpful error message
  - [ ] `skills.json` without lockfile → creates lockfile

  **Commit**: YES
  - Message: `feat(cli): add deterministic install from lockfile with integrity verification`
  - Files: `apps/cli/src/commands/install.ts` (extends existing)

---

- [ ] 3.5. Lockfile Generation + Determinism

  **What to do**:
  - Create `apps/cli/src/lib/lockfile.ts`
  - Lockfile generation rules:
    1. Skills object keys sorted alphabetically
    2. JSON serialized with `JSON.stringify(lock, null, 2)` + trailing newline
    3. Integrity hash format: `sha512-{base64}`
    4. Resolved permissions: union of all installed skill permissions
    5. `permission_budget_check`: `"pass"` or `"fail"` (or `"no_budget"` if project has no permissions field)
  - Lockfile verification:
    1. Read lockfile
    2. For each entry, re-compute integrity of installed files
    3. Compare with stored integrity
    4. Report any mismatches
  - `tank verify` command: runs lockfile verification and reports results

  **Must NOT do**:
  - No lockfile diffing (showing what changed between versions)
  - No lockfile auto-merge for git conflicts

  **Parallelizable**: NO (depends on 3.3)

  **References**:
  - `packages/shared/src/schemas/skills-lock.ts` — schema
  - `package-lock.json` format as reference
  - `docs/product-brief.md:82-111` — lockfile spec

  **Acceptance Criteria**:
  - [ ] RED: Write test that generates lockfile from installed skills → expects deterministic output
  - [ ] GREEN: Implement, test passes
  - [ ] Same set of skills always produces byte-identical lockfile
  - [ ] `tank verify` passes when installed files match lockfile
  - [ ] `tank verify` fails when a file is modified after install
  - [ ] Lockfile includes resolved permissions union
  - [ ] Lockfile includes `permission_budget_check` result

  **Commit**: YES
  - Message: `feat(cli): add deterministic lockfile generation and tank verify command`
  - Files: `apps/cli/src/lib/lockfile.ts`, `apps/cli/src/commands/verify.ts`

---

- [ ] 3.6. `tank remove` + `tank update`

  **What to do**:
  - `tank remove @org/skill`:
    1. Remove from `skills.json`
    2. Remove from `skills.lock`
    3. Delete `.tank/skills/@org/skill/` directory
    4. Print `✓ Removed @org/skill`
  - `tank update @org/skill`:
    1. Fetch available versions
    2. Find latest version within the range defined in `skills.json`
    3. If newer version available: download, verify, update lockfile
    4. If already at latest: print `Already at latest: @org/skill@1.2.3`
  - `tank update` (no args): update all skills within their ranges

  **Parallelizable**: YES (with 3.5, independent commands)

  **Acceptance Criteria**:
  - [ ] RED: Write tests for remove and update flows
  - [ ] GREEN: Implement, tests pass
  - [ ] `tank remove @org/skill` removes from json, lock, and disk
  - [ ] `tank update @org/skill` updates to latest within range
  - [ ] `tank update` with no newer versions prints "Already up to date"
  - [ ] Lockfile is regenerated after remove/update

  **Commit**: YES
  - Message: `feat(cli): add tank remove and tank update commands`
  - Files: `apps/cli/src/commands/remove.ts`, `apps/cli/src/commands/update.ts`

---

- [ ] 3.7. `tank permissions`

  **What to do**:
  - Create `apps/cli/src/commands/permissions.ts`
  - Reads `skills.lock` and displays resolved permission summary:
    ```
    Resolved permissions for this project:

    Network (outbound):
      *.anthropic.com    ← @vercel/next-skill
      *.openai.com       ← @community/llm-helper

    Filesystem (read):
      ./src/**            ← @vercel/next-skill
      ./docs/**           ← @community/seo-audit

    Filesystem (write):
      ./output/**         ← @vercel/next-skill

    Subprocess: none

    Budget status: ✓ PASS (all within budget)
    ```
  - Color-coded: green for within budget, red for exceeding

  **Parallelizable**: YES (display-only command)

  **Acceptance Criteria**:
  - [ ] RED: Write test with mock lockfile → expects formatted output
  - [ ] GREEN: Implement, test passes
  - [ ] Shows each permission with which skill requires it
  - [ ] Shows budget status (pass/fail/no budget defined)
  - [ ] Works without lockfile (prints "No skills installed")

  **Commit**: YES
  - Message: `feat(cli): add tank permissions to display resolved permission summary`
  - Files: `apps/cli/src/commands/permissions.ts`

---

### Sprint 4: Discovery + Web Browse (Week 7-8)

---

- [ ] 4.1. Search API

  **What to do**:
  - Create `apps/web/app/api/v1/search/route.ts`
  - `GET /api/v1/search?q=seo&page=1&limit=20`
  - PostgreSQL full-text search on `skills.name` + `skills.description`
  - Use `ts_rank` for relevance ordering
  - Include in response: name, description, latest version, audit score, download count
  - Pagination with cursor or offset

  **Must NOT do**:
  - No vector/semantic search
  - No faceted search / filters beyond keyword

  **Parallelizable**: YES (with 4.2)

  **Acceptance Criteria**:
  - [ ] RED: Write test that searches for published skill by keyword → expects it in results
  - [ ] GREEN: Implement, test passes
  - [ ] Search by name returns matching skills
  - [ ] Search by description keyword returns matching skills
  - [ ] Results include name, description, version, audit_score
  - [ ] Empty query returns most recently published
  - [ ] Pagination works correctly

  **Commit**: YES
  - Message: `feat(api): add full-text search endpoint for skills`
  - Files: `apps/web/app/api/v1/search/route.ts`

---

- [ ] 4.2. `tank search` + `tank info`

  **What to do**:
  - `tank search "query"`:
    - Calls search API
    - Displays results as table: name, version, description (truncated), score
    - If no results: "No skills found for 'query'"
  - `tank info @org/skill`:
    - Calls metadata API
    - Displays: name, version, description, publisher, permissions, audit score, download count, homepage, repository

  **Parallelizable**: YES (with 4.1 once API exists)

  **Acceptance Criteria**:
  - [ ] RED: Write tests with mock API responses → expect formatted output
  - [ ] GREEN: Implement, tests pass
  - [ ] `tank search "seo"` shows matching skills in table format
  - [ ] `tank info @org/skill` shows full metadata
  - [ ] `tank info @org/nonexistent` shows "Not found"

  **Commit**: YES
  - Message: `feat(cli): add tank search and tank info commands`
  - Files: `apps/cli/src/commands/search.ts`, `apps/cli/src/commands/info.ts`

---

- [ ] 4.3. Download Counting

  **What to do**:
  - On each successful `tank install` of a specific version, record download in `skill_downloads` table
  - Aggregate counts for display on info/search endpoints
  - Rate limit: max 1 download count per IP hash per skill per hour (prevent inflation)
  - Add `downloads` field to search and metadata API responses

  **Must NOT do**:
  - No detailed analytics (just counts)
  - No user tracking (IP is hashed, no user ID stored)

  **Parallelizable**: YES (with 4.1/4.2)

  **Acceptance Criteria**:
  - [ ] RED: Write test that records download, queries count → expects incremented
  - [ ] GREEN: Implement, test passes
  - [ ] Download count increments on install
  - [ ] Same IP within 1 hour doesn't double-count
  - [ ] Count visible in `tank info` and search results

  **Commit**: YES
  - Message: `feat(api): add download counting with ip-based deduplication`
  - Files: `apps/web/app/api/v1/skills/[name]/[version]/route.ts` (add counting)

---

- [ ] 4.4. Web — Skills Browse Page

  **What to do**:
  - Create `apps/web/app/(registry)/skills/page.tsx`
  - Search bar at top
  - Grid/list of skill cards: name, description, version, audit score badge, download count
  - Server component with search params for query
  - Pagination (load more or page numbers)

  **Must NOT do**:
  - No filtering by category/tag
  - No sorting options (just relevance for search, recency for browse)

  **Parallelizable**: NO (depends on 4.1 for search API)

  **Acceptance Criteria**:
  - [ ] Skills browse page renders at `/skills`
  - [ ] Search bar filters results
  - [ ] Skill cards show name, description, version, score
  - [ ] Clicking a card navigates to detail page
  - [ ] Empty state shows "No skills published yet"

  **Commit**: YES
  - Message: `feat(web): add skills browse page with search`
  - Files: `apps/web/app/(registry)/skills/page.tsx`, components

---

- [ ] 4.5. Web — Skill Detail Page

  **What to do**:
  - Create `apps/web/app/(registry)/skills/[...name]/page.tsx`
    - Handle scoped names: `/skills/@org/skill-name`
  - Display: full README (rendered markdown), permissions table, version history, install command, audit score, publisher info, download count
  - Install command in copyable code block: `tank install @org/skill-name`
  - Version selector dropdown

  **Parallelizable**: NO (depends on 4.4 for navigation)

  **Acceptance Criteria**:
  - [ ] Detail page renders at `/skills/@org/skill-name`
  - [ ] SKILL.md content rendered as HTML
  - [ ] Permissions displayed clearly
  - [ ] Install command is copyable
  - [ ] Version history shows all published versions
  - [ ] 404 page for non-existent skills

  **Commit**: YES
  - Message: `feat(web): add skill detail page with readme, permissions, and versions`
  - Files: `apps/web/app/(registry)/skills/[...name]/page.tsx`

---

### Sprint 5: Security Analysis Pipeline (Week 9-10) — Partner's Domain

---

- [ ] 5.1. Python Function Scaffold

  **What to do** (PARTNER):
  - Create `api/analyze.py` with FastAPI
  - Set up `requirements.txt` with dependencies
  - Create shared utilities for calling OpenRouter
  - Configure environment variables: `OPENROUTER_API_KEY`
  - Test deployment on Vercel

  **Acceptance Criteria**:
  - [ ] `POST /api/analyze` returns 200 with test payload
  - [ ] FastAPI auto-docs accessible at `/api/analyze/docs`
  - [ ] Deploys successfully on Vercel

  **Commit**: YES
  - Message: `feat(api): scaffold python analysis functions with fastapi`

---

- [ ] 5.2. Permission Extraction

  **What to do** (PARTNER):
  - `POST /api/analyze/permissions` — accepts SKILL.md content
  - Uses OpenRouter `qwen/qwen3-coder:free` to analyze SKILL.md
  - Extracts: what tools/APIs does the skill request? What filesystem access? What network access?
  - Returns structured JSON matching permission types from `packages/shared`

  **Acceptance Criteria**:
  - [ ] Returns extracted permissions in correct schema
  - [ ] Identifies network access patterns
  - [ ] Identifies filesystem access patterns
  - [ ] Identifies subprocess usage

  **Commit**: YES
  - Message: `feat(api): add llm-based permission extraction from skill.md`

---

- [ ] 5.3. Security Scanning

  **What to do** (PARTNER):
  - `POST /api/analyze/security` — accepts SKILL.md content
  - Uses OpenRouter `deepseek/deepseek-r1-0528:free`
  - Checks for: prompt injection patterns, data exfiltration attempts, obfuscated instructions, credential harvesting
  - Returns: `{ safe: boolean, issues: Array<{ severity, description, location }> }`

  **Acceptance Criteria**:
  - [ ] Flags known malicious patterns
  - [ ] Returns structured issue list
  - [ ] Handles benign skills without false positives (test with 5+ real skills)

  **Commit**: YES
  - Message: `feat(api): add llm-based security scanning for skill.md`

---

- [ ] 5.4. Audit Score Computation

  **What to do** (PARTNER + ELAD):
  - Compute 0-10 score based on available signals:
    - SKILL.md present and non-empty: +1
    - Description present: +1
    - Permissions declared (not empty): +1
    - No security issues found: +2
    - Permission extraction matches declared permissions: +2
    - File count reasonable (< 100): +1
    - Has README/documentation beyond SKILL.md: +1
    - Package size reasonable (< 5MB): +1
  - Store in `skill_versions.audit_score` and `skill_versions.analysis_results`

  **Acceptance Criteria**:
  - [ ] Score computed for test skills matches expected values
  - [ ] Score stored in DB
  - [ ] Score visible in `tank info` and web UI

  **Commit**: YES
  - Message: `feat(api): add audit score computation from analysis results`

---

- [ ] 5.5. Publish Pipeline Integration

  **What to do** (ELAD):
  - After `POST /api/v1/skills/confirm` succeeds:
    1. Trigger async analysis: call Python functions with SKILL.md content
    2. If analysis completes within 30 seconds → store results, compute score
    3. If analysis times out → set `audit_score = null`, `analysis_status = "pending"`
    4. Never block publish on analysis — publish always succeeds if validation passes
  - Add `analysis_status` field to `skill_versions`: `pending`, `completed`, `failed`
  - Background retry for failed/pending analyses (simple cron or Vercel cron)

  **Must NOT do**:
  - No blocking publish on analysis results
  - No complex job queue — simple async call with timeout

  **Acceptance Criteria**:
  - [ ] Published skill triggers analysis automatically
  - [ ] Analysis results stored in DB
  - [ ] Publish succeeds even if analysis times out
  - [ ] Pending analysis shows "Analysis in progress" in UI/CLI
  - [ ] Completed analysis shows score

  **Commit**: YES
  - Message: `feat(api): integrate security analysis into publish pipeline`
  - Files: `apps/web/app/api/v1/skills/confirm/route.ts` (extend)

---

- [ ] 5.6. `tank audit`

  **What to do** (ELAD):
  - Create `apps/cli/src/commands/audit.ts`
  - `tank audit`: audit all installed skills
    - For each skill in lockfile, fetch audit data from API
    - Display table: name, version, score, issues count, status
    - Summary: "5 skills audited. 4 pass, 1 has issues."
  - `tank audit @org/skill`: audit specific skill
    - Show detailed analysis results
  - Color-coded: green (score ≥ 7), yellow (4-6), red (0-3)

  **Acceptance Criteria**:
  - [ ] RED: Write test with mock audit data → expects formatted output
  - [ ] GREEN: Implement, test passes
  - [ ] `tank audit` shows all installed skills with scores
  - [ ] `tank audit @org/skill` shows detailed analysis
  - [ ] Color coding works correctly
  - [ ] "Analysis pending" shown for unscored skills

  **Commit**: YES
  - Message: `feat(cli): add tank audit to display security analysis results`
  - Files: `apps/cli/src/commands/audit.ts`

---

## Commit Strategy

| After Task | Message | Verification |
|------------|---------|--------------|
| 1.1 | `feat(infra): initialize turborepo monorepo` | `pnpm build && pnpm test` |
| 1.2 | `feat(infra): configure supabase project` | `pnpm test --filter=web` |
| 1.3 | `feat(db): add initial database schema` | `pnpm test --filter=web` |
| 1.4 | `feat(shared): add zod schemas for skills.json, skills.lock, permissions` | `pnpm test --filter=shared` |
| 1.5 | `feat(auth): integrate better-auth` | `pnpm test --filter=web` |
| 1.6 | `feat(web): add auth pages with github login` | `pnpm test --filter=web` |
| 1.7 | `feat(web): add dashboard with token management` | `pnpm test --filter=web` |
| 1.8 | `feat(web): add organization management` | `pnpm test --filter=web` |
| 1.9 | `feat(api): add cli auth endpoints` | `pnpm test --filter=web` |
| 2.1 | `feat(cli): scaffold tank cli` | `pnpm test --filter=cli` |
| 2.2 | `feat(cli): add tank login and whoami` | `pnpm test --filter=cli` |
| 2.3 | `feat(cli): add tank init` | `pnpm test --filter=cli` |
| 2.4 | `feat(cli): add skill packer` | `pnpm test --filter=cli` |
| 2.5 | `feat(api): add two-step publish endpoint` | `pnpm test --filter=web` |
| 2.6 | `feat(cli): add tank publish` | `pnpm test --filter=cli` |
| 2.7 | `feat(cli): add tank logout` | `pnpm test --filter=cli` |
| 2.8 | `docs: add e2e publish test procedure` | manual |
| 3.1 | `feat(api): add skill metadata endpoints` | `pnpm test --filter=web` |
| 3.2 | `feat(shared): add semver resolver` | `pnpm test --filter=shared` |
| 3.3 | `feat(cli): add tank install` | `pnpm test --filter=cli` |
| 3.4 | `feat(cli): add deterministic install from lockfile` | `pnpm test --filter=cli` |
| 3.5 | `feat(cli): add lockfile generation and tank verify` | `pnpm test --filter=cli` |
| 3.6 | `feat(cli): add tank remove and tank update` | `pnpm test --filter=cli` |
| 3.7 | `feat(cli): add tank permissions` | `pnpm test --filter=cli` |
| 4.1 | `feat(api): add full-text search` | `pnpm test --filter=web` |
| 4.2 | `feat(cli): add tank search and tank info` | `pnpm test --filter=cli` |
| 4.3 | `feat(api): add download counting` | `pnpm test --filter=web` |
| 4.4 | `feat(web): add skills browse page` | manual |
| 4.5 | `feat(web): add skill detail page` | manual |
| 5.1-5.4 | Partner's commits | Partner tests |
| 5.5 | `feat(api): integrate security analysis` | `pnpm test --filter=web` |
| 5.6 | `feat(cli): add tank audit` | `pnpm test --filter=cli` |

---

## Success Criteria

### Verification Commands
```bash
pnpm test                    # All workspace tests pass
pnpm build                   # All packages build successfully
pnpm test --filter=shared    # Schema validation tests
pnpm test --filter=web       # API + auth tests
pnpm test --filter=cli       # CLI command tests
```

### Final E2E Checklist
- [ ] Create account via GitHub OAuth on tankpkg.dev
- [ ] Create organization "testorg"
- [ ] Generate API token
- [ ] `tank login` → authenticates via browser
- [ ] `tank whoami` → shows user info
- [ ] `tank init` → creates skills.json
- [ ] `tank publish` → uploads skill to registry
- [ ] `tank search "test"` → finds published skill
- [ ] `tank info @testorg/test-skill` → shows metadata
- [ ] `tank install @testorg/test-skill` → downloads and locks
- [ ] `tank install` (from lockfile) → deterministic reinstall
- [ ] `tank verify` → integrity check passes
- [ ] `tank permissions` → shows resolved permissions
- [ ] `tank update @testorg/test-skill` → updates within range
- [ ] `tank remove @testorg/test-skill` → removes cleanly
- [ ] `tank audit` → shows security analysis results
- [ ] `tank logout` → clears credentials
- [ ] All "Must NOT Have" items are absent from the codebase
