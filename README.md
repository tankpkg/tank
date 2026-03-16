<p align="center">
  <img src="assets/hero-banner.png" alt="Tank — Security-first package manager for AI agent skills" width="100%" />
</p>

<p align="center">
  <img src="assets/logo.png" alt="Tank logo" width="120" />
</p>

<h1 align="center">Tank</h1>

<p align="center">
  Security-first package manager for AI agent skills.
  <br />
  <em>"I know Kung Fu." — but verified, locked, and scanned.</em>
</p>

<p align="center">
  <a href="https://github.com/tankpkg/tank/stargazers"><img src="https://img.shields.io/github/stars/tankpkg/tank?style=flat&color=22c55e" alt="GitHub Stars"></a>
  <a href="https://github.com/tankpkg/tank/blob/main/LICENSE"><img src="https://img.shields.io/github/license/tankpkg/tank?color=3b82f6" alt="License"></a>
  <a href="https://www.npmjs.com/package/@tankpkg/cli"><img src="https://img.shields.io/npm/v/@tankpkg/cli?color=22c55e&label=cli" alt="npm"></a>
  <a href="https://github.com/tankpkg/tank/actions"><img src="https://img.shields.io/github/actions/workflow/status/tankpkg/tank/ci.yml?branch=main&label=CI" alt="CI"></a>
</p>

---

## The Problem

AI coding agents (Claude Code, Codex, Cursor) can be extended with **skills** — reusable packages that teach agents how to perform tasks. The ecosystem is growing fast: 110,000+ installs in 4 days on one registry alone.

But today's skill registries have **no versioning, no lockfiles, no permissions, and no security scanning**. In February 2026, the ClawHavoc incident revealed that 341 malicious skills (12% of a major marketplace) were distributing credential-stealing malware.

Agent skills are more dangerous than npm packages because they execute with the **agent's full authority** — reading files, making API calls, running shell commands. The attack surface is fundamentally larger.

## What Tank Does

Tank is the **npm for agent skills**, with security built into the foundation:

| Feature         | npm (2012)              | Current Registries | Tank                                 |
| --------------- | ----------------------- | ------------------ | ------------------------------------ |
| Versioning      | Social contract         | Git tags / none    | **Semver with escalation detection** |
| Lockfile        | `package-lock.json`     | None               | **`skills.lock` with SHA-512**       |
| Permissions     | None                    | None               | **Declared + enforced at install**   |
| Static analysis | None built-in           | Basic / none       | **6-stage security pipeline**        |
| Audit score     | `npm audit` (deps only) | None               | **Transparent 0-10 score**           |
| Code signing    | npm provenance (2023)   | None               | Planned (Sigstore)                   |
| Sandbox         | None                    | None               | Planned (Phase 3)                    |

## Quick Look

### All CLI Commands

```bash
# Authentication
tank login                          # Authenticate via GitHub OAuth
tank whoami                         # Show current user info
tank logout                         # Clear credentials

# Project setup
tank init                           # Create skills.json interactively

# Publishing
tank publish                        # Pack and publish a skill
tank publish --dry-run              # Validate without uploading

# Installation & management
tank install @org/skill             # Install a specific skill
tank install                        # Install all from lockfile (like npm ci)
tank install --yes                  # Auto-accept permission budget expansions
tank update @org/skill              # Update within semver range
tank update                         # Update all skills
tank remove @org/skill              # Remove a skill

# Verification & security
tank verify                         # Verify lockfile integrity
tank permissions                    # Display resolved permission summary
tank audit                          # Show security analysis results
tank audit @org/skill               # Audit a specific skill

# Discovery
tank search "query"                 # Search the registry
tank info @org/skill                # Show skill metadata
```

**`skills.json`** — declare what your agent is allowed to do:

```json
{
  "skills": {
    "@vercel/next-skill": "^2.1.0",
    "@community/seo-audit": "3.0.0"
  },
  "permissions": {
    "network": { "outbound": ["*.anthropic.com"] },
    "filesystem": { "read": ["./src/**"], "write": ["./output/**"] },
    "subprocess": false
  }
}
```

If any skill exceeds the permission budget, Tank prompts you to review and approve the expansion — or auto-accept with `--yes` in CI. No silent escalation. This single feature would have prevented ClawHavoc.

## Development

### Prerequisites

- Node.js 24+
- Bun 1.x+
- Python 3.14+ (for security analysis functions)

### Setup

```bash
git clone https://github.com/tankpkg/tank.git
cd tank
bun install
cp .env.example .env  # fill in credentials
just db admin                # promotes FIRST_ADMIN_EMAIL to admin
```

### Commands

```bash
just dev                    # Start all workspaces in dev mode
just build                  # Build all packages
just test                   # Run all unit tests
just test scanner           # Run Python scanner tests
just test perf              # Run performance tests
just check                  # Biome lint + format validation
just fmt                    # Auto-format code
just verify                 # Validation-only pipeline
just --list                 # See all available commands
```

## Project Structure

```
tank/
├── apps/
│   ├── registry-legacy/ # Maintained Next.js registry during cutover
│   ├── registry/        # Active TanStack Start registry target
│   └── python-api/   # Python security scanner (FastAPI)
├── packages/
│   ├── cli/          # Tank CLI (TypeScript)
│   ├── internals-helpers/ # Shared pure helpers
│   ├── internals-schemas/ # Shared schemas, types, constants
│   ├── mcp-server/   # MCP server for editor integration
│   └── ...
├── infra/            # Docker Compose, Helm charts
├── docs/             # Reference, process, product, ops
├── idd/              # Intent-driven development artifacts
├── bdd/              # Executable behavior specs
└── e2e/              # Full-stack regression tests
```

## Project Status

> **Tank MVP is code-complete.** We're building in the open from day one.

## Documentation

| Document                                   | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| [Docs Index](docs/README.md)               | Start here for architecture, process, and references |
| [Architecture](docs/core/architecture.md)  | Technical design and current app state               |
| [Methodology](docs/process/methodology.md) | IDD → BDD → TDD → E2E workflow                       |
| [Contributing](CONTRIBUTING.md)            | How to get involved                                  |

## Why "Tank"?

<img src="assets/tank-character.jpg" alt="Tank (Marcus Chong) — the operator from The Matrix" width="400" align="right" />

In The Matrix, **Tank is the operator** — the person who loads skills into people's minds. He's the one who makes "I know Kung Fu" possible. But he doesn't just load anything blindly. He verifies, he monitors, he's the last line of defense.

That's what this project does for AI agent skills.

## Contributing

Tank is open source under the [MIT License](LICENSE). We welcome contributions of all kinds — see [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE) — do what you want, just include the license.
