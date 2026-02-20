# Tank CLI Distribution: Brew, APT, Curl Installer & npm

## Context

### Original Request
Make the Tank CLI installable via Homebrew, APT, and a curl installer. npm publishing under `@tankpkg/cli` is secondary. Users should NOT need Node.js installed — standalone binaries required.

### Interview Summary
**Key Discussions**:
- Tank CLI works locally via `npm link` — zero distribution infrastructure exists
- npm name `tank` is taken — will publish as `@tankpkg/cli`
- User explicitly prioritizes brew/apt/curl over npm
- Standalone binaries chosen over requiring Node.js 24+
- Platforms: macOS (arm64 + x64) + Linux (x64 + arm64)

**Research Findings**:
- **esbuild + Node.js SEA** is the recommended approach for Node.js CLI binary bundling (2025-2026)
- `pkg` is deprecated, `nexe` broken with Node 24+, `caxa` archived
- Node.js SEA requires CommonJS entry — esbuild handles ESM→CJS conversion
- SEA 3-step process (generate blob → copy node → inject blob) works on Node 22/24
- Binary size expected: ~30-50MB per platform
- Popular CLIs (Biome, esbuild) use GitHub Releases + Homebrew taps pattern
- `fpm` tool simplifies `.deb` generation from a binary

### Metis Review
**Identified Gaps (addressed)**:
- PoC validation is critical — esbuild+SEA must work with `@inquirer/prompts`, `open`, `pino` before committing to this approach → **Wave 0 is a blocking gate**
- Version is hardcoded in 3 places — must unify to single source of truth
- Linux binaries must build on `ubuntu-22.04` (not `latest`) for glibc compatibility
- macOS unsigned binaries trigger Gatekeeper warnings → document workaround for v1
- SHA256 verification in curl installer is mandatory (security-first brand)
- `@tankpkg` npm scope availability must be verified before any npm work
- ARM64 Linux needs either native runner or QEMU cross-build in CI

---

## Work Objectives

### Core Objective
Make Tank CLI installable by anyone via `brew install`, `apt install` (`.deb`), `curl | sh`, or `npm install -g @tankpkg/cli` — without requiring Node.js on the user's machine (except npm fallback).

### Concrete Deliverables
- Standalone binaries for 4 targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`
- `apps/cli/scripts/build-binary.sh` — local binary build script
- `.github/workflows/release.yml` — tag-triggered multi-platform release workflow
- `tankpkg/homebrew-tank` GitHub repo with auto-updated formula
- `install.sh` — curl installer script with SHA256 verification
- `.deb` packages for Linux x64 and arm64 attached to GitHub Releases
- `@tankpkg/cli` published to npm registry

### Definition of Done
- [ ] `brew install tankpkg/tank/tank && tank --version` → prints version on macOS
- [ ] `curl -fsSL https://get.tankpkg.dev/install.sh | sh && tank --version` → works on fresh Ubuntu 22.04 and macOS 14+
- [ ] `dpkg -i tank_*.deb && tank --version` → works on Ubuntu/Debian
- [ ] `npm install -g @tankpkg/cli && tank --version` → works with Node.js 24+
- [ ] `tank login` opens browser successfully from standalone binary
- [ ] `tank init` handles interactive prompts from standalone binary

### Must Have
- SHA256 checksum verification in curl installer and GitHub Releases
- Automatic Homebrew formula updates on new releases
- Single-file binary per platform (no runtime dependencies)
- Version derived from single source of truth (`package.json`)

### Must NOT Have (Guardrails)
- ❌ NO Windows binaries (explicitly out of scope)
- ❌ NO PPA or self-hosted APT repository — `.deb` files on GitHub Releases only
- ❌ NO submission to homebrew-core — tap formula only (`tankpkg/tank`)
- ❌ NO auto-updater or `tank self-update` command
- ❌ NO shell completion installation in the curl script
- ❌ NO PATH manipulation or `.bashrc`/`.zshrc` modifications in installer
- ❌ NO changes to CLI application logic, commands, or lib/ files
- ❌ NO publishing `@tank/shared` as a standalone npm package
- ❌ NO build metadata in `--version` output (just semver)
- ❌ NO refactoring of the CLI entry point structure
- ❌ Binary size MUST stay under 60MB per platform

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest in CLI)
- **User wants tests**: Tests-after (verify binaries work, not TDD for infra scripts)
- **Framework**: vitest (existing) + shell-based smoke tests for binaries

