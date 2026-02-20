# Learnings

## [2026-02-20T15:06:47Z] Task 0 - SEA PoC
- npx esbuild was unavailable; pnpm dlx esbuild 0.27.3 bundled successfully.
- Bundled CJS `--version` prints 0.1.0; init prompts appear, but piped input/timeout ends with ExitPromptError after the Version prompt.
- Bun compile produced a working binary: `./build/tank --version` prints 0.1.0, init prompt renders, login opens browser and completes (process lingered past 5s timeout).

## [2026-02-20T15:05:37Z] Task 0 - SEA PoC
- `pnpm dlx esbuild` reliably bundles `apps/cli/dist/bin/tank.js` into `build/tank-bundle.cjs` without repo-level esbuild dependency changes.
- Bundled CJS smoke tests pass for `--version` and `login`; `init` reaches interactive prompts in non-interactive automation and fails with prompt-close behavior, indicating prompt path is present.
- Legacy Node SEA flow (`node --experimental-sea-config` + `postject`) can create/inject blob successfully, but runtime execution crashes.
- SEA binary size was `113M`, above target guidance.
- Bun fallback (`bun build --compile`) produced a working standalone binary at `58M` with successful `--version` and `login`, and `init` prompt flow present.
- Decision signal: pivot away from Node SEA implementation path for this repo; Bun compile is currently viable.

## [2026-02-20T15:08:03Z] Task 1 - Version Source of Truth
- Added `apps/cli/src/version.ts` and now read version from `../package.json` via `createRequire(import.meta.url)`.
- Updated `apps/cli/src/bin/tank.ts` to use `.version(VERSION)` from `../version.js`.
- Updated `apps/cli/src/index.ts` to re-export `VERSION` from `./version.js`.
- Validation passed: `pnpm --filter ./apps/cli build`, `pnpm --filter ./apps/cli test` (25 files, 304 tests), and `node apps/cli/dist/bin/tank.js --version` returns `0.1.0`.
- LSP project-level diagnostics could not run due missing root extension mapping; used build+tests as verification evidence.

## [2026-02-20T17:19:00Z] Task 2 - Binary Build Scripts
- Added CLI build scripts in `apps/cli/package.json`: `build:bundle`, `build:sea`, `build:binary`.
- Added `apps/cli/scripts/build-binary.sh` to compile standalone platform binary with Bun compile, normalize OS/arch, chmod executable, and smoke test `--version`.
- Added `apps/cli/.gitignore` with `build/`.
- `build:bundle` uses ESM output (`tank-bundle.mjs`) to avoid `import.meta` incompatibility seen with CJS bundling.
- `src/version.ts` now imports package version from `../package.json` with import attributes (`with { type: 'json' }`), and `tsconfig.json` enables `resolveJsonModule`.
- Validation passed: `pnpm --filter ./apps/cli test` (304 passed), `pnpm --filter ./apps/cli build`, and `pnpm build:binary` produced working standalone binary (`58M`) with `--version` output `0.1.0`.

## [2026-02-20T17:21:17Z] Task 3 - Release Workflow
- Added `.github/workflows/release.yml` with tag trigger (`v*`), four-platform matrix (`linux-x64`, `linux-arm64`, `darwin-arm64`, `darwin-x64`), artifact upload, release aggregation, and SHA256SUMS generation.
- Workflow reuses project setup patterns (Node 24 + corepack + pnpm install) and adds Bun setup for standalone binary compilation.
- Local syntax and regression verification passed: Ruby YAML parse for release workflow, plus `pnpm --filter ./apps/cli build` and full CLI tests (304 passing).

## [2026-02-20T17:26:00Z] Tasks 5-6 - Installer and .deb Packaging
- Added root `install.sh` with OS/arch detection, GitHub latest-release resolution, binary + `SHA256SUMS` download, checksum verification, atomic temp install, and fallback install target (`/usr/local/bin` or `~/.local/bin`).
- Updated release workflow to package `.tar.gz` artifacts per platform and generate `.deb` packages (`amd64`, `arm64`) using `fpm` in release job.
- Release artifacts now include raw binaries, tarballs, `.deb` files, and `SHA256SUMS`.
- Added Homebrew formula template at `packaging/homebrew/Formula/tank.rb` and CI step to auto-update/push formula to `tankpkg/homebrew-tank` when `HOMEBREW_TAP_TOKEN` is present.
- Validation passed locally: `sh -n install.sh`, workflow YAML parse, and full CLI build+test suite (304 tests).

## [2026-02-20T17:28:00Z] Tasks 4 and 7 - Homebrew + npm Publish
- Extended release workflow with conditional Homebrew tap update step that writes `Formula/tank.rb` and pushes to `tankpkg/homebrew-tank` when `HOMEBREW_TAP_TOKEN` is configured.
- Added local formula template at `packaging/homebrew/Formula/tank.rb` for reference and parity with generated tap formula.
- Migrated npm package identity to `@tankpkg/cli` and added publish metadata: `files: ["dist"]`, `publishConfig.access: "public"`.
- Added `publish-npm` job in release workflow (guarded by `NPM_TOKEN`) to build and publish `apps/cli` on release tags.
- `npm pack --dry-run` now shows clean tarball with no compiled test artifacts after build cleanup and tsconfig test exclusion.
