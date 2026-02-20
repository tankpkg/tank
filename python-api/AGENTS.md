# PYTHON-API — Security Scanner

## OVERVIEW

6-stage security analysis pipeline for skill packages. FastAPI + Pydantic 2. Deployed standalone (Vercel) and mirrored in `apps/web/api-python/`.

## STRUCTURE

```
python-api/
├── api/analyze/                  # FastAPI endpoints
│   ├── index.py                  # Health / root
│   ├── scan.py                   # POST /analyze/scan — full pipeline
│   ├── rescan.py                 # POST /analyze/rescan
│   ├── security.py               # Security-specific analysis
│   ├── permissions.py            # Permission validation
│   └── _lib.py                   # Shared endpoint utilities
├── lib/scan/                     # Pipeline stages
│   ├── stage0_ingest.py          # Download + extract tarball, compute hashes
│   ├── stage1_structure.py       # Validate file structure, detect anomalies
│   ├── stage2_static.py          # Static code analysis (bandit, AST)
│   ├── stage3_injection.py       # Prompt injection detection
│   ├── stage4_secrets.py         # Secret/credential scanning (detect-secrets)
│   ├── stage5_supply.py          # Supply chain risk analysis (pip-audit)
│   ├── models.py                 # ScanVerdict, Finding, StageResult, ScanRequest/Response
│   └── verdict.py                # Verdict computation rules
├── lib/patterns/                 # Detection patterns (extensible)
├── lib/rules/                    # Analysis rules (extensible)
├── tests/                        # pytest tests (16 tests)
├── requirements.txt              # Python dependencies
└── vercel.json                   # Standalone Vercel deployment
```

## PIPELINE

```
stage0 (ingest) → stage1 (structure) → stage2 (static) → stage3 (injection) → stage4 (secrets) → stage5 (supply)
```

Each stage returns `StageResult` with findings (severity: critical/high/medium/low) and status (passed/failed/errored/skipped).

## VERDICT RULES

| Condition | Verdict |
|-----------|---------|
| 1+ critical findings | `FAIL` |
| 4+ high findings | `FAIL` |
| 1–3 high findings | `FLAGGED` |
| Any medium/low only | `PASS_WITH_NOTES` |
| No findings | `PASS` |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add security check | `lib/scan/stage{N}*.py` | Pick appropriate stage |
| Add new stage | `lib/scan/stage{N}_name.py` | Wire into scan.py pipeline |
| Add detection pattern | `lib/patterns/` | Extensible pattern library |
| Modify verdict logic | `lib/scan/verdict.py` | Threshold-based rules |
| Add/modify data models | `lib/scan/models.py` | Pydantic 2 models |
| Add API endpoint | `api/analyze/new.py` | FastAPI route handler |

## CONVENTIONS

- **Pydantic 2** for all models — strict validation
- **pytest** for testing — `test_*.py` pattern
- **Each stage is independent** — can skip or error without blocking others
- **Findings carry confidence** — 0.0 to 1.0 float
- **SHA-256 file hashes** computed in stage0, returned in response

## ANTI-PATTERNS

- **Never modify without syncing to `apps/web/api-python/`** — both locations must match
- **Never skip stage0 (ingest)** — all other stages depend on its output
- **Never swallow stage errors silently** — use `errored` status, not empty results
- **Never hardcode detection patterns** — use `lib/patterns/` and `lib/rules/`
