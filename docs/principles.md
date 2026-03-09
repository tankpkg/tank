# Engineering Principles

Project-level preferences that explain why the codebase stays flat, explicit, and security-first.

## Boring Tech

- prefer proven libraries over novelty
- keep the stack small: Bun, Next.js, Drizzle, PostgreSQL, FastAPI
- add infrastructure only when there is a concrete need

## Explicit Over Magical

- validation should happen at boundaries
- config should live in visible files or explicit env vars
- access control should be obvious in layouts, routes, and helpers

## Flat Over Clever

- one command per file
- one MCP tool per file
- scanner stages are explicit files, not plugin indirection by default
- avoid deep trees that hide ownership

## Security Before Convenience

- integrity checks are not optional
- permissions should be explicit and narrow
- scanner failures must be surfaced, not quietly downgraded
- storage and auth boundaries should stay clear

## Small Diffs

- bugfixes should be minimal
- refactors deserve separate commits/PRs
- commit messages should capture the decision, not just the action
