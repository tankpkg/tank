# Shared Package Reference

Tank now uses two workspace-only internal packages for shared TypeScript code:

- `@internals/schemas` for schemas, types, and contract constants
- `@internals/helpers` for pure reusable helpers

## Public Surface

Everything public should come from:

- `packages/internals-schemas/src/index.ts`
- `packages/internals-helpers/src/index.ts`

### Schemas

- `skillsJsonSchema`
- `skillsLockSchema`
- `skillsLockV1Schema`
- `permissionsSchema`
- admin/user/skill status schemas

### Constants

- `REGISTRY_URL`
- `REGISTRY_API_VERSION`
- `LOCKFILE_VERSION`
- size/name/description limits
- default permission metadata

### Helpers

- `resolve()`
- `sortVersions()`
- `encodeSkillName()`

### Types

- `SkillsJson`
- `SkillsLock`
- `LockedSkill`
- `PublishStartRequest`
- `PublishStartResponse`
- `PublishConfirmRequest`
- `SearchResponse`
- `SkillInfoResponse`
- `Publisher`
- `Skill`
- `SkillVersion`

## Rules

- keep both packages pure: no network, fs, env, or side effects
- treat each package `src/index.ts` as the contract
- add schema logic to `@internals/schemas`
- add general reusable functions to `@internals/helpers`

## Lockfile Notes

Lockfile schema supports:

- v1 legacy reads
- v2 current shape with optional `dependencies` per locked skill

Writers use `LOCKFILE_VERSION`; readers accept both versions.
