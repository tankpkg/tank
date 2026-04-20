# Resolution: Phase 6 MCP Proxy — Install Path Bypass Bugs (Bulletproof E2E)

**Issue:** tankpkg/tank#397 (mcp-proxy) Phase 6 — adapter rewriting + install integration
**Date:** 2026-04-20
**Branch:** feat/mcp-proxy-phase-1 (PR #399)
**Files changed:**

- `packages/proxy/package.json`
- `packages/cli/src/commands/install.ts`
- `packages/cli/src/bin/tank.ts`
- `packages/cli/src/lib/url-fetcher.ts`
- `bdd/steps/system/mcp-proxy-phase-6-e2e.steps.ts` (new)
- `idd/modules/mcp-proxy/INTENT.md` (E30a..E30d examples added)

## Finding

Phase 6 shipped with BDD scenarios that called `applyProxyWrapping()` as a
library function rather than spawning the real `tank` CLI. The tests all
passed but didn't exercise the user flow. When I rewrote the Phase 6 BDD
as genuine E2E — spawning `node packages/cli/dist/bin/tank.js install …`
against real fixture skills with an isolated `HOME` — four production bugs
surfaced immediately, every one of them shippable to users:

1. **Proxy package pointed at source, not dist.** `@tankpkg/proxy` declared
   `"main": "src/index.ts"`. When the CLI dynamically imported it at
   runtime, Node's strip-only TS mode choked on `CanarySession`'s
   constructor parameter assignments: `TypeScript parameter property is
not supported in strip-only mode`. Effect: `tank proxy --remote`
   always crashed with exit 1, regardless of arguments or env.

2. **`installFromUrl` bypassed `applyProxyWrapping` entirely.** C42
   ("proxy enabled by default for all `tank install` commands") was
   violated for every URL-based install. The agent config ended up with
   the raw child command, with no proxy wrapper — silent downgrade.

3. **`installFromLockfile` skipped agent linking for non-global installs.**
   The entire link block lived inside `if (global)`. Consequence: any
   `tank install` in a project with an existing `tank.lock` left the
   agent configs empty — and therefore unwrapped. Silent bypass again.

4. **`--dangerously-no-tank-proxy` not plumbed into `installFromUrl`.**
   The flag was threaded through `installCommand` / `installAll` but
   silently ignored on URL-path installs.

## Root Cause

The shared root cause is weak verification. The pre-existing Phase 6 BDD
(`mcp-proxy-phase-6.steps.ts`) imported and invoked `applyProxyWrapping`
directly. That pattern verified the library in isolation, not the
binary, not the install pipeline, not the CLI plumbing. Every bug above
lived in code the library-call tests never touched:

| Bug                        | Lived in                                                   | Tests called                                         |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| 1. Proxy package main      | `packages/proxy/package.json`                              | `applyProxyWrapping` (no import of `@tankpkg/proxy`) |
| 2. URL install bypass      | `packages/cli/src/commands/install.ts:installFromUrl`      | `applyProxyWrapping` directly (not via install path) |
| 3. Lockfile install bypass | `packages/cli/src/commands/install.ts:installFromLockfile` | Same as above                                        |
| 4. CLI flag plumbing       | `packages/cli/src/bin/tank.ts`                             | Library function, not Commander parser               |

The library-call BDD passed with green output while production was
broken in four places. Following `@tank/bulletproof` strictly (spawn the
real binary, verify real disk + real process output) caught all four in
one RED run.

## Fix

**Bug 1 — proxy package export correction.** Changed `packages/proxy/package.json`
to match every other internals package: `"main": "./dist/index.js"` with a
proper `exports` map pointing to `dist/`. Built artifact is now the import
target; source TS is no longer invoked at runtime.

**Bug 2 — URL install proxy wrapping.** Added a `wrapMcpServerForSkill` call
in `installFromUrl` immediately after the link step, mirroring what
`executeInstallPipeline` already does in `linkInstalledRoots`. Threaded
`dangerouslyNoTankProxy` through `InstallFromUrlOptions`.

**Bug 3 — Lockfile install agent linking.** Lifted the link block out of
the `if (global)` guard; both local and global installs now link AND
wrap. Added `wrapMcpServerForSkill` to the lockfile path. Also added a
short-circuit: if the extract dir already contains a valid `tank.json`,
skip re-fetching the tarball and just re-link/re-wrap.

**Bug 4 — CLI flag plumbing.** Threaded `opts.dangerouslyNoTankProxy`
into the `installFromUrl` branch in `packages/cli/src/bin/tank.ts` via
the same spread pattern used for `installCommand` / `installAll`.

**Supporting changes.**

- `url-fetcher.ts` gained a `file://` URL branch. The install pipeline
  unchanged; `fetchFromFileUrl` just copies the source directory into a
  temp location so the existing scan/validate/link steps work. Required
  for bulletproof E2E; also useful for dev installs of local fixtures.
- `installFromUrl` skips the remote scan API for `file://` URLs. Trust
  model: the scan API evaluates public URLs; a `file://` URL is a
  directory the user already controls, so remote scanning adds no value.

## Acceptance Criteria Verified

- [x] `tank install file://fixture` writes `.claude/settings.json` with
      `{command: "tank", args: ["proxy", "--", <child>]}` (@C42 @E30a)
- [x] `tank install file://fixture --dangerously-no-tank-proxy` writes the
      original command, no wrapper (@C39 @E29)
- [x] `tank install` on a project with existing `tank.lock` wraps every
      locked skill with `mcp_server` (@C42 @E30b)
- [x] `tank proxy --remote <url> --requires-auth` with env var missing
      exits 2, stderr contains `tank proxy: required auth env var
  TANK_MCP_AUTH_<SLUG> not set` (@C48 @E30c)
- [x] `tank proxy --remote <url> --requires-auth` with env var set exits
      0, stderr explains remote transport is Phase 7, secret never
      appears in stdout or stderr (@C47 @E30d)
- [x] Agent config command+args actually form a valid `tank proxy --
  <child>` invocation (@C42 @cross-phase)
- [x] All 59 mcp-proxy BDD scenarios green (14 P2 + 13 P3 + 6 P4 + 6 P5 + 14 P6 library + 6 P6 E2E)
- [x] 270 proxy unit tests green
- [x] 480 CLI unit tests green
- [x] CI `test`, `check-docs-sync`, `CodeQL`, all Analyze jobs green on
      PR #399

## Gherkin Scenarios

See `bdd/steps/system/mcp-proxy-phase-6-e2e.steps.ts` — all six scenarios
now satisfied, all spawn the real CLI via `node
packages/cli/dist/bin/tank.js`, all assert against real disk state and
real exit codes with zero mocks.

## Lesson

Library-call BDD is not bulletproof. A test that imports and invokes a
function from the same package as the code under test will miss every
bug that lives outside that function — package exports, dynamic
imports, CLI flag plumbing, pipeline ordering, trust-boundary checks.
The right test is the one that runs exactly what the user types.
