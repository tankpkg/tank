# SDK Module

## Anchor

**Why this module exists:** External systems — AI coding tools (OpenCode, Cursor, Windsurf),
agent frameworks (LangChain, CrewAI, AutoGen), and custom tooling — need programmatic access
to Tank's skill ecosystem. Today the only integration path is shelling out to the CLI or raw
HTTP calls. An official SDK provides typed, ergonomic, multi-language clients with built-in
auth, retries, error handling, and the full install pipeline. Without this, Tank remains a
CLI-only product in a world of programmatic integrations.

**Consumers:**

- `@tankpkg/sdk` (npm) — TypeScript/Node.js applications, IDE plugins, agent frameworks
- `tankpkg` (PyPI) — Python agent frameworks, Jupyter notebooks, ML pipelines
- `packages/cli` — the CLI itself becomes a thin consumer of the SDK (Phase 6)
- `packages/mcp-server` — MCP server migrates to SDK client (Phase 6)

**Single source of truth:**

- `packages/sdk/` — TypeScript SDK package (hand-written REST client + install pipeline extracted from CLI)
- `packages/sdk-python/` — Python SDK package (hand-written httpx REST client, install pipeline via Rust core later)
- `packages/sdk-core/` — Shared Rust core for permission checking, tarball extraction, integrity verification, lockfile I/O (dep graph resolver is future work)
- `apps/registry/src/api/routes/v1.ts` — OpenAPI 3.1 spec served at `/api/v1/openapi.json` via @hono/zod-openapi

---

## Layer 1: Structure

### Architecture: Hand-Written Clients + Shared Core

```
           ┌────────────────┐    ┌────────────────┐
           │ TS SDK          │    │ Python SDK      │
           │ (hand-written   │    │ (hand-written   │
           │  fetch client)  │    │  httpx client)  │
           └──────┬─────────┘    └───┬────────────┘
                  │                  │
           ┌──────▼─────────┐    ┌───▼────────────┐
           │ TS Install      │    │ Python Install  │
           │ Pipeline         │    │ Pipeline        │  ← future
           │ (extracted       │    │ (via Rust core  │
           │  from CLI)       │    │  NAPI/PyO3)     │
           └──────┬──────────┘    └───┬────────────┘
                  │  optional          │
           ┌──────▼────────────────────▼──┐
           │   Shared Rust Core           │
           │   permissions, extraction,   │
           │   integrity, lockfile I/O    │
           │   NAPI-RS ↔ PyO3            │
           │   (full dep resolver: TODO)  │
           └──────────────────────────────┘
```

**Note:** Stainless (auto-generated REST clients) was evaluated but not adopted.
Hand-written clients are simpler for ~15 endpoints and allow custom security
hardening (redirect blocking, credential leak prevention, streaming size caps)
that generated clients don't provide out of the box.

### Package Layout

```
packages/
  sdk/                              # @tankpkg/sdk (npm)
    src/
      index.ts                      # Public API surface
      client.ts                     # TankClient constructor
      errors.ts                     # Typed error classes
      constants.ts                  # Re-exported constants
      types.ts                      # Re-exported types from @internals/schemas
      rest/                         # Reserved for future generated client
        generated/                  # Auto-generated — DO NOT EDIT
      install/                      # Layer B — extracted from CLI
        pipeline.ts                 # download → extract → verify → lockfile
        resolver.ts                 # Dependency resolution
        permissions.ts              # Permission budget checking
        linker.ts                   # Agent linking/unlinking
    package.json
    tsconfig.json

  sdk-python/                       # tankpkg (PyPI) — v1: Layer A only
    tankpkg/
      __init__.py
      client.py                     # TankClient constructor
      errors.py                     # Typed error classes
      rest/                         # Reserved for future generated client
    pyproject.toml
    setup.cfg

  sdk-core/                         # Shared Rust core (future)
    src/
      lib.rs
      resolver.rs                   # Dep resolution
      permissions.rs                # Permission checking
      extract.rs                    # Tarball extraction + verification
      lockfile.rs                   # Lockfile read/write
    Cargo.toml
    napi/                           # NAPI-RS bindings for Node
    pyo3/                           # PyO3 bindings for Python

apps/
  registry/
    src/api/
      openapi.ts                    # @hono/zod-openapi route definitions
      openapi-spec.ts               # Generated OpenAPI JSON export
```

