# Intent: Scanner Report Redesign

## Problem

The security report is confusing for users:
1. **detect-secrets is broken** — stage4 silently fails, no secrets are detected
2. **Existing fields never displayed** — `cwe_id`, `remediation`, `confidence`, `llm_verdict` exist in `ScanFinding` type but are never rendered in any component
3. **External tools poorly attributed** — Cisco, Snyk, Bandit, detect-secrets, OSV.dev all produce findings but the frontend uses a hardcoded tool list instead of dynamic attribution from actual findings
4. **OSV.dev findings buried** — Stage 5 supply chain audit queries OSV.dev API for known vulnerabilities but results aren't well surfaced in the report
5. **npms.io quality scores unused** — Package quality scoring is fully implemented (`npms-client.ts`) but never shown in the security UI
6. **Too many false positives** — documentation prose and code examples flagged as injection attacks
7. **No remediation guidance** — users see "prompt injection detected" but don't know how to fix it
8. **Scan page limited** — only accepts tarball uploads and npm package URLs, can't scan GitHub folders, raw .md files, or skills.sh links
9. **No skill showcase** — no way to browse top skills (internal or external) with security posture visibility

## Success Criteria

1. detect-secrets runs correctly and reports real secrets with tool attribution
2. Every finding shows: what, why it's a problem, how to fix it, CWE link, confidence level, LLM corroboration
3. Tools strip dynamically renders from actual findings — Cisco, Snyk, Bandit, Semgrep, detect-secrets, OSV.dev, npms.io, LLM each shown with individual status + findings count
4. OSV.dev supply chain findings clearly labeled with CVE links and severity
5. npms.io package quality scores visible in dependency audit section
6. False positive rate < 5% — documentation prose, code examples, and placeholder values not flagged
7. Scan page accepts: GitHub folder URLs, raw .md file URLs, skills.sh links, npm packages, tarball uploads
8. Top Skills page shows internal (Tank) + external (skills.sh) skills with security verdict and trust badges
9. "Bulletproof" skills are clearly highlighted with explanation of why they're safe

## Constraints

- Python scanner is a separate service — changes require Docker rebuild
- No breaking changes to scan API response shape (additive only)
- False positive reduction must not suppress real threats
- skills.sh API surface needs research before implementation
- External skill cache requires new DB table + periodic sync

## Target Users

1. **Skill authors** — need clear feedback on what's wrong and how to fix it
2. **Skill consumers** — need to quickly understand if a skill is safe to install
3. **Security researchers** — need to see which tools ran and what each found

## Complexity: Complex
## Risk: Medium — scanner changes affect every skill's security verdict
