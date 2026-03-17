# Resolution 005: `tank upgrade` corrupts npm installations (GH-181)

**Finding:** `tank upgrade` overwrites the JS entry point with a native binary, bricking the CLI
**Issue:** [tankpkg/tank#181](https://github.com/tankpkg/tank/issues/181)
**Date:** 2026-03-14
**Files changed:**

- `packages/cli/src/commands/upgrade.ts`
- `packages/cli/src/__tests__/upgrade.test.ts`
- `.idd/modules/upgrade/INTENT.md`
- `.bdd/features/upgrade/upgrade.feature`
- `.bdd/steps/upgrade.steps.ts`

## Root Cause

`tank upgrade` downloads a platform-native binary from GitHub Releases and writes it to `process.argv[1]` via `fs.copyFileSync`. When Tank is installed via npm, `process.argv[1]` resolves to `dist/bin/tank.js` — a JavaScript file. Overwriting it with a Windows PE executable (starting with `MZ` header) makes Node.js throw `SyntaxError: Invalid or unexpected token` on every subsequent invocation.

The Homebrew guard (C7) already existed but no equivalent guard existed for npm/npx installations.

## Fix

Added install-method detection before the binary download (constraint C9):

- Path contains `node_modules` → npm install
- Path ends with `.js` or `.mjs` → JS entry point (npm/npx)

Both cases redirect the user to `npm update -g @tankpkg/cli` and return early.

## Verification

- CLI unit tests: 11/11 pass (2 new npm detection tests)
- BDD upgrade scenarios: 8/8 GREEN (2 new C9 scenarios)
- CLI full suite: 470/472 pass (2 pre-existing build-artifact failures)
