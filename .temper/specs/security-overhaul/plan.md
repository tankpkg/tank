# Security Overhaul — Implementation Plan

## Validation Anchor

**`@tank/security-review` is the primary regression test.** It's a published Tank skill that is pure markdown — security reference documentation. If the improved scanner flags it as CRITICAL or HIGH, the fix has failed.

Expected scan result for `@tank/security-review`:
- Verdict: `PASS` or `PASS_WITH_NOTES`
- CRITICAL findings: 0
- HIGH findings: 0
- MEDIUM findings: 0 (instructional text is documentation, not injection)
- INFO findings: some (code examples detected, permission references noted)
- Key change: code inside ```` ```python ```` blocks → INFO, not CRITICAL

---

## Architecture: Two-Layer False Positive Reduction

```
                    Raw Finding
                        │
                        ▼
            ┌─── Hardcoded Fast Path ───┐
            │                            │
    Safe pattern match?          Clearly dangerous?
    (git, npm, NODE_ENV,         (shell injection with
     declared permission,          user input, obfuscation
     code in ``` block)            + exec)
            │                            │
            ▼                            ▼
        Downgrade to INFO           Keep severity,
        (zero-cost, instant)        skip LLM
            │                            │
            └────────┬───────────────────┘
                     │
                     ▼
              Ambiguous? (LLM)
              ┌───────┴───────┐
         likely_benign    confirmed_threat/
         (downgrade)      uncertain (keep)
```

**Layer 1: Hardcoded rules** (`context.py` + `safe_patterns.py`)
- Instant, zero cost, zero latency
- Catches the obvious cases: declared permissions, safe subprocess args, standard env vars, markdown structure
- Conservative: only downgrades when ALL applicable factors agree

**Layer 2: LLM corroboration** (`llm_analyzer.py` — already exists, 673 lines)
- Only processes findings that survive Layer 1 as ambiguous
- Uses existing Groq free tier: `llama-3.1-8b-instant` (primary), `llama-3.3-70b-versatile` (fallback)
- One call per scan, ~1,500 tokens, ~500ms latency
- Safety: can only downgrade, never escalate

**Groq free tier capacity (confirmed 2026-03):**

| Metric | Limit | Per-scan usage | Capacity |
|--------|-------|---------------|----------|
| `llama-3.1-8b-instant` RPM | 30 | 1 req | 30 scans/min |
| `llama-3.1-8b-instant` RPD | 14,400 | 1 req | **14,400 scans/day** |
| `llama-3.1-8b-instant` TPM | 6,000 | ~1,500 tokens | 4 scans/min |
| `llama-3.3-70b-versatile` RPD | 1,000 | fallback only | plenty |
| Cost | **$0** | **$0** | — |

---

## Phase 1: Fix Over-Classification (Scanner Intelligence)

### Task 1.1: Add INFO severity level
**Files:**
- `apps/python-api/lib/scan/models.py` — add `info` to severity enum
- `apps/python-api/lib/scan/verdict.py` — exclude `info` from verdict counting
- `apps/registry/src/components/skills/findings-table.tsx` — add INFO rendering (gray badge, collapsed "Notes" section)
- `packages/internals-schemas/` — add `info` to shared severity types if applicable

**No DB migration needed** — severity is a text field.

### Task 1.2: Build hardcoded fast-path (ContextEvaluator)
**New file:** `apps/python-api/lib/scan/context.py`

```python
class ContextEvaluator:
    def __init__(self, permissions: dict, manifest: dict):
        self.permissions = permissions
        self.manifest = manifest

    def evaluate(self, finding: Finding, source: str, file_meta: dict) -> tuple[Finding, bool]:
        """Adjust finding severity. Returns (finding, is_resolved).
        is_resolved=True means finding is no longer ambiguous (skip LLM)."""
```

**Downgrade rules** (instant, zero-cost — only when ALL applicable factors agree):

| Factor | Condition | Adjustment | Resolved? |
|--------|-----------|------------|-----------|
| Permission declared | `fetch()` + `network.outbound` in manifest | HIGH → INFO | Yes (skip LLM) |
| Safe literal args | `subprocess.call(["git", "status"])` | CRITICAL → LOW | Yes (skip LLM) |
| Standard env vars | `process.env.NODE_ENV`, `PATH`, `HOME`, `CI` | MEDIUM → INFO | Yes (skip LLM) |
| Inside code block | Match is between ```` ``` ```` fences | CRITICAL/HIGH → INFO | Yes (skip LLM) |
| Inside heading | Match is on a `# heading` line | Skip entirely | Yes (skip LLM) |
| Test/example file | Path matches `test_*`, `*_test.*`, `examples/` | → INFO | Yes (skip LLM) |
| Build/config script | `setup.py`, `Makefile`, `justfile` | Context-dependent | No (send to LLM) |

**Escalation rules** (keep severity, skip LLM):

| Factor | Condition | Adjustment | Resolved? |
|--------|-----------|------------|-----------|
| Undeclared capability | `fetch()` with no `network.outbound` | HIGH → CRITICAL | Yes (skip LLM) |
| Shell injection with user input | `os.system(f"cmd {var}")` | CRITICAL stays | Yes (skip LLM) |
| Obfuscation + execution | `base64.b64decode() + exec()` | HIGH → CRITICAL | Yes (skip LLM) |

**New file:** `apps/python-api/lib/scan/safe_patterns.py`
- Allowlist: safe subprocess args (`git`, `npm`, `pip`, `bun`, `node`, `python`, `echo`)
- Allowlist: standard env vars (`NODE_ENV`, `PATH`, `HOME`, `CI`, `PORT`, `HOST`)
- Allowlist: safe chmod targets (own scripts, not `/etc`, `/usr`, system paths)

**Integration:**
- `stage2_static.py` — call `ContextEvaluator.evaluate()` on each raw finding
- `stage3_injection.py` — call on each regex match finding
- Return `(finding, is_resolved)` — resolved findings skip LLM, unresolved ones go to Layer 2

### Task 1.3: Markdown structure awareness (Stage 3 fix)
**File:** `apps/python-api/lib/scan/stage3_injection.py`

This is the biggest false positive source. Changes:

1. **Code block detection**: Before evaluating a match, check if the match position is inside a fenced code block (between ```` ``` ```` delimiters). If so → INFO or skip entirely.

2. **Heading detection**: If match is on a line starting with `#` → skip (it's a heading, not an instruction).

3. **Confidence tuning**:
   - `IMPERATIVE_PATTERNS` confidence: 0.5 → 0.15 (almost always false positives)
   - `AUTHORITY_PATTERNS` confidence ("trust me", "I promise"): 0.5 → 0.2
   - `ROLE_HIJACKING` patterns inside code examples: → INFO

4. **Context window**: Read ±3 lines around match. If surrounding context is clearly instructional documentation (list items, headings, explanations) → downgrade to INFO.

**Add helper:** `apps/python-api/lib/scan/markdown_utils.py`
- `is_inside_code_block(content: str, position: int) -> bool`
- `is_inside_heading(content: str, position: int) -> bool`
- `get_surrounding_context(content: str, position: int, lines: int = 3) -> str`

### Task 1.4: Expand LLM corroboration to Stage 2

**Current state:** LLM only runs in Stage 3 for ambiguous injection findings (`llm_analyzer.py:116-119`).
**Target:** LLM reviews ambiguous findings from BOTH Stage 2 and Stage 3 in a single batched call.

**File:** `apps/python-api/lib/scan/llm_analyzer.py`

**Changes:**

1. **Expand `AMBIGUOUS_TYPES`** to include Stage 2 finding types:

```python
AMBIGUOUS_TYPES = {
    # Stage 3 (existing)
    "prompt_injection_pattern",
    "elevated_suspicion",
    # Stage 2 (new)
    "subprocess_usage",      # Could be safe (git) or dangerous (user input)
    "network_access",        # Depends on permission declaration
    "env_access",            # NODE_ENV is safe, DB_PASSWORD is suspicious
    "code_in_markdown",      # Code examples vs executable code
    "obfuscation_pattern",   # base64+exec or just encoding helpers
}
```

2. **Add Stage 2 system prompt** for LLM context:

```python
STAGE2_LLM_PROMPT = """You are reviewing static analysis findings from a Tank skill package.
Skills can contain Python, JS/TS, shell scripts, and markdown.

For each finding, classify as:
- "likely_benign": False positive. The code is a safe standard pattern, inside a
  code block, part of build tooling, or matches a declared permission.
- "confirmed_threat": Genuinely dangerous. Undeclared network access, shell injection
  with user input, obfuscated payloads, credential exfiltration.
- "uncertain": Cannot determine from context alone.

Context matters:
- subprocess.call(["git", "status"]) → likely_benign (safe literal args)
- subprocess.call(user_input, shell=True) → confirmed_threat (shell injection)
- fetch() with network.outbound declared → likely_benign
- fetch() with no network permission → confirmed_threat
- Code inside markdown code blocks (```...```) → likely_benign (documentation)
- process.env.NODE_ENV → likely_benign (standard env var)
- process.env.AWS_SECRET_ACCESS_KEY → confirmed_threat (credential access)

Declared permissions for this skill: {permissions}
"""
```

3. **Combine prompts for batched call** — use a single LLM call that includes both the injection-focused and static-analysis-focused system prompt:

```python
COMBINED_SYSTEM_PROMPT = LLM_SYSTEM_PROMPT + "\n\n" + STAGE2_LLM_PROMPT
```

4. **Batch findings across stages** in the scan orchestrator:

**File:** `apps/python-api/api/analyze/scan.py`

```python
# Current: LLM runs independently inside each stage
# New: Collect ambiguous findings from Stage 2 + Stage 3, single batched LLM call

# Stage 2 returns: (results, ambiguous_findings)
# Stage 3 returns: (results, ambiguous_findings)
# After both stages:
all_ambiguous = stage2_ambiguous + stage3_ambiguous
if all_ambiguous and llm_analyzer.is_enabled():
    llm_result = await llm_analyzer.analyze_findings(all_ambiguous, temp_dir)
    reviewed = llm_analyzer.apply_verdicts(all_ambiguous, llm_result.verdicts)
```

**Key constraint:** `MAX_FINDINGS_PER_CALL` stays at 12 (existing budget). If ambiguous findings exceed 12, prioritize:
1. CRITICAL ambiguous (most value from LLM review)
2. HIGH ambiguous
3. MEDIUM ambiguous

**Impact:** One LLM call per scan instead of one per stage. Same cost ($0 on Groq free tier), better coverage.

### Task 1.5: Finding deduplication
**New file:** `apps/python-api/lib/scan/dedup.py`

Post-processing step in scan orchestrator (`api/analyze/scan.py`), after all stages complete AND after LLM review, before verdict computation.

Rules:
- Same `file:line` from multiple tools → merge into one, keep highest severity, boost confidence to `max(a.confidence, b.confidence) * 1.1`
- Same pattern type repeated in same file → consolidate with count ("3 occurrences of X in this file")
- INFO findings that duplicate a higher-severity finding → drop the INFO

### Task 1.6: Remediation guidance + CWE references
**New file:** `apps/python-api/lib/scan/remediation.py`

Map of `finding_type` → `(remediation_text, cwe_id)`.

```python
REMEDIATION_MAP = {
    "subprocess_call": ("Use subprocess with list arguments instead of shell=True", "CWE-78"),
    "eval_usage": ("Avoid eval() — use ast.literal_eval() for safe evaluation", "CWE-94"),
    "network_access": ("Declare network.outbound in your tank.json permissions", "CWE-200"),
    "prompt_injection": ("Review flagged text — wrap instructions in code blocks if documentation", "CWE-94"),
    "secret_detected": ("Move secret to environment variable or secrets manager", "CWE-798"),
    ...
}
```

**File:** `apps/python-api/lib/scan/models.py` — add `remediation: str | None` and `cwe_id: str | None` to Finding model.

### Task 1.7: Regression test suite
**New files:**
- `apps/python-api/tests/test_context.py` — ContextEvaluator unit tests (fast-path rules)
- `apps/python-api/tests/test_dedup.py` — deduplication unit tests
- `apps/python-api/tests/test_remediation.py` — remediation mapping tests
- `apps/python-api/tests/test_markdown_utils.py` — code block / heading detection
- Update `apps/python-api/tests/test_stage2.py` — context-aware + LLM-filtered cases
- Update `apps/python-api/tests/test_stage3.py` — false-positive regression tests
- `apps/python-api/tests/test_llm_stage2.py` — LLM Stage 2 prompt integration

**Validation anchor test:**
```python
# test_stage3_regression.py
def test_security_review_skill_no_critical_findings():
    """@tank/security-review is pure markdown docs — should produce zero CRITICAL/HIGH."""
    findings = run_scan(fixture="security-review-skill")
    assert all(f.severity not in ("critical", "high") for f in findings)
```

**Test fixtures** (in `apps/python-api/tests/fixtures/`):
1. `security-review-skill/` — actual content from `@tank/security-review` (markdown-only)
2. `declared-permission-skill/` — skill with `network.outbound` + `fetch()` → expect INFO (fast-path resolves)
3. `undeclared-network-skill/` — skill with `fetch()` but no permissions → expect CRITICAL (fast-path resolves)
4. `safe-subprocess-skill/` — skill with `subprocess.call(["git", "status"])` → expect LOW (fast-path resolves)
5. `ambiguous-network-skill/` — skill with `fetch()` and unclear permissions → expect LLM review (Layer 2)
6. `injection-skill/` — skill with actual prompt injection patterns → expect CRITICAL (LLM confirms)
7. `duplicate-findings-skill/` — skill with `eval()` that Bandit + AST both detect → expect single finding

---

## Phase 2: Remove Score System

### Task 2.1: Backend — stop computing score
**File:** `apps/registry/src/api/routes/v1/skills-confirm.ts`
- Remove `computeAuditScore()` call
- Set `auditScore: null` on new skill versions

**File:** `apps/registry/src/lib/skills/audit-score.ts`
- Keep file (existing DB rows have scores), mark as `@deprecated`

### Task 2.2: UI — remove all score displays
**Delete:**
- `apps/registry/src/components/skills/score-breakdown.tsx`
- `apps/registry/src/lib/score.ts`

**Modify:**
- `apps/registry/src/components/skills/security-overview.tsx` — remove score circle/number
- `apps/registry/src/components/skills/skill-sidebar.tsx` — remove score section, keep trust badge
- `apps/registry/src/screens/skills-list-screen.tsx` — remove ScoreBadge, use TrustBadge
- `apps/registry/src/screens/skill-detail-helpers.tsx` — remove `buildScoreCriteria()`
- `apps/registry/src/components/skills/skills-filters.tsx` — replace score filter with security status filter (Verified / Review Recommended / Concerns / Unsafe)

### Task 2.3: Badge API
**File:** `apps/registry/src/api/routes/v1/badge.ts` (or equivalent)
- SVG shows trust level text instead of numeric score
- Color based on verdict: `pass` → green, `pass_with_notes` → yellow, `flagged` → orange, `fail` → red, `pending` → gray

---

## Phase 3: Online Scanning Service (v1 — Synchronous)

**Design principle: v1 is synchronous.** The Python scanner already has a 55-second timeout. The existing `POST /api/analyze/scan` endpoint works synchronously. For v1, the registry proxies to the scanner and returns results directly. No async job queue, no worker process, no `scan_jobs` table.

Async scanning (job queue, polling, webhooks) is Phase 4 — only if 55s proves insufficient.

### Task 3.1: Public scan API endpoint
**New file:** `apps/registry/src/api/routes/v1/scan.ts`

```
POST /api/v1/scan
  Body: { url: string }  // tarball URL (.tar.gz, .tgz)
  Response: { verdict, findings: [...], ... }  // full scan report
```

**Flow:**
1. Validate URL (SSRF protection — reject internal IPs, require HTTPS for non-local)
2. Rate limit check (IP-based for anonymous, user-based for auth)
3. Proxy to Python scanner: `POST ${PYTHON_API_URL}/api/analyze/scan` with `tarball_url`
4. Return scanner response directly (synchronous, ~5-30s)

**SSRF protection** (`apps/registry/src/lib/scan/url-validator.ts`):
- Reject private IPs: 10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fd*
- Reject non-HTTPS for production
- Allowlist localhost only in development
- URL must end in `.tar.gz`, `.tgz`, or be a known registry URL pattern

### Task 3.2: Rate limiting
**New file:** `apps/registry/src/api/middleware/rate-limit.ts`

Simple in-memory rate limiter (Map of IP/user → count + window reset).

| Tier | Limit | Window |
|------|-------|--------|
| Anonymous (IP-based) | 3 scans | 1 hour |
| Authenticated free | 20 scans | 1 hour |
| Authenticated pro | 200 scans | 1 hour |

For on-prem: unlimited (single-tenant).

**Note:** In-memory works for single-instance. For multi-replica, use Redis-backed store (Phase 4).

### Task 3.3: Scan report page
**New route:** `apps/registry/src/routes/scan/index.tsx`

Public-facing scanner tool page:
- URL input with "Scan Now" button
- Inline loading state (stage-by-stage progress)
- Result renders on same page
- "Share" button generates permalink (stores result client-side or in URL hash for v1)

**Report sections:**
1. Trust badge + verdict + one-line summary
2. Findings grouped by category (code execution, injection, secrets, supply chain)
3. Each finding: severity, location, evidence, remediation, CWE
4. Pipeline stages overview (which ran, duration)
5. Permission analysis (declared vs detected)

### Task 3.4: Scanner service authentication
**File:** `apps/python-api/api/` — add auth middleware

- New env var: `SCANNER_SERVICE_KEY`
- Registry passes `X-Scanner-Key` header when calling scanner
- Scanner validates on all endpoints
- Feature flag: `SCANNER_AUTH_ENABLED` (default false, enable after scanner deploy)

### Task 3.5: Pattern database externalization
**New directory:** `apps/python-api/lib/scan/patterns/`

Move hardcoded regex patterns from Python source to YAML/JSON data files:
- `patterns/injection.json` — Stage 3 regex patterns
- `patterns/static.json` — Stage 2 detection rules
- `patterns/safe_patterns.json` — allowlists for ContextEvaluator

Load at scanner startup. Patterns version independently from scanner code.

---

## Phase 4: Future Enhancements (NOT in this plan)

These are research topics for future RFCs, not implementation tasks:

- **Async scanning**: Job queue, `scan_jobs` table, worker process, polling/webhooks — only if 55s synchronous limit proves insufficient
- **Cross-file dataflow analysis**: Track data flow across files (AST-based import graph)
- **Community intelligence**: Aggregate scan results for threat correlation
- **Report tiering**: Free vs full report content gating
- **GitHub/npm URL resolution**: Auto-resolve repos and packages to tarballs
- **File upload scanning**: Accept multipart tarball uploads
- **Multi-replica rate limiting**: Redis-backed store for distributed deployments

---

## Quickstart (for fresh-context agent)

```bash
# 1. Understand the scanner
cat apps/python-api/lib/scan/models.py
cat apps/python-api/lib/scan/verdict.py
cat apps/python-api/lib/scan/stage2_static.py
cat apps/python-api/lib/scan/stage3_injection.py
cat apps/python-api/lib/scan/llm_analyzer.py

# 2. Understand the UI
cat apps/registry/src/components/skills/security-overview.tsx
cat apps/registry/src/components/skills/trust-badge.tsx
cat apps/registry/src/lib/skills/audit-score.ts

# 3. Understand the integration
cat apps/registry/src/api/routes/v1/skills-confirm.ts
cat apps/registry/src/api/routes/admin/packages.ts  # rescan flow

# 4. Read this spec
cat .temper/specs/security-overhaul/spec.md

# 5. Start with Phase 1, Task 1.1
```

## Dependencies Between Tasks

```
1.1 (INFO severity) ─┬─→ 1.2 (ContextEvaluator) ─┬─→ 1.4 (LLM expansion) ──→ 1.5 (Dedup)
                      │                            │
1.3 (Markdown utils) ─┘                            └─→ 1.7 (Tests)
1.6 (Remediation) ─────────────────────────────────────→ 1.7 (Tests)

2.1 (Backend score removal) ── no dependency on Phase 1
2.2 (UI score removal) ── depends on trust badge existing (already done)
2.3 (Badge API) ── depends on 2.2

3.1 (Scan API) ── depends on 3.2 (rate limit) + 3.4 (scanner auth)
3.2 (Rate limit) ── standalone
3.3 (Report page) ── depends on 3.1
3.4 (Scanner auth) ── standalone
3.5 (Pattern externalization) ── standalone, can run parallel with 3.1-3.4

Phase 1 and Phase 2 can run in parallel.
Phase 3 starts after Phase 1 (so online service produces good results).
Phase 4 = future RFCs, not in scope.
```

## Effort Estimate

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| Phase 1 | 1.1–1.7 | 2–3 weeks (core scanner work + LLM integration) |
| Phase 2 | 2.1–2.3 | 1 week (mostly deletion) |
| Phase 3 | 3.1–3.5 | 1–2 weeks (synchronous scan proxy + simple UI) |
| **Total** | | **4–6 weeks** |

LLM expansion (Task 1.4) adds minimal effort because:
- `llm_analyzer.py` already handles provider fallback, 429 errors, timeout budgets
- New work = expand `AMBIGUOUS_TYPES`, add Stage 2 system prompt, batch findings in orchestrator
- Groq free tier covers all expected volume ($0 cost)
