# SHARED — @tank/shared

## OVERVIEW

Pure library package — Zod schemas, TypeScript types, constants, and a semver resolver. Zero side effects, consumed by both CLI and Web.

## STRUCTURE

```
shared/src/
├── index.ts                      # Barrel export (ONLY public API)
├── schemas/
│   ├── skills-json.ts            # skillsJsonSchema — validates skills.json manifests
│   ├── skills-lock.ts            # skillsLockSchema — validates tank-lock.json
│   └── permissions.ts            # permissionsSchema — capability declarations
├── types/
│   ├── api.ts                    # Publish*, SkillInfo*, Search* request/response contracts
│   └── skill.ts                  # Publisher, Skill, SkillVersion domain types
├── constants/
│   ├── registry.ts               # REGISTRY_URL, MAX_PACKAGE_SIZE(50MB), MAX_FILE_COUNT(1000)
│   └── permissions.ts            # Permission categories and descriptions
├── lib/
│   └── resolver.ts               # resolve(range, versions), sortVersions()
└── __tests__/                    # Unit tests per module
```

## CONVENTIONS

- **Barrel export only** — all public API via `index.ts`, no deep imports
- **Zod v4** — `safeParse()` for validation, never `parse()` (throws)
- **Pure library** — no side effects, no I/O, no runtime dependencies beyond `zod` + `semver`
- **ESM + declarations** — compiled with `tsc`, emits `.js` + `.d.ts`
- **LOCKFILE_VERSION = 1** — bump only on breaking lockfile format changes

## ANTI-PATTERNS

- **Never add side-effect dependencies** — this package must stay pure
- **Never import from `apps/cli` or `apps/web`** — dependency flows one way
- **Never use deep import paths** — always import from `@tank/shared`
- **Never mutate exported constants** — treat as frozen
