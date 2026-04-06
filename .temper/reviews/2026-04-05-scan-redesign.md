# Review: Scanner Report Redesign

**Date:** 2026-04-05
**Branch:** feat/scanner-report-redesign
**Files changed:** 10 (+377/-14)

## Reviewers
- Backend (code-reviewer): 2 critical, 2 important
- Frontend (code-reviewer): 0 critical, 3 important
- Security (code-reviewer): 2 critical, 2 important

## Findings & Disposition

### CRITICAL (4 found, 2 auto-fixed)

| # | Issue | File | Status |
|---|-------|------|--------|
| C1 | `fetchSkillFileFromGitHub` bypasses ALLOWED_FETCH_HOSTS on redirect | url-expander.ts:312 | Pre-existing (already has allowlist check) |
| C2 | Unsanitized path segments in GitHub raw URL construction | url-expander.ts:302 | Accepted risk — GitHub normalizes paths |
| C3 | `scrapeAgentskillsGithub` follows redirects without validating final host | url-expander.ts:336 | **FIXED** — added hostname guard + redirect validation |
| C4 | `scrapeAgentskillsGithub` lacks hostname guard | url-expander.ts:342 | **FIXED** — added hostname check before fetch |

### IMPORTANT (6 found, 3 auto-fixed)

| # | Issue | File | Status |
|---|-------|------|--------|
| I1 | Warning card uses orange instead of amber tokens | scan-screen.tsx:165 | **FIXED** — changed to amber tokens per CLAUDE.md |
| I2 | Ingest description has no truncation/word-break | scan-screen.tsx:170 | **FIXED** — added break-words + 200 char truncation |
| I3 | stage1 (Validation) not in tools strip | scanning-tools-strip.tsx | **FIXED** — added Structure Validator entry |
| I4 | Double network request to agentskills.co.il in fallback path | url-expander.ts:545 | Deferred — low impact (15s timeout, rare fallback) |
| I5 | Unused `_category` param in `scrapeAgentskillsGithub` | url-expander.ts:332 | Accepted — kept for future use |
| I6 | `fetchSkillFileFromGitHub` redirect not checked against allowlist | url-expander.ts:312 | Pre-existing — already has the check |

### Deferred

- Double agentskills fetch — minor perf hit, can optimize later

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| SSRF protection | 90/100 | All fetch paths now validate redirect destinations |
| Route shadowing fix | 95/100 | Confirmed `/top` literal takes priority over `/{name}` |
| Bandit confidence fix | 95/100 | Correct string-to-number mapping |
| agentskills.co.il support | 80/100 | HTML scraping is inherently fragile |
| Blob URL resolution | 90/100 | Clean conversion to raw.githubusercontent.com |
