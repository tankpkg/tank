# Tank — Codebase Prime Context

**Generated:** 2026-02-14
**Branch:** main
**Commit:** 1532b68

---

## 1. Project Overview

**Tank** is a security-first package manager for Claude Code AI agent skills/plugins. Users publish, discover, and install skills via a CLI, with a web registry (tankpkg.dev) managing packages and audit scores.

## 2. Monorepo Structure

```
tank/
├── apps/
│   ├── cli/                    # Tank CLI — TypeScript/Node.js (Commander.js)
│   │   ├── src/commands/       # 13 commands: login, publish, install, audit, etc.
│   │   ├── src/lib/            # config, lockfile, logging utilities
│   │   └── package.json        # name: "tank"
│   └── web/                    # Next.js 15 web app + REST API
│       ├── app/                # Next.js App Router
│       │   ├── (auth)/         # Auth pages
│       │   ├── (dashboard)/    # Dashboard pages
│       │   ├── (registry)/     # Registry UI
│       │   ├── api/v1/         # REST API routes (TypeScript)
│       │   └── cli-login/      # CLI OAuth callback page
│       ├── api-python/         # Vercel Python Functions (FastAPI)
│       │   └── analyze/        # Security analysis endpoints
│       ├── lib/                # Server-side utilities
│       │   ├── db/             # Drizzle ORM schema + connection
│       │   ├── auth.ts         # better-auth config
│       │   ├── auth-helpers.ts # CLI API key verification
│       │   ├── audit-score.ts  # Audit score computation (pure function)
│       │   ├── supabase.ts     # Supabase Storage admin client
│       │   └── logger.ts       # Pino → Loki structured logging
│       ├── components/ui/      # shadcn/ui primitives
│       ├── requirements.txt    # Python deps: fastapi, httpx, pydantic
│       └── package.json        # name: "@tank/web"
├── packages/
│   └── shared/                 # @tank/shared — schemas, types, constants
│       └── src/
│           ├── schemas/        # Zod: skills-json, permissions, skills-lock
│           ├── types/          # TS interfaces: api.ts, skill.ts
│           ├── constants/      # registry URL, limits
│           └── lib/            # semver resolver
├── e2e/                        # End-to-end tests
├── supabase/                   # Supabase config (config.toml)
├── infra/                      # Docker/Loki/Grafana config
├── turbo.json                  # Turborepo config
├── pnpm-workspace.yaml         # apps/* + packages/*
└── package.json                # Root: turbo, vitest, pnpm 10.29.3
```

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 15.x |
| React | React | 19.x |
| Styling | TailwindCSS + shadcn/ui | 4.x |
| ORM | Drizzle ORM + drizzle-kit | 0.45.x |
| Database | PostgreSQL (via Supabase pooler) | — |
| DB Driver | postgres.js | 3.4.x |
| Auth | better-auth (GitHub OAuth + API keys + orgs) | 1.4.x |
| Storage | Supabase Storage (S3-compatible) | — |
| CLI Framework | Commander.js | 14.x |
| Validation | Zod | 4.3.x |
| Logging | Pino → Loki + Grafana | 10.x |
| Python API | FastAPI + httpx + Pydantic | 0.115+ |
| Build | Turborepo + pnpm | — |
| Testing | Vitest + pytest | 3.x |
| Package Manager | pnpm | 10.29.3 |

## 4. Database Schema

### Core Tables (`lib/db/schema.ts`)

**publishers** — Users who publish skills
- `id` (uuid PK), `userId` (text), `displayName`, `githubUsername` (unique), `avatarUrl`, timestamps

**skills** — Skill package metadata
- `id` (uuid PK), `name` (text, unique), `description`, `publisherId` → publishers, `orgId`, timestamps
- Constraints: name regex `^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$`, max 214 chars
- Indexes: GIN full-text search on name+description, org_id

**skill_versions** — Published versions
- `id` (uuid PK), `skillId` → skills, `version`, `integrity` (SHA hash), `tarballPath`, `tarballSize`, `fileCount`, `manifest` (JSONB), `permissions` (JSONB), `auditScore` (real), `auditStatus` (text, default 'pending'), `readme`, `publishedBy` → publishers, `createdAt`
- Unique: (skillId, version)
- Status progression: `pending-upload` → `completed` → `published`

**skill_downloads** — Download tracking
- `id`, `skillId`, `versionId`, `ipHash`, `userAgent`, `createdAt`

**audit_events** — Audit log
- `id`, `action`, `actorId`, `targetType`, `targetId`, `metadata` (JSONB), `createdAt`

### Auth Tables (`lib/db/auth-schema.ts` — better-auth generated)
- `user`, `session`, `account`, `verification`, `apikey`, `organization`, `member`, `invitation`

## 5. API Routes

### TypeScript Routes (`app/api/v1/`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/skills` | Initiate publish (validate manifest, create version, return upload URL) |
| POST | `/api/v1/skills/confirm` | Confirm upload (compute audit score, finalize version) |
| GET | `/api/v1/skills/[name]` | Skill metadata |
| GET | `/api/v1/skills/[name]/[version]` | Version details + signed download URL |
| GET | `/api/v1/skills/[name]/versions` | List versions |
| GET | `/api/v1/search?q=...` | Full-text search |
| POST | `/api/v1/cli-auth/start` | CLI login flow start |
| POST | `/api/v1/cli-auth/authorize` | Web authorizes CLI session |
| POST | `/api/v1/cli-auth/exchange` | CLI exchanges code for API key |
| ALL | `/api/auth/[...all]` | better-auth handler |

### Python Routes (`api-python/analyze/`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/analyze` | Health check / echo |
| POST | `/api/analyze/security` | LLM-based security scan (OpenRouter + DeepSeek) |
| POST | `/api/analyze/permissions` | LLM-based permission extraction (OpenRouter + Qwen) |