---

## Layer 2: Constraints

### OpenAPI Spec (Phase 1)

| #   | Rule                                                                                               | Rationale                                | Verified by                 |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------- |
| C1  | OpenAPI spec is generated from Hono route handlers via @hono/zod-openapi — never hand-written YAML | Prevents spec drift from code            | CI: spec regeneration check |
| C2  | Spec covers ALL `/api/v1/` public endpoints (auth, search, skills CRUD, publish, star, badge)      | Complete API coverage for SDK generation | BDD scenario                |
| C3  | Spec includes Zod schema references for all request/response bodies                                | Typed SDK generation                     | BDD scenario                |
| C4  | Spec is exported as JSON at a stable URL (`/api/v1/openapi.json`)                                  | API documentation + tooling              | BDD scenario                |

### Constructor & Auth (Phase 2)

| #   | Rule                                                                                                      | Rationale                                | Verified by   |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- |
| C5  | `TankClient()` with no args auto-discovers token from `~/.tank/config.json` then `TANK_TOKEN` env         | Zero-config for existing CLI users       | BDD scenario  |
| C6  | `TankClient({ token })` uses explicit token, ignoring config file and env                                 | Programmatic usage in CI/server contexts | BDD scenario  |
| C7  | `TankClient({ registryUrl })` overrides default `https://www.tankpkg.dev`                                 | Self-hosted / on-prem support            | BDD scenario  |
| C8  | All HTTP requests include `Authorization: Bearer <token>` and `User-Agent: tankpkg-sdk/<version>` headers | Auth + traceability                      | BDD assertion |
| C9  | 429 and 5xx responses trigger exponential backoff retry (default 3 attempts)                              | Resilience without consumer effort       | BDD scenario  |
| C10 | Network failures throw `TankNetworkError` with original cause attached                                    | Debuggable errors                        | BDD scenario  |
| C11 | 401 responses throw `TankAuthError`, 404 → `TankNotFoundError`, 403 → `TankPermissionError`               | Typed error handling                     | BDD scenario  |

### Discovery Methods (Phase 3)

| #   | Rule                                                                                                                        | Rationale                       | Verified by  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------ |
| C12 | `search(query)` returns `SearchResponse` matching the registry's `/api/v1/search` contract                                  | Parity with web search          | BDD scenario |
| C13 | `info(name)` returns full skill metadata including latest version, permissions, audit score                                 | Single-call skill inspection    | BDD scenario |
| C14 | `versions(name)` returns all published versions with audit scores and timestamps                                            | Version selection for consumers | BDD scenario |
| C15 | `download(name, version)` returns a ReadableStream by default; `{ dest }` writes to disk; `{ buffer: true }` returns Buffer | Flexible consumption patterns   | BDD scenario |
| C16 | `download()` with `{ dest }` verifies SHA-512 integrity after write — mismatch throws `TankIntegrityError`                  | Tamper detection                | BDD scenario |

### Security & Audit Methods (Phase 3)

| #   | Rule                                                                                                | Rationale                                   | Verified by  |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| C17 | `audit(name, version?)` returns the full security analysis result (score, findings, stages)         | Programmatic security inspection            | BDD scenario |
| C18 | `permissions(name, version?)` returns the declared permission set (network, filesystem, subprocess) | Permission budget evaluation before install | BDD scenario |
| C19 | `whoami()` returns user info if authenticated, `null` if no valid token                             | Auth status check                           | BDD scenario |

### Skill Content Access (Phase 3)

