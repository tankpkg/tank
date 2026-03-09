# Inspiration

Projects we studied and what we took away.

## opencode (https://github.com/anomalyco/opencode)

| Pattern | Decision | Rationale |
|---------|----------|-----------|
| `@tsconfig/bun` | Adopted | Eliminates 90% of tsconfig boilerplate |
| `packages/` folder layout | Adopted | npm ecosystem convention, consistent with Turborepo |
| Co-versioning all packages | Rejected | Published packages (CLI, MCP) need independent versions from internal ones |
| Single-word variable names | Rejected | Security-critical code needs descriptive names for auditability |
| No justfile | Rejected | `just --list` is more discoverable than hunting through package.json scripts |
| No else statements, early returns | Adopted | Already our style -- enforced via Biome `noUselessElse` |
| Avoid mocks in tests | Partially adopted | Unit tests mock external APIs, E2E tests use real infra with zero mocks |

## zod

| Pattern | Decision | Rationale |
|---------|----------|-----------|
| Pure schema library, zero deps | Model for `@internal/shared` | Shared package must stay side-effect-free |
| Barrel exports with explicit re-exports | Adopted | Already our pattern in `shared/src/index.ts` |

## Conventions and rationale

**Why `packages/` not `apps/`** -- aligns with the npm ecosystem, consistent with opencode and Turborepo's guidance. `apps/` implies deployable applications; `packages/` is the generic term for workspace members. We use both: `apps/` for deployables (web, cli), `packages/` for libraries (shared, mcp-server).

**Why no `-pkg` suffix** -- redundant when CLAUDE.md documents which packages are published. The npm scope (`@tankpkg/cli`) already communicates publishability.

**Why justfile** -- `just --list` shows all available commands grouped by category. Compare: `cat package.json | jq '.scripts'` or hunting through nested workspace scripts. One entry point for every common operation.

**Why Biome over ESLint** -- single binary, fast, opinionated defaults. No plugin ecosystem to manage. Replaces both ESLint and Prettier in one tool.

**Why tsdown over tsc for library builds** -- handles ESM output, declaration files, and bundling in one tool. No need for separate `tsc` and `rollup` steps.

**Why Bun over pnpm** -- faster installs, native TypeScript execution, built-in test runner (though we use Vitest for compatibility). Bun's lockfile is binary and faster to parse than pnpm's YAML-based one.

**Why conventional commits** -- enables automated changelogs and semantic versioning. `feat:` triggers minor bumps, `fix:` triggers patches, `BREAKING CHANGE` triggers majors. Machine-readable commit history.
