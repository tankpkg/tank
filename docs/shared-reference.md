# Shared Package Reference

`@internal/shared` is a pure library package providing Zod schemas, TypeScript types, constants, and a semver resolver. Zero side effects. This is the only shared dependency between the CLI, MCP server, and web app.

## All Exports

Everything is exported through the barrel file `src/index.ts`. Deep imports are not allowed -- always import from `@internal/shared`.

### Schemas

| Export              | Source           | Purpose                           |
| ------------------- | ---------------- | --------------------------------- |
| `skillsJsonSchema`  | `skills-json.ts` | Validates `skills.json` manifest  |
| `skillsLockSchema`  | `skills-lock.ts` | Validates `skills.lock` file      |
| `permissionsSchema` | `permissions.ts` | Validates permission declarations |

### Types

| Export            | Source     | Purpose                      |
| ----------------- | ---------- | ---------------------------- |
| `PublishRequest`  | `api.ts`   | POST /v1/skills request body |
| `PublishResponse` | `api.ts`   | POST /v1/skills response     |
| `SkillInfo`       | `api.ts`   | Skill metadata response      |
| `SearchResult`    | `api.ts`   | Search API response          |
| `Publisher`       | `skill.ts` | Publisher entity             |
| `Skill`           | `skill.ts` | Skill entity                 |
| `SkillVersion`    | `skill.ts` | Version entity               |

### Constants

| Export                  | Source           | Value                               |
| ----------------------- | ---------------- | ----------------------------------- |
| `REGISTRY_URL`          | `registry.ts`    | `https://tankpkg.dev` (or override) |
| `MAX_PACKAGE_SIZE`      | `registry.ts`    | `50 * 1024 * 1024` (50 MB)          |
| `MAX_FILE_COUNT`        | `registry.ts`    | `1000`                              |
| `LOCKFILE_VERSION`      | `registry.ts`    | `1`                                 |
| `PERMISSION_CATEGORIES` | `permissions.ts` | Map of permission to description    |

### Functions

| Export         | Source        | Signature                                               |
| -------------- | ------------- | ------------------------------------------------------- |
| `resolve`      | `resolver.ts` | `(range: string, versions: string[]) => string \| null` |
| `sortVersions` | `resolver.ts` | `(versions: string[]) => string[]`                      |

## Consumer Dependency Diagram

```
@internal/shared
     ^                    ^                    ^
     |                    |                    |
  apps/cli          packages/mcp-server     apps/web
 (9 imports)        (schemas, types)     (1 import, hoisted)
```

- **CLI**: lockfile, packer, and validator use schemas + resolver + constants
- **MCP server**: packer and tools use schemas + types + constants
- **Web**: skill route uses `skillsJsonSchema.safeParse()` -- imported undeclared via Bun workspace hoisting

## Pure Library Contract

This package enforces a strict purity contract:

- **No side effects** -- no I/O, no network calls, no file system access
- **No runtime dependencies** beyond `zod` and `semver`
- **Barrel export only** -- all public API via `src/index.ts`, no deep imports
- **Immutable exports** -- all constants treated as frozen, all types use `readonly` where possible
- **LOCKFILE_VERSION = 1** -- only bumped on breaking lockfile format changes
- **Never add side-effect dependencies** -- keep the package pure

## Directory Layout

```
shared/src/
├── index.ts              # Barrel export (ONLY public API)
├── schemas/
│   ├── skills-json.ts    # skillsJsonSchema
│   ├── skills-lock.ts    # skillsLockSchema
│   └── permissions.ts    # permissionsSchema
├── types/
│   ├── api.ts            # PublishRequest, PublishResponse, SkillInfo, SearchResult
│   └── skill.ts          # Publisher, Skill, SkillVersion
├── constants/
│   ├── registry.ts       # REGISTRY_URL, MAX_PACKAGE_SIZE, MAX_FILE_COUNT, LOCKFILE_VERSION
│   └── permissions.ts    # PERMISSION_CATEGORIES
└── lib/
    └── resolver.ts       # resolve(), sortVersions()
```
