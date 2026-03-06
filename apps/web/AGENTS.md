# WEB — Next.js 15 Registry

## OVERVIEW

Next.js 15 App Router application serving as the Tank skill registry — web UI, REST API for CLI, and Python security scanning stubs. Two auth modes: web sessions (better-auth cookies) and CLI (Bearer `tank_*` API keys).

## STRUCTURE

```
web/
├── app/
│   ├── layout.tsx                # Root layout, loads fonts, GA tracking
│   ├── page.tsx                  # Homepage (public)
│   ├── cli-login/                # CLI OAuth redirect handler
│   ├── (auth)/                   # Auth route group
│   │   └── login/                # Web login page
│   ├── (dashboard)/              # Protected — layout auth guard
│   │   ├── layout.tsx            # Auth guard: checks session
│   │   ├── dashboard/            # Overview page
│   │   ├── tokens/               # API key management
│   │   │   ├── page.tsx          # List/create API keys
│   │   │   └── actions.ts        # Server actions for tokens
│   │   └── orgs/                 # Organization management
│   │       ├── page.tsx          # List orgs
│   │       ├── actions.ts        # Server actions for orgs
│   │       └── accept-invitation/# Accept org invitations
│   ├── (admin)/                  # Admin-only — role guard in layout
│   │   └── admin/
│   │       ├── layout.tsx        # Admin role check
│   │       ├── page.tsx          # Admin dashboard
│   │       ├── users/            # User management
│   │       ├── packages/         # Skill moderation
│   │       ├── service-accounts/ # CI/CD API keys
│   │       └── orgs/             # Organization CRUD
│   ├── (registry)/               # Public skill browsing
│   │   ├── layout.tsx            # No auth required
│   │   └── skills/
│   │       ├── page.tsx          # Skill list with search
│   │       └── [...name]/        # Skill detail page (627 lines)
│   │           ├── page.tsx      # Metadata, versions, security, files
│   │           └── components/   # Skill page components
│   ├── docs/                     # Documentation (Fumadocs MDX)
│   └── api/                      # REST API
│       ├── health/               # Health check endpoint
│       ├── auth/[...all]/        # better-auth handlers
│       ├── v1/                   # Public API (CLI uses this)
│       │   ├── cli-auth/         # OAuth flow (start→authorize→exchange)
│       │   ├── skills/           # Publish, metadata, download
│       │   │   ├── route.ts      # POST (publish), GET (search)
│       │   │   ├── confirm/      # Finalize publish
│       │   │   └── [name]/       # Skill operations
│       │   │       ├── route.ts  # GET metadata
│       │   │       ├── versions/ # List versions
│       │   │       ├── star/     # Star/unstar
│       │   │       └── [version]/
│       │   │           ├── route.ts        # GET version metadata
│       │   │           └── files/[...path]/# File content
│       │   ├── search/           # Full-text search
│       │   ├── badge/[...name]/  # SVG badge generation
│       │   └── scan/             # Security scan endpoint
│       └── admin/                # Admin API
│           ├── packages/         # Skill CRUD, moderation
│           ├── users/            # User CRUD, status
│           ├── orgs/             # Organization CRUD
│           ├── audit-logs/       # Query audit logs
│           ├── rescan-skills/    # Bulk security rescan
│           └── service-accounts/ # CI/CD API keys
├── api-python/                   # Vercel Python stubs — mirrors python-api/
│   └── analyze/                  # Security scan endpoints
├── lib/
│   ├── db.ts                     # globalThis singleton (hot-reload safe)
│   ├── db/
│   │   ├── schema.ts             # Domain: skills, versions, downloads, audit, scans
│   │   └── auth-schema.ts        # better-auth auto-generated tables
│   ├── auth.ts                   # better-auth config (GitHub + OIDC SSO + apiKey + org)
│   ├── auth-client.ts            # Client-side auth helpers
│   ├── auth-helpers.ts           # verifyCliAuth() — Bearer token validation
│   ├── admin-middleware.ts       # requireAdmin(), withAdminAuth() HOF
│   ├── cli-auth-store.ts         # Memory + Redis session store (5-min TTL)
│   ├── supabase.ts               # Storage client (tarballs only)
│   ├── storage/
│   │   └── provider.ts           # Abstract storage (Supabase or S3)
│   ├── redis.ts                  # Optional Redis for caching
│   ├── email/
│   │   ├── service.ts            # Multi-provider: Resend, SMTP, console
│   │   └── rate-limiter.ts       # Rate limiting for emails
│   ├── audit-score.ts            # 0–10 score, 8 weighted checks
│   ├── permission-escalation.ts  # Version bump + permission change detection
│   ├── logger.ts                 # pino → Loki structured logging
│   ├── config-validation.ts      # Environment validation
│   ├── utils.ts                  # Shared utilities (cn for Tailwind)
│   └── data/
│       └── skills.ts             # Data access layer (optimized queries)
├── components/
│   ├── ui/                       # shadcn/ui components (9 base)
│   └── security/                 # Security scan visualization (5 files)
├── content/docs/                 # 13 MDX documentation pages (Fumadocs)
├── scripts/                      # Performance testing
│   ├── perf-seed.ts              # Seed test data
│   ├── perf-analyze-runs.ts      # Analyze results
│   └── perf-report.ts            # Generate reports
├── drizzle/                      # Migrations
└── public/                       # Static assets
```