### Python Shared (`api-python/analyze/_lib.py`)
- `call_llm(model, system_prompt, user_content)` — OpenRouter API wrapper via httpx
- `parse_llm_json(raw)` — Strips markdown fences, parses JSON

## 6. Publish Flow (Current)

```
1. CLI: POST /api/v1/skills        → validate manifest, create skill + version record (status: pending-upload)
                                    → return signed Supabase upload URL
2. CLI: uploads .tgz to Supabase Storage
3. CLI: POST /api/v1/skills/confirm → set integrity hash, compute audit score, set status: completed
                                    → analysisResults: null (no Python analysis integrated yet)
```

## 7. Audit Score System (`lib/audit-score.ts`)

Pure function: `computeAuditScore(input) → { score: 0-10, details: ScoreDetail[] }`

8 checks, max 10 points:
1. SKILL.md present (+1)
2. Description present (+1)
3. Permissions declared (+1)
4. No security issues (+2) — **defaults to pass when no analysis**
5. Permission extraction match (+2) — **defaults to pass when no analysis**
6. File count reasonable <100 (+1)
7. README documentation (+1)
8. Package size <5MB (+1)

Input accepts optional `analysisResults: { securityIssues, extractedPermissions }` but currently always receives `null`.

## 8. Authentication

- **Web**: GitHub OAuth via better-auth → session cookies
- **CLI**: API keys with prefix `tank_` via better-auth apiKey plugin
- **Verification**: `verifyCliAuth(request)` extracts `Authorization: Bearer tank_...`, calls `auth.api.verifyApiKey()`
- **Org scoping**: `@org/skill` names checked against `member` table membership

## 9. Shared Package (`@tank/shared`)

### Schemas (Zod)
- `skillsJsonSchema` — manifest: name (scoped), version (semver), description, permissions, skills, audit
- `permissionsSchema` — network (outbound domains), filesystem (read/write paths), subprocess (bool)
- `skillsLockSchema` — lockfile format

### Types
- `PublishStartRequest/Response`, `PublishConfirmRequest`
- `SkillInfoResponse`, `SearchResult`, `SearchResponse`
- `Publisher`, `Skill`, `SkillVersion`

### Constants
- `REGISTRY_URL`: `https://tankpkg.dev`
- `MAX_PACKAGE_SIZE`: 50MB, `MAX_FILE_COUNT`: 1000, `MAX_NAME_LENGTH`: 214

## 10. CLI Commands (`apps/cli/src/commands/`)

| Command | File | Description |
|---------|------|-------------|
| `tank login` | login.ts | OAuth browser flow |
| `tank logout` | logout.ts | Remove API key |
| `tank whoami` | whoami.ts | Show current user |
| `tank init` | init.ts | Create skills.json |
| `tank publish` | publish.ts | Pack + publish to registry |
| `tank install` | install.ts | Install from registry/lockfile |
| `tank update` | update.ts | Update within semver range |
| `tank remove` | remove.ts | Remove installed skill |
| `tank verify` | verify.ts | Verify lockfile integrity |
| `tank permissions` | permissions.ts | Display permission summary |
| `tank search` | search.ts | Full-text search |
| `tank info` | info.ts | Show skill metadata |
| `tank audit` | audit.ts | Display audit scores |

## 11. Existing Python Setup

- **Location**: `apps/web/api-python/analyze/`
- **Framework**: FastAPI on Vercel Python runtime
- **Dependencies** (`requirements.txt`): fastapi, httpx, pydantic
- **Tests**: `tests/test_analyze.py` — 16 tests with mocked OpenRouter calls
- **External service**: OpenRouter API (env: `OPENROUTER_API_KEY`)
- **Current state**: LLM-based analysis (not deterministic, susceptible to prompt injection)

## 12. Infrastructure

- **Hosting**: Vercel (Next.js + Python Functions)
- **Database**: PostgreSQL via Supabase (connection pooler)
- **Storage**: Supabase Storage (`packages` bucket for .tgz files)
- **Logging**: Pino → Loki (Docker) + Grafana
- **Env vars**: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_CLIENT_ID/SECRET`, `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_APP_URL`

## 13. Key Patterns

- **Drizzle queries**: `db.select().from(table).where(eq(...)).limit(1)` pattern
- **Auth guards**: `verifyCliAuth(request)` at top of every CLI-facing API
- **Error responses**: `NextResponse.json({ error: '...' }, { status: N })`
- **Python endpoints**: Each file creates its own `FastAPI()` app (Vercel convention)
- **Storage paths**: `skills/{skillId}/{version}.tgz`
- **Hot reload safety**: `globalThis._var` pattern for dev mode singletons
- **Proxy pattern**: Lazy initialization for env-dependent clients (Supabase, DB)

## 14. Vercel Python Function Constraints

| Constraint | Value |
|------------|-------|
| Max bundle size (uncompressed) | 250MB |
| Max duration (Pro) | 60s |
| Max duration (Hobby) | 10s |
| Runtime | Python 3.12 |
| Dependencies | requirements.txt at project root or app root |
| File system | `/tmp` only, ephemeral per invocation |
| No system binaries | Can't install Go/Rust CLIs (OSV-Scanner, Semgrep native) |
| No tree-shaking | All reachable files bundled |
| Stateless | No persistent processes, no background jobs |

## 15. Test Infrastructure

- **Framework**: Vitest (TS), pytest (Python)
- **Test count**: ~461 (445 TS + 16 Python)
- **Pattern**: Tests in `__tests__/` directories or `.test.ts` files
- **Python mocking**: `unittest.mock.AsyncMock` + `patch` for httpx calls
- **TS mocking**: Direct function mocking via vitest
