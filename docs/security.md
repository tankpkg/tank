# Security Model

Implemented security layers, scan stages, and verdict rules for Tank.

## Why Tank Exists

ClawHavoc matters because agent skills run with the agent's authority: files, network, and subprocesses. Tank treats skill packages like software supply chain inputs, not harmless documentation.

## Permission Model

Permissions are declared in `skills.json` and validated with shared Zod schemas.

Current permission types:

- `network.outbound`
- `filesystem.read`
- `filesystem.write`
- `subprocess`

Enforcement layers in the current repo:

1. publish-time manifest validation
2. install/update permission budget enforcement in the CLI
3. scanner cross-check between declared permissions and observed behavior

Planned, not implemented here:

- runtime sandbox enforcement

## Permission Escalation

Publish-time escalation checks live in `apps/registry-legacy/lib/permission-escalation.ts` (and `packages/internals-helpers/src/permission-escalation.ts`).

- PATCH bump: reject any new permissions
- MINOR bump: reject dangerous additions (`network.outbound`, `subprocess`)
- MAJOR bump: allow permission changes

## Scanner Pipeline

Stage map:

- `0 → safe ingest, extraction, SHA-256 file hashing`
- `1 → structure validation`
- `2 → static analysis and permission cross-check`
- `3 → prompt injection detection`
- `4 → secret scanning`
- `5 → dependency and supply-chain checks`

Stage 0 is mandatory. Other stages may error independently and still produce a final verdict.

## Verdict Rules

Verdict computation is implemented in the scanner.

Verdict map:

- `1+ critical findings → fail`
- `4+ high findings → fail`
- `1-3 high findings → flagged`
- `medium/low only → pass_with_notes`
- `no findings → pass`

## Install-Time Safety Checks

CLI extraction rejects:

- symlinks
- hardlinks
- path traversal
- absolute paths
- tarballs above size limits
- archives above file-count limits

CLI also verifies SHA-512 integrity against the registry metadata before install completes.

## Storage And Database

- PostgreSQL stores metadata, audit data, and scan results
- Supabase or S3-compatible storage stores tarballs
- scanner writes findings back to PostgreSQL

## Review Heuristics

Higher-risk changes in this repo usually touch one or more of:

- permission schemas
- install extraction logic
- auth helpers or API key validation
- scanner stage implementations
- admin moderation paths
