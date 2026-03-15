# Design: Restructure `lib/` and `server-fns/` for Clarity

**Date:** 2026-03-15
**Scope:** `apps/web-tanstack/src/lib/` + `src/server-fns/` + `src/query/`
**Type:** Pure file moves + import rewrites. Zero logic changes.

## Problem

`lib/` is a flat folder with 23 files. API-only infrastructure (logger, redis, email, storage) sits alongside TanStack-only UI helpers (format, utils, auth-client) and shared core (auth, db, env). A new developer can't tell what's what.

Auth naming is misleading: `lib/auth.ts` is the auth engine, `server-fns/auth.ts` sounds like auth core but is just a session bridge, `auth-helpers.ts` is really authorization policy.

## Architecture

Better Auth is the framework-neutral auth core (`lib/auth/core.ts`). Both TanStack and Hono use it directly. TanStack handles page guards and session loading via `server-fns/session.ts`. Hono handles API auth via `api/middleware/`. Authorization policy lives in `lib/auth/authz.ts`, shared by both layers.

## Final Structure

```
src/
├── lib/
│   ├── auth/
│   │   ├── core.ts              (Better Auth config)
│   │   ├── client.ts            (browser hooks: signIn, signOut, useSession)
│   │   ├── authz.ts             (policy: isAdmin, canReadSkill, verifyCliAuth)
│   │   └── cli-store.ts         (CLI OAuth session management)
│   ├── db/
│   │   ├── index.ts             (Drizzle ORM instance)
│   │   ├── schema.ts            (app tables)
│   │   ├── auth-schema.ts       (better-auth generated tables)
│   │   └── visibility.ts        (SQL visibility clause)
│   ├── services/
│   │   ├── email/
│   │   │   ├── service.ts
│   │   │   └── rate-limiter.ts
│   │   ├── storage/
│   │   │   └── provider.ts
│   │   ├── redis.ts
│   │   ├── supabase.ts
│   │   └── logger.ts
│   ├── skills/
│   │   ├── data.ts              (queries + types)
│   │   ├── audit-score.ts
│   │   └── permission-escalation.ts
│   ├── env.ts
│   ├── format.ts
│   ├── utils.ts
│   └── docs-meta.ts
├── query/                        (promoted from lib/query/)
│   ├── homepage-options.ts
│   └── skills-options.ts
├── server-fns/
│   ├── session.ts                (was auth.ts)
│   ├── skills.ts
│   ├── tokens.ts
│   ├── homepage.ts
│   ├── docs.ts
│   └── github.ts
└── api/                          (unchanged)
```

## File Moves

| From                           | To                                    | Rationale                                              |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `lib/auth.ts`                  | `lib/auth/core.ts`                    | Auth config is the core — other auth files orbit it    |
| `lib/auth-client.ts`           | `lib/auth/client.ts`                  | Groups browser auth with server auth                   |
| `lib/auth-helpers.ts`          | `lib/auth/authz.ts`                   | It's authorization policy, not "helpers"               |
| `lib/cli-auth-store.ts`        | `lib/auth/cli-store.ts`               | CLI OAuth belongs with auth                            |
| `lib/db.ts`                    | `lib/db/index.ts`                     | db/ already exists; Drizzle instance becomes its entry |
| `lib/data/skills.ts`           | `lib/skills/data.ts`                  | Skill queries move to skills domain                    |
| `lib/audit-score.ts`           | `lib/skills/audit-score.ts`           | Skill-specific scoring                                 |
| `lib/permission-escalation.ts` | `lib/skills/permission-escalation.ts` | Skill-specific security                                |
| `lib/email/service.ts`         | `lib/services/email/service.ts`       | Infrastructure service                                 |
| `lib/email/rate-limiter.ts`    | `lib/services/email/rate-limiter.ts`  | Infrastructure service                                 |
| `lib/storage/provider.ts`      | `lib/services/storage/provider.ts`    | Infrastructure service                                 |
| `lib/redis.ts`                 | `lib/services/redis.ts`               | Infrastructure service                                 |
| `lib/supabase.ts`              | `lib/services/supabase.ts`            | Infrastructure service                                 |
| `lib/logger.ts`                | `lib/services/logger.ts`              | Infrastructure service                                 |
| `lib/query/*`                  | `src/query/*`                         | TanStack glue, not a library                           |
| `server-fns/auth.ts`           | `server-fns/session.ts`               | It's a session bridge, not auth core                   |

## Import Rewrite Scope

~80 import path changes across ~45 files.

### Absolute import rewrites (external consumers)

- `~/lib/auth` → `~/lib/auth/core` (~5 consumers)
- `~/lib/auth-helpers` → `~/lib/auth/authz` (~8 consumers)
- `~/lib/auth-client` → `~/lib/auth/client` (~2 consumers)
- `~/lib/cli-auth-store` → `~/lib/auth/cli-store` (~1 consumer)
- `~/lib/db` → `~/lib/db` (no change — index.ts convention)
- `~/lib/data/skills` → `~/lib/skills/data` (~15 consumers)
- `~/lib/audit-score` → `~/lib/skills/audit-score` (~1 consumer)
- `~/lib/permission-escalation` → `~/lib/skills/permission-escalation` (~1 consumer)
- `~/lib/redis` → `~/lib/services/redis` (~1 consumer)
- `~/lib/supabase` → `~/lib/services/supabase` (~1 consumer)
- `~/lib/logger` → `~/lib/services/logger` (~2 consumers)
- `~/lib/email/*` → `~/lib/services/email/*` (~1 consumer: auth/core.ts)
- `~/lib/storage/provider` → `~/lib/services/storage/provider` (~3 consumers)
- `~/lib/query/*` → `~/query/*` (~3 consumers)
- `~/server-fns/auth` → `~/server-fns/session` (~5 consumers)

### Relative import rewrites (inside moved files — highest risk)

These break when a file's directory depth changes:

- **`auth/core.ts`** (was `lib/auth.ts`): `./db` → `../db`, `./email/*` → `../services/email/*`
- **`auth/authz.ts`** (was `lib/auth-helpers.ts`): `./auth` → `./core`, `./db` → `../db`, `./db/auth-schema` → `../db/auth-schema`, `./db/schema` → `../db/schema`
- **`auth/cli-store.ts`** (was `lib/cli-auth-store.ts`): `./env` → `../env`, `./redis` → `../services/redis`
- **`db/index.ts`** (was `lib/db.ts`): `./db/schema` → `./schema`, `./env` → `../env`
- **`services/email/rate-limiter.ts`** (was `lib/email/rate-limiter.ts`): `~/lib/redis` → `~/lib/services/redis`
- **`services/storage/provider.ts`** (was `lib/storage/provider.ts`): `~/lib/supabase` → `~/lib/services/supabase`

## Constraints

- Zero logic changes — pure structural refactor
- No new abstractions or barrel re-exports (except db/index.ts)
- No cross-package boundary violations
- Better Auth stays as shared core
- Hono API auth unchanged
- TanStack route guards unchanged

## Verification

1. `npx tsc --noEmit` — zero type errors
2. `npx biome check src/` — no new lint errors
3. `git diff --stat` confirms only file moves + import path changes