### Approach
Each task includes **manual execution verification** since this is infrastructure/distribution work. The primary verification is: "does the binary actually run on a clean system?"

**Evidence Required per Task:**
- Commands run with actual output
- Binary size reported
- `tank --version` output from standalone binary
- Screenshots/output from `tank init` and `tank login` if applicable

---

## Task Flow

```
Wave 0: [Task 0 — PoC Spike] ← BLOCKING GATE
         │
         ▼
Wave 1: [Task 1 — Version Unification] → [Task 2 — Build Scripts]
         │
         ▼
Wave 2: [Task 3 — GitHub Release Workflow]
         │
         ▼
Wave 3: [Task 4 — Homebrew Tap] ─┬─ [Task 5 — Curl Installer] ─┬─ [Task 6 — .deb Packaging]
                                  │  (parallel)                   │  (parallel)
         │                        └───────────────────────────────┘
         ▼
Wave 4: [Task 7 — npm Publish]
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 4, 5, 6 | Independent distribution channels — Homebrew, curl, .deb |

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | 0 | PoC must validate approach before committing |
| 2 | 1 | Build scripts need unified version |
| 3 | 2 | Release workflow uses build scripts |
| 4, 5, 6 | 3 | All channels consume GitHub Release artifacts |
| 7 | 1 | npm publish needs updated package.json |

---

## TODOs

### Wave 0 — Validation Gate

- [x] 0. PoC: Validate esbuild + Node.js SEA Binary Approach

  **What to do**:
  - Bundle the CLI into a single CJS file using esbuild:
    ```bash
    npx esbuild apps/cli/dist/bin/tank.js \
      --bundle --platform=node --format=cjs \
      --outfile=build/tank-bundle.cjs \
      --banner:js="#!/usr/bin/env node" \
      --external:fsevents
    ```
  - Verify the bundle runs: `node build/tank-bundle.cjs --version` → `0.1.0`
  - Verify interactive commands work: `node build/tank-bundle.cjs init` (inquirer prompts must work)
  - Verify browser open works: `node build/tank-bundle.cjs login` (must open browser)
  - Generate SEA blob using Node.js experimental SEA config:
    ```json
    {
      "main": "build/tank-bundle.cjs",
      "output": "build/sea-prep.blob",
      "disableExperimentalSEAWarning": true,
      "useCodeCache": false,
      "useSnapshot": false
    }
    ```
  - Build the SEA binary:
    ```bash
    node --experimental-sea-config sea-config.json
    cp $(which node) build/tank
    npx postject build/tank NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    ```
  - On macOS, codesign after injection: `codesign --sign - build/tank`
  - Smoke test the standalone binary:
    - `./build/tank --version` → prints version
    - `./build/tank init` → interactive prompts work
    - `./build/tank login` → opens browser
    - `ls -lh build/tank` → under 60MB
  - **IF ANY OF THESE FAIL**: Stop. Document what failed. Consider alternatives:
    - `bun build --compile apps/cli/dist/bin/tank.js --outfile build/tank` (Bun compile)
    - Deno compile as fallback
    - Report back before proceeding

  **Must NOT do**:
  - Do not modify any CLI source code to make the PoC work
  - Do not install native dependencies
  - Do not optimize binary size yet

  **Parallelizable**: NO (blocking gate for all subsequent tasks)

  **References**:

  **Pattern References**:
  - `apps/cli/dist/bin/tank.js` — The compiled ESM entry point to bundle
  - `apps/cli/src/bin/tank.ts` — Source entry point (Commander setup, `.version('0.1.0')`)
  - `apps/cli/package.json` — Dependencies that must be bundled (chalk, ora, commander, @inquirer/prompts, open, pino, pino-loki, tar)

  **Documentation References**:
  - Node.js SEA docs: https://nodejs.org/api/single-executable-applications.html
  - esbuild bundle docs: https://esbuild.github.io/api/#bundle
  - postject npm: https://www.npmjs.com/package/postject

  **WHY Each Reference Matters**:
  - The entry point file is what esbuild bundles — must be the compiled JS, not the TS source
  - All dependencies in package.json must be resolved by esbuild (no externals except fsevents)
  - SEA docs describe the exact 3-step process for Node 22/24 (pre-`--build-sea` flag)

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `node build/tank-bundle.cjs --version` → outputs `0.1.0`
  - [ ] `node build/tank-bundle.cjs init` → interactive prompts appear and respond to input
  - [ ] `node build/tank-bundle.cjs login` → browser opens to auth URL
  - [ ] `./build/tank --version` → outputs `0.1.0` (standalone binary, no Node.js in PATH)
  - [ ] `./build/tank init` → interactive prompts work from standalone binary
  - [ ] `ls -lh build/tank` → file size under 60MB
  - [ ] PoC results documented: what worked, what didn't, binary size, any workarounds needed

  **Commit**: NO (this is a spike — artifacts are temporary)

---

### Wave 1 — Foundation

- [x] 1. Unify Version to Single Source of Truth

  **What to do**:
  - Remove hardcoded version from `apps/cli/src/bin/tank.ts:26` (`.version('0.1.0')`)
  - Remove hardcoded version from `apps/cli/src/index.ts:1` (`export const VERSION = '0.1.0'`)
  - Read version dynamically from `package.json` at build time or runtime:
    - Option A (preferred): Use esbuild `--define` to inject version at bundle time
    - Option B: Read `package.json` version with `createRequire` at runtime
  - Create `apps/cli/src/version.ts` that exports the version from a single source
  - Update `apps/cli/src/bin/tank.ts` to use: `.version(VERSION)`
  - Update any other files importing `VERSION` from `index.ts`
  - Verify: `pnpm --filter=cli build && node apps/cli/dist/bin/tank.js --version` → still works

  **Must NOT do**:
  - Do not add build metadata (commit SHA, date) to version output
  - Do not change the version number itself (keep `0.1.0`)

  **Parallelizable**: NO (depends on Task 0 validating the approach)

  **References**:

  **Pattern References**:
  - `apps/cli/src/bin/tank.ts:26` — Current `.version('0.1.0')` hardcoding
  - `apps/cli/src/index.ts:1` — Current `export const VERSION = '0.1.0'`
  - `apps/cli/package.json` — The single source of truth for version (`"version": "0.1.0"`)

  **WHY Each Reference Matters**:
  - These 3 files are the only places version is defined — all must converge to one
  - `package.json` is the standard source of truth for npm packages

  **Acceptance Criteria**:
  - [ ] `grep -r "0.1.0" apps/cli/src/` → only appears in auto-generated or version.ts (not hardcoded in multiple places)
  - [ ] `pnpm --filter=cli build && node apps/cli/dist/bin/tank.js --version` → `0.1.0`
  - [ ] `pnpm --filter=cli test` → all existing tests pass

  **Commit**: YES
  - Message: `fix(cli): unify version to single source of truth`
  - Files: `apps/cli/src/bin/tank.ts`, `apps/cli/src/index.ts`, `apps/cli/src/version.ts`
  - Pre-commit: `pnpm --filter=cli test`

---

- [x] 2. Create Binary Build Scripts

  **What to do**:
  - Install build dependencies: `pnpm --filter=cli add -D esbuild postject`
  - Create `apps/cli/sea-config.json`:
    ```json
    {
      "main": "build/tank-bundle.cjs",
      "output": "build/sea-prep.blob",
      "disableExperimentalSEAWarning": true,
      "useCodeCache": false,
      "useSnapshot": false
    }
    ```
  - Add build scripts to `apps/cli/package.json`:
    - `"build:bundle"`: esbuild bundles `dist/bin/tank.js` → `build/tank-bundle.cjs` (CJS, all deps inlined, version injected via `--define`)
    - `"build:sea"`: Generate SEA blob + copy node binary + inject blob + codesign (macOS)
    - `"build:binary"`: `build` → `build:bundle` → `build:sea` (full pipeline)
  - Create `apps/cli/scripts/build-binary.sh` that:
    - Runs the full pipeline
    - Detects current OS/arch
    - Names output as `tank-{os}-{arch}` (e.g., `tank-darwin-arm64`)
    - Reports binary size
    - Runs smoke test (`./tank-{os}-{arch} --version`)
  - Add `build/` to `apps/cli/.gitignore`
  - Verify locally: `cd apps/cli && pnpm build:binary` → produces working binary

  **Must NOT do**:
  - Do not cross-compile locally (that's for CI)
  - Do not optimize binary size beyond default esbuild tree-shaking
  - Do not modify the existing `build` (tsc) script

  **Parallelizable**: NO (depends on Task 1 for version unification)

  **References**:

  **Pattern References**:
  - `apps/cli/package.json` — Where to add scripts, dependencies
  - `apps/cli/dist/bin/tank.js` — Entry point for esbuild bundling
  - PoC results from Task 0 — exact esbuild flags and SEA steps that worked

  **External References**:
  - esbuild CLI API: https://esbuild.github.io/api/#build-api
  - Node.js SEA: https://nodejs.org/api/single-executable-applications.html
  - postject: https://github.com/nicolo-ribaudo/postject

  **WHY Each Reference Matters**:
  - PoC from Task 0 gives the exact flags that worked — replicate them in scripts
  - Package.json is where scripts and devDeps live

  **Acceptance Criteria**:
  - [ ] `cd apps/cli && pnpm build:binary` → completes without errors
  - [ ] `./build/tank-darwin-arm64 --version` (or appropriate platform) → prints version
  - [ ] `./build/tank-darwin-arm64 init` → interactive prompts work
  - [ ] `ls -lh build/tank-*` → under 60MB
  - [ ] `build/` directory is in `.gitignore`
  - [ ] Existing `pnpm --filter=cli test` still passes (no regressions)

  **Commit**: YES
  - Message: `feat(cli): add standalone binary build pipeline`
  - Files: `apps/cli/package.json`, `apps/cli/sea-config.json`, `apps/cli/scripts/build-binary.sh`, `apps/cli/.gitignore`
  - Pre-commit: `pnpm --filter=cli test`

---

### Wave 2 — Release Automation

- [x] 3. Create GitHub Actions Release Workflow

  **What to do**:
  - Create `.github/workflows/release.yml` triggered on `push: tags: ['v*']`
  - Build matrix with 4 jobs:
    | Runner | Platform | Binary Name |
    |--------|----------|-------------|
    | `ubuntu-22.04` | linux-x64 | `tank-linux-x64` |
    | `ubuntu-22.04` + QEMU | linux-arm64 | `tank-linux-arm64` |
    | `macos-14` (arm64) | darwin-arm64 | `tank-darwin-arm64` |
    | `macos-13` (x64) | darwin-x64 | `tank-darwin-x64` |
  - Each job: checkout → setup node 24 → corepack enable → pnpm install → pnpm build → build:bundle → build:sea → upload artifact
  - **Important**: Use `ubuntu-22.04` (not `latest`) for Linux builds to ensure glibc 2.35 compatibility with older distros
  - For ARM64 Linux: use QEMU with `docker run --platform linux/arm64` to build, OR use GitHub's arm64 runners if available
  - After all builds complete, create a `release` job that:
    - Downloads all 4 binary artifacts
    - Generates `SHA256SUMS` file: `sha256sum tank-* > SHA256SUMS`
    - Creates GitHub Release with auto-generated notes
    - Attaches all 4 binaries + `SHA256SUMS` to the release
  - Test by pushing a tag: `git tag v0.1.0 && git push origin v0.1.0`

  **Must NOT do**:
  - Do not split into multiple workflow files
  - Do not add Windows builds
  - Do not run the full test suite in the release workflow (CI already does this)
  - Do not attempt homebrew-core submission

  **Parallelizable**: NO (depends on Task 2 for build scripts)

  **References**:

  **Pattern References**:
  - `.github/workflows/ci.yml` — Existing CI workflow (node 24, pnpm, corepack pattern)
  - `apps/cli/scripts/build-binary.sh` — Build script created in Task 2

  **External References**:
  - GitHub Actions matrix strategy: https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
  - `actions/upload-artifact@v4` and `softprops/action-gh-release` for release creation
  - QEMU for arm64 cross-build: `docker/setup-qemu-action@v3`

  **WHY Each Reference Matters**:
  - Existing CI workflow shows the project's node/pnpm/corepack setup — reuse the same steps
  - Build script from Task 2 is invoked by each matrix job

  **Acceptance Criteria**:
  - [ ] Pushing `git tag v0.1.0-test && git push origin v0.1.0-test` triggers the workflow
  - [ ] All 4 matrix jobs complete successfully
  - [ ] GitHub Release is created with: `tank-darwin-arm64`, `tank-darwin-x64`, `tank-linux-x64`, `tank-linux-arm64`, `SHA256SUMS`
  - [ ] `SHA256SUMS` contains correct checksums for all 4 binaries
  - [ ] Release notes are auto-generated
  - [ ] Downloaded binary from release runs: `./tank-darwin-arm64 --version` → prints version
  - [ ] Clean up: delete test tag and release after verification

  **Commit**: YES
  - Message: `feat(ci): add multi-platform release workflow`
  - Files: `.github/workflows/release.yml`
  - Pre-commit: `yamllint .github/workflows/release.yml` (or manual review)

---

### Wave 3 — Distribution Channels (PARALLEL)

- [x] 4. Create Homebrew Tap

  **What to do**:
  - Create new GitHub repository: `tankpkg/homebrew-tank`
  - Add `Formula/tank.rb` with:
    - `desc "Security-first package manager for AI agent skills"`
    - `homepage "https://tankpkg.dev"`
    - Platform detection: `Hardware::CPU.arm?` + `OS.mac?` / `OS.linux?`
    - URLs pointing to GitHub Release binaries (`https://github.com/tankpkg/tank/releases/download/v#{version}/tank-{platform}.tar.gz`)
    - SHA256 checksums per platform
    - `def install` → `bin.install "tank"`
    - `test do` → `system "#{bin}/tank", "--version"`
  - Add auto-update mechanism: In the release workflow (Task 3), add a step that:
    - Computes SHA256 of each binary
    - Clones `tankpkg/homebrew-tank`
    - Updates `Formula/tank.rb` with new version + SHA256s
    - Commits and pushes (using a GitHub token or deploy key)
  - **Note**: Binaries must be `.tar.gz` wrapped (not raw binaries) — Homebrew expects tarballs
  - Add `tar.gz` packaging step in the release workflow
  - Test: `brew tap tankpkg/tank && brew install tank && tank --version`

  **Must NOT do**:
  - Do not submit to homebrew-core
  - Do not create a Homebrew cask (that's for GUI apps)
  - Do not add auto-update to the CLI itself

  **Parallelizable**: YES (with Tasks 5, 6 — independent distribution channel)

  **References**:

  **Pattern References**:
  - `.github/workflows/release.yml` — Release workflow to add auto-update step (created in Task 3)

  **External References**:
  - Homebrew formula cookbook: https://docs.brew.sh/Formula-Cookbook
  - Homebrew tap docs: https://docs.brew.sh/Taps
  - Example tap: https://github.com/biomejs/homebrew-biome (Biome's tap for reference)

  **WHY Each Reference Matters**:
  - Biome's tap is a production example of a Node/Rust CLI distributed via Homebrew
  - The release workflow must be updated to auto-push formula changes

  **Acceptance Criteria**:
  - [ ] `tankpkg/homebrew-tank` repo exists with `Formula/tank.rb`
  - [ ] `brew tap tankpkg/tank` → succeeds
  - [ ] `brew install tankpkg/tank/tank` → installs binary to `/opt/homebrew/bin/tank` (or `/usr/local/bin/tank`)
  - [ ] `tank --version` → prints correct version
  - [ ] `tank init` → interactive prompts work
  - [ ] After a new release, formula is auto-updated (new SHA256 + version)
  - [ ] `brew upgrade tank` → picks up new version after auto-update

  **Commit**: YES (in `tankpkg/homebrew-tank` repo)
  - Message: `feat: initial tank formula`
  - Files: `Formula/tank.rb`, `README.md`

  **Also commit in main repo**:
  - Message: `feat(ci): add homebrew formula auto-update to release workflow`
  - Files: `.github/workflows/release.yml`

---

- [x] 5. Create Curl Installer Script

  **What to do**:
  - Create `install.sh` at the root of the repo (or `scripts/install.sh`)
  - The script must:
    1. Detect OS: `uname -s` → `Darwin` or `Linux`
    2. Detect arch: `uname -m` → `arm64`/`aarch64` or `x86_64`
    3. Map to binary name: `tank-darwin-arm64`, `tank-linux-x64`, etc.
    4. Determine latest version from GitHub API: `https://api.github.com/repos/tankpkg/tank/releases/latest`
    5. Download binary from GitHub Release
    6. Download `SHA256SUMS` from same release
    7. **Verify SHA256 checksum** (use `sha256sum` on Linux, `shasum -a 256` on macOS)
    8. Install to `/usr/local/bin/tank` (with sudo if needed) or `~/.local/bin/tank` (without sudo)
    9. Make executable: `chmod +x`
    10. Print success message with version
    11. Print warning if `~/.local/bin` is not in PATH
  - Handle errors gracefully:
    - Unsupported platform → clear error message
    - Download failure → clear error message
    - Checksum mismatch → **abort with security warning**
    - No curl/wget → suggest installing
  - Use atomic install: download to temp file → verify → `mv` to final location
  - Also host this script at a memorable URL. Options:
    - `https://raw.githubusercontent.com/tankpkg/tank/main/install.sh`
    - Or configure a redirect: `https://get.tankpkg.dev/install.sh` → raw GitHub URL
  - Usage: `curl -fsSL https://raw.githubusercontent.com/tankpkg/tank/main/install.sh | sh`

  **Must NOT do**:
  - Do not add shell completion installation
  - Do not modify PATH, `.bashrc`, `.zshrc`, or any shell config
  - Do not add version pinning or `--version` flag to the script
  - Do not add an uninstall step (that's just `rm /usr/local/bin/tank`)

  **Parallelizable**: YES (with Tasks 4, 6 — independent distribution channel)

  **References**:

  **External References**:
  - Homebrew's own install script: https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh (pattern reference for detecting OS/arch)
  - Deno's install script: https://deno.land/install.sh (simpler pattern, good reference)
  - Bun's install script: https://bun.sh/install (excellent UX reference)

  **WHY Each Reference Matters**:
  - Bun's installer is considered best-in-class for DX — follow its output format and error handling
  - SHA256 verification is mandatory — Tank is a security tool, unverified installs are brand-damaging

  **Acceptance Criteria**:
  - [ ] On macOS arm64: `curl -fsSL .../install.sh | sh` → installs to `/usr/local/bin/tank`
  - [ ] On macOS x64: same, correct binary detected
  - [ ] On Ubuntu 22.04 x64: same, correct binary detected
  - [ ] On Linux arm64: same, correct binary detected
  - [ ] `tank --version` works after install
  - [ ] Checksum verification passes (check script output mentions "verified")
  - [ ] Deliberately corrupt the binary → re-run → script aborts with security warning
  - [ ] Run on unsupported platform (e.g., Windows WSL with wrong arch) → clear error message
  - [ ] Script uses atomic install (temp file → mv)
  - [ ] If `/usr/local/bin` is not writable, suggests `sudo` or falls back to `~/.local/bin`

  **Commit**: YES
  - Message: `feat: add curl installer script`
  - Files: `install.sh`
  - Pre-commit: `shellcheck install.sh`

---

- [x] 6. Create .deb Packages for Linux

  **What to do**:
  - Install `fpm` (Effing Package Managers) as a build tool: `gem install fpm`
  - Add a `.deb` build step to the release workflow (`.github/workflows/release.yml`)
  - For each Linux architecture (x64, arm64), generate a `.deb` package:
    ```bash
    fpm -s dir -t deb \
      -n tank \
      -v ${VERSION} \
      --description "Security-first package manager for AI agent skills" \
      --url "https://tankpkg.dev" \
      --maintainer "Tank Team <team@tankpkg.dev>" \
      --license "MIT" \
      --architecture amd64 \  # or arm64
      ./tank-linux-x64=/usr/local/bin/tank
    ```
  - This produces `tank_0.1.0_amd64.deb` (or arm64)
  - Attach `.deb` files to the GitHub Release alongside the raw binaries
  - Test: Download `.deb` from release → `sudo dpkg -i tank_0.1.0_amd64.deb` → `tank --version`
  - Test removal: `sudo dpkg -r tank` → cleanly removes

  **Must NOT do**:
  - Do not set up a PPA or APT repository
  - Do not create RPM packages (out of scope)
  - Do not add systemd service files or post-install scripts

  **Parallelizable**: YES (with Tasks 4, 5 — independent distribution channel)

  **References**:

  **External References**:
  - fpm documentation: https://fpm.readthedocs.io/en/latest/
  - fpm GitHub: https://github.com/jordansissel/fpm

  **WHY Each Reference Matters**:
  - fpm is dramatically simpler than writing Debian control files by hand — one command produces a valid `.deb`

  **Acceptance Criteria**:
  - [ ] `tank_0.1.0_amd64.deb` is attached to GitHub Release
  - [ ] `tank_0.1.0_arm64.deb` is attached to GitHub Release
  - [ ] `sudo dpkg -i tank_0.1.0_amd64.deb` → installs to `/usr/local/bin/tank`
  - [ ] `tank --version` → prints correct version after install
  - [ ] `sudo dpkg -r tank` → cleanly removes binary
  - [ ] `dpkg -I tank_0.1.0_amd64.deb` → shows correct metadata (name, version, description, architecture)

  **Commit**: YES
  - Message: `feat(ci): add .deb packaging to release workflow`
  - Files: `.github/workflows/release.yml`

---

### Wave 4 — npm (Secondary)

- [x] 7. Publish @tankpkg/cli to npm

  **What to do**:
  - Verify scope availability: `npm view @tankpkg/cli` → should 404
  - If `@tankpkg` scope not registered: `npm init --scope=@tankpkg` on npmjs.com (register org)
  - Update `apps/cli/package.json`:
    - Change `"name"` from `"tank"` to `"@tankpkg/cli"`
    - Add `"files": ["dist/", "README.md", "LICENSE"]`
    - Add `"publishConfig": { "access": "public" }`
    - Ensure `"bin": { "tank": "./dist/bin/tank.js" }` is preserved
  - Create or update `apps/cli/README.md` with installation instructions (brew, curl, npm)
  - Add npm publish step to the release workflow:
    - After GitHub Release is created, run `cd apps/cli && npm publish`
    - Use `NPM_TOKEN` secret for authentication
    - Use `--provenance` flag if on GitHub Actions (free attestation)
  - **Important**: The npm package ships the JS source (requires Node.js) — this is the fallback for users who already have Node.js. The standalone binary is for everyone else.
  - Test: `npm install -g @tankpkg/cli && tank --version`

  **Must NOT do**:
  - Do not publish `@tank/shared` separately — it's bundled via workspace resolution
  - Do not add platform-specific optional dependencies (that's for Biome-style distribution, not needed here)
  - Do not invest in npm download badges or README polish beyond basic install instructions

  **Parallelizable**: NO (depends on Task 1 for package.json changes, but independent of Wave 3)

  **References**:

  **Pattern References**:
  - `apps/cli/package.json` — Package to modify and publish
  - `.github/workflows/release.yml` — Add npm publish step

  **External References**:
  - npm publish docs: https://docs.npmjs.com/cli/v10/commands/npm-publish
  - GitHub Actions npm publish: https://docs.github.com/en/actions/publishing-packages/publishing-nodejs-packages

  **WHY Each Reference Matters**:
  - Package.json needs specific fields (`files`, `publishConfig`) for npm publishing
  - Release workflow is where the automated publish step goes

  **Acceptance Criteria**:
  - [ ] `npm view @tankpkg/cli` → shows package info (not 404)
  - [ ] `npm install -g @tankpkg/cli` → installs successfully
  - [ ] `tank --version` → prints correct version
  - [ ] Published package only includes `dist/`, `README.md`, `LICENSE` (no source, no tests)
  - [ ] `npm pack @tankpkg/cli --dry-run` → shows expected files, reasonable size
  - [ ] Version matches the git tag that triggered the release

  **Commit**: YES
  - Message: `feat(cli): configure npm publishing as @tankpkg/cli`
  - Files: `apps/cli/package.json`, `apps/cli/README.md`, `.github/workflows/release.yml`
  - Pre-commit: `pnpm --filter=cli test`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 0 (PoC) | No commit (spike) | Temporary build/ artifacts | Manual smoke test |
| 1 | `fix(cli): unify version to single source of truth` | `src/bin/tank.ts`, `src/index.ts`, `src/version.ts` | `pnpm --filter=cli test` |
| 2 | `feat(cli): add standalone binary build pipeline` | `package.json`, `sea-config.json`, `scripts/build-binary.sh` | `pnpm build:binary` + smoke test |
| 3 | `feat(ci): add multi-platform release workflow` | `.github/workflows/release.yml` | Push test tag → verify release |
| 4 | `feat: initial homebrew tap formula` | `homebrew-tank/Formula/tank.rb` (separate repo) | `brew install tankpkg/tank/tank` |
| 5 | `feat: add curl installer script` | `install.sh` | `curl ... \| sh` on macOS + Linux |
| 6 | `feat(ci): add .deb packaging to release workflow` | `.github/workflows/release.yml` | `dpkg -i` on Ubuntu |
| 7 | `feat(cli): configure npm publishing as @tankpkg/cli` | `apps/cli/package.json`, `.github/workflows/release.yml` | `npm install -g @tankpkg/cli` |

---

## Success Criteria

### Verification Commands
```bash
# Homebrew
brew install tankpkg/tank/tank
tank --version  # Expected: 0.1.0

# Curl installer
curl -fsSL https://raw.githubusercontent.com/tankpkg/tank/main/install.sh | sh
tank --version  # Expected: 0.1.0

# Debian package
sudo dpkg -i tank_0.1.0_amd64.deb
tank --version  # Expected: 0.1.0

# npm (fallback)
npm install -g @tankpkg/cli
tank --version  # Expected: 0.1.0

# Functional verification (from any install method)
tank login      # Expected: opens browser
tank init       # Expected: interactive prompts
```

### Final Checklist
- [ ] All 4 installation methods produce working `tank` binary
- [ ] `tank --version` shows correct version from all methods
- [ ] `tank login` opens browser from standalone binary
- [ ] `tank init` interactive prompts work from standalone binary
- [ ] SHA256 checksums present in GitHub Release
- [ ] Curl installer verifies checksums before installing
- [ ] Homebrew formula auto-updates on new release
- [ ] `.deb` packages install and uninstall cleanly
- [ ] npm package includes only dist files
- [ ] No Windows binaries shipped
- [ ] No PPA or APT repo created
- [ ] No CLI application logic was modified
- [ ] Binary size under 60MB per platform
