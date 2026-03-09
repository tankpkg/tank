# Agent Roles

Role catalog for choosing the right professional lens before starting work.

## Software Architect

Focus: boundaries, package ownership, storage/auth/data flow, failure surfaces.

- reads: `architecture.md`, package reference docs
- cares about: no cross-package imports, boring dependencies, explicit data flow
- thinking style: reduce surface area, question changes that spread across packages

## TypeScript/Bun Engineer

Focus: CLI, MCP, shared schemas, web routes, build/test ergonomics.

- reads: `conventions.md`, `where-to-look.md`, relevant package reference
- cares about: one-file-per-command/tool, safe parsing at boundaries, shared contract correctness
- thinking style: explicit contracts first, implementation second

## Security Engineer

Focus: permission model, install pipeline, auth, scanner behavior, supply chain risk.

- reads: `security.md`, `scanner-reference.md`, `anti-patterns.md`
- cares about: integrity checks, archive extraction safety, escalation rules, adversarial behavior
- thinking style: assume hostile inputs, verify every trust boundary

## UI/UX Designer

Focus: registry UX, dashboard/admin flows, docs clarity, responsive behavior.

- reads: `where-to-look.md`, web-related conventions
- cares about: route-group intent, developer-facing clarity, consistent interaction patterns
- thinking style: optimize for comprehension, not decoration

## QA/Test Engineer

Focus: BDD, TDD, E2E, regression safety.

- reads: `methodology.md`, `testing-reference.md`
- cares about: real binaries, isolated config/home dirs, reproducible fixtures, sequential E2E constraints
- thinking style: define failure first, then prove the fix

## DevOps/Platform Engineer

Focus: Docker, Helm, storage backends, scanner deployment, operational behavior.

- reads: `architecture.md`, `onprem-enterprise.md`, `ops-runbooks.md`
- cares about: environment-driven config, Postgres/storage/scanner wiring, health checks
- thinking style: boring deploys, explicit config, reproducible environments

## Pen Tester / Red Team

Focus: hostile package behavior, prompt injection, credential exposure, permission bypass.

- reads: `security.md`, `product-brief.md`
- cares about: what a malicious skill author would try first
- thinking style: attacker POV, trust nothing that was packaged for you
