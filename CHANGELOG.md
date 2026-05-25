# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Conversion Improvements (Issue #462)

End-to-end overhaul of the discovery → install funnel, driven by analytics showing 73% of homepage visitors never reach docs and 41% of traffic lands directly on `/skills`.

**Homepage**

- Hero now shows 4 scannable differentiator pills (Scanning · Vault · Permissions · Integrity) linking to their respective sections
- Hero CTAs upgraded from tiny muted links to proper `<Button>` elements (Browse Packages, View Docs)
- Hero stats row: package count · GitHub stars · MIT license (auto-hides on empty registries)
- Sticky section nav appears after scrolling past hero (Stripe Docs / Linear pattern)
- Section order reflows so Vault and Atoms appear in the first 5 sections (was buried at positions 8–10)
- "Built with Tank" section featuring real production users (prompt2bot, Skills-IL)
- "Recently published" feed showing the 6 newest verified packages
- "Stay in the loop" community section linking to GitHub stars, releases, discussions, contributing

**Skills list**

- Dismissible value-proposition banner explaining the 6-stage security pipeline (localStorage persisted)
- "Getting Started" CLI flow card in the desktop filter sidebar
- Every skill card now shows a copyable `tank install -g <name>` snippet
- Empty-state recovery: "No results for 'foo'" now includes copyable `tank search foo`, browse-all link, and publish guide link

**Skill detail**

- Install command (`tank install -g <name>`) now visible on desktop (was mobile-only)
- "Trust summary" card above the tabs shows scan verdict at a glance
- "View details →" button on the trust card jumps to the security tab
- 404 page shows fuzzy-matched suggestions (`pg_trgm` similarity > 0.2) when a skill name doesn't exist

**Docs**

- Bottom CTA on every doc page: copyable install command + "Browse Packages" button
- Command palette adds a "Learn" group with "What is Tank?" / "How does scanning work?" / "How does the Vault work?"

**CLI**

- `tank install` now accepts multiple targets in one invocation (`tank install -g @org/a @org/b@^1.0.0 https://x.com/c.tgz`)
- npm-style `name@version` spec syntax
- Back-compat shim preserves legacy `tank install @org/skill ^1.0.0` positional form
- One failing target no longer aborts the rest; aggregated exit code
- Failed install with "not found" now prints "Did you mean:" with fuzzy suggestions
- `tank telemetry on|off|status` subcommand for managing opt-in usage analytics
- First-run consent prompt on `tank init` and `tank login` (TTY only, never twice)
- `tank doctor` now reports current telemetry state
- All telemetry strictly opt-in; respects `TANK_TELEMETRY` env var and `TANK_MODE=selfhosted`

**Infrastructure**

- OG images now serve as PNG (was SVG — many social platforms don't render SVG previews)
- Lazy-loaded `node:fs/promises` import in `@internals/helpers` so the package can be safely imported in browser bundles

#### Universal Atom Architecture (Issue #352)

Multi-atom skill packages that compile to native AI agent configs. Write once in `tank.json`, build for any platform.

- **7 atom IR schemas** — instruction, hook, tool, agent, rule, resource, prompt — as Zod schemas in `@internals/schemas`
- **37 canonical hook events**, 13 canonical tool names, 4 abstract model tiers
- **6 platform adapters** — OpenCode, Claude Code, Cursor, Windsurf, Cline, Roo Code — each compiles all 7 atom kinds to native configs
- **Compile orchestrator** — JSON deep-merge for singleton configs (e.g., `.claude/settings.json`), `{file:...}` content inlining, cross-platform handler resolution, package composition with DAG cycle detection
- **`tank build` CLI command** — `--platform`, `--out`, `--dry-run`, `--list-platforms` flags, auto-detection from project files
- **`tank install` auto-build** — skills with `atoms` in their manifest are compiled for detected platforms on install
- **`publishManifestSchema`** — registry accepts both legacy `skills.json` and atom-enriched `tank.json` manifests
- **JSON Schema** — `tank-json.schema.json` for IDE autocomplete in VS Code, JetBrains, etc.
- **166 E2E tests** across 8 test files, including 7-atom fixture through all 6 adapters
- **33 BDD scenarios** across 4 feature files
- **User guide** (`docs/guide/atoms.md`), CLI reference, adapter contributing guide, RFC doc
- **llms.txt** updated with atom architecture, build command, and platform table

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

#### Web API (`@internal/web` 0.1.0 → 0.2.0)

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
