# Scanner Reference

Current Python scanner service, stage layout, and API surface used by the web app.

## Service Shape

Scanner lives in `packages/scanner`.

- FastAPI entrypoint: `api/main.py`
- stage implementations: `lib/scan/`
- models: `lib/scan/models.py`
- verdict logic: `lib/scan/verdict.py`

It is a standalone service reached over HTTP from the web app.

## Endpoints

Endpoint map:
- `GET / → service info`
- `GET /health → basic health`
- `GET /health/llm → LLM provider health`
- `POST /api/analyze/scan → full 6-stage scan`
- `POST /api/analyze/security → security-focused scan path`
- `POST /api/analyze/permissions → permission extraction path`
- `POST /api/analyze/rescan → rescan an existing package`

## Stages

Stage map:
- `0, stage0_ingest.py, required safe fetch/extract`
- `1, stage1_structure.py, structure validation`
- `2, stage2_static.py, Bandit + AST + regex + permission cross-check`
- `3, stage3_injection.py, regex heuristics + hidden content + optional external scanners/LLM`
- `4, stage4_secrets.py, detect-secrets + custom secret regex`
- `5, stage5_supply.py, dependency and vulnerability checks`

## Result Contract

Core Pydantic models:

- `Finding`
- `StageResult`
- `ScanRequest`
- `ScanResponse`
- `IngestResult`
- `LLMAnalysis`

Important shape details:

- stage identifiers are strings like `stage0`
- verdict values are lowercase: `pass`, `pass_with_notes`, `flagged`, `fail`
- stage status is one of `passed`, `failed`, `errored`, `skipped`

## Operational Notes

- scan results are stored in PostgreSQL when `DATABASE_URL` is set
- scanner can continue past later-stage failures
- stage 0 failure stops the pipeline because later stages need extracted files
