# Security Overhaul: Context-Aware Scanning & Online Service

## Problem Statement

Tank's security scanner has **three critical problems** that undermine its value proposition:

### 1. Over-Classification (Everything Is "Critical")

The scanner flags legitimate patterns as threats because it lacks context awareness.

**Proof: `@tank/security-review` (a published Tank skill)**

This skill is pure markdown — security reference documentation with code examples. Zero executable code. Yet the current scanner flags it for:

| Content in the skill                  | Why it matches              | Current severity | Reality                       |
| ------------------------------------- | --------------------------- | ---------------- | ----------------------------- |
| "you must follow these steps"         | `IMPERATIVE_PATTERNS` regex | MEDIUM           | Normal instructional text     |
| "act as" / "role-play"                | `ROLE_HIJACKING` regex      | CRITICAL         | Security education examples   |
| `<system>`                            | `CLAUDE_FORMAT` regex       | HIGH             | HTML/markdown code examples   |
| "send to" / "post to"                 | `EXFILTRATION` regex        | HIGH             | HTTP documentation            |
| `process.env.NODE_ENV` in code blocks | `stage2` JS/TS patterns     | MEDIUM           | Standard Node.js example      |
| `subprocess.call()` in code blocks    | `stage2` Python patterns    | CRITICAL         | Security remediation examples |

If a skill that **teaches security best practices** gets flagged as dangerous, the scanner has a precision problem, not a sensitivity problem.

**Root causes:**

- **Stage 2** (`stage2_static.py`): Matches code patterns inside markdown code blocks. `subprocess.call(["git", "status"])` in a ` ```python ` block is CRITICAL. No permission cross-check — `fetch()` with declared `network.outbound` still flagged HIGH.
- **Stage 3** (`stage3_injection.py`): Regex matches instructional documentation text. "you must" / "always do" / "act as" match when explaining security concepts. No markdown structure awareness.
- **LLM only covers Stage 3**: The existing `llm_analyzer.py` (673 lines) only reviews ambiguous injection findings. Stage 2 false positives — the bulk of the problem — never get LLM review.
- **No deduplication**: Bandit + custom AST + permission check all flag the same `subprocess.call()` → 3 findings instead of 1.
- **No file-type baseline**: Pure-markdown skills scanned with the same baseline as Python/JS tooling skills.

### 2. Numeric Score Is Misleading

The 0-10 audit score conflates security + docs + hygiene into one number. A skill with 3 medium findings scores 8/10 — users see "8/10" and think "good to use".

**Status**: Trust badge already exists. Score removal from sidebar partially done. But `audit-score.ts`, `score-breakdown.tsx`, and all score-displaying components remain in codebase.

### 3. Scanner Is Not a Competitive Advantage

- No public-facing scanning service for external packages
- No API for third-party integrations
- No way to scan arbitrary npm/GitHub packages
- Findings lack remediation guidance — just "found X at line Y"

## Proposed Solution

### Two-Layer False Positive Reduction

Replace the current single-pass regex approach with a two-layer pipeline:

````
Raw Finding
    │
    ▼
┌─── Layer 1: Hardcoded Fast Path ───┐
│                                      │
Safe pattern?              Clearly dangerous?
(git, npm, NODE_ENV,       (shell injection with
 declared permission,       user input, obfuscation
 code in ``` block)         + exec)
    │                          │
    ▼                          ▼
Downgrade to INFO         Keep severity,
(zero-cost, instant)      skip LLM
    │                          │
    └──────────┬───────────────┘
               │
               ▼
        Layer 2: LLM Review
        (existing llm_analyzer.py)
        ┌───────┴───────┐
   likely_benign    confirmed_threat/
   (downgrade)      uncertain (keep)
````

**Layer 1 — Hardcoded rules** (`context.py` + `safe_patterns.py`):

- Instant, zero cost, zero latency
- Catches obvious cases: declared permissions, safe subprocess args, standard env vars, markdown structure
- Conservative: only downgrades when ALL applicable factors agree
- Returns `is_resolved=True` for findings that need no further review

