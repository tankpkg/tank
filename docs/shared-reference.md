# Internals Package Reference

`@internals/schemas` and `@internals/helpers` are the pure TypeScript contracts shared by CLI, MCP server, and registry apps.

## Public Surface

Everything public should come from `packages/internals-schemas/src/index.ts` (schemas, types, constants) or `packages/internals-helpers/src/index.ts` (utilities).

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

- keep it pure: no network, fs, env, or side effects
- treat `src/index.ts` as the contract
- prefer adding shared schema logic here over duplicating validation across packages

## Lockfile Notes

Lockfile schema supports:

- v1 legacy reads
- v2 current shape with optional `dependencies` per locked skill

Writers use `LOCKFILE_VERSION`; readers accept both versions.
