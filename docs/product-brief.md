# Tank — Product Brief

> Security-first package manager and registry for AI agent skills.

## What Are Agent Skills?

AI coding agents (Claude Code, OpenAI Codex, Cursor, etc.) can be extended with "skills" — reusable packages that teach agents how to perform specific tasks. A skill is typically a folder with a `SKILL.md` file containing instructions, plus optional scripts and templates. Think of it like plugins, but for AI agents.

Examples: "how to create a Next.js component following our conventions", "how to write and run database migrations", "how to deploy to our staging environment".

Anthropic released the SKILL.md format as an open standard in December 2025, and OpenAI adopted the same format for Codex. The ecosystem is growing fast — Vercel's skills.sh registry hit 110,000+ installs within 4 days of launching in January 2026.

## The Problem

The current ecosystem is where npm was in 2012 — before lockfiles, before security audits, before code signing. Today's skill registries (skills.sh, ClawHub, SkillsMP, skillsdirectory.com) are essentially GitHub link aggregators. They offer:

- **No versioning enforcement** — skills change without notice, breaking your setup
- **No lockfiles** — no way to guarantee reproducible installs across machines or CI
- **No permission model** — a skill that claims to "format markdown" could silently make network requests or read your filesystem
- **No code signing** — no way to verify a skill actually comes from who it claims to
- **No audit trail** — no visibility into what changed between versions
- **No dependency management** — no way to declare or resolve skill dependencies

### The ClawHavoc Incident

