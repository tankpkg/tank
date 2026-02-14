# Security Scanning System — Quickstart (TL;DR)

## What

Replace the LLM-based security analysis with a deterministic 6-stage static scanner that produces PASS/FAIL/FLAGGED verdicts for every published skill.

## Why

Current system: metadata checks only, LLM analysis never integrated (`analysisResults: null`), LLM susceptible to the very attacks it detects.

## Key Decision: No ML Models

The original plan's ML classifiers (torch, transformers, DeBERTa, Prompt-Guard) are **2GB+ combined** and blow past Vercel's 250MB limit. Stage 3 (prompt injection) uses regex patterns + heuristic scoring instead. This is a deliberate tradeoff: slightly less sophisticated detection, but deterministic, fast, and actually deployable.

## Architecture in 30 Seconds

```
tank publish → confirm endpoint (TS) → POST /api/analyze/scan (Python)
                                              ↓
                                        Stage 0: Extract + hash
                                        Stage 1: Structure + Unicode
                                        Stage 2: Bandit + AST analysis
                                        Stage 3: Prompt injection regex
                                        Stage 4: detect-secrets
                                        Stage 5: pip-audit + OSV API
                                              ↓
                                        Verdict → DB → CLI audit display
```

## Files to Touch

| Area | Key Files |
|------|-----------|
| Python pipeline | `api-python/analyze/scan.py` + `scan/*.py` (new) |
| DB schema | `lib/db/schema.ts` (add scan_results + scan_findings) |
| Publish flow | `api/v1/skills/confirm/route.ts` (trigger scan) |
| API response | `api/v1/skills/[name]/[version]/route.ts` (return verdict) |
| Shared types | `packages/shared/src/types/api.ts` |
| CLI | `apps/cli/src/commands/audit.ts` (display verdict) |
| Dependencies | `requirements.txt` (add bandit, detect-secrets, pip-audit, psycopg) |

## Python Deps (stay under 250MB)

```
bandit, detect-secrets, pip-audit, psycopg[binary], charset-normalizer, python-magic
```
Estimated: ~80-100MB total. Safe margin under 250MB.

## Verdict Rules

- Any critical → FAIL
- >3 high → FAIL
- Any high (<=3) → FLAGGED
- Only medium/low → PASS WITH NOTES
- Nothing → PASS

## Implementation Order

1. DB tables + Pydantic models
2. Stage 0 (extraction) — everything depends on this
3. Stages 1-5 (can parallelize)
4. Verdict + orchestrator
5. TS integration (confirm endpoint, version endpoint, CLI)
6. Cron re-scan + vercel.json

## Gotchas

- `python-magic` needs `libmagic` — may not be on Vercel runtime, have extension-based fallback
- Semgrep is a Rust binary — can't install on Vercel, using Bandit + custom AST instead
- OSV-Scanner is a Go binary — using OSV.dev REST API directly instead
- Vercel Cron has 60s limit — rescan processes max 5 skills per invocation
- Python functions are stateless — extract to `/tmp`, cleanup after
