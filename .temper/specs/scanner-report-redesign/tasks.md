# Tasks: Scanner Report Redesign

## Phase 1: Scanner Fixes (backend, no UI changes)

### T1: Fix detect-secrets import
- **Files:** `apps/python-api/lib/scan/stage4_secrets.py`
- **What:** Verify detect-secrets version compat, add fallback wrapper so scanner doesn't silently fail. Ensure the library is actually invoked and results are returned.
- **Validate:** `just test python-api`

### T2: Add tool attribution to stage4 findings
- **Files:** `apps/python-api/lib/scan/stage4_secrets.py`
- **What:** Tag each finding with `tool="detect-secrets"` or `tool="custom-patterns"` so frontend can distinguish which scanner found it
- **Validate:** `just test python-api`

### T3: Enhance placeholder suppression in custom patterns
- **Files:** `apps/python-api/lib/scan/stage4_secrets.py`
- **What:** Reduce false positives by suppressing `your_api_key_here`, `sk-placeholder`, `xxx`, `REPLACE_ME`, `<your-key>` patterns
- **Validate:** `just test python-api`

### T4: Ensure remediation + cwe_id flow end-to-end
- **Files:** `apps/python-api/lib/scan/scan.py`, `apps/registry/src/lib/skills/data.ts`
- **What:** Fields `remediation` and `cwe_id` already exist in ScanFinding type. Verify they flow: scanner output → API response → DB storage → frontend query. If the DB query doesn't select these columns, add them.
- **Validate:** Check scan response JSON contains remediation + cwe_id fields

### T5: Verify Cisco/Snyk/OSV tool names in findings
- **Files:** `apps/python-api/lib/scan/cisco_scanner.py`, `apps/python-api/lib/scan/snyk_scanner.py`, `apps/python-api/lib/scan/stage5_osv.py` (or equivalent stage5 file)
- **What:** Confirm all tools set consistent `tool` field: Cisco=`skill-scanner/static|behavioral`, Snyk=`snyk-agent-scan`, OSV.dev=`stage5_osv`, Bandit=`bandit`. Add OSV.dev-specific CVE links to findings.
- **Validate:** `just test python-api`

### T6: Add stage3 context-aware suppression
- **Files:** `apps/python-api/lib/scan/stage3_injection.py`
- **What:** Suppress injection findings inside code blocks (```...```), HTML comments, and documentation prose sections. Only flag actual skill content, not examples/docs.
- **Validate:** `just test python-api`

### T7: Unit tests for scanner fixes
- **Files:** New test files in `apps/python-api/tests/`
- **What:** Tests for: detect-secrets available/unavailable, custom patterns, FP suppression, tool attribution, stage3 context suppression, OSV.dev CVE linking
- **Validate:** `just test python-api`

## Phase 2: Security Report UX Redesign

### T8: Wire existing ScanFinding fields to UI
- **Files:** `apps/registry/src/lib/skills/data.ts`, `apps/registry/src/components/skills/skill-detail-helpers.tsx`
- **What:** `cwe_id`, `remediation`, `confidence`, `llm_verdict` already exist in ScanFinding type. Update `buildSecurityTab` and related helpers to pass these through to components. Update DB query if columns aren't selected.
- **Validate:** `just typecheck registry`

### T9: Redesign SecurityOverview — verdict hero
- **Files:** `apps/registry/src/components/skills/security-overview.tsx`
- **What:** Replace current verdict display with hero section: large trust badge + human-readable 1-line summary (e.g., "2 secrets found, 1 prompt injection risk") + overall safety indicator. Show LLM corroboration status prominently.
- **Validate:** Visual check in browser

### T10: Redesign FindingsTable — remediation + CWE + confidence + LLM
- **Files:** `apps/registry/src/components/skills/findings-table.tsx`
- **What:**
  - Add "How to fix" column using `remediation` field
  - Add CWE link column using `cwe_id` (link to `https://cwe.mitre.org/data/definitions/{id}.html`)
  - Add confidence indicator (bar or badge using `confidence` field)
  - Show LLM verdict per finding using `llm_verdict` field
  - Group findings by category (secrets, injection, supply chain, etc.)
- **Validate:** Visual check in browser

