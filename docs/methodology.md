# Development Methodology: IDD → BDD → TDD → E2E

Every feature flows through this pipeline sequentially. Each stage produces artifacts that feed the next.

```
Define Intent → Express as Scenarios → Implement with Tests → Validate End-to-End
    IDD               BDD                   TDD                    E2E
  .idd/             .bdd/              __tests__/                e2e/
```

---

## 1. IDD — Intent-Driven Development

> "Stop treating code as the primary artifact. Treat the *specification* as primary." — copyleftdev

### Philosophy

IDD inverts the traditional workflow. Instead of code-first ("vague requirements → code → debug → hope → ship"), IDD starts with **full specification of what the system does** before any implementation. The specification is the source of truth — not the code.

Specification is not bureaucracy — it's strategic clarity that prevents costly rework. Understanding a system should never require "archaeology" through source files.

### Why IDD Matters for AI-Assisted Development

The project becomes a knowledge base (RAG environment) for AI agents:
- Intent docs → "What should the system do?"
- Constraints → "What rules must hold?"
- Examples → "What are the concrete expected behaviors?"
- Acceptance criteria → "How do I know this task is done?"

This transforms unstructured "vibe coding" into deliberate, verifiable development. AI agents produce dramatically better code when they have structured context — the intent document is that context.

### Tank Structure: `.idd/`

```
.idd/
└── modules/
    └── <module-name>/
        └── INTENT.md
```

Each module gets an `INTENT.md` with three layers:

**Anchor** — Why the module exists, who consumes it, single source of truth file path.

**Layer 1: Structure** — File tree showing what code exists and where.

**Layer 2: Constraints (C1–CX)** — Business rules with rationale and verification method. Each constraint has:
- `#` — Identifier (C1, C2, ...)
- `Rule` — The invariant that must hold
- `Rationale` — Why this constraint exists
- `Verified by` — How it's checked (BDD scenario, unit test, code review, migration)

**Layer 3: Examples (E1–EX)** — Concrete input/output pairs that map directly to test cases. Each example is a verifiable assertion:
- `Input` — Function call or user action
- `Expected Output` — What should happen

Example from `search` module:
```
| C1 | Search uses three strategies in union: ILIKE, pg_trgm similarity, FTS | Each strategy covers a different user intent | BDD scenario |
| E1 | searchSkills("@org/react", ...) | First result is exact skill @org/react |
| E4 | searchSkills("recat", ...) | Trigram similarity matches "react" despite typo |
```

Constraints become BDD scenarios. Examples become test assertions. The dependency chain:
```
.idd/modules/search/INTENT.md  →  .bdd/features/mcp/search.feature  →  .bdd/steps/search.steps.ts
```

### References

- https://intent-driven.dev/ — Context engineering for AI agents
- https://dev.to/copyleftdev/intent-driven-development-define-the-system-before-you-write-the-code-22pe — Full IDD workflow
- https://medium.com/@binoy_93931/from-agile-to-adaptive-intent-driven-development-aidd-the-ai-first-paradigm-shift-e07e5c7df1ec — AIDD: The AI-first paradigm shift

---

## 2. BDD — Behavior-Driven Development

> "BDD is not primarily a testing methodology — tests are a valuable byproduct. It's a holistic development approach emphasizing collaboration, behavior specification, and continuous validation." — Cucumber

### Philosophy

BDD bridges intent (from IDD) and executable code. It minimizes feedback loops by interweaving analysis, design, coding, and testing into a single short cycle. The fundamental principle: **express what the system should do in plain language that is both human-readable and machine-executable**.

Focus on *what* the system does, never *how*. Scenarios should describe behavior ("authorized user logs in") not implementation ("click the login button"). This decoupling frees developers to change implementation without rewriting tests.

### The Discovery → Formulation → Automation Cycle

1. **Discovery** — Structured conversations using real-world examples from IDD constraints/examples. Reveals requirements, identifies gaps, surfaces deferrable features.
2. **Formulation** — Document examples using Gherkin (Given/When/Then). Human-readable, machine-executable. Creates living documentation that stays accurate through automation.
3. **Automation** — Scenarios become automated tests. Initially fail, then guide implementation. Function as guardrails maintaining development focus.

