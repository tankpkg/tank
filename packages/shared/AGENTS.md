# packages/shared — @tank/shared

## OVERVIEW

Shared library: Zod schemas for runtime validation, TypeScript types for API contracts, constants for registry limits, and semver resolution utilities. Consumed by CLI (heavily) and Web (minimally). Pure — no side effects, no I/O.

## API SURFACE

**Schemas** (Zod v4 — use `safeParse()` for validation):
- `skillsJsonSchema` / `SkillsJson` — skills.json manifest (name, version, description, skills map, permissions)
- `skillsLockSchema` / `SkillsLock` / `LockedSkill` — skills.lock lockfile (lockfileVersion, resolved URLs, SHA512 integrity, permissions)
- `permissionsSchema` / `Permissions` — permission declarations (network outbound domains, filesystem read/write globs, subprocess boolean)
- `networkPermissionsSchema` / `NetworkPermissions`, `filesystemPermissionsSchema` / `FilesystemPermissions`

**Types** (TypeScript interfaces):
- `Publisher`, `Skill`, `SkillVersion` — domain entities
- `PublishStartRequest`, `PublishStartResponse`, `PublishConfirmRequest` — publish flow contracts
- `SkillInfoResponse`, `SearchResult`, `SearchResponse` — read endpoint contracts

**Constants**:
- `REGISTRY_URL` = `https://tankpkg.dev`, `REGISTRY_API_VERSION` = `v1`
- `MAX_PACKAGE_SIZE` = 50MB, `MAX_FILE_COUNT` = 1000, `MAX_NAME_LENGTH` = 214, `MAX_DESCRIPTION_LENGTH` = 500
- `LOCKFILE_VERSION` = 1
- `PERMISSION_CATEGORIES` = `['network', 'filesystem', 'subprocess']`, `DEFAULT_PERMISSIONS`

**Utilities**:
- `resolve(range, versions)` → highest matching version or null. Excludes pre-releases unless range specifies them.
- `sortVersions(versions)` → descending order, filters out invalid semver strings.

## STRUCTURE

```
src/
├── index.ts           # Barrel export — ALL public API here
├── schemas/
│   ├── skills-json.ts # skillsJsonSchema
│   ├── skills-lock.ts # skillsLockSchema, lockedSkillSchema
│   └── permissions.ts # permissionsSchema + sub-schemas
├── types/
│   ├── skill.ts       # Publisher, Skill, SkillVersion
│   └── api.ts         # Request/Response interfaces
├── constants/
│   ├── registry.ts    # URLs, limits, versions
│   └── permissions.ts # Categories, defaults
├── lib/
│   └── resolver.ts    # Semver resolution
└── __tests__/         # Unit tests
```

## CONVENTIONS

- **Export everything through `src/index.ts`** — consumers import `from '@tank/shared'`, never deep paths
- **Zod v4** — use `safeParse()` for validation, `z.infer<typeof schema>` for type extraction
- **No side effects** — pure functions and type definitions only
- **Dependencies**: only `zod` and `semver` — keep minimal
- **ESM** with TypeScript declarations (`dist/index.js` + `dist/index.d.ts`)

## ANTI-PATTERNS

- **Never add runtime dependencies with side effects** — this package must remain pure
- **Never import from `apps/`** — shared is a leaf dependency
- **Never expose deep import paths** — always re-export from `index.ts`
- **Never mutate constants** — treat as frozen
