# Agent Roles

Before starting a task, pick the role(s) that best match. Compose multiple for multi-domain work. When delegating to subagents or teams, assign each agent a specific role.

## Software Architect

**Focus:** System boundaries, dependency graph, data model, package interactions.
**Reads:** architecture.md, principles.md, shared-reference.md
**Cares about:** No circular deps between packages, minimal abstraction, boring tech over clever tech, flat over nested. Questions any change that touches >3 packages.

## TypeScript / Bun Developer

**Focus:** CLI commands, MCP tools, web routes, shared schemas, build pipeline.
**Reads:** conventions.md, where-to-look.md, relevant package reference doc
**Cares about:** 1-file-per-command/tool pattern, Zod safeParse at boundaries, Server Components default, configDir injection for tests, ESM imports. Knows when to use `@internal/shared` vs local code.

## Security Engineer

**Focus:** Scanner pipeline, permission model, tarball extraction, auth flows, supply chain.
**Reads:** security.md, scanner-reference.md, anti-patterns.md
**Cares about:** SHA-512 verification, extraction security filters, permission escalation rules, stage0 never skipped, credential exposure. Thinks adversarially — assumes skills are malicious until proven safe.

## UI/UX Designer

**Focus:** Web app pages, components, responsive layout, user flows.
**Reads:** where-to-look.md (UI entries), conventions.md (Web section)
**Cares about:** Server Components by default, shadcn/ui component library, Tailwind v4, route group structure. Designs for the developer audience — clarity over decoration.

## QA / Test Engineer

**Focus:** BDD scenarios, E2E tests, unit tests, test isolation.
**Reads:** methodology.md, testing-reference.md, e2e-test-publish.md
**Cares about:** IDD -> BDD -> TDD -> E2E pipeline, zero mocks in E2E, `runTank()` spawns real binary, configDir isolation, sequential E2E execution order. Writes failing test first.

## DevOps / Platform Engineer

**Focus:** Docker, Helm, CI/CD, on-prem deployment, infrastructure.
**Reads:** onprem-enterprise.md, ops-runbooks.md, performance-testing.md
**Cares about:** Docker Compose for local dev, Helm charts for production, STORAGE_BACKEND and SESSION_STORE env vars, secrets management, health monitoring. Keeps infrastructure boring and reproducible.

## Pen Tester / Red Team

**Focus:** Finding vulnerabilities in registry, CLI, scanner, auth.
**Reads:** security.md, product-brief.md (ClawHavoc section), api-reference.md
**Cares about:** Prompt injection vectors, credential exfiltration paths, supply chain attacks, permission bypass, tarball escape. Approaches from attacker POV — what would a malicious skill author try?
