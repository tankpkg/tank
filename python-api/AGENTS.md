# PYTHON-API — Security Scanner

## OVERVIEW

6-stage security analysis pipeline for skill packages. FastAPI + Pydantic 2. Deployed standalone (Vercel) and mirrored in `apps/web/api-python/`. This is the core security engine that prevents malicious skills from entering the registry.

## STRUCTURE

```
python-api/
├── api/analyze/                  # FastAPI endpoints
│   ├── index.py                  # Health / root endpoint
│   ├── scan.py                   # POST /analyze/scan — full 6-stage pipeline
│   ├── rescan.py                 # POST /analyze/rescan — re-run on existing skill
│   ├── security.py               # POST /analyze/security — security-only analysis
│   ├── permissions.py            # POST /analyze/permissions — permission extraction
│   ├── _lib.py                   # Shared endpoint utilities
│   └── tests/                    # Endpoint tests
├── lib/scan/                     # Pipeline stages (13 files)
│   ├── __init__.py               # Package init
│   ├── stage0_ingest.py          # Download + extract tarball, compute hashes
│   ├── stage1_structure.py       # Validate file structure, detect anomalies
│   ├── stage2_static.py          # Static code analysis (AST, pattern matching)
│   ├── stage3_injection.py       # Prompt injection detection
│   ├── stage4_secrets.py         # Secret/credential scanning
│   ├── stage5_supply.py          # Supply chain risk analysis
│   ├── models.py                 # ScanVerdict, Finding, StageResult, ScanRequest/Response
│   ├── verdict.py                # Verdict computation rules
│   ├── permission_extractor.py   # Extract declared permissions from code
│   ├── sarif.py                  # SARIF output format generation
│   ├── dedup.py                  # Deduplicate findings
│   └── cisco_scanner.py          # Cisco security integration
├── lib/patterns/                 # Detection patterns (extensible)
├── lib/rules/                    # Analysis rules (extensible)
├── tests/                        # pytest tests (16 tests)
│   ├── test_skills/
│   │   ├── benign/               # Safe skill fixtures
│   │   └── malicious/            # Malicious skill fixtures for testing
│   └── test_*.py                 # Test modules
├── requirements.txt              # Python dependencies
├── pyproject.toml                # Project config
├── Dockerfile                    # Container for on-prem deployment
└── vercel.json                   # Standalone Vercel deployment
```

## PIPELINE STAGES

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   stage0    │───▶│   stage1    │───▶│   stage2    │───▶│   stage3    │───▶│   stage4    │───▶│   stage5    │
│   INGEST    │    │  STRUCTURE  │    │   STATIC    │    │  INJECTION  │    │   SECRETS   │    │   SUPPLY    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

| Stage | File | Lines | Purpose |
|-------|------|-------|---------|
| 0 | `stage0_ingest.py` | ~200 | Download tarball, extract, compute SHA-256 hashes |
| 1 | `stage1_structure.py` | ~300 | Validate file structure, detect anomalies |
| 2 | `stage2_static.py` | ~550 | AST analysis, dangerous functions, obfuscation |
| 3 | `stage3_injection.py` | ~350 | Prompt injection, system prompt extraction |
| 4 | `stage4_secrets.py` | ~250 | API keys, credentials, private keys |
| 5 | `stage5_supply.py` | ~544 | Dependencies, typosquatting, known vulnerabilities |

## VERDICT RULES

| Condition | Verdict | Meaning |
|-----------|---------|---------|
| 1+ critical findings | `FAIL` | Cannot publish |
| 4+ high findings | `FAIL` | Cannot publish |
| 1–3 high findings | `FLAGGED` | Requires manual review |
| Any medium/low only | `PASS_WITH_NOTES` | Publishes with warnings |
| No findings | `PASS` | Clean |

## DATA MODELS

```python
class Finding(BaseModel):
    id: str                    # Unique identifier
    stage: int                 # Stage number (0-5)
    severity: FindingSeverity  # critical/high/medium/low
    confidence: float          # 0.0 to 1.0
    message: str               # Human-readable description
    file: str | None           # File path if applicable
    line: int | None           # Line number if applicable
    code_snippet: str | None   # Relevant code snippet
    cwe: str | None            # CWE identifier
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add security check | `lib/scan/stage{N}*.py` | Pick appropriate stage |
| Add new stage | `lib/scan/stage{N}_name.py` | Wire into `scan.py` pipeline |
| Add detection pattern | `lib/patterns/` | Extensible pattern library |
| Modify verdict logic | `lib/scan/verdict.py` | Threshold-based rules |
| Add/modify data models | `lib/scan/models.py` | Pydantic 2 models |
| Add API endpoint | `api/analyze/new.py` | FastAPI route handler |
| Add test fixture | `tests/test_skills/` | benign/ or malicious/ |

## CONVENTIONS

> Universal conventions (strict TS, ESM, Zod safeParse) in root AGENTS.md. Python-specific below.

- **Findings carry confidence** — 0.0 to 1.0 float
- **SARIF output** supported for CI integration
- **Finding deduplication** in `dedup.py`

## ANTI-PATTERNS

> Universal anti-patterns (sync with api-python, stage0 required, no silent errors) in root AGENTS.md.

- **Never hardcode detection patterns** — use `lib/patterns/` and `lib/rules/`
- **Never skip confidence scoring** — all findings must have confidence value

## TESTING

```bash
cd python-api && pytest                   # All Python tests
pytest tests/test_stage2.py               # Specific test
pytest --cov=lib/scan                     # With coverage
pytest tests/ -k "malicious"              # Test specific fixture
```

## SYNC WITH WEB APP

**CRITICAL**: Any changes to `python-api/` must be mirrored to `apps/web/api-python/`:

```bash
cp -r python-api/lib/scan/* apps/web/api-python/analyze/scan/
cp -r python-api/api/analyze/* apps/web/api-python/analyze/
```

## API ENDPOINTS

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check |
| `/analyze/scan` | POST | Full 6-stage pipeline |
| `/analyze/rescan` | POST | Re-run on existing skill |
| `/analyze/security` | POST | Security-only (stages 2-4) |
| `/analyze/permissions` | POST | Extract permissions |
