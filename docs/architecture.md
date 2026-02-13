# Tank — Architecture

> Technical design for a security-first package manager and registry for AI agent skills.

> **Status**: Draft. This document will evolve as implementation begins.

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

**Technology decision (pending):**
- **Node.js**: Faster to build, larger contributor pool, same ecosystem as target users
- **Rust**: Better performance, single binary distribution, no runtime dependency

The decision depends on whether install speed is a critical differentiator. For MVP, Node.js is likely sufficient.

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
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Sign     │────▶│  Analyze   │────▶│  Validate  │────▶│   Score    │────▶│   Store    │
│            │     │            │     │            │     │            │     │            │
│ cosign     │     │ semgrep    │     │ perms      │     │ 0-10       │     │ OCI blob   │
│ sigstore   │     │ custom     │     │ semver     │     │ compute    │     │ postgres   │
│            │     │ rules      │     │ SBOM       │     │            │     │            │
└────────────┘     └────────────┘     └────────────┘     └────────────┘     └────────────┘
```

Each step can reject the publish with a clear error message explaining why and how to fix it.

### Permission System

The permission model is the core security innovation.

**Three layers:**
1. **Skill declaration**: each skill declares what it needs (`capabilities` in skill manifest)
2. **Project budget**: each project declares what it allows (`permissions` in `skills.json`)
3. **Runtime enforcement**: the sandbox blocks anything not declared (Phase 3)

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

### Why Sigstore for Signing?

Sigstore is the emerging standard for software signing (npm is migrating to it). Benefits:
- Keyless signing via GitHub OIDC — publishers don't manage keys
- Transparency log (Rekor) provides public audit trail
- Same tooling developers already use for container signing

### Why Semgrep for Static Analysis?

Semgrep supports custom rule authoring, runs fast, and has a large community. We'll write agent-specific rules that detect:
- Obfuscated code patterns
- Undeclared network calls
- Credential access patterns
- Suspicious file system operations
- Hidden subprocess spawning

### Lockfile Format

The lockfile is JSON (not YAML) for:
- Deterministic serialization (JSON.stringify with sorted keys)
- Easy machine parsing
- Diffability in version control
- Familiarity (same as package-lock.json)

---

## Open Technical Questions

1. **CLI language**: Node.js vs Rust? Node is faster to ship, Rust is faster to run.
2. **Monorepo structure**: Should CLI, registry API, and shared types live in one repo?
3. **Self-hosting**: Should the registry be easy to self-host from day one (like Verdaccio)?
4. **WASM sandbox specifics**: Wasmtime? WasmEdge? What's the capability brokering interface?
5. **Search**: Start with PostgreSQL full-text search or invest in vector search early?

---

## Further Reading

- [Product Brief](product-brief.md) — full feature description and positioning
- [Roadmap](roadmap.md) — phased timeline