| #   | Rule                                                                                                                                                                             | Rationale                                                   | Verified by  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| C36 | `listFiles(name, version?)` returns all file paths in the skill package                                                                                                          | File discovery for agents loading skills                    | BDD scenario |
| C37 | `readFile(name, version, path)` returns file content as string; rejects paths with `..`, backslashes, NUL bytes, or absolute paths                                               | Secure individual file access                               | BDD scenario |
| C38 | `readSkill(name, version?)` returns `SkillContent` with `content` (SKILL.md), `references` (dict keyed by filename), `scripts` (dict keyed by filename), and `files` (all paths) | Single-call complete skill loading for LLM context          | BDD scenario |
| C39 | `readSkill()` fetches references and scripts in parallel where possible                                                                                                          | Performance — skills with many references shouldn't be slow | BDD scenario |
| C40 | File listing and file reading endpoints enforce visibility checks — private skills return 404 to unauthorized users                                                              | No data leakage of private skill content                    | BDD scenario |

### Install Pipeline (Phase 4 — TypeScript only at v1)

| #   | Rule                                                                                                                                            | Rationale                             | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ |
| C20 | `install(nameOrRange)` resolves deps, downloads, extracts, verifies, writes lockfile, and links to agents — same behavior as `tank install` CLI | SDK is functionally equivalent to CLI | BDD scenario |
| C21 | `install()` emits progress events via `onProgress` callback for each phase (resolving, downloading, extracting, verifying, linking)             | UIs need progress feedback            | BDD scenario |
| C22 | `install()` rejects with `TankConflictError` if dependency resolution fails                                                                     | Explicit conflict reporting           | BDD scenario |
| C23 | `install()` rejects with `TankPermissionError` if skill exceeds project permission budget and `yes: false` (default)                            | No silent permission escalation       | BDD scenario |
| C24 | `update(name?)` re-resolves within semver range and re-installs if newer version available                                                      | Programmatic updates                  | BDD scenario |
| C25 | `remove(name)` removes skill files, lockfile entry, and agent links                                                                             | Clean uninstall                       | BDD scenario |
| C26 | `link(skillDir, { agents })` and `unlink(skillName, { agents })` manage agent config files                                                      | Integration helper                    | BDD scenario |

### Type Safety & Exports

| #   | Rule                                                                                                                                                                            | Rationale                   | Verified by            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------- |
| C27 | SDK re-exports all public types from `@internals/schemas` — consumers import from `@tankpkg/sdk`, never from internals                                                          | Clean public API boundary   | TypeScript compilation |
| C28 | SDK exports typed error classes: `TankError` (base), `TankAuthError`, `TankNotFoundError`, `TankPermissionError`, `TankNetworkError`, `TankIntegrityError`, `TankConflictError` | Programmatic error handling | TypeScript compilation |
| C29 | SDK exports constants: `AGENT_PATHS`, `MANIFEST_FILENAME`, `LOCKFILE_FILENAME`, `SUPPORTED_AGENTS`                                                                              | Integration helpers         | TypeScript compilation |

### Python SDK

| #   | Rule                                                                                                                       | Rationale                                | Verified by  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| C30 | Python SDK includes: search, info, versions, download, audit, permissions, whoami, star, read_skill, list_files, read_file | Full parity with TS SDK for skill access | BDD scenario |
| C31 | Python SDK uses snake_case method names, context managers (`with TankClient() as client:`), and type hints                 | Idiomatic Python                         | Code review  |
| C32 | Python SDK raises typed exceptions mirroring TS error classes (TankError hierarchy)                                        | Consistent error handling cross-language | BDD scenario |
| C41 | Python SDK validates registry URL (reject credentials, non-http schemes) same as TS                                        | Security parity                          | BDD scenario |
| C42 | Python SDK uses streaming download with 100MB byte limit                                                                   | DoS prevention parity with TS            | BDD scenario |
| C43 | Python SDK computes integrity as `sha512-{base64}` (not hex) matching lockfile format                                      | Correct integrity verification           | BDD scenario |

### Shared Rust Core

| #   | Rule                                                                                                                                                                         | Rationale                                                            | Verified by           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------- |
| C33 | Rust core implements permission checking, tarball extraction (with tarbomb protection), integrity verification, lockfile read/write. Full dep graph resolver is future work. | Single source of truth for security-critical operations              | cargo test (22 tests) |
| C34 | NAPI-RS bindings expose Rust core to Node.js; PyO3 bindings expose to Python                                                                                                 | Multi-language without logic duplication                             | cargo check           |
| C35 | Rust core is optional — TS SDK falls back to pure-TS implementation if native binary unavailable                                                                             | Graceful degradation; no hard native dependency for simple use cases | BDD scenario          |