### T11: Redesign ScanningToolsStrip — dynamic per-tool attribution
- **Files:** `apps/registry/src/components/skills/scanning-tools-strip.tsx`, `apps/registry/src/components/skills/skill-detail-helpers.tsx`
- **What:**
  - Replace hardcoded tool list with dynamic rendering from actual findings
  - Each tool shows: name, icon, status (ran/skipped/failed), findings count
  - Include all tools: Cisco, Snyk, Bandit, Semgrep, detect-secrets, OSV.dev, npms.io, LLM
  - Show OSV.dev as separate tool with CVE count
  - Show npms.io quality score as separate indicator
- **Validate:** Visual check in browser

### T12: Add npms.io quality scoring to security report
- **Files:** `apps/registry/src/components/skills/security-overview.tsx`, `apps/registry/src/lib/dep-audit/npms-client.ts` (already exists)
- **What:** Show package quality score from npms.io in the security overview. Display quality/popularity/maintenance breakdown. Already implemented in backend — just needs frontend wiring.
- **Validate:** Visual check in browser

## Phase 3: Scan Page Expansion

### T13: Create URL expander
- **Files:** `apps/registry/src/lib/scan/url-expander.ts` (NEW)
- **What:** GitHub folder → tarball URL via GitHub API, raw.githubusercontent.com → inline content, skills.sh → skill URL resolution
- **Validate:** Unit tests

### T14: Expand URL validator
- **Files:** `apps/registry/src/lib/scan/url-validator.ts`
- **What:** Allow raw.githubusercontent.com, skills.sh URLs in addition to existing GitHub repo URLs
- **Validate:** Unit tests

### T15: Update scan API for expanded URL types
- **Files:** `apps/registry/src/api/routes/v1/scan.ts`
- **What:** Handle expanded URLs, raw file content, and single-file scans. Integrate URL expander into scan flow.
- **Validate:** `just test registry`

### T16: Python scanner single-file support
- **Files:** `apps/python-api/lib/scan/scan.py`, `apps/python-api/lib/scan/stage0_ingest.py`
- **What:** Allow scanning a single .md file without tarball packaging. Skip stages that require package structure (stage1, stage2 Bandit) when input is a single file.
- **Validate:** `just test python-api`

### T17: Redesign scan screen
- **Files:** `apps/registry/src/screens/scan-screen.tsx`
- **What:** Accept folders, .md files, expanded URL types. Use full SecurityOverview + ScanningToolsStrip + FindingsTable (with remediation) in scan results. Show OSV.dev + npms.io results.
- **Validate:** Visual check in browser

## Phase 4: Top Skills Showcase

### T18: External skills cache DB table
- **Files:** `apps/registry/src/lib/db/schema.ts`, migration
- **What:** New table for caching external skill metadata + scan results
- **Validate:** `just db push`

### T19: skills.sh fetcher service
- **Files:** `apps/registry/src/services/external-skills.ts` (NEW)
- **What:** Fetch and cache top skills.sh skills, periodic sync
- **Validate:** Unit tests

### T20: Top skills API endpoint
- **Files:** `apps/registry/src/api/routes/v1/top-skills.ts` (NEW)
- **What:** `GET /api/v1/skills/top` — returns internal + external skills with security data (verdict, findings count, trust badge)
- **Validate:** API test

### T21: TopSkillsScreen component
- **Files:** `apps/registry/src/screens/top-skills-screen.tsx` (NEW)
- **What:** Dual-panel: Tank internal skills + skills.sh external skills. Each card shows trust badge, verdict summary, "why safe" or "why unsafe" breakdown. "Bulletproof" skills highlighted prominently.
- **Validate:** Visual check

### T22: Route for top-skills page
- **Files:** `apps/registry/src/routes/scan/top-skills.tsx` (NEW)
- **What:** TanStack Router route for `/scan/top-skills`
- **Validate:** `just typecheck registry`

## Dependencies

```
T1-T7 (Phase 1) — no dependencies, can start immediately
T8-T12 (Phase 2) — depends on T4 (remediation fields verified)
T13-T17 (Phase 3) — T13/T14 independent, T15 depends on T13, T16 depends on T15
T18-T22 (Phase 4) — T18 first, then T19-T22 in parallel
```

## Open Questions

1. **skills.sh API** — What is the public API surface? REST? HTML scraping needed?
2. **Re-scan frequency** — How often to re-scan external skills?
3. **Phase 4 timing** — Ship with scanner fixes or as separate release?
4. **npms.io display** — Quality score in overview header or dependency audit section?
