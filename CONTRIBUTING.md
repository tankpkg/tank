# Contributing to Tank

Thank you for your interest in contributing to Tank! Every contribution matters — whether it's fixing a typo, improving docs, reporting a bug, or building a feature.

## Project Status

Tank is in active product and platform iteration. Right now, the most valuable contributions are:

1. **Testing the CLI and web app** in real workflows
2. **Opening issues** for bugs, edge cases, or missing features
3. **Improving documentation** — clarity, examples, diagrams
4. **Contributing security analysis rules** for the audit system
5. **Improving the TanStack migration** without assuming parity with the maintained Next app

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or later
- [Bun](https://bun.sh/) 1.x or later
- [Python](https://python.org/) 3.14 or later (for security scanner)
- [UV](https://docs.astral.sh/uv/) for Python dependency management — `brew install uv` (macOS) or `curl -LsSf https://astral.sh/uv/install.sh | sh`
- [just](https://just.systems/) command runner — `brew install just` (macOS) or `cargo install just`
- A [Supabase](https://supabase.com/) project (for database)
- A [GitHub OAuth App](https://github.com/settings/developers) (for authentication)

### Development Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/tankpkg/tank.git
   cd tank
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in the values — see `.env.example` for what's needed.

4. **Push database schema** (requires DATABASE_URL in .env)

   ```bash
   bun --filter registry-legacy exec drizzle-kit push
   ```

5. **Start the dev server**

   ```bash
   just dev registry-legacy
   ```

6. **Run tests**

   ```bash
   just test              # All unit tests
   just test scanner      # Python scanner tests
   ```

7. **Discover all commands** — run `just --list` for the full command surface

### Project Structure

This is a monorepo managed by [Turborepo](https://turbo.build/repo) with Bun workspaces:

- `apps/registry` — active TanStack Start registry app and migration target
- `apps/registry-legacy` — Next.js 15 web app + API routes (deployed to Vercel)
- `packages/cli` — `tank` CLI tool (TypeScript, commander.js)
- `apps/python-api` — Python security scanner (FastAPI, 6-stage pipeline)
- `packages/internals-schemas` — Shared Zod schemas, TypeScript types, contract constants
- `packages/internals-helpers` — Shared pure helpers
- `packages/mcp-server` — MCP server for editor integration
- `idd/` — intent-first design artifacts and active initiatives
- `bdd/` — executable behavior specs
- `e2e/` — full-stack regression tests
- `infra/` — Docker Compose, Helm charts, Grafana/Loki configs
- `docs/` — architecture, process, product, and ops reference

## How to Contribute

### Report a Bug

Use the [Bug Report template](https://github.com/tankpkg/tank/issues/new?template=bug_report.yml) on GitHub. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, Tank version)

### Suggest a Feature

Open a [Feature Request](https://github.com/tankpkg/tank/issues/new?template=feature_request.yml) or start a [Discussion](https://github.com/tankpkg/tank/discussions). Please check existing issues first to avoid duplicates.

### Submit Code

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/my-feature`
3. **Make your changes** with clear, focused commits
4. **Push** your branch: `git push origin feat/my-feature`
5. **Open a Pull Request** against `main`

### Pull Request Guidelines

- Keep PRs focused — one logical change per PR
- Update documentation if your change affects user-facing behavior
- Add or update tests in the right layer: unit, `bdd/`, or `e2e/`
- Ensure all checks pass before requesting review

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add permission budget validation
fix: resolve lockfile hash mismatch on Windows
docs: clarify semver enforcement rules
chore: update CI workflow
test: add integration tests for install command
refactor: extract version resolution logic
```

**Types**: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `ci`, `style`

## Coding Standards

- **TypeScript strict mode** — no `any`, no `@ts-ignore`, no `as any`
- **TDD** — write failing tests first, then implement (RED → GREEN → REFACTOR)
- **vitest** for TypeScript tests, **pytest** for Python tests
- **Drizzle ORM** for database access (not raw SQL, not Prisma)
- **React server/client boundaries** should match the target app architecture you are editing
- **Zod** for all runtime validation (API inputs, config files, schemas)
- Match existing patterns — look at similar files before writing new ones

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to conduct@tankpkg.dev.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

Open a [Discussion](https://github.com/tankpkg/tank/discussions) — there are no dumb questions.