---

## Layer 3: Examples

### Constructor & Auth

| #   | Input                                                                | Expected Output                                                                                |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| E1  | `new TankClient()` with valid `~/.tank/config.json` containing token | Client authenticated; `whoami()` returns user info                                             |
| E2  | `new TankClient()` with no config file and no `TANK_TOKEN` env       | Client created unauthenticated; `whoami()` returns `null`                                      |
| E3  | `new TankClient({ token: "tank_xxx" })`                              | Client uses explicit token; ignores config file                                                |
| E4  | `new TankClient({ registryUrl: "https://my-tank.internal" })`        | All requests target custom registry                                                            |
| E5  | `new TankClient({ token: "invalid_token" })` → any API call          | Throws `TankAuthError` with 401 status                                                         |
| E6  | API call when server returns 429                                     | Retries with exponential backoff up to 3 times; succeeds on retry or throws `TankNetworkError` |
| E7  | API call when server is unreachable                                  | Throws `TankNetworkError` with connection error cause                                          |

### Discovery

| #   | Input                              | Expected Output                                                                                     |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| E8  | `tank.search("react")`             | Returns `SearchResponse` with matching skills, total count, pagination                              |
| E9  | `tank.search("xyznonexistent123")` | Returns `SearchResponse` with empty results array, total: 0                                         |
| E10 | `tank.info("@tank/react")`         | Returns full skill metadata: name, description, latest version, permissions, audit score, downloads |
| E11 | `tank.info("@acme/nonexistent")`   | Throws `TankNotFoundError`                                                                          |
| E12 | `tank.versions("@tank/react")`     | Returns array of all versions with semver, audit score, published timestamp                         |

### Download

| #   | Input                                                                                | Expected Output                                                      |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| E13 | `tank.download("@tank/react", "1.0.0")`                                              | Returns ReadableStream of tarball bytes                              |
| E14 | `tank.download("@tank/react", "1.0.0", { dest: "./skills/" })`                       | Writes tarball to `./skills/@tank/react-1.0.0.tgz`; verifies SHA-512 |
| E15 | `tank.download("@tank/react", "1.0.0", { buffer: true })`                            | Returns Buffer containing tarball                                    |
| E16 | `tank.download("@tank/react", "1.0.0", { dest: "./skills/" })` with tampered tarball | Throws `TankIntegrityError` with expected vs actual hash             |
| E17 | `tank.download("@acme/nonexistent", "1.0.0")`                                        | Throws `TankNotFoundError`                                           |

### Skill Content Access

| #   | Input                                                                       | Expected Output                                                 |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| E35 | `tank.listFiles("@tank/react")`                                             | Returns `["SKILL.md", "references/component-patterns.md", ...]` |
| E36 | `tank.readFile("@tank/react", "2.2.0", "SKILL.md")`                         | Returns SKILL.md content as string                              |
| E37 | `tank.readFile("@tank/react", "2.2.0", "references/component-patterns.md")` | Returns reference file content                                  |
| E38 | `tank.readFile("@tank/react", "2.2.0", "../etc/passwd")`                    | Throws `TankNetworkError` (path traversal rejected)             |
| E39 | `tank.readSkill("@tank/react")`                                             | Returns `{ content, references, scripts, files }`               |
| E40 | `tank.readSkill("@acme/nonexistent")`                                       | Throws `TankNotFoundError`                                      |

### Security & Audit

| #   | Input                             | Expected Output                                                                         |
| --- | --------------------------------- | --------------------------------------------------------------------------------------- |
| E18 | `tank.audit("@tank/react")`       | Returns audit result: score (0-10), findings array, stage results                       |
| E19 | `tank.permissions("@tank/react")` | Returns `Permissions` object: network outbound rules, filesystem paths, subprocess flag |

### Install Pipeline (TypeScript SDK)

