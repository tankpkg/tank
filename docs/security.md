# Security Model

Tank's security architecture. For scanner API details see [scanner-reference.md](scanner-reference.md). For the full ClawHavoc writeup see [product-brief.md](product-brief.md).

## Why This Exists

In February 2026, **341 malicious skills (12% of ClawHub's marketplace)** distributed Atomic Stealer malware — stealing credentials, API keys, SSH keys, and crypto wallets. Root cause: unmoderated publishing, no permission boundaries, no sandboxing. Agent skills are more dangerous than traditional packages because they execute with the **agent's full authority** — reading files, making API calls, running shell commands.

## Permission Model (5 Layers)

| Layer | Where | What |
|-------|-------|------|
| 1. Declaration | `SKILL.json` manifest | Skill declares what it needs |
| 2. Budget | `skills.json` project file | Project declares what it allows |
| 3. Install-time | CLI `tank install` | Blocks skills exceeding project budget |
| 4. Scan-time | 6-stage scanner | Extracts actual permissions from code, flags mismatches with declared |
| 5. Runtime | WASM sandbox (planned Phase 3) | Blocks anything not declared at execution time |

Layers 1-4 are implemented. Layer 5 is planned.

## Permission Types

| Permission | Scope |
|-----------|-------|
| `network:outbound` | Make HTTP/HTTPS requests |
| `network:inbound` | Listen on ports |
| `filesystem:read` | Read files (with glob patterns) |
| `filesystem:write` | Write files (with glob patterns) |
| `subprocess` | Spawn child processes |
| `secrets` | Access environment variables / secret store |

## Permission Escalation Rules

Prevents silent permission creep across version bumps:

- **PATCH** bumps with ANY new permissions → **rejected**
- **MINOR** bumps with dangerous permissions (network, subprocess) → **rejected**
- **MAJOR** bumps → allow any permission changes

Implemented in `lib/permission-escalation.ts`.

## Scanner Pipeline (6 Stages)

| Stage | Purpose |
|-------|---------|
| 0 — Ingest | Download tarball, extract, compute SHA-256 hashes |
| 1 — Structure | Validate file structure, detect anomalies |
| 2 — Static | AST analysis, dangerous functions, obfuscation detection |
| 3 — Injection | Prompt injection detection, system prompt extraction |
| 4 — Secrets | API keys, credentials, private keys |
| 5 — Supply Chain | Dependencies, typosquatting, known vulnerabilities (OSV) |

Stage 0 is mandatory — all others depend on it. Each subsequent stage is independent and can error without blocking others.

## Verdict Rules

| Condition | Verdict | Effect |
|-----------|---------|--------|
| 1+ critical findings | `FAIL` | Cannot publish |
| 4+ high findings | `FAIL` | Cannot publish |
| 1-3 high findings | `FLAGGED` | Requires manual review |
| Medium/low only | `PASS_WITH_NOTES` | Publishes with warnings |
| No findings | `PASS` | Clean |

## Audit Score

Every published skill receives a score from 0 to 10 (8 checks):

| Check | Points | Criteria |
|-------|--------|----------|
| SKILL.md present | 1 | Manifest file exists |
| Description present | 1 | Non-empty description |
| Permissions declared | 1 | Explicit capability list |
| No security issues | 2 | Clean scan result |
| Permission match | 2 | Declared matches actual (scanner cross-check) |
| File count reasonable | 1 | Under 100 files |
| README documentation | 1 | README exists |
| Package size reasonable | 1 | Under 5 MB |

## Tarball Extraction Security

During install, CLI enforces:
- Reject **symlinks** and **hardlinks** — prevent path escape
- Reject **path traversal** (`../`) — prevent writing outside target
- Reject **absolute paths** — prevent arbitrary filesystem writes
- Enforce **1000 file limit** and **50MB size limit** — prevent resource exhaustion
- Verify **SHA-512 integrity hash** — prevent tampered packages
