# Resolution 004: Workspace dependency leaked to npm (GH-158)

**Finding:** `npm install -g @tankpkg/cli` fails with 404 for `@tank/shared@0.1.0`
**Issue:** [tankpkg/tank#158](https://github.com/tankpkg/tank/issues/158)
**Date:** 2026-03-11
**Files changed:**

- `packages/cli/tsdown.config.ts`
- `packages/cli/package.json`
- `packages/mcp-server/tsdown.config.ts`
- `packages/mcp-server/package.json`

## Root Cause

`@internal/shared` (workspace-only) was listed in `dependencies` and left as an external import by tsdown. During `npm publish`, the `workspace:*` protocol was mangled to `@tank/shared@0.1.0` — a package that doesn't exist on npm.

## Fix

1. Added `deps: { alwaysBundle: [/^@internal\//] }` to both `tsdown.config.ts` files — inlines shared code into dist.
2. Moved `@internal/shared` from `dependencies` to `devDependencies` in both packages.
3. Surfaced transitive deps (`semver`, `zod`) as direct `dependencies` in consuming packages.

## Verification

- CLI build-integrity tests: 3/3 pass (C1, C2, C3)
- MCP server build-integrity tests: 3/3 pass (C1, C2, C3)
- CLI full suite: 454/454 pass
- MCP server full suite: 39/39 pass
- BDD cicd-build-integrity: all scenarios GREEN
