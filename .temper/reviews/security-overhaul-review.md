# Code Review: Security Scanning System Overhaul

**Date:** 2026-03-31
**Scope:** Python scanner intelligence overhaul + score removal + online scan service
**Diff:** ~630 lines changed, 19 modified files, 12 new files

---

## Critical (P0) — Must Fix Before Merge

### 1. ~~Dead code after `raise` in `scan_handler`~~ ✅ RESOLVED
**File:** `apps/python-api/api/analyze/scan.py`

Exception handler at lines 422-429 correctly raises `HTTPException` with no dead code following it. The dangling `ScanResponse(...)` constructor described in the original review no longer exists — the handler was refactored.

---

## High (P1) — Should Fix Before Merge

### 2. ~~Scanner auth bypass on misconfiguration~~ ✅ RESOLVED
**File:** `apps/python-api/api/main.py`

`scanner_auth_middleware` returns `JSONResponse(status_code=503, ...)` when `SCANNER_SERVICE_KEY` is empty. No request passthrough on misconfiguration.

### 3. ~~Auth key comparison not timing-safe~~ ✅ RESOLVED
**File:** `apps/python-api/api/main.py`, line 89

Uses `hmac.compare_digest(provided_key, expected_key)`.

### 4. ~~`remediation` and `cwe_id` not persisted to database~~ ✅ RESOLVED (Python path) + ✅ RESOLVED (Registry path)
**Files:** `apps/python-api/api/analyze/scan.py`, `apps/registry/src/lib/db/schema.ts`, `apps/registry/src/api/routes/v1/skills-confirm.ts`

Python scanner INSERT includes `remediation` and `cwe_id`. Drizzle schema now has `remediation text` and `cwe_id text` on `scan_findings`. Migration `0013_scan_schema_columns.sql` adds the columns. `skills-confirm.ts` now inserts both fields.

### 5. ~~Public scan endpoint doesn't forward `X-Scanner-Key`~~ ✅ RESOLVED
**File:** `apps/registry/src/api/routes/v1/scan.ts`, lines 56-58

Forwards `X-Scanner-Key` header when `SCANNER_SERVICE_KEY` env var is set.

### 6. ~~`id(f)` identity tracking is fragile~~ ✅ RESOLVED
**File:** `apps/python-api/lib/scan/stage3_injection.py`

`id(f)` tracking is gone — stage3 was refactored and no longer uses object identity for replacement tracking.

### 7. SSRF bypass via DNS rebinding [CONFIDENCE: 88%] — ACCEPTED
**File:** `apps/registry/src/lib/scan/url-validator.ts`

The current implementation uses an **allowlist** of known registry hosts (`npmjs.org`, `github.com`, `ghcr.io`, etc.) rather than a blocklist. This significantly reduces the DNS rebinding attack surface since attackers cannot register subdomains under those TLDs. Full DNS resolution at request time would add latency and introduce its own failure modes. Accepted as architectural trade-off for V1.

### 8. `infoCount` read from DB but never stored ✅ RESOLVED
**Files:** `apps/registry/src/lib/db/schema.ts`, `apps/registry/src/lib/skills/data.ts`, `apps/registry/src/api/routes/v1/skills-confirm.ts`

- Added `info_count integer NOT NULL DEFAULT 0` to `scan_results` schema
- Migration `0013_scan_schema_columns.sql` adds the column
- SQL query in `data.ts` now selects `sr.info_count AS "infoCount"`
- `skills-confirm.ts` now inserts `infoCount` (count of `info`-severity findings)

---

## Medium (P2) — Should Fix Soon

### 9. ~~`stage2_ambiguous` assigned but never consumed~~ ✅ RESOLVED
**File:** `apps/python-api/api/analyze/scan.py`

`stage2_ambiguous` is passed as `extra_ambiguous=stage2_ambiguous` to `stage3_detect_injection` at line 283.

### 10. DB storage failure returns `None`, caller treats as success — ACCEPTED
**File:** `apps/python-api/api/analyze/scan.py`, line 142

Intentional design: scan results are available in the HTTP response even if DB persistence fails. Scan should not fail due to DB unavailability. `scan_id=None` in the response signals the caller that persistence failed.

### 11. Source cache silently suppresses file read errors [CONFIDENCE: 88%] — ACCEPTED
**File:** `apps/python-api/lib/scan/stage2_static.py`

File has been significantly refactored (205 lines, original review referenced 579+). Silent `except` on file reads is acknowledged — impact is limited to context evaluation for individual files, not findings generation.

### 12. Analysis errors become low-severity findings, not logged [CONFIDENCE: 82%] — ACCEPTED
**File:** `apps/python-api/lib/scan/stage3_injection.py`

File refactored to 275 lines; original referenced structure no longer present. Accepted as low-impact for V1.

### 13. Generic "Scanner unavailable" discards error context — PARTIALLY RESOLVED
**File:** `apps/registry/src/api/routes/v1/scan.ts`, lines 84-85

`log.error('Public scan fetch failed', { url, error: String(err) })` logs server-side context. Client still receives generic "Scanner unavailable" which is intentional (avoid leaking internal error details).

### 14. `FindingsTable` uses raw `<table>` instead of shadcn `<Table>` ✅ RESOLVED
**File:** `apps/registry/src/components/skills/findings-table.tsx`

Converted to shadcn `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`.

### 15. Info-severity dedup only matches exact location [CONFIDENCE: 81%] — ACCEPTED
**File:** `apps/python-api/lib/scan/dedup.py`

Info findings suppress only exact-location duplicates. Intentional: info findings are low-signal and proximity dedup would over-suppress. Accepted as V1 behavior.

---

## Architecture Notes

- **Rate limiter is serverless-incompatible:** In-memory `Map` resets on every cold start. Acceptable for V1 but needs Redis for production.
- **Pattern JSON files not consumed:** `patterns/injection.json` and `patterns/safe_patterns.json` exist but stage3 still uses hardcoded Python patterns. These are future infrastructure.
- **LLM only downgrades, never upgrades:** Verified this safety constraint is preserved throughout.
- **`info` severity properly excluded from verdict:** Confirmed in `verdict.py`.