### Given-When-Then

```gherkin
Scenario: Agent installs a skill by name and latest version is resolved
  Given the MCP server is running
  And Emma is authenticated with Tank
  And the skill "@acme/web-search" exists in the Tank registry
  When the agent calls the "install-skill" tool with name "@acme/web-search"
  Then the MCP server resolves the latest compatible version
  And the skill tarball is fetched from the registry
```

- **Given** — Establish initial context or state
- **When** — Describe the action or event
- **Then** — Specify the observable outcome

### When BDD Adds Most Value

- Shared understanding of requirements is a primary risk
- Complex business logic or workflows
- Acceptance criteria need clear documentation
- Multiple consumers of the same behavior (CLI, MCP, Web)

### When to Skip BDD

- Internal refactoring with no behavior change
- Purely algorithmic work lacking user-visible behavior
- Trivial bug fixes with obvious scope

### Tank Structure: `.bdd/`

```
.bdd/
├── features/                    # Gherkin .feature files
│   ├── admin/                   # Admin API scenarios
│   │   └── rescan-version.feature
│   └── mcp/                     # MCP server scenarios (11 features)
│       ├── install.feature
│       ├── auth.feature
│       ├── scan.feature
│       └── ...
├── steps/                       # Step definitions (12 files)
│   ├── install.steps.ts         # Given/When/Then implementations
│   ├── auth.steps.ts
│   └── ...
├── interactions/                # Test client abstractions
│   ├── mcp-client.ts            # Spawns real MCP server via StdioClientTransport
│   └── admin-api-client.ts      # HTTP calls to /api/admin/*
├── qa/                          # QA feedback loop
│   ├── findings/                # Bugs discovered by BDD tests (numbered)
│   └── resolutions/             # Fixes applied (linked to findings)
├── support/                     # Setup & fixtures
│   ├── hooks.ts                 # beforeAll/afterEach
│   ├── fixtures.ts              # createSkillFixture(), createConfigDir()
│   └── setup.ts                 # setupE2E() — real PostgreSQL + API key + org
└── vitest.config.ts             # Sequential, 60s timeout
```

**Key conventions:**
- One Feature per command/capability
- `@high`, `@medium` tags for priority (map to IDD examples)
- `Background` blocks for shared setup (authenticated user, server running)
- Named actors: "Emma", "Alice" for test users
- `interactions/` abstracts real infrastructure — MCP client spawns actual server process
- `qa/findings/` + `qa/resolutions/` = documented feedback loop from tests to fixes
- Run: `pnpm test:bdd`

**Also: `e2e/bdd/`** — Separate Playwright-based BDD for browser/UI tests:
```
e2e/bdd/
├── features/                    # UI-focused Gherkin (cookie consent, SEO, private packages)
├── steps/                       # Playwright step definitions
└── playwright.config.ts         # Uses defineBddConfig() from playwright-bdd
```

### References

- https://cucumber.io/docs/bdd/ — Official BDD guide (Discovery/Formulation/Automation)
- https://semaphore.io/community/tutorials/behavior-driven-development — Practical BDD, Three Amigos, pitfalls

---

## 3. TDD — Test-Driven Development

### Philosophy

TDD operates inside each unit identified by BDD scenarios. The cycle is strict: **RED → GREEN → REFACTOR**.

1. **RED** — Write a failing test that defines the expected behavior
2. **GREEN** — Write the minimal code to make the test pass
3. **REFACTOR** — Clean up the implementation while keeping tests green

Never write production code without a failing test first. Never refactor while tests are red. Never refactor while bugfixing — fix minimally, then refactor separately.

### Why TDD Works

- **Better design** — Test-first thinking produces modular, loosely-coupled code
- **Regression safety** — Every behavior has a test guarding it
- **Documentation** — Tests describe what the code does, with executable examples
- **Confidence** — Refactoring is safe because tests catch regressions immediately

### Tank Structure: `__tests__/`

