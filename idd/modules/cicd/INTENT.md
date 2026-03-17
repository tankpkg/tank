# CI/CD Module

## Anchor

**Why this module exists:** Tank ships multiple npm packages (`@tankpkg/cli`, `@tankpkg/mcp-server`) from a Bun monorepo with internal workspace dependencies. The build and release pipeline must produce artifacts that install cleanly from the public npm registry — workspace-only packages must be bundled, not leaked as external dependencies.

**Consumers:** GitHub Actions release workflow (`.github/workflows/release.yml`), developers running `bun run build`.

**Single source of truth:** `packages/cli/tsdown.config.ts`, `packages/mcp-server/tsdown.config.ts`, `.github/workflows/release.yml`.

---

## Layer 1: Structure

```
packages/cli/tsdown.config.ts                # CLI build config (tsdown/rolldown)
packages/mcp-server/tsdown.config.ts         # MCP server build config
packages/internals-schemas/                  # @internals/schemas — workspace-only, never published
packages/internals-helpers/                  # @internals/helpers — workspace-only, never published
.github/workflows/release.yml               # Binary builds + npm publish
.github/workflows/publish.yml               # Docker + Helm publish
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                                                                        | Rationale                                                                                  | Verified by |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| C1  | Built dist must NOT contain external imports to workspace-only packages (`@internal/*`). Workspace deps must be bundled into output.                        | npm install fails when workspace packages don't exist on public registry (GH-158)          | Build test  |
| C2  | Published `dependencies` must NOT include workspace protocol (`workspace:*`) entries or `@internal/*` packages. Workspace deps belong in `devDependencies`. | npm cannot resolve workspace protocol references at install time                           | Build test  |
| C3  | Transitive dependencies of bundled workspace packages must be listed in the consuming package's `dependencies`.                                             | Bundling inlines code but not node_modules — transitive deps must still resolve at runtime | Code review |

---

## Layer 3: Examples

| #   | Input                                                    | Expected Output                                          |
| --- | -------------------------------------------------------- | -------------------------------------------------------- |
| E1  | `bun run build` in CLI package, inspect dist/bin/tank.js | No `from "@internal/` imports in any .js file            |
| E2  | Read CLI package.json `dependencies` field               | No key matching `@internal/*` or containing `workspace:` |
| E3  | `bun run build` in mcp-server, inspect dist/index.js     | No `from "@internal/` imports in any .js file            |
| E4  | Read mcp-server package.json `dependencies` field        | No key matching `@internal/*` or containing `workspace:` |
| E5  | `npm install -g @tankpkg/cli` on a fresh machine         | Installs without 404 errors                              |
