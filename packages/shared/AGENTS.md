# SHARED — @tank/shared

## OVERVIEW

Pure library package — Zod schemas, TypeScript types, constants, and a semver resolver. Zero side effects, consumed by both CLI and Web. This is the ONLY shared dependency between apps.

## STRUCTURE

```
shared/src/
├── index.ts                      # Barrel export (ONLY public API)
├── schemas/                      # Zod v4 validation schemas
│   ├── skills-json.ts            # skillsJsonSchema — validates skills.json manifests
│   ├── skills-lock.ts            # skillsLockSchema — validates skills.lock files
│   └── permissions.ts            # permissionsSchema — capability declarations
├── types/                        # TypeScript interfaces
│   ├── api.ts                    # Publish*, SkillInfo*, Search* request/response contracts
│   └── skill.ts                  # Publisher, Skill, SkillVersion domain types
├── constants/                    # Runtime constants
│   ├── registry.ts               # REGISTRY_URL, MAX_PACKAGE_SIZE(50MB), MAX_FILE_COUNT(1000)
│   └── permissions.ts            # Permission categories and descriptions
├── lib/                          # Pure functions
│   └── resolver.ts               # resolve(range, versions), sortVersions()
└── __tests__/                    # Unit tests (4 files)
    ├── skills-json.test.ts       # Manifest validation tests
    ├── skills-lock.test.ts       # Lockfile validation tests
    ├── permissions.test.ts       # Permission schema tests
    └── resolver.test.ts          # Semver resolution tests
```

## ALL EXPORTS

### Schemas (from `schemas/`)

| Export | Source | Purpose |
|--------|--------|---------|
| `skillsJsonSchema` | `skills-json.ts` | Validates `skills.json` manifest |
| `skillsLockSchema` | `skills-lock.ts` | Validates `skills.lock` file |
| `permissionsSchema` | `permissions.ts` | Validates permission declarations |

### Types (from `types/`)

| Export | Source | Purpose |
|--------|--------|---------|
| `PublishRequest` | `api.ts` | POST /v1/skills request body |
| `PublishResponse` | `api.ts` | POST /v1/skills response |
| `SkillInfo` | `api.ts` | Skill metadata response |
| `SearchResult` | `api.ts` | Search API response |
| `Publisher` | `skill.ts` | Publisher entity |
| `Skill` | `skill.ts` | Skill entity |
| `SkillVersion` | `skill.ts` | Version entity |

### Constants (from `constants/`)

| Export | Source | Value |
|--------|--------|-------|
| `REGISTRY_URL` | `registry.ts` | `https://tankpkg.dev` (or override) |
| `MAX_PACKAGE_SIZE` | `registry.ts` | `50 * 1024 * 1024` (50MB) |
| `MAX_FILE_COUNT` | `registry.ts` | `1000` |
| `LOCKFILE_VERSION` | `registry.ts` | `1` |
| `PERMISSION_CATEGORIES` | `permissions.ts` | Map of permission → description |

### Functions (from `lib/`)

| Export | Source | Signature |
|--------|--------|-----------|
| `resolve` | `resolver.ts` | `(range: string, versions: string[]) => string \| null` |
| `sortVersions` | `resolver.ts` | `(versions: string[]) => string[]` |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new schema | `schemas/*.ts` | Export from `index.ts` |
| Add new type | `types/*.ts` | Export from `index.ts` |
| Add constant | `constants/*.ts` | Export from `index.ts` |
| Add helper function | `lib/*.ts` | Must be pure, no side effects |
| Add test | `__tests__/*.test.ts` | Colocated with source |

## PERMISSION SCHEMA

```typescript
permissionsSchema = z.object({
  network: z.object({
    outbound: z.array(z.string()).optional(),  // Domains allowed
    inbound: z.boolean().optional(),
  }).optional(),
  filesystem: z.object({
    read: z.array(z.string()).optional(),   // Glob patterns
    write: z.array(z.string()).optional(),
  }).optional(),
  subprocess: z.boolean().optional(),
  environment: z.array(z.string()).optional(),  // Env var names
  secrets: z.array(z.string()).optional(),      // Secret names
})
```

## LOCKFILE SCHEMA

```typescript
skillsLockSchema = z.object({
  version: z.literal(1),  // LOCKFILE_VERSION
  skills: z.record(z.string(), z.object({
    version: z.string(),
    resolved: z.string(),    // tarball URL
    integrity: z.string(),   // SHA-512 hash
    permissions: permissionsSchema.optional(),
  })),
})
```

## SKILLS.JSON SCHEMA

```typescript
skillsJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  permissions: permissionsSchema.optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  author: z.object({
    name: z.string(),
    email: z.string().optional(),
  }).optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})
```

## CONVENTIONS

- **Barrel export only** — all public API via `index.ts`, no deep imports
- **Zod v4** — `safeParse()` for validation, never `parse()` (throws)
- **Pure library** — no side effects, no I/O, no runtime dependencies beyond `zod` + `semver`
- **ESM + declarations** — compiled with `tsc`, emits `.js` + `.d.ts`
- **LOCKFILE_VERSION = 1** — bump only on breaking lockfile format changes
- **All types immutable** — use `readonly` where possible

## ANTI-PATTERNS

- **Never add side-effect dependencies** — this package must stay pure
- **Never import from `apps/cli` or `apps/web`** — dependency flows one way
- **Never use deep import paths** — always import from `@tank/shared`
- **Never mutate exported constants** — treat as frozen
- **Never use `parse()` from Zod** — always `safeParse()` to avoid throwing
- **Never add runtime dependencies** — only `zod` and `semver` allowed

## TESTING

```bash
# Run shared package tests
pnpm test --filter=shared

# Run specific test
pnpm test --filter=shared -- resolver.test.ts
```

## BUILD OUTPUT

```bash
pnpm build --filter=shared
```

Produces:
- `dist/index.js` — ESM entry point
- `dist/index.d.ts` — TypeScript declarations
- `dist/**/*.js` — Compiled modules
- `dist/**/*.d.ts` — Declaration files
