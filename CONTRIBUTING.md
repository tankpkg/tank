# Contributing to Tank

Thank you for your interest in contributing to Tank! Every contribution matters — whether it's fixing a typo, improving docs, reporting a bug, or building a feature.

## Project Status

Tank is in **early development** (Phase 0 — Foundation). Right now, the most valuable contributions are:

1. **Reviewing the design docs** and poking holes in them
2. **Opening issues** for anything unclear, missing, or wrong
3. **Joining discussions** about design decisions
4. **Improving documentation** — clarity, examples, diagrams

## Getting Started

### Prerequisites

Development setup will be documented here once the codebase is established. For now, you only need:

- Git
- A text editor
- Familiarity with the [Product Brief](docs/product-brief.md) and [Roadmap](docs/roadmap.md)

### Development Setup

> Coming soon — the project is in early planning phase. Once code lands, this section will include setup instructions, test commands, and local dev workflow.

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

> Will be established as the codebase develops. We'll document linting, formatting, and style conventions here.

General principles:
- Write clear code that doesn't need comments to understand
- Match existing patterns in the codebase
- TypeScript strict mode — no `any`, no `@ts-ignore`
- Tests for all non-trivial logic

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to conduct@tankpkg.dev.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

Open a [Discussion](https://github.com/tankpkg/tank/discussions) — there are no dumb questions.
