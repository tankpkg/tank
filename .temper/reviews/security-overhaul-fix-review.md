# Code Review: Security Overhaul — Fix Pass

**Date:** 2026-03-31
**Scope:** Fixes from `security-overhaul-review.md` — schema gaps, findings persistence, design system compliance
**Changed files:** 5 (1 new migration, 4 modified)
**Reviewer:** temper:review

---

## Summary

4 issues from the original review were addressed in this pass: `infoCount` not persisted (P1 #8), `remediation`/`cwe_id` missing from Drizzle schema (implicit in P1 #4), and `FindingsTable` raw HTML (P2 #14). All changes are additive and non-breaking.

---

## Findings

### 1. `ScanFinding` interface missing `remediation` and `cwe_id` [CONFIDENCE: 88%] — MEDIUM
**File:** `apps/registry/src/lib/skills/data.ts`

`ScanFinding` only declares `stage`, `severity`, `type`, `description`, `location`, `confidence`, `tool`, `evidence`, `llm_verdict`, `llm_reviewed`. The `remediation` and `cwe_id` fields written in `skills-confirm.ts` are accessed via `(f as { remediation?: string })` type casts rather than typed fields.

This works at runtime but is fragile: if the scanner stops returning these fields, or the field names change, TypeScript will not catch it.

**Recommendation:** Add `remediation?: string | null` and `cwe_id?: string | null` to `ScanFinding`.

---

### 2. `infoCount` filtering scans in-memory, not from Python scanner's authoritative count [CONFIDENCE: 80%] — LOW
**File:** `apps/registry/src/api/routes/v1/skills-confirm.ts`, line 153

```ts
infoCount: scanResult.findings.filter((f) => f.severity === 'info').length,
```

The Python scanner computes counts via `verdict.py` and could in theory return a different `info_count` in `scan_results.info_count` (its own DB write). The registry re-counts from `findings[]` independently. For other severity counts (critical, high, medium, low) this is the same pattern, so it's consistent. Low risk but worth noting.

---

### 3. Migration numbering has a gap (`0007` appears twice) [CONFIDENCE: 95%] — INFO
**File:** `apps/registry/drizzle/`

`0007_mute_swordsman.sql` and `0007_parched_scream.sql` both exist — a pre-existing duplicate. `0013_scan_schema_columns.sql` is sequenced correctly after `0012`.

No action needed on `0013`. Pre-existing `0007` duplicate should be investigated separately.

---

### 4. `skills-confirm.ts` now always sets `auditScore: null` [CONFIDENCE: 92%] — INFO (pre-existing change)
**File:** `apps/registry/src/api/routes/v1/skills-confirm.ts`

This change (removing `computeAuditScore`) is part of the broader security overhaul working tree, not from this fix pass. Noted for completeness: all three code paths (scan success, scan fail, catch) now write `auditScore: null`. If any UI still reads `auditScore`, it will silently show nothing. Verify display components handle `null` gracefully.

---

## Verified Correct

| Change | Verdict |
|---|---|
| `info_count NOT NULL DEFAULT 0` migration — safe for existing rows | LGTM |
| `remediation` / `cwe_id` nullable — correct for optional enrichment fields | LGTM |
| `IF NOT EXISTS` on all three `ALTER TABLE` — idempotent migration | LGTM |
| `ScanFinding.severity` union extended with `'info'` | LGTM |
| `infoCount: 0` in null branch of `ScanDetails` | LGTM |
| `sr.info_count AS "infoCount"` in raw SQL projection | LGTM |
| `severityColor` map now covers `info` (was missing — would render no badge style) | LGTM |
| shadcn `<Table>` conversion — correct import order, correct component hierarchy | LGTM |
| `TableHead` uses `text-xs font-medium uppercase tracking-wide` per design system | LGTM |
| No cross-package imports introduced | LGTM |

---

## Action Items

| Priority | Item | File |
|---|---|---|
| P2 | Add `remediation?` and `cwe_id?` to `ScanFinding` interface | `data.ts:46` |
| P3 | Audit `auditScore: null` impact on display components | `skill-detail-screen.tsx` |
