# SHARED — @tank/shared

## OVERVIEW

Pure library package — Zod schemas, TypeScript types, constants, and a semver resolver. Zero side effects, consumed by CLI, MCP server, and Web. This is the ONLY shared dependency between apps.

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

## CONSUMERS

```
@tank/shared
     ↑                    ↑                    ↑
     │                    │                    │
  apps/cli         packages/mcp-server     apps/web
 (9 imports)        (schemas, types)     (1 import, hoisted)
```

- **CLI**: lockfile, packer, validator use schemas + resolver + constants
- **MCP server**: packer, tools use schemas + types + constants
- **Web**: skill route uses `skillsJsonSchema.safeParse()` — imported undeclared via pnpm hoisting

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new schema | `schemas/*.ts` | Export from `index.ts` |
| Add new type | `types/*.ts` | Export from `index.ts` |
| Add constant | `constants/*.ts` | Export from `index.ts` |
| Add helper function | `lib/*.ts` | Must be pure, no side effects |
| Add test | `__tests__/*.test.ts` | Colocated with source |

## CONVENTIONS

> Universal conventions (strict TS, ESM, Zod safeParse, no cross-app imports) in root AGENTS.md.

- **Barrel export only** — all public API via `index.ts`, no deep imports
- **Pure library** — no side effects, no I/O, no runtime dependencies beyond `zod` + `semver`
- **LOCKFILE_VERSION = 1** — bump only on breaking lockfile format changes
- **All types immutable** — use `readonly` where possible

## ANTI-PATTERNS

> Universal anti-patterns (type suppression, cross-app imports, frozen constants) in root AGENTS.md.

- **Never use deep import paths** — always import from `@tank/shared`
- **Never add runtime dependencies** — only `zod` and `semver` allowed

## TESTING

```bash
pnpm test --filter=shared
pnpm test --filter=shared -- resolver.test.ts
```
