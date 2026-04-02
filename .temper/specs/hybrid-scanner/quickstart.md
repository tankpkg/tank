# QUICKSTART: Hybrid Dependency Scanner

## TLDR

1. New `dep_audit_results` table stores dependency health data (separate from scan_results)
2. `DepAuditService` fetches from npms.io + OSV.dev + npm audit API (all free, no auth)
3. Runs non-blocking after publish/rescan, Python scanner unchanged
4. Skill detail security tab gets Snyk-like card: tldr, scores, vuln table
5. Badge API extended with `?type=deps` for vuln count

## Key Decisions

- Separate table, not extending scan_results (no migration risk)
- Non-blocking: dep audit failure never blocks publish
- Python scanner untouched — runs in parallel, both results shown
- 3 free APIs, no paid services, no API keys needed

## Run Order

1. Schema + types → 2. Parser + clients (parallel) → 3. Report builder → 4. Service → 5. Publish/Rescan integration → 6. UI

## Validate

`just db push && just test registry && bun run tsc --noEmit`