**Layer 2 — LLM corroboration** (expanding existing `llm_analyzer.py`):

- Only processes findings that survive Layer 1 as ambiguous
- **Expanded from Stage 3 only → Stage 2 + Stage 3 combined in a single batched call**
- Uses existing Groq free tier: `llama-3.1-8b-instant` (primary), `llama-3.3-70b-versatile` (fallback)
- One call per scan, ~1,500 tokens, ~500ms latency, $0 cost
- Safety: can only downgrade severity, never escalate
- New Stage 2 system prompt teaches the LLM about Tank skill context (permissions, code blocks, standard patterns)

**Groq free tier capacity (confirmed 2026-03):**

| Metric                     | Limit  | Per-scan usage | Capacity             |
| -------------------------- | ------ | -------------- | -------------------- |
| `llama-3.1-8b-instant` RPD | 14,400 | 1 req          | **14,400 scans/day** |
| `llama-3.1-8b-instant` TPM | 6,000  | ~1,500 tokens  | 4 scans/min          |
| Cost                       | **$0** | **$0**         | —                    |

### Workstream B: Remove Score System

- Stop computing `auditScore` on new publishes (set `null`)
- Delete `score-breakdown.tsx`, `lib/score.ts`
- Remove score from all UI components, replace with trust badge + security status filter
- Badge API returns trust level text, not numeric score

### Workstream C: Online Scanning Service (v1 — Synchronous)

- `POST /api/v1/scan` — submit tarball URL, get full scan report synchronously
- SSRF protection on URL input
- Rate limiting (3/hr anonymous, 20/hr auth)
- Public scan report page at `/scan` with URL input, inline results, share button
- Scanner service authentication via `SCANNER_SERVICE_KEY`

### Workstream D: Proprietary Protection

- Detection patterns externalized to `lib/scan/patterns/*.json` (not inline Python)
- Scanner API requires service-to-service auth

## Success Criteria

### SC1: Context-Aware Classification

- [ ] `@tank/security-review` produces zero CRITICAL/HIGH findings (validation anchor)
- [ ] Findings with matching declared permissions are downgraded to INFO (Layer 1)
- [ ] Code inside markdown code blocks produces INFO, not CRITICAL/HIGH (Layer 1)
- [ ] Normal documentation language produces no findings or INFO only (Layer 2 LLM)
- [ ] Duplicate findings from multiple tools are consolidated into one
- [ ] Every CRITICAL/HIGH finding includes remediation guidance and CWE reference
- [ ] False positive rate drops from ~60% to <15% on regression test set (10 real published skills)
- [ ] LLM reviews ambiguous findings from BOTH Stage 2 and Stage 3 in a single batched call
- [ ] LLM failure is non-blocking — scanner degrades to Layer 1 only

### SC2: Score Removal

- [ ] No numeric score visible anywhere in the UI
- [ ] Trust badge is the primary security indicator on all pages
- [ ] Badge API returns trust level text, not numeric score
- [ ] Score filter replaced with security status filter

### SC3: Online Scanning Service

- [ ] Users can submit a tarball URL and receive a scan report
- [ ] Scan reports are shareable via permalink (scanId UUID)
- [ ] Rate limiting enforced (3/hr anonymous, 20/hr auth)
- [ ] Report page shows findings grouped by category with remediation

### SC4: Proprietary Protection

- [ ] Scanner API requires service-to-service authentication
- [ ] Detection patterns externalized to data files

## Constraints

- C1: Existing scan results in DB must not be modified — new scans use new logic
- C2: INFO severity must not affect verdict computation
- C3: Context evaluator is conservative — only downgrade when ALL context factors agree
- C4: Online scanner must have SSRF protection on URL input
- C5: Phase 3 launches AFTER Phase 1 (so online service produces good results)
- C6: v1 scan service is synchronous (55s max) — no async job queue needed yet
- C7: LLM can only downgrade severity, never escalate (existing safety rule, unchanged)
- C8: LLM failure degrades gracefully — findings keep original severity from Layer 1

## Spec

`.temper/specs/security-overhaul/spec.md`
