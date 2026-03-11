# Scanner API Module

## Anchor

**Why this module exists:** The Python security scanner exposes a FastAPI HTTP server that the Next.js web app calls at publish-confirm time. The scanner API is the integration boundary between the TypeScript registry and the Python analysis pipeline. It must accept a tarball URL, run all 6 analysis stages, and return a structured verdict.

**Consumers:** `POST /api/v1/skills/confirm` calls `POST /api/analyze/scan`. Admin rescan calls `POST /api/analyze/rescan`.

**Single source of truth:** `packages/scanner/api/analyze/scan.py`, `packages/scanner/api/analyze/rescan.py`, `packages/scanner/api/analyze/permissions.py`.

---

## Layer 1: Structure

```
packages/scanner/api/analyze/scan.py          # POST /api/analyze/scan — full 6-stage pipeline
packages/scanner/api/analyze/permissions.py   # POST /api/analyze/permissions — permissions extraction only
packages/scanner/api/analyze/rescan.py        # POST /api/analyze/rescan — rescan by versionId
packages/scanner/lib/scan/                    # 6 stage implementations
```

---

## Layer 2: Constraints

| #   | Rule                                                                                  | Rationale                                            | Verified by  |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| C1  | `POST /api/analyze/scan` accepts `{ tarball_url, version_id, manifest, permissions }` | All data needed for a full scan                      | BDD scenario |
| C2  | Returns `{ verdict, findings, stage_results, duration_ms, file_hashes }`              | Callers need structured results to store and display | BDD scenario |
| C3  | `verdict` is one of: `pass`, `pass_with_notes`, `flagged`, `fail`                     | Four-tier verdict for different risk levels          | BDD scenario |
| C4  | `GET /health` returns 200 with `{ status: "healthy" }` when scanner is up               | Used by `GET /api/health` dependency check           | BDD scenario |
| C5  | Malformed request body → 422 (FastAPI validation)                                     | Scanner must reject bad inputs explicitly            | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                           | Expected                                                 |
| --- | ----------------------------------------------- | -------------------------------------------------------- |
| E1  | `GET /health`                                   | 200: `{ status: "healthy" }`                             |
| E2  | `POST /api/analyze/scan` with valid tarball URL | 200: `{ verdict, findings, stage_results, duration_ms }` |
| E3  | `POST /api/analyze/scan` missing `tarball_url`  | 422                                                      |
| E4  | `verdict: "pass"` for a clean skill             | No findings with severity critical/high                  |
| E5  | `POST /api/analyze/permissions`                 | 200: extracted permissions structure                     |