## ALL API ENDPOINTS

### Public API (`/api/v1/`)

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/cli-auth/start` | POST | Begin OAuth flow, returns poll token |
| `/cli-auth/authorize` | GET | User grants access |
| `/cli-auth/exchange` | POST | Exchange poll token for API key |
| `/skills` | GET, POST | Search skills, publish new skill |
| `/skills/confirm` | POST | Finalize publish after upload |
| `/skills/[name]` | GET | Get skill metadata |
| `/skills/[name]/versions` | GET | List all versions |
| `/skills/[name]/star` | POST, DELETE | Star/unstar skill |
| `/skills/[name]/[version]` | GET | Get version metadata |
| `/skills/[name]/[version]/files/[...path]` | GET | Get file content |
| `/search` | GET | Full-text search with GIN index |
| `/badge/[...name]` | GET | SVG badge generation |
| `/scan` | POST | Security scan (upload tarball) |

### Admin API (`/api/admin/`)

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/packages` | GET | List all packages for moderation |
| `/packages/[...segments]` | GET, PUT, DELETE | Package CRUD |
| `/users` | GET | List all users |
| `/users/[userId]` | GET, PUT | User CRUD |
| `/users/[userId]/status` | PUT | Enable/disable/ban user |
| `/orgs` | GET | List organizations |
| `/orgs/[orgId]` | GET, PUT, DELETE | Organization CRUD |
| `/orgs/[orgId]/members/[memberId]` | PUT, DELETE | Member management |
| `/audit-logs` | GET | Query audit logs (action, actor, target, date range) |
| `/rescan-skills` | POST | Bulk security rescan |
| `/service-accounts` | GET, POST | Service account CRUD |
| `/service-accounts/[id]` | GET, PUT, DELETE | Service account management |
| `/service-accounts/[id]/keys` | GET, POST | API key management |
| `/service-accounts/[id]/keys/[keyId]` | DELETE | Revoke API key |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `app/api/v1/new/route.ts` or `api/admin/` | Export `GET`/`POST`/etc. |
| Add protected page | `app/(dashboard)/new/page.tsx` | Layout guard handles auth |
| Add admin page | `app/(admin)/admin/new/page.tsx` | Admin role guard in layout |
| Add public page | `app/(registry)/new/page.tsx` | No auth needed |
| Add server action | `app/(dashboard)/feature/actions.ts` | `'use server'` directive |
| Modify DB schema | `lib/db/schema.ts` | Run `drizzle-kit generate` after |
| Add UI component | `components/ui/` | `npx shadcn add <component>` |
| Auth configuration | `lib/auth.ts` | better-auth plugins |
| Modify security scanning | `api-python/analyze/` | Must sync with `python-api/` at root |
| Performance testing | `scripts/perf-*.ts` | Needs real Postgres + Supabase |
| Email service | `lib/email/service.ts` | Multi-provider (Resend, SMTP, console) |
| Storage backend | `lib/storage/provider.ts` | Supabase or S3 |
| OIDC SSO config | `lib/auth.ts` | `genericOAuth` plugin configuration |
| Admin RBAC | `lib/admin-middleware.ts` | `withAdminAuth()` HOF wrapper |
| Documentation | `content/docs/*.mdx` | 13 MDX pages (Fumadocs) |
| Data access layer | `lib/data/skills.ts` | Optimized combined queries |