| #   | Input                                                                                  | Expected Output                                                                                           |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| E20 | `tank.install("@tank/react")` in empty project                                         | Resolves latest, downloads, extracts, writes lockfile, links to detected agents                           |
| E21 | `tank.install("@tank/react", { onProgress })`                                          | Calls `onProgress` with events for each phase: resolving → downloading → extracting → verifying → linking |
| E22 | `tank.install("@tank/react")` when already installed at same version                   | No-op; returns result with `alreadyInstalled: true`                                                       |
| E23 | `tank.install("@tank/react@^2.0.0")` with no version satisfying range                  | Throws `TankConflictError` with resolution details                                                        |
| E24 | `tank.install("@org/risky-skill")` where skill exceeds permission budget, `yes: false` | Throws `TankPermissionError` with required vs allowed permissions                                         |
| E25 | `tank.install("@org/risky-skill", { yes: true })`                                      | Installs despite permission expansion; lockfile reflects expanded budget                                  |
| E26 | `tank.update("@tank/react")` with newer version in range                               | Downloads and installs newer version; updates lockfile                                                    |
| E27 | `tank.remove("@tank/react")`                                                           | Removes skill files, lockfile entry, manifest entry, agent links                                          |

### Linking

| #   | Input                                                    | Expected Output                               |
| --- | -------------------------------------------------------- | --------------------------------------------- |
| E28 | `tank.link("./my-skill/", { agents: ["opencode"] })`     | Adds skill path to OpenCode agent config      |
| E29 | `tank.unlink("@org/my-skill", { agents: ["opencode"] })` | Removes skill path from OpenCode agent config |

### Python SDK

| #   | Input                                                          | Expected Output                                                      |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| E30 | `tank = TankClient(token="tank_xxx")` → `tank.search("react")` | Returns search results with snake_case fields                        |
| E31 | `tank.info("@acme/nonexistent")`                               | Raises `TankNotFoundError`                                           |
| E32 | `tank.download("@tank/react", "1.0.0", dest="./skills/")`      | Writes tarball to disk; verifies sha512-base64 integrity             |
| E41 | `tank.read_skill("@tank/react")`                               | Returns `SkillContent(content=..., references={...}, scripts={...})` |
| E42 | `with TankClient(registry_url="http://...") as client:`        | Context manager closes httpx client on exit                          |
| E43 | `TankClient(registry_url="ftp://evil.com")`                    | Raises `ValueError` (non-http scheme rejected)                       |

### Error Classes

| #   | Input                                                                  | Expected Output                                                    |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| E33 | `catch (e) { if (e instanceof TankAuthError) }`                        | Error is instanceof chain: `TankAuthError` → `TankError` → `Error` |
| E34 | `TankNotFoundError` has `.status`, `.skillName`, `.message` properties | Structured error data for programmatic handling                    |

---

## Implementation Phases

| Phase | Scope                                                                                            | Status                                 |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1     | OpenAPI spec via @hono/zod-openapi, serve at `/api/v1/openapi.json`                              | ✅ Done                                |
| 2     | `packages/sdk` + `packages/sdk-python` — constructor, auth, errors, constants, types             | ✅ Done                                |
| 3     | Core API methods (search, info, versions, download, readSkill, audit, permissions, whoami, star) | ✅ Done                                |
| 4     | Install pipeline extraction from CLI into TS SDK (resolver, pipeline, permissions)               | ✅ Done                                |
| 5     | Shared Rust core (permissions, extraction, integrity, lockfile) + NAPI-RS + PyO3 bindings        | ✅ Done (dep graph resolver is future) |
| 6     | Publish workflows, MCP server migration, justfile recipes                                        | ✅ Done                                |

## Resolved Decisions

1. **Endpoint scope:** Public-only (~15 endpoints). Admin panel stays web-only.
2. **REST clients:** Hand-written (not Stainless). ~15 endpoints don't justify code generation overhead. Hand-written clients allow custom security hardening.
3. **Rust core:** Implements permissions, extraction, integrity, lockfile. Full dependency graph resolver deferred — currently only `resolve_version()` (semver matching). Full graph resolution stays in TS until Python SDK needs install.
4. **Semver policy:** Follows monorepo version (0.10.x). Breaking changes allowed per semver.
5. **MCP server:** Migrated to SDK-backed api-client with `sdk` getter for gradual tool migration.
6. **Infrastructure:** MinIO replaced with RustFS across all docker-compose files.
