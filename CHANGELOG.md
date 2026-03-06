# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-03-06

### Added

#### CLI + MCP Release Alignment (`@tankpkg/cli` 0.5.0 → 0.6.0, `@tankpkg/mcp-server` 0.2.0 → 0.6.0)

- `tank install` now resolves the full skill dependency graph up front from registry metadata before downloading tarballs
- Transitive skill dependencies are recorded in `skills.lock`, making the resolved graph reconstructable from lockfile data alone
- Shared dependencies are deduplicated into a single resolved version per skill name during install planning
- Tarball downloads for resolved skills now run in parallel with a bounded concurrency limit
- `@tankpkg/mcp-server` is version-aligned with the CLI for the `v0.6.0` repo release

### Changed

- Existing locked skills are treated as exact pins during new installs, preventing silent upgrades while resolving additional dependencies
- `install.ts` was refactored into shared install pipeline and permission checker modules to remove duplicated install logic between `installCommand` and `installAll`
- Lockfile writes happen before legacy manifest fallback recursion so recursive installs do not overwrite resolved dependency state

### Fixed

- Installs now fail fast when two skills require incompatible versions of the same dependency instead of partially installing a broken tree
- Dependency verification compares extracted manifest dependency ranges against registry metadata for better mismatch detection
- Agent linking in `installAll` now handles per-skill failures without aborting the entire install run

## [0.5.0] - 2026-03-05

### Added

#### MCP Server — Full CLI Parity (`@tankpkg/mcp-server` 0.1.0 → 0.2.0)

12 new MCP tools, bringing the total from 5 to 17. AI agents (Claude Code, Cursor, VS Code Copilot) now have access to every Tank operation without leaving the editor:

- **logout** — Clear stored credentials and env-based tokens
- **whoami** — Show current user with network error distinction
- **init-skill** — Create `skills.json` and `SKILL.md` scaffold
- **install-skill** — Full install flow: version resolve → fetch → SHA-512 verify → extract → lockfile
- **update-skill** — Semver-aware update within declared ranges, major version detection
- **remove-skill** — Remove from lockfile, delete files, update `skills.json`
- **verify-skills** — Verify lockfile integrity against installed files
- **skill-permissions** — Display per-skill permission summary from lockfile
- **audit-skill** — Fetch security scan results with verdict derivation
- **link-skill** / **unlink-skill** — Symlink skills into agent workspaces
- **doctor** — 4-check diagnostics (config, auth, registry connectivity, Node.js version)

MCP server internals:
- `verifyAuth()` now returns a discriminated union: `{ valid, user }` | `{ valid: false, reason: 'no-token' | 'unauthorized' | 'network-error' }`
- `packForScan()` added to MCP packer for scanning non-skill directories
- `logout` clears `process.env.TANK_TOKEN` to prevent env-based re-reads

#### CLI Improvements (`@tankpkg/cli` 0.4.0 → 0.5.0)

- **`tank scan` command** — Scan any directory for security issues, not just Tank skills with `skills.json`
- **`tank init --yes`** — Non-interactive mode for CI/CD and piped stdin environments
- **`packForScan()`** — Packer fallback for directories without `skills.json`
- **`--skill-version`** — Renamed from `--version` to avoid Commander.js clash

#### Web API (`@tank/web` 0.1.0 → 0.2.0)

- **Scan endpoint** — `manifest` field now optional in `/api/v1/scan`, enabling security scans on arbitrary code directories

#### BDD Test Suite (100 scenarios)

Full behavior-driven test coverage for all 17 MCP tools across 11 feature files. Zero mocks — real MCP server over stdio, real HTTP, real PostgreSQL:

- `auth.feature` (7 scenarios) — Login, logout, whoami, token lifecycle
- `init.feature` (9 scenarios) — Skill initialization with validation
- `scan.feature` (10 scenarios) — Security scanning with/without `skills.json`
- `install.feature` (9 scenarios) — Full publish → install → SHA-512 verify flow
- `update.feature` (8 scenarios) — Semver resolution, range updates, major detection
- `remove.feature` (7 scenarios) — Skill removal and cleanup
- `verify.feature` (9 scenarios) — Lockfile integrity verification
- `audit.feature` (9 scenarios) — Security audit and verdict display
- `permissions.feature` (11 scenarios) — Permission summary display
- `link.feature` (11 scenarios) — Skill linking and unlinking
- `doctor.feature` (10 scenarios) — Setup diagnostics

### Fixed

- `@inquirer/prompts` does not work with piped stdin — added `--yes` non-interactive mode to `tank init`
- Commander.js `--version` flag clash — renamed to `--skill-version`
- MCP `whoami` API response shape mismatch — `verifyAuth()` now matches actual `/api/v1/auth/whoami` response format
- MCP `verifyAuth()` didn't distinguish network errors from auth failures — returns discriminated union
- MCP logout didn't clear env-based token — `process.env.TANK_TOKEN` now cleared after logout
- Python scanner audit_score fallback — `result.audit_score ?? 0` prevents undefined

## [0.4.0] - 2026-02-23

### Added

- Project scaffolding and documentation
- Product brief, roadmap, and architecture docs
- OSS community files (contributing guide, code of conduct, issue templates)
