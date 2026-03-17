# Scanner Stages Module

## Anchor

**Why this module exists:** The security scanner uses a 6-stage pipeline where each stage detects a specific class of threats. Stages are independent, run sequentially, and aggregate findings into a final verdict. Each stage must be individually verifiable to prevent regressions when the pipeline is updated.

**Consumers:** `apps/python-api/api/analyze/scan.py` orchestrates all 6 stages.

**Single source of truth:** `apps/python-api/lib/scan/stage{0-5}_*.py` and `apps/python-api/lib/scan/verdict.py`.

---

## Layer 1: Structure

```
apps/python-api/lib/scan/stage0_ingest.py       # Download tarball, extract, hash files
apps/python-api/lib/scan/stage1_structure.py    # Validate package structure, banned files
apps/python-api/lib/scan/stage2_static.py       # Bandit static analysis for Python code
apps/python-api/lib/scan/stage3_injection.py    # Prompt injection patterns in markdown/text
apps/python-api/lib/scan/stage4_secrets.py      # detect-secrets for credentials/tokens
apps/python-api/lib/scan/stage5_supply.py       # pip-audit + OSV for known CVEs
apps/python-api/lib/scan/verdict.py             # Aggregate stage results → final verdict
apps/python-api/lib/scan/permission_extractor.py # Extract declared permissions from manifest
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                                       | Rationale                                                 | Verified by  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| C1  | Stage 0 (ingest): downloads tarball from signed URL, extracts files, computes SHA-256 per file                             | File integrity baseline for all subsequent stages         | BDD scenario |
| C2  | Stage 1 (structure): rejects packages with `.git` directories, executable scripts in unexpected locations, oversized files | Structural red flags must fail before deep analysis       | BDD scenario |
| C3  | Stage 2 (static): runs Bandit on Python files; critical/high findings contribute to verdict                                | Python code is the most common attack vector              | BDD scenario |
| C4  | Stage 3 (injection): detects prompt injection patterns in `*.md`, `*.txt`, instructions files                              | Prompt injection is the primary AI-specific threat vector | BDD scenario |
| C5  | Stage 4 (secrets): runs detect-secrets on all files; hardcoded credentials → critical finding                              | Secrets in packages could exfiltrate data                 | BDD scenario |
| C6  | Stage 5 (supply): runs pip-audit and queries OSV for known CVEs in declared dependencies                                   | Supply chain compromise via known-vulnerable deps         | BDD scenario |
| C7  | Verdict: `pass` if no critical/high findings; `pass_with_notes` if medium only; `flagged` if high; `fail` if critical      | Four-tier verdict matches different risk tolerances       | BDD scenario |
| C8  | Each stage result includes `stage`, `status`, `findings`, `duration_ms`                                                    | Per-stage results enable targeted remediation             | BDD scenario |
| C9  | Security score uses only security findings from stages 2-5; stage1 structural hygiene never lowers security score          | Separates quality/hygiene checks from risk scoring        | BDD scenario |
| C10 | Security score is exactly `10.0` only when total findings are zero; any finding lowers it                                  | Prevents inflated trust signals for "pass with notes"     | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                     | Expected                                                    |
| --- | --------------------------------------------------------- | ----------------------------------------------------------- |
| E1  | Clean skill tarball                                       | All stages pass; verdict `pass`                             |
| E2  | Tarball with `exec(base64.b64decode(...))` in Python file | Stage 2 finding: critical; verdict `fail`                   |
| E3  | Tarball with `IGNORE ALL PREVIOUS INSTRUCTIONS` in README | Stage 3 finding: prompt injection; verdict `flagged`        |
| E4  | Tarball with hardcoded `ANTHROPIC_API_KEY=sk-...`         | Stage 4 finding: critical; verdict `fail`                   |
| E5  | Tarball with `requests==2.26.0` (known CVE)               | Stage 5 finding: high; verdict `flagged`                    |
| E6  | Tarball with only medium findings                         | Verdict `pass_with_notes`                                   |
| E7  | Tarball with only stage1 oversized-file finding           | Security score remains `10.0`; hygiene issue still reported |
| E8  | Tarball with only low severity finding in stage3          | Verdict `pass_with_notes`; security score below `10.0`      |
