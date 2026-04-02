# INTENT: Hybrid Dependency Scanner with Snyk/Socket-like Reports

## Problem

Tank's current security model runs a heavy Python scanner (6 stages, ~30s) for every publish. The scanner produces detailed findings but the dependency audit (Stage 5) only queries OSV.dev. Users expect Snyk/Socket-style dependency intelligence: quality scores, known vulnerabilities from multiple sources, maintenance health, and concise tldr summaries -- all without running the Python scanner locally.

The Python scanner is also a deployment dependency. On-prem users must run the Python container even though 90% of the value they see comes from external API data that could be fetched directly from the registry TypeScript layer.

## Success Criteria

1. **Registry-side dependency enrichment** -- When a skill with npm/Python dependencies is published, the registry TypeScript service fetches package health data from npms.io + vulnerability data from OSV.dev + npm audit API and stores it alongside the scan results.
   - Validate: code -- `DepAuditService` class exists in `apps/registry/src/lib/dep-audit/`

2. **Snyk-like security tab** -- Skill detail pages show a concise dependency audit summary: quality score, vulnerability count by severity, maintenance status, and a tldr sentence (e.g. "2 vulnerabilities found, 1 critical in lodash@4.17.20").
   - Validate: scenario -- covered by "Dependency audit shows on skill page"

3. **Python scanner unchanged** -- The existing 6-stage Python scanner continues to run for Tank-specific skill analysis (prompt injection, secrets, structure). The new dependency enrichment runs in parallel or as a post-scan enhancement in the registry TS layer.
   - Validate: code -- no files in `apps/python-api/` are modified

4. **Badge API extended** -- The SVG badge shows a vulnerability count (e.g. "0 vulns", "3 vulns") alongside the existing verdict.
   - Validate: scenario -- covered by "Badge shows vulnerability count"

5. **No paid APIs** -- All external data sources are free and require no authentication (npms.io, OSV.dev, npm audit API, GitHub Advisories public endpoint).
   - Validate: code -- no API key env vars added for external sources

6. **Graceful degradation** -- If external APIs are unavailable, the skill page still loads. Dependency data is shown as "unavailable" rather than blocking the page.
   - Validate: scenario -- covered by "External API failure graceful degradation"

## Constraints

- No changes to the Python scanner codebase (`apps/python-api/`)
- No new paid API dependencies
- No DB schema changes to `scan_results` or `scan_findings` -- new data stored in a separate `dep_audit_results` table
- External API calls must have timeouts (5s default) and retry limits (1 retry)
- Rate-limit awareness: GitHub Advisories has 60/hr unauthenticated limit
- Data must be cached in DB to avoid re-fetching on every page view

## Target Users

- **Skill consumers**: Want to know at a glance if a skill's dependencies are safe
- **Skill publishers**: Get immediate feedback on dependency health after publish
- **Security reviewers**: Need vulnerability details with CVE/CWE references

## Scenarios (BDD)

### Scenario 1: Dependency audit enriches skill on publish

```gherkin
Given a skill "lodash-helper" with package.json containing lodash@4.17.20
When the skill is published and confirmed
Then the registry fetches dependency audit data from npms.io and OSV.dev
And stores the audit in dep_audit_results with versionId linkage
And the skill detail page shows the audit data in the security tab
```

**Note:** integration -- involves registry API + external API calls + DB storage

### Scenario 2: Vulnerability summary shows on skill page

```gherkin
Given a skill with 2 high and 1 critical vulnerability in dependencies
When a user visits the skill detail page
Then the security tab shows "3 vulnerabilities found" with severity breakdown
And a tldr reads "1 critical, 2 high vulnerabilities in dependencies"
And each vulnerability lists the package, CVE, and severity
```

**Note:** unit -- UI rendering from stored data

### Scenario 3: No dependencies shows clean bill of health

```gherkin
Given a skill with no package.json or requirements.txt
When the dependency audit runs
Then the security tab shows "No dependencies found"
And the audit is stored as clean (0 vulns, no packages)
```

**Note:** unit -- logic branch for empty manifest

### Scenario 4: External API failure graceful degradation

```gherkin
Given npms.io returns a 503 timeout
When the dependency audit runs during publish
Then the audit is stored with status "partial_failure"
And the skill page shows "Dependency audit unavailable" in the security tab
And the publish still succeeds (non-blocking)
```

**Note:** mock -- external API failure simulation

### Scenario 5: Quality score from npms.io displayed

```gherkin
Given lodash has npms.io score: quality=0.85, popularity=0.95, maintenance=0.80
When the dependency audit runs for a skill depending on lodash
Then the skill page shows "Quality: 0.85, Popularity: 0.95, Maintenance: 0.80" for lodash
And an overall package health indicator is computed
```

**Note:** mock -- npms.io API response

### Scenario 6: Badge shows vulnerability count

```gherkin
Given a skill "my-skill" with 0 vulnerabilities in dependencies
When the badge SVG is requested at /api/v1/badge/my-skill
Then the SVG shows "0 vulns" with green color
Given a skill "risky-skill" with 3 vulnerabilities
When the badge SVG is requested
Then the SVG shows "3 vulns" with orange color
```

**Note:** unit -- badge rendering logic

### Scenario 7: Audit data refreshes on rescan

```gherkin
Given an admin triggers rescan for skill "my-skill"
When the rescan completes
Then the dep_audit_results for the latest version are replaced with fresh data
And the skill page reflects the updated vulnerability information
```

**Note:** integration -- admin rescan endpoint + audit refresh

### Scenario 8: npm audit API detects vulnerabilities not in OSV

```gherkin
Given a dependency with a vulnerability reported by npm audit but not OSV.dev
When the dependency audit runs
Then the vulnerability is still captured from the npm audit API response
And deduplicated against OSV findings by CVE ID
```

**Note:** mock -- npm audit API response with unique CVE

### Regression Guard: Existing Python scanner findings still display

```gherkin
Given a skill scanned by the Python scanner with stage2 findings
When the dependency audit enriches the skill
Then the original Python scanner findings remain visible in the security tab
And the dependency audit section appears as a separate card below
```

**Note:** unit -- UI composition test
