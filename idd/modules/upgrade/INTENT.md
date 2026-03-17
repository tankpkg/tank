# Upgrade Module

## Anchor

**Why this module exists:** Tank distributes compiled binaries. Users need a self-update mechanism that downloads the correct platform binary, verifies its SHA-256 checksum against the published `SHA256SUMS` file, and replaces the running binary — without requiring npm or package managers.

**Consumers:** CLI (`tank upgrade` / `upgradeCommand()`).

**Single source of truth:** `packages/cli/src/commands/upgrade.ts`. Binaries hosted on GitHub Releases at `tankpkg/tank`.

---

## Layer 1: Structure

```
packages/cli/src/commands/upgrade.ts   # Self-update: fetch latest release, download, verify, replace binary
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                     | Rationale                                                           | Verified by  |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ |
| C1  | Fetches latest version from GitHub Releases API if `--version` not specified                             | Single source of truth for latest version                           | BDD scenario |
| C2  | If already on latest version, prints "Already on latest" and exits without downloading                   | Avoids unnecessary downloads                                        | BDD scenario |
| C3  | Downloads platform+arch-specific binary (`tank-darwin-arm64`, `tank-linux-x64`, etc.)                    | Must install the right binary for the OS                            | BDD scenario |
| C4  | Downloads `SHA256SUMS` and verifies the binary checksum before replacing                                 | Supply-chain attack prevention                                      | BDD scenario |
| C5  | Checksum mismatch → prints error "Checksum mismatch. Aborting for security." and does NOT replace binary | Binary integrity must be guaranteed                                 | BDD scenario |
| C6  | `--dry-run` prints "Would upgrade X → Y" without downloading                                             | Safe preview before actual upgrade                                  | BDD scenario |
| C7  | Homebrew installs are detected and redirected to `brew upgrade tank`                                     | Homebrew manages its own binaries                                   | BDD scenario |
| C8  | Binary is written to a temp directory first, then copied to running binary path                          | Atomic replacement; prevents partial writes                         | Code review  |
| C9  | npm/npx installs are detected and redirected to `npm update -g @tankpkg/cli`                             | Overwriting a JS entry with a native binary bricks the CLI (GH-181) | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                              | Expected Output                                       |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| E1  | `tank upgrade` when already on latest                              | "Already on latest version: X.Y.Z"                    |
| E2  | `tank upgrade --dry-run` when newer version exists                 | "Would upgrade tank X.Y.Z → A.B.C"                    |
| E3  | `tank upgrade --version 1.2.3` with valid checksum                 | Binary replaced; "Upgraded tank X → 1.2.3"            |
| E4  | Checksum mismatch                                                  | "Checksum mismatch. Aborting for security."           |
| E5  | Homebrew install detected                                          | "Run `brew upgrade tank` instead"                     |
| E6  | npm install detected (path in `node_modules` or ends `.js`/`.mjs`) | "Run `npm update -g @tankpkg/cli` to upgrade instead" |
