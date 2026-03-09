# Scanner Reference

6-stage security analysis pipeline for skill packages. Built with FastAPI and Pydantic 2. This is the core security engine that prevents malicious skills from entering the registry. Deployed standalone and mirrored in the web app's `api-python/` directory for Vercel serverless.

## Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   stage0    │───>│   stage1    │───>│   stage2    │───>│   stage3    │───>│   stage4    │───>│   stage5    │
│   INGEST    │    │  STRUCTURE  │    │   STATIC    │    │  INJECTION  │    │   SECRETS   │    │   SUPPLY    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

| Stage | File                  | Purpose                                            |
| ----- | --------------------- | -------------------------------------------------- |
| 0     | `stage0_ingest.py`    | Download tarball, extract, compute SHA-256 hashes  |
| 1     | `stage1_structure.py` | Validate file structure, detect anomalies          |
| 2     | `stage2_static.py`    | AST analysis, dangerous functions, obfuscation     |
| 3     | `stage3_injection.py` | Prompt injection detection, system prompt extraction |
| 4     | `stage4_secrets.py`   | API keys, credentials, private keys                |
| 5     | `stage5_supply.py`    | Dependencies, typosquatting, known vulnerabilities |

Stage 0 (ingest) is mandatory -- all subsequent stages depend on its output. Each stage beyond stage 0 is independent and can error without blocking others. Errored stages report `errored` status rather than silently returning empty results.

## Verdict Rules

Verdicts are computed in `lib/scan/verdict.py` based on the aggregate findings across all stages:

| Condition            | Verdict           | Meaning                 |
| -------------------- | ----------------- | ----------------------- |
| 1+ critical findings | `FAIL`            | Cannot publish          |
| 4+ high findings     | `FAIL`            | Cannot publish          |
| 1-3 high findings    | `FLAGGED`         | Requires manual review  |
| Any medium/low only  | `PASS_WITH_NOTES` | Publishes with warnings |
| No findings          | `PASS`            | Clean                   |

## Finding Data Model

All findings use this Pydantic 2 model from `lib/scan/models.py`:

```python
class Finding(BaseModel):
    id: str                    # Unique identifier
    stage: int                 # Stage number (0-5)
    severity: FindingSeverity  # critical / high / medium / low
    confidence: float          # 0.0 to 1.0
    message: str               # Human-readable description
    file: str | None           # File path if applicable
    line: int | None           # Line number if applicable
    code_snippet: str | None   # Relevant code snippet
    cwe: str | None            # CWE identifier
```

Every finding must carry a confidence score (0.0 to 1.0). Duplicate findings across stages are removed by `lib/scan/dedup.py`. SARIF output is supported via `lib/scan/sarif.py` for CI integration.

## Scanner API Endpoints

| Endpoint               | Method | Purpose                                  |
| ---------------------- | ------ | ---------------------------------------- |
| `/`                    | GET    | Health check                             |
| `/analyze/scan`        | POST   | Full 6-stage pipeline                    |
| `/analyze/rescan`      | POST   | Re-run on existing skill                 |
| `/analyze/security`    | POST   | Security-only analysis (stages 2-4)      |
| `/analyze/permissions` | POST   | Permission extraction from skill code    |

## Extensibility

- Detection patterns live in `lib/patterns/` -- add new pattern files without modifying stages
- Analysis rules live in `lib/rules/` -- extensible rule library
- Test fixtures in `tests/test_skills/` -- `benign/` for safe skills, `malicious/` for attack scenarios

## Sync Requirement

Any changes to the scanner must be mirrored to `apps/web/api-python/` for the Vercel serverless deployment. Both locations must stay in sync.
