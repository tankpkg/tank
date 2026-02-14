# Contributing to Tank

Thank you for your interest in contributing to Tank! Every contribution matters — whether it's fixing a typo, improving docs, reporting a bug, or building a feature.

## Project Status

Tank is **MVP code-complete** with 461 tests passing. Right now, the most valuable contributions are:

1. **Testing the CLI and web app** in real workflows
2. **Opening issues** for bugs, edge cases, or missing features
3. **Improving documentation** — clarity, examples, diagrams
4. **Contributing security analysis rules** for the audit system

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or later
- [pnpm](https://pnpm.io/) 10 or later (installed via corepack: `corepack enable`)
- [Python](https://python.org/) 3.14 or later (for security analysis functions)
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
   corepack enable
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values — see `.env.example` for what's needed.

4. **Push database schema** (requires DATABASE_URL in .env.local)
   ```bash
   cd apps/web
   npx drizzle-kit push
   ```

5. **Start the dev server**
   ```bash
   pnpm dev --filter=web
   ```

6. **Run tests**
   ```bash
   pnpm test              # All tests (445 TypeScript + 16 Python)
   pnpm test --filter=cli # CLI tests only
   pnpm test --filter=web # Web tests only
   ```

### Project Structure

This is a monorepo managed by [Turborepo](https://turbo.build/repo) with pnpm workspaces:

- `apps/web` — Next.js 15 web app + API routes (deployed to Vercel)
- `apps/cli` — `tank` CLI tool (TypeScript, commander.js)
- `packages/shared` — Shared Zod schemas, TypeScript types, constants
- `docs/` — Product brief, architecture, roadmap

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
- Add tests for new functionality (once test infrastructure exists)
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
- **Server Components** by default in Next.js — `"use client"` only when needed
- **Zod** for all runtime validation (API inputs, config files, schemas)
- Match existing patterns — look at similar files before writing new ones

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to conduct@tankpkg.dev.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

Open a [Discussion](https://github.com/tankpkg/tank/discussions) — there are no dumb questions.
