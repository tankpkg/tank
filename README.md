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
  <em>"I know Kung Fu." — but verified, signed, and sandboxed.</em>
</p>

<p align="center">
  <a href="https://github.com/tankpkg/tank/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/tankpkg/tank"><img src="https://img.shields.io/badge/status-early%20development-orange" alt="Status: Early Development"></a>
</p>

---

## The Problem

AI coding agents (Claude Code, Codex, Cursor) can be extended with **skills** — reusable packages that teach agents how to perform tasks. The ecosystem is growing fast: 110,000+ installs in 4 days on one registry alone.

But today's skill registries have **no versioning, no lockfiles, no permissions, no code signing, and no audit trail**. In February 2026, the ClawHavoc incident revealed that 341 malicious skills (12% of a major marketplace) were distributing credential-stealing malware.

Agent skills are more dangerous than npm packages because they execute with the **agent's full authority** — reading files, making API calls, running shell commands. The attack surface is fundamentally larger.

## What Tank Does

Tank is the **npm for agent skills**, with security built into the foundation:

| Feature | npm (2012) | Current Registries | Tank |
|---------|-----------|-------------------|------|
| Versioning | Social contract | Git tags / none | **Enforced semver** |
| Lockfile | `package-lock.json` | None | **`skills.lock`** |
| Permissions | None | None | **Declared + enforced at runtime** |
| Code signing | npm provenance (2023) | None | **Mandatory from day one** |
| Static analysis | None built-in | Basic / none | **Agent-specific rules** |
| Audit score | `npm audit` (deps only) | None | **Transparent 0-10 score** |
| Sandbox | None | None | **WASM / container isolation** |

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

If any skill exceeds the permission budget, installation fails. This single feature would have prevented ClawHavoc.

## Development

### Prerequisites
- Node.js 24+
- pnpm 10+
- Python 3.14+ (for security analysis functions)

### Setup

```bash
git clone https://github.com/tankpkg/tank.git
cd tank
pnpm install
cp .env.example .env.local  # fill in credentials
```

### Commands

```bash
pnpm dev                    # Start web app in dev mode
pnpm build                  # Build all packages
pnpm test                   # Run all tests (445 TypeScript + 16 Python)
pnpm test:perf              # Run performance tests (no-cache production build)
pnpm test --filter=cli      # Run CLI tests only
pnpm test --filter=web      # Run web tests only
pnpm test --filter=shared   # Run shared package tests only
```

## Project Structure

```
tank/
├── apps/
│   ├── web/          # Next.js 15 web app + API (Vercel)
│   └── cli/          # Tank CLI (TypeScript)
├── packages/
│   └── shared/       # Shared schemas, types, constants
└── docs/             # Product brief, architecture, roadmap
```

## Project Status

> **Tank MVP is code-complete with 461 tests passing.** We're building in the open from day one.

See the [Roadmap](docs/roadmap.md) for what we're building and when.

## Documentation

| Document | Description |
|----------|-------------|
| [Product Brief](docs/product-brief.md) | Full vision, features, and technical direction |
| [Roadmap](docs/roadmap.md) | Phased timeline with milestones |
| [Architecture](docs/architecture.md) | Technical design and decisions |
| [Performance Testing](docs/performance-testing.md) | Methodology and regression protocol |
| [Contributing](CONTRIBUTING.md) | How to get involved |

## Why "Tank"?

<img src="assets/tank-character.jpg" alt="Tank (Marcus Chong) — the operator from The Matrix" width="400" align="right" />

In The Matrix, **Tank is the operator** — the person who loads skills into people's minds. He's the one who makes "I know Kung Fu" possible. But he doesn't just load anything blindly. He verifies, he monitors, he's the last line of defense.

That's what this project does for AI agent skills.

## Contributing

Tank is open source under the [MIT License](LICENSE). We welcome contributions of all kinds — see [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE) — do what you want, just include the license.