## KEY PATTERNS

### Authentication
- **Two modes**: Web sessions (better-auth cookies) and CLI (Bearer `tank_*` API keys)
- **Web flow**: GitHub OAuth → session cookie → layout guard checks
- **CLI flow**: POST `/cli-auth/start` → browser OAuth → poll `/cli-auth/exchange`
- **OIDC SSO**: Enterprise single sign-on via OpenID Connect providers
- **Scope validation**: API keys carry scopes (`skills:read`, `skills:publish`, `skills:admin`)
- **User moderation**: `getUserModerationStatus()` — active/suspended/banned

### Database
- **DB singleton**: `globalThis.__db` in `lib/db.ts` — prevents hot-reload connection leaks
- **Dual schema**: `schema.ts` (domain) + `auth-schema.ts` (better-auth generated)
- **Migrations**: Drizzle Kit, stored in `drizzle/`
- **Performance**: Combined queries in `data/skills.ts` (was 8 queries → 1, 2s → 200ms)

### Audit Score (0-10)
Always 8 entries, max 10 points total:
1. SKILL.md present (1 pt)
2. Description present (1 pt)
3. Permissions declared (1 pt)
4. No security issues (2 pts)
5. Permission extraction match (2 pts)
6. File count reasonable (1 pt) — <100 files
7. README documentation (1 pt)
8. Package size reasonable (1 pt) — <5 MB

### Permission Escalation Detection
- `determineBump()` — detects major/minor/patch version bump
- PATCH bumps with ANY new permissions → rejected
- MINOR bumps with dangerous permissions (network, subprocess) → rejected

### Full-Text Search
- `searchVector` column on skills table
- GIN index for fast searching
- Trigram similarity for fuzzy matching

## CONVENTIONS

> Universal conventions (strict TS, ESM, Zod safeParse, no cross-app imports) in root AGENTS.md.

- **All data access** through `lib/data/skills.ts` or direct Drizzle queries
- **Server actions** in `actions.ts` files with `'use server'` directive
- **react-doctor** for React linting (60+ rules). Config in `react-doctor.config.json`

## ANTI-PATTERNS

> Universal anti-patterns (type suppression, cross-app imports, Supabase, auth-schema) in root AGENTS.md.

- **Never hardcode API responses** — use Zod `safeParse()` on all inputs

## TESTING

```bash
pnpm test --filter=web                    # All web tests
pnpm test --filter=web -- publish.test.ts # Specific test
pnpm test:perf                            # Performance tests (needs real DB)
```

- API tests in `__tests__/` subdirectories (colocated with route handlers)
- Mock Drizzle query builder, fetch, storage provider
- 22 test files covering routes, actions, lib modules
- Performance tests: seed → analyze → report

## ENVIRONMENT VARIABLES

Required in `.env.local`:
- `DATABASE_URL` — PostgreSQL connection string
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Public key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only key
- `BETTER_AUTH_SECRET` — Session encryption key
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — OAuth
- `RESEND_API_KEY` — Email service (optional)
- `OIDC_*` — Enterprise SSO (optional)
- `REDIS_URL` — Caching (optional)
- `STORAGE_BACKEND` — `supabase` (default) or `s3`
- `SESSION_STORE` — `memory` (default) or `redis`
