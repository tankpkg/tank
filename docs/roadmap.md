# Tank — Roadmap

> Phased timeline for building a security-first package manager for AI agent skills.

## Overview

Tank is built in **four phases**, each delivering a usable milestone. We ship the smallest useful thing first, then layer on security depth.

```
Phase 0 ──── Phase 1 ──────── Phase 2 ──────── Phase 3 ────────
Foundation   Core Registry     Security Layer   Runtime Safety
(now)        (MVP)             (Trust)          (Enforcement)

Docs, spec,  Install, publish, Code signing,    Sandbox, broker,
project      lockfile, semver  audit scoring,   anomaly detection
scaffold                       static analysis
```

---

## Phase 0 — Foundation (Current)

**Goal**: Define the project, build in the open, attract early contributors.

**Duration**: 2-3 weeks

| Deliverable | Status |
|-------------|--------|
| Product brief | Done |
| Roadmap (this document) | Done |
| README with positioning | Done |
| OSS scaffolding (license, contributing, templates) | Done |
| Architecture doc (technical design) | In progress |
| `skills.json` spec (JSON Schema) | Not started |
| `skills.lock` spec (JSON Schema) | Not started |
| Permission model spec | Not started |
| CLI command design (help text, flags, UX) | Not started |

**Exit criteria**: Someone can read the docs and understand exactly what Tank is, how it works, and how to contribute.

---

## Phase 1 — Core Registry (MVP)

**Goal**: A working package manager that people can actually use. Install, publish, lock, resolve.

**Duration**: 6-8 weeks

### 1.1 — CLI Foundation

| Deliverable | Description |
|-------------|-------------|
| `tank init` | Create a `skills.json` in the current directory |
| `tank install <skill>` | Download a skill, add to `skills.json`, generate `skills.lock` |
| `tank install` | Install all skills from `skills.lock` (CI-safe, deterministic) |
| `tank remove <skill>` | Remove a skill and update lockfile |
| `tank update <skill>` | Update within semver range |
| `tank info <skill>` | Show metadata, version, description |
| `tank search <query>` | Search the registry |

### 1.2 — Registry API

| Deliverable | Description |
|-------------|-------------|
| `POST /v1/skills` | Publish a skill package |
| `GET /v1/skills/:name` | Get latest metadata |
| `GET /v1/skills/:name/:version` | Get specific version |
| `GET /v1/search?q=...` | Keyword search |
| Package storage | OCI-compatible blob storage |
| Metadata storage | PostgreSQL schema for skills, versions, publishers |

### 1.3 — Versioning & Lockfile

| Deliverable | Description |
|-------------|-------------|
| Semver parsing & resolution | Standard `^`, `~`, exact version constraints |
| `skills.lock` generation | Deterministic lockfile with integrity hashes |
| Lockfile verification | Hash check on `tank install` from lockfile |
| Dependency resolution | Resolve transitive skill dependencies |

### 1.4 — Permission Declaration

| Deliverable | Description |
|-------------|-------------|
| Permission schema | Define the permission model (network, filesystem, subprocess, secrets) |
| `skills.json` permission budget | Declare project-level permission ceiling |
| Budget violation detection | Block install if skill exceeds project budget |
| `tank permissions` | Display resolved permission summary |

**Exit criteria**: A developer can `tank install @someone/skill`, get a lockfile, commit it, and another developer can `tank install` to get the exact same setup. Permission violations block installation.

---

## Phase 2 — Security Layer (Trust)

**Goal**: Build the trust infrastructure. Signing, auditing, static analysis, verified publishers.

**Duration**: 8-10 weeks

### 2.1 — Code Signing

| Deliverable | Description |
|-------------|-------------|
| Sigstore integration | Sign packages with cosign at publish time |
| Signature verification | Verify signatures on install |
| `tank verify` | Manually verify all installed skill signatures |
| Keyless signing | Support GitHub OIDC identity (no key management for publishers) |

### 2.2 — Static Analysis

| Deliverable | Description |
|-------------|-------------|
| Semgrep integration | Run static analysis on publish |
| Agent-specific rulesets | Detect obfuscated payloads, hidden network calls, credential access |
| Capability validation | Verify actual behavior matches declared permissions |
| SBOM generation | Generate Software Bill of Materials for every published skill |

### 2.3 — Audit System

| Deliverable | Description |
|-------------|-------------|
| Audit scoring engine | Compute 0-10 score based on signing, analysis, tests, etc. |
| `tank audit` | Audit all installed skills |
| `tank audit <skill>` | Audit a specific skill |
| Audit history API | `GET /v1/skills/:name/audit` |
| `audit.min_score` enforcement | Block install of skills below threshold |

### 2.4 — Version Diff & Enforcement

| Deliverable | Description |
|-------------|-------------|
| `tank diff <skill> v1 v2` | Show permission + schema diff between versions |
| Enforced semver | Reject publishes where version bump doesn't match actual changes |
| Permission escalation alerts | Flag when a skill update adds dangerous permissions |
| Diff API | `GET /v1/skills/:name/diff/:v1/:v2` |

### 2.5 — Verified Publishers

| Deliverable | Description |
|-------------|-------------|
| Publisher identity verification | Verify GitHub org/user identity |
| Verified badge | Display on registry and in `tank info` |
| Namespace reservation | Prevent squatting on org-scoped names |

**Exit criteria**: Every published skill is signed, analyzed, and scored. Developers can see exactly what changed between versions and trust that skills come from who they claim to.

---

## Phase 3 — Runtime Safety (Enforcement)

**Goal**: Move from "trust but verify" to "verify and enforce". Sandboxed execution, real-time monitoring.

**Duration**: 10-12 weeks

### 3.1 — Sandbox Runtime

| Deliverable | Description |
|-------------|-------------|
| WASM sandbox (Wasmtime) | Lightweight isolation for skill execution |
| Capability broker | Proxy layer that enforces declared permissions at runtime |
| Permission boundary enforcement | Block undeclared network/filesystem/subprocess access |
| SDK for agent runtimes | Integration interface for Claude Code, Codex, etc. |

### 3.2 — Runtime Monitoring

| Deliverable | Description |
|-------------|-------------|
| Audit logging | Record every action taken by every skill |
| Rate limiting | Per-skill request/operation limits |
| Anomaly detection | Flag skills behaving differently from historical patterns |
| Dashboard | Web UI for monitoring skill activity |

### 3.3 — Firecracker Option

| Deliverable | Description |
|-------------|-------------|
| Firecracker micro-VM integration | Higher-isolation option for sensitive environments |
| Configuration toggle | Allow teams to choose isolation level per skill |

**Exit criteria**: Skills run in sandboxes with enforced permission boundaries. If a skill tries something it didn't declare, it's blocked in real-time.

---

## Future (Post v1.0)

Not planned in detail yet. Potential directions:

- **Private registries** — org-scoped private skill hosting
- **Vulnerability database** — CVE-equivalent for skill vulnerabilities
- **IDE integration** — VS Code / JetBrains extensions showing audit info inline
- **Policy-as-code** — enterprise teams defining custom installation policies
- **Community review program** — structured security review incentives
- **Governance framework** — dispute resolution, takedown process, namespace policy

---

## How to Contribute

Each phase has deliverables that can be picked up independently. See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to get involved.

The best way to help right now:
1. **Read the [product brief](product-brief.md)** and poke holes in the design
2. **Open issues** for anything unclear, missing, or wrong
3. **Join discussions** on design decisions in GitHub Discussions
