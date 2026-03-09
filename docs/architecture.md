# Tank — Architecture

> Technical design for a security-first package manager and registry for AI agent skills.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Developer Machine                     │
│                                                              │
│  ┌──────────┐    ┌─────────────┐    ┌────────────────────┐  │
│  │ tank CLI  │───▶│ skills.json │    │ skills.lock        │  │
│  │           │───▶│ (manifest)  │    │ (deterministic)    │  │
│  └─────┬─────┘    └─────────────┘    └────────────────────┘  │
│        │                                                      │
│        │  install / publish / audit / verify                  │
│        ▼                                                      │
├─────────────────────────────────────────────────────────────┤
│                         Network                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Tank Registry                      │   │
│  │                                                       │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │   │
│  │  │ REST API │  │ Metadata │  │ Package Storage    │  │   │
│  │  │ (Hono/   │  │ (Postgres│  │ (OCI-compatible)   │  │   │
│  │  │  NestJS) │  │  )       │  │                    │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────────┬───────────┘  │   │
│  │       │              │                  │              │   │
│  │  ┌────▼──────────────▼──────────────────▼──────────┐  │   │
│  │  │              Publish Pipeline                    │  │   │
│  │  │                                                  │  │   │
│  │  │  Sign ─▶ Analyze ─▶ Validate ─▶ Score ─▶ Store  │  │   │
│  │  │  (cosign) (semgrep) (perms)    (audit)  (OCI)   │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### CLI (`tank`)

The command-line tool developers interact with.

**Responsibilities:**
- Parse and validate `skills.json`
- Generate and verify `skills.lock`
- Resolve dependency trees
- Communicate with the registry API
- Verify signatures and integrity hashes locally
- Display audit information and permission summaries

**Technology:** Node.js with Commander.js — same ecosystem as target users, 18 commands implemented.

### Registry API

The server that hosts, indexes, and serves skill packages.

**Responsibilities:**
- Accept and validate skill publishes
- Run the publish pipeline (sign, analyze, score)
- Serve skill metadata and packages
- Maintain audit history
- Handle search queries

**Technology:**
- **API framework**: Hono or NestJS (Node.js)
- **Database**: PostgreSQL for metadata, versions, publishers, audit records
- **Package storage**: OCI-compatible registry (skills are stored as OCI artifacts)
- **Search**: PostgreSQL full-text search for MVP, vector database for semantic search later

### Publish Pipeline

The chain of checks every skill goes through before entering the registry.

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│  Analyze   │────▶│  Validate  │────▶│   Score    │────▶│   Store    │
│            │     │            │     │            │     │            │
│ 6-stage    │     │ perms      │     │ 0-10       │     │ supabase   │
│ pipeline   │     │ semver     │     │ compute    │     │ postgres   │
│            │     │ escalation │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
```

Each step can reject the publish with a clear error message explaining why and how to fix it.

> **Planned**: Code signing (Sigstore/cosign) will be added as a first step in the pipeline in Phase 2.

### Permission System

The permission model is the core security innovation.

**Three layers:**
1. **Skill declaration**: each skill declares what it needs (`permissions` in skill manifest)
2. **Project budget**: each project declares what it allows (`permissions` in `skills.json`)
3. **Install-time enforcement**: CLI blocks skills that exceed the project budget
4. **Scan-time cross-check**: 6-stage scanner independently extracts permissions from code and flags mismatches
5. **Runtime enforcement** (planned, Phase 3): sandbox blocks anything not declared

**Performance Guardrails:**
To prevent security features from degrading developer experience, Tank implements a non-cached performance regression suite that gates all CI merges. See [Performance Testing](performance-testing.md) for methodology.

**Permission types:**
```
network:outbound     — make HTTP/HTTPS requests
network:inbound      — listen on ports
filesystem:read      — read files (with glob patterns)
filesystem:write     — write files (with glob patterns)
subprocess           — spawn child processes
secrets              — access environment variables / secret store
```

---

## Data Model

### Skills

```
skills
├── id (uuid)
├── name (string, unique, scoped: @org/name)
├── description (text)
├── publisher_id (fk → publishers)
├── created_at
└── updated_at

skill_versions
├── id (uuid)
├── skill_id (fk → skills)
├── version (semver string)
├── integrity_hash (sha512)
├── signature (sigstore reference)
├── permissions (jsonb)
├── dependencies (jsonb)
├── audit_score (integer, 0-10)
├── sbom (jsonb)
├── package_url (string, OCI reference)
├── published_at
└── analysis_results (jsonb)

publishers
├── id (uuid)
├── name (string)
├── github_id (string)
├── verified (boolean)
├── signing_key_fingerprint (string)
├── created_at
└── verified_at
```

### Audit Trail

```
audit_events
├── id (uuid)
├── skill_id (fk → skills)
├── version_id (fk → skill_versions)
├── event_type (enum: publish, review, flag, takedown, score_change)
├── actor_id (fk → publishers, nullable)
├── details (jsonb)
└── created_at
```

---

## Key Design Decisions

### Why OCI for Package Storage?

OCI (Open Container Initiative) registries are a proven, scalable standard for distributing artifacts. Benefits:
- Existing infrastructure (Harbor, GHCR, ECR all support OCI artifacts)
- Content-addressable storage (integrity built in)
- Replication and mirroring support
- Well-understood caching and CDN patterns

### Why Sigstore for Signing? (Planned — Phase 2)

Sigstore is the emerging standard for software signing (npm is migrating to it). Benefits:
- Keyless signing via GitHub OIDC — publishers don't manage keys
- Transparency log (Rekor) provides public audit trail
- Same tooling developers already use for container signing

### Static Analysis Pipeline (Implemented)

Tank uses a custom 6-stage Python pipeline instead of Semgrep, designed specifically for AI agent skill analysis:
- **Stage 0 (Ingest)**: Hash computation, file inventory
- **Stage 1 (Structure)**: Package structure validation
- **Stage 2 (Static)**: AST analysis, regex patterns, permission cross-checking
- **Stage 3 (Injection)**: Prompt injection detection
- **Stage 4 (Secrets)**: Credential and secret scanning
- **Stage 5 (Supply Chain)**: Dependency vulnerability checking via OSV API

### Lockfile Format

The lockfile is JSON (not YAML) for:
- Deterministic serialization (JSON.stringify with sorted keys)
- Easy machine parsing
- Diffability in version control
- Familiarity (same as package-lock.json)

---

## Resolved Technical Decisions

1. **CLI language**: Node.js (Commander.js) — same ecosystem as target users, 16 commands implemented
2. **Monorepo structure**: Yes — pnpm workspaces with Turbo orchestration (apps/cli, apps/web, packages/shared)
3. **Search**: PostgreSQL full-text search with GIN index — sufficient for MVP
4. **Package storage**: Supabase Storage (with on-prem abstraction layer)

## Open Technical Questions

1. **Self-hosting**: Should the registry be easy to self-host from day one (like Verdaccio)?
2. **WASM sandbox specifics**: Wasmtime? WasmEdge? What's the runtime permission interface?
3. **Semantic search**: When to invest in vector search for improved skill discovery?

---

## Further Reading

- [Product Brief](product-brief.md) — full feature description and positioning
