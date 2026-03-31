# Security Overhaul

## What

Transform Tank's security scanner from a pattern-matching tool that over-flags everything into a context-aware scanning engine with LLM-backed false positive reduction. Remove the misleading 0-10 score. Launch a public scanning service as Tank's differentiator.

## Why

- Scanner produces ~60% false positives — `@tank/security-review` (pure markdown docs) would get flagged CRITICAL
- Everything looks "critical" → users distrust the scanner → scanner provides no value
- LLM corroboration already exists (`llm_analyzer.py`, 673 lines) but only covers Stage 3 injection findings — Stage 2 false positives (the bulk) never get LLM review
- 0-10 score conflates security + docs + hygiene into one misleading number
- No way to scan skills from the internet — missed market opportunity
- Scanner logic is fully exposed — no competitive moat

## Architecture

### Two-Layer False Positive Pipeline

```
Raw Finding → Layer 1 (hardcoded rules, instant, $0)
                 ├─ resolved (safe/dangerous) → final finding, skip LLM
                 └─ ambiguous → Layer 2 (LLM, ~500ms, $0 on Groq free tier)
                                  ├─ likely_benign → downgrade
                                  └─ confirmed_threat / uncertain → keep
```

**Layer 1** — Hardcoded fast path (`context.py` + `safe_patterns.py`):

- Declared permissions, safe subprocess args, standard env vars, markdown structure
- Zero cost, zero latency, resolves obvious cases instantly
- Conservative: only downgrades when ALL applicable factors agree

**Layer 2** — LLM corroboration (expanding existing `llm_analyzer.py`):

- Expanded from Stage 3 only → Stage 2 + Stage 3 combined in single batched call
- Groq free tier: `llama-3.1-8b-instant` (14,400 req/day), $0 cost
- New Stage 2 system prompt with Tank skill context (permissions, code blocks, standard patterns)
- Safety: can only downgrade, never escalate. Failure is non-blocking.

## Success Criteria

### SC1: Context-Aware Classification

- [ ] `@tank/security-review` produces zero CRITICAL/HIGH findings (validation anchor)
- [ ] Findings with matching declared permissions are downgraded to INFO (Layer 1)
- [ ] Code inside markdown code blocks produces INFO, not CRITICAL/HIGH (Layer 1)
- [ ] Normal documentation language produces no findings or INFO only (Layer 2 LLM)
- [ ] Duplicate findings from multiple tools are consolidated into one
- [ ] Every CRITICAL/HIGH finding includes remediation guidance and CWE reference
- [ ] False positive rate <15% on regression test set (10 real published skills)
- [ ] LLM reviews ambiguous findings from BOTH Stage 2 and Stage 3 in a single batched call
- [ ] LLM failure is non-blocking — scanner degrades to Layer 1 only

### SC2: Score Removal

- [ ] No numeric score visible anywhere in the UI
- [ ] Trust badge is the primary security indicator on all pages
- [ ] Badge API returns trust level text, not numeric score
- [ ] Score filter replaced with security status filter

### SC3: Online Scanning Service

- [ ] Users can submit a tarball URL and receive a scan report
- [ ] Scan reports are shareable via permalink
- [ ] Rate limiting enforced (3/hr anonymous, 20/hr free auth)
- [ ] Report page shows findings grouped by category with remediation

### SC4: Proprietary Protection

- [ ] Scanner API requires service-to-service authentication
- [ ] Detection patterns externalized to data files

## Constraints

- C1: Existing scan results in DB must not be modified
- C2: INFO severity must not affect verdict computation
- C3: Context evaluator must be conservative — only downgrade when ALL context factors agree
- C4: Online scanner must have SSRF protection on URL input
- C5: Phase 3 launches AFTER Phase 1 (so online service produces good results)
- C6: v1 scan service is synchronous (55s max) — no async job queue needed yet
- C7: LLM can only downgrade severity, never escalate
- C8: LLM failure degrades gracefully — findings keep original severity from Layer 1

## Spec

`.temper/specs/security-overhaul/spec.md`