Test files are colocated with source code across all packages:

```
apps/cli/src/__tests__/              # CLI command tests
apps/web/lib/__tests__/              # Web utility tests
apps/web/lib/db/__tests__/           # DB layer tests
apps/web/app/api/v1/search/__tests__/ # API route tests
packages/shared/src/__tests__/       # Shared schema tests
packages/mcp-server/__tests__/       # MCP tool tests
python-api/tests/                    # Python scanner tests (test_*.py)
```

**Key conventions:**
- Always `__tests__/*.test.ts` (never `.spec.ts`)
- TypeScript: Vitest — `pnpm test` or `pnpm test --filter=<package>`
- Python: pytest — `test_*.py` pattern

---

## 4. E2E — End-to-End Testing

### Philosophy

> **ZERO MOCKS. REAL APP. STABLE SELECTORS. RELIABLE CI.**

E2E validates the full system as a user would experience it. No mocks, no stubs, no shortcuts. Real CLI binary, real database, real registry, real infrastructure.

Mocks create a parallel reality that diverges from production. They pass in CI while bugs ship to users. E2E tests catch integration issues that unit tests structurally cannot: network behavior, database constraints, auth flows, file system interactions.

### Tank Structure: `e2e/`

```
e2e/
├── producer.e2e.test.ts         # Publish flow (runs FIRST)
├── consumer.e2e.test.ts         # Install flow (runs SECOND)
├── integration.e2e.test.ts      # Cross-cutting scenarios
├── admin.e2e.test.ts            # Admin operations (730 lines)
├── search.e2e.test.ts           # Search flow
├── scan.e2e.test.ts             # Security scanning
├── init.e2e.test.ts             # Project initialization
├── onprem.e2e.test.ts           # On-prem deployment
├── helpers/
│   ├── cli.ts                   # runTank() — spawns real CLI binary
│   ├── fixtures.ts              # createSkillFixture(), createConsumerFixture()
│   └── setup.ts                 # setupE2E() — real PostgreSQL + API key + org
├── fixtures/                    # Static test data (test-skill/)
├── bdd/                         # Playwright-based BDD (see BDD section)
├── AGENTS.md                    # E2E conventions & patterns
└── vitest.config.ts             # Sequential, 60s timeout
```

### Sequential Execution

Tests have data dependencies and MUST run in order:
```
producer (publish) → consumer (install) → integration → admin
```

### Key conventions:
- `runTank()` spawns `node apps/cli/dist/bin/tank.js` — real binary, real network
- `setupE2E()` creates user + API key + org in real PostgreSQL
- Test isolation via unique `runId`, separate `configDir`, temp fixtures
- Needs `.env.local` with real credentials
- Run: `pnpm test:e2e`

### Detailed References

- `e2e/AGENTS.md` — Full E2E conventions, anti-patterns, running instructions
- `docs/references/README.md` — E2E philosophy, decision tree, selector patterns
- `docs/references/playwright-web.md` — Playwright patterns for web E2E

---

## The Pipeline in Practice

When building a new feature for Tank:

1. **IDD**: Create `.idd/modules/<feature>/INTENT.md` — Anchor (why), Layer 1 (structure), Layer 2 (constraints C1–CX with rationale), Layer 3 (examples E1–EX with expected output)
2. **BDD**: Express constraints/examples as Gherkin scenarios in `.bdd/features/` — concrete, executable specifications. Map `@high` tags to IDD examples.
3. **TDD**: Implement each unit — write failing test in `__tests__/`, make it pass, refactor
4. **E2E**: Write integration test in `e2e/` — verify the feature works end-to-end with real infrastructure

The dependency chain:
```
.idd/modules/<feature>/INTENT.md
    ↓ constraints become scenarios
.bdd/features/<feature>.feature
    ↓ scenarios guide implementation
__tests__/*.test.ts (unit) + .bdd/steps/*.steps.ts (integration)
    ↓ validated end-to-end
e2e/*.e2e.test.ts
```

Each stage produces artifacts that feed the next. Skip a stage and the pipeline breaks down.
