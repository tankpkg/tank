# Security Scanning System — Specification (WHAT)

## Problem Statement

Tank currently computes audit scores from metadata-only checks (description present, permissions declared, file count, etc.) with **zero actual code analysis**. The existing Python endpoints (`/api/analyze/security` and `/api/analyze/permissions`) use LLM-based analysis via OpenRouter, which is:

1. **Non-deterministic** — same input can produce different results
2. **Susceptible to prompt injection** — a malicious skill could manipulate the reviewing LLM
3. **Unreliable** — depends on external API availability and free-tier model quality
4. **Not integrated** — confirm endpoint passes `analysisResults: null`, so security checks always default to "pass"

The system needs a deterministic, multi-stage static security scanner that produces a **PASS**, **FAIL**, or **FLAGGED** verdict for every published skill version.

## User Stories

**US-1**: As a skill consumer, I want every published skill to be automatically scanned for security threats, so I can trust that installed skills don't contain malicious code.

**US-2**: As a skill publisher, I want to see exactly which security checks my skill passed or failed, so I can fix issues before re-publishing.

**US-3**: As a registry operator, I want to automatically block skills with critical security findings, so the registry maintains its trust guarantee.

**US-4**: As a skill consumer running `tank audit`, I want to see the scan verdict and individual findings, not just a numeric score.

## Feature Type

**New Feature** — replaces existing LLM-based endpoints with deterministic static analysis pipeline. Integrates into existing publish flow.

## Complexity: High

## Affected Systems

| System | Change Type | Impact |
|--------|-------------|--------|
| `apps/web/api-python/analyze/` | Rewrite | Replace LLM endpoints with 6-stage scanning pipeline |
| `apps/web/requirements.txt` | Expand | Add bandit, detect-secrets, pip-audit, python-magic, charset-normalizer |
| `apps/web/lib/db/schema.ts` | Add tables | New `scan_results` and `scan_findings` tables |
| `apps/web/lib/audit-score.ts` | Modify | Integrate real scan results into score computation |
| `apps/web/app/api/v1/skills/confirm/route.ts` | Modify | Call Python scan endpoint after upload confirmation |
| `apps/web/app/api/v1/skills/[name]/[version]/route.ts` | Modify | Return scan verdict + findings in response |
| `packages/shared/src/types/api.ts` | Extend | Add scan result types to `SkillInfoResponse` |
| `apps/cli/src/commands/audit.ts` | Extend | Display verdict + findings instead of just score |

## Requirements

### Functional

| ID | Requirement |
|----|-------------|
| R1 | Every skill version triggers a full scan pipeline after upload confirmation |
| R2 | All scanning runs as Python Vercel Functions (FastAPI) |
| R3 | Scanner produces structured verdict: **PASS**, **FAIL**, or **FLAGGED** |
| R4 | Each stage produces findings with severity: critical, high, medium, low |
| R5 | Any **critical** finding = immediate **FAIL** |
| R6 | More than 3 **high** findings across all stages = **FAIL** |
| R7 | Any **high** finding (but <=3 total) = **FLAGGED** (quarantine for review) |
| R8 | Only medium/low findings = **PASS WITH NOTES** |
| R9 | Zero findings = **PASS** |
| R10 | Scan results stored as immutable records in `scan_results` + `scan_findings` |
| R11 | CLI `tank audit` displays verdict + individual findings |
| R12 | No LLM-based review in the scan pipeline (deterministic only) |
| R13 | No sandbox execution of skill code |
| R14 | Scan is idempotent — re-running produces the same result |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Total scan time < 55 seconds (leave headroom within 60s Vercel limit) |
| NF2 | Python function bundle < 250MB uncompressed |
| NF3 | Zero false positives on common benign patterns (read own project files, declared API usage) |
| NF4 | Graceful degradation — if scan fails, skill still publishes with `audit_status: scan-failed` |

## Scanning Pipeline Stages

```
Input: skill tarball (.tgz) from Supabase Storage
│
├─ Stage 0: Ingestion & Quarantine
│  └─ Download, extract safely, MIME check, hash all files
│
├─ Stage 1: File & Structure Validation
│  └─ SKILL.md check, Unicode tricks, encoding, hidden files
│
├─ Stage 2: Static Code Analysis
│  └─ Bandit (Python) + custom AST rules (JS/TS/Python)
│
├─ Stage 3: Prompt Injection Detection
│  └─ Regex pattern engine + heuristic scoring (no ML)
│
├─ Stage 4: Secrets & Credential Scanning
│  └─ detect-secrets with all built-in plugins
│
├─ Stage 5: Dependency & Supply Chain Audit
│  └─ pip-audit + PyPI/npm advisory API checks
│
└─ Output: Verdict (PASS/FAIL/FLAGGED) + findings JSON
```

## Verdict Logic

| Condition | Verdict |
|-----------|---------|
| Any **critical** finding in any stage | **FAIL** |
| More than 3 **high** findings across all stages | **FAIL** |
| Any **high** finding (<=3 total) | **FLAGGED** |
| Only **medium** and **low** findings | **PASS WITH NOTES** |
| Zero findings | **PASS** |

No trusted publisher bypass. Every version of every skill is fully scanned.

## Constraints: Vercel Python Functions

| Constraint | Impact on Original Plan |
|------------|------------------------|
| 250MB bundle limit | Cannot use torch/transformers (~2GB). Stage 3 must use regex+heuristics instead of ML classifiers |
| 60s max duration | All stages must complete within one function call, or use multi-call orchestration |
| No system binaries | Cannot install Semgrep CLI (Rust) or OSV-Scanner (Go). Must use pure-Python alternatives |
| Stateless / no persistent processes | Cannot use APScheduler. Re-scan scheduling via Vercel Cron Jobs |
| Ephemeral /tmp only | Archives extracted to /tmp, discarded after invocation |

## What Changes from the Original High-Level Plan

| Original Plan | Adapted Plan | Reason |
|---------------|-------------|--------|
| Stage 3: ML classifiers (DeBERTa v3, Prompt-Guard-86M, sentence-transformers, all-MiniLM-L6-v2) | Regex pattern engine + heuristic scoring + structural analysis | torch+transformers = ~2GB, blows 250MB limit |
| Stage 2: Semgrep CLI (Rust binary) | Python AST analysis + Bandit | Semgrep CLI is a Rust binary, can't install on Vercel |
| Stage 5: OSV-Scanner (Go binary) | pip-audit (pure Python) + direct PyPI/npm advisory API queries | OSV-Scanner is a Go binary |
| Stage 6: APScheduler for periodic re-scans | Vercel Cron Job → `/api/analyze/rescan` endpoint | Serverless = no persistent processes |
| Single monolithic process | Single orchestrator function (sequential stages) | Keep within 60s timeout |
