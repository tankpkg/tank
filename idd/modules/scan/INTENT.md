# Scan Module

## Anchor

**Why this module exists:** A developer needs to security-scan a local skill directory
BEFORE publishing — or without ever publishing — to understand its risk profile. The scan
command packs the directory, sends the tarball to Tank's 6-stage Python scanner, and
displays a detailed report with verdict, audit score, per-severity findings, and stage-by-stage results.
This is the primary pre-publish security gate.

**Consumers:** CLI (`tank scan`), MCP server (`scan-skill` tool). Auth required (token).

**Single source of truth:**

- `packages/cli/src/commands/scan.ts` — `scanCommand()`
- `packages/mcp-server/src/tools/scan-skill.ts` — MCP wrapper
- `apps/registry-legacy/app/api/v1/scan/route.ts` — proxy to Python scanner
- `apps/python-api/` — 6-stage Python FastAPI scanner

---

## Layer 1: Structure

```
packages/
  cli/src/commands/scan.ts              # scanCommand() — pack, POST /api/v1/scan, display report
  mcp-server/src/tools/scan-skill.ts   # MCP wrapper
registry-legacy/app/api/v1/scan/route.ts           # POST — receives tarball, delegates to scanner service
scanner/api/analyze/scan.py            # Python FastAPI endpoint, runs all 6 stages
scanner/lib/scan/
  stage0_ingest.py                     # Extract and inventory the tarball
  stage1_structure.py                  # Package structure checks
  stage2_static.py                     # Static analysis via Bandit
  stage3_injection.py                  # Command injection detection
  stage4_secrets.py                    # Secret detection via detect-secrets
  stage5_supply.py                     # Supply chain checks via pip-audit + OSV
  verdict.py                           # Aggregate findings → verdict + audit_score
```

---

## Layer 2: Constraints

| #   | Rule                                                                                          | Rationale                                                       | Verified by   |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| C1  | Scan requires an auth token — rejects with 401 if missing                                     | Prevents anonymous abuse of scanner compute resources           | BDD scenario  |
| C2  | Scan works on directories with or without a `tank.json` manifest                              | Pre-publish scan of any directory, not just Tank skills         | BDD scenario  |
| C3  | Verdict is one of: `pass`, `pass_with_notes`, `flagged`, `fail`                               | Standardized verdict vocabulary used across CLI, web, and API   | BDD assertion |
| C4  | Security score is a decimal 0.0–10.0; 10.0 is reserved for scans with zero findings           | Keeps top score meaningful and prevents inflated trust signals  | BDD assertion |
| C5  | Findings are grouped by severity: `critical`, `high`, `medium`, `low`                         | Priority ordering for remediation                               | BDD assertion |
| C6  | Each finding includes: stage, severity, type, description, location (nullable)                | Enough context for the developer to locate and fix the issue    | BDD assertion |
| C7  | Stage results include: stage name, status (`passed`/`failed`), finding count, duration_ms     | Transparency about which scan stage found what                  | BDD assertion |
| C8  | A skill with no findings receives verdict `pass` and security score exactly `10.0`            | Clean skills should be clearly marked safe                      | BDD scenario  |
| C9  | A skill with hardcoded secrets receives at minimum a `flagged` verdict                        | Secrets are a high-severity finding that must not pass silently | BDD scenario  |
| C10 | Network errors reaching the scanner are reported as scan failure, not silent success          | Silent failures would give false security                       | BDD scenario  |
| C11 | Any finding (including low/medium) lowers security score below `10.0`                         | "Passed with notes" cannot look identical to fully clean scans  | BDD scenario  |
| C12 | Non-security hygiene checks (for example oversized files) do not contribute to security score | Separates operational quality from security risk scoring        | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                 | Expected Output                                                       |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| E1  | Scan a clean skill directory with no issues           | Verdict `pass`; score `10.0`; zero findings; all stages show `passed` |
| E2  | Scan a skill with a hardcoded API key                 | Verdict `flagged` or `fail`; at least one finding in stage4_secrets   |
| E3  | Scan without auth token                               | Fails with auth error; no report displayed                            |
| E4  | Scan a directory without `tank.json`                  | Succeeds; verdict and score returned using synthesized manifest       |
| E5  | `scan-skill({ directory: "/path/to/skill" })` via MCP | Report output contains verdict, score, findings, stage results        |
| E6  | Scanner service unreachable                           | Fails with network/connection error message                           |
| E7  | Scan a skill with only medium findings                | Verdict `pass_with_notes`; score below `10.0`                         |
| E8  | Scan a skill with only oversized-file stage1 finding  | Verdict may include notes; security score remains `10.0`              |