In February 2026, **341 malicious skills (12% of ClawHub's marketplace)** were distributing Atomic Stealer malware — stealing credentials, API keys, SSH keys, and crypto wallets. Skills masqueraded as benign utilities while running obfuscated payloads in the background.

Root cause: unmoderated publishing, no permission boundaries, no sandboxing, and a trust model that assumes skill content is safe documentation rather than executable software.

### Why This Is Worse Than npm/PyPI

Agent skills are **more dangerous** than traditional packages because they execute with the **agent's authority**. A malicious npm package runs inside your app's sandbox. A malicious agent skill runs with the agent's full permissions — reading any file on your machine, making API calls with your credentials, executing arbitrary shell commands.

The attack surface is fundamentally larger, and the consequences are more severe.

## What We're Building

A **security-first package manager and registry for AI agent skills**. The npm/PyPI equivalent for the agent skills ecosystem, with security built into the foundation rather than bolted on years later.

Compatible with the existing **SKILL.md open standard** — we're not replacing the format, we're wrapping it with the infrastructure layer it's missing.

---

## Core Features

### 1. skills.json — The Manifest

A project-level file where teams declare which skills they use, at which versions, with which permissions.

```json
{
  "name": "@myorg/my-agent-project",
  "version": "1.0.0",
  "skills": {
    "@vercel/next-skill": "^2.1.0",
    "@solara/content-gen": "~1.3.0",
    "@community/seo-audit": "3.0.0"
  },
  "permissions": {
    "network": {
      "outbound": ["*.anthropic.com", "*.openai.com"]
    },
    "filesystem": {
      "read": ["./src/**", "./docs/**"],
      "write": ["./output/**"]
    },
    "subprocess": false
  },
  "audit": {
    "min_score": 7,
    "require_signing": true
  }
}
```

Key concepts:

- **Permission budget**: the project declares a ceiling for what skills are allowed to do. If any installed skill exceeds this budget, installation fails.
- **Audit threshold**: minimum audit score (0-10). Skills below the threshold cannot be installed.
- **Semver ranges**: standard `^` (compatible) and `~` (patch-only) version constraints.

### 2. skills.lock — The Lockfile

Auto-generated file that pins exact versions of every skill and transitive dependency, with integrity hashes and signature verification.

```json
{
  "lockfileVersion": 1,
  "skills": {
    "@vercel/next-skill@2.1.3": {
      "resolved": "https://registry.tankpkg.dev/@vercel/next-skill/2.1.3",
      "integrity": "sha512-abc123...",
      "signature": "sigstore://cosign/def456...",
      "audit_score": 9,
      "permissions": {
        "filesystem": { "read": ["./src/**"] },
        "network": false,
        "subprocess": false
      },
      "dependencies": {
        "@core/markdown-parser": "1.0.2"
      }
    }
  },
  "resolved_permissions": {
    "network": { "outbound": ["*.anthropic.com"] },
    "filesystem": { "read": ["./src/**", "./docs/**"], "write": ["./output/**"] }
  },
  "permission_budget_check": "pass"
}
```

- **Deterministic installs**: every machine gets exactly the same skills with the same hashes
- **Resolved permissions**: the union of all installed skill permissions, visible at a glance
- **Integrity verification**: if content doesn't match its hash, installation fails

### 3. Enforced Semantic Versioning

Unlike npm/PyPI where semver is a social contract, Tank **enforces it** by analyzing what actually changed:

| Change Type | Required Bump | Detection |
|-------------|--------------|-----------|
| Bug fix, no schema/permission change | PATCH | Schema diff + permission diff |
| New feature, backward-compatible | MINOR | Schema diff |
| New non-dangerous permission | MINOR | Permission diff |
| Breaking schema change | MAJOR | Schema diff |
| New dangerous permission (network, subprocess) | MAJOR | Permission diff |

If a publisher tries to release a PATCH that adds network access, the publish is **rejected**.

### 4. Security Layers

Security at four stages:

**Publish-time:**
- Mandatory code signing (Sigstore/cosign)
- Static analysis with agent-specific rules
- Capability declaration validation
- SBOM generation
- No arbitrary install scripts

**Review & audit (ongoing):**
- Automated audit score (0-10)
- Verified publisher program
- Permission escalation detection between versions
- Dependency vulnerability scanning

**Install-time:**
- Lockfile integrity verification
- Interactive permission prompt for budget-exceeding capabilities
- Dependency tree resolution with conflict detection

**Runtime:**
- Sandboxed execution (WASM or container isolation)
- Capability broker enforcing declared permissions
- Rate limiting per skill
- Full audit log
- Anomaly detection

### 5. Permission Model

Every skill declares what it needs. The system enforces it at runtime:

```yaml
capabilities:
  - network:outbound
  - filesystem:read

permissions:
  network:
    allowed_domains: ["*.example.com"]
    max_requests_per_minute: 60
  filesystem:
    read: ["./data/**"]
    write: []
  subprocess: false
  secrets:
    required: ["API_KEY"]
```

### 6. Audit Score

Transparent 0-10 score for every skill:

| Check | Points |
|-------|--------|
| Code signing present | +1 |
| Static analysis passes | +1 |
| No install scripts | +1 |
| Reproducible build | +1 |
| SBOM complete | +1 |
| Test coverage > 80% | +1 |
| Community security reviews (max 2) | +1 each |
| Verified publisher | +1 |
| No known vulnerabilities | +1 |

### 7. CLI

```bash
# Install & manage
tank install @org/skill-name
tank install                          # from skills.lock (CI-safe)
tank update @org/skill-name
tank remove @org/skill-name

# Security & audit
tank audit
tank audit @org/skill-name
tank permissions
tank verify
tank diff @org/skill-name 2.0 3.0

# Publishing
tank publish
tank publish --dry-run

# Discovery
tank search "web scraping"
tank info @org/skill-name
```

### 8. Registry API

```
POST   /v1/skills                          # publish
GET    /v1/skills/:name                    # latest metadata
GET    /v1/skills/:name/:version           # specific version
GET    /v1/skills/:name/audit              # audit history
GET    /v1/skills/:name/deps               # dependency tree
GET    /v1/skills/:name/diff/:v1/:v2       # permission + schema diff
GET    /v1/search?q=...                    # semantic search
POST   /v1/skills/:name/review             # submit security review
POST   /v1/verify                          # batch verify signatures
```

---

## What We're NOT Building

- **Not an agent framework** — we don't define how agents work
- **Not a skill authoring tool** — we use the existing SKILL.md standard
- **Not a runtime/orchestrator** — we provide the sandbox spec; agent runtimes integrate via SDK
- **Not locked to one agent** — works with Claude Code, Codex, Cursor, or any SKILL.md-compatible agent

## Competitive Landscape

| | skills.sh | ClawHub | SkillsMP | **Tank** |
|-|-----------|---------|----------|----------|
| Discovery | Yes | Yes | Yes | Yes |
| Versioning | Git tags | None | None | Enforced semver |
| Lockfile | No | No | No | Yes |
| Permissions | No | No | No | Declared + enforced |
| Code signing | No | No | No | Mandatory |
| Static analysis | No | Basic | No | Agent-specific |
| Audit score | No | No | No | Transparent 0-10 |
| SBOM | No | No | No | Required |
| Sandbox | No | No | No | WASM/container |
| Install scripts | Allowed | Allowed | N/A | Forbidden |

## Target Users

1. **Development teams using AI agents** — need confidence that installed skills are safe and stable
2. **Skill authors/publishers** — need a distribution channel with trust signals
3. **Enterprise security teams** — need governance over agent capabilities with audit trails
4. **Open-source community** — needs shared infrastructure raising the security bar

## Success Metrics

- Skills published to the registry
- Installs via CLI
- Verified publishers
- Percentage of skills with audit score >= 7
- **Zero successful supply chain attacks** (north star)
- Integrations with agent frameworks (Claude Code, Codex, etc.)

## Technical Direction

- **Registry API**: Node.js (NestJS or Hono)
- **Package storage**: OCI-compatible registry
- **Metadata storage**: PostgreSQL
- **Semantic search**: Vector database (Milvus or similar)
- **Code signing**: Sigstore (cosign)
- **Static analysis**: Semgrep with custom agent-specific rulesets
- **Sandbox runtime**: WASM (Wasmtime) with Firecracker micro-VM option
- **CLI**: Node.js or Rust (TBD)

## Open Questions

1. **Private registries**: Support from day one (like npm private packages)?
2. **Monetization**: Open-source core + paid enterprise features? Or fully open-source with hosted SaaS?
3. **MVP scope**: Registry + CLI + basic audit, without sandbox runtime?
4. **Governance**: How to handle skill disputes, takedowns, and namespace squatting?
