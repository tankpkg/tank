# TASKS: Hybrid Dependency Scanner with Snyk/Socket-like Reports

## Task 1 — DB Schema: dep_audit_results table [SEQUENTIAL]

Traced to: Infrastructure: required by DepAuditService

**What:** Add `dep_audit_results` table to Drizzle schema + create migration.

**Files:**

- Modify: `apps/registry/src/lib/db/schema.ts`
- Create: migration SQL (via `just db push` or manual)

**Schema:**

```sql
dep_audit_results:
  id              UUID PK DEFAULT gen_random_uuid()
  version_id      UUID FK -> skill_versions.id NOT NULL
  ecosystem       TEXT NOT NULL  -- 'npm', 'pypi', 'mixed', 'none'
  package_count   INTEGER NOT NULL DEFAULT 0
  vulnerable_count INTEGER NOT NULL DEFAULT 0
  vuln_summary    JSONB  -- { critical: N, high: N, medium: N, low: N }
  packages        JSONB  -- [{ name, version, scores, vulns }]
  tldr            TEXT   -- "2 vulns: 1 critical in lodash@4.17.20"
  health_score    REAL   -- 0.0-1.0
  sources_queried JSONB  -- { npms: bool, osv: bool, npm_audit: bool }
  status          TEXT NOT NULL DEFAULT 'pending'  -- 'pending','completed','partial_failure','failed'
  created_at      TIMESTAMP DEFAULT NOW()

Index on (version_id, created_at DESC) — latest per version
```

**Validate:** `just db push` succeeds, schema.ts typechecks (`bun run tsc --noEmit`)

---

## Task 2 — Dep-Audit Types [SEQUENTIAL: after Task 1]

Traced to: Infrastructure: required by all dep-audit modules

**What:** Create shared types for the dependency audit module.

**Files:**

- Create: `apps/registry/src/lib/dep-audit/types.ts`

**Types:**

- `Dependency` — { name, version, ecosystem: 'npm'|'pypi' }
- `PackageHealth` — { name, version, quality, popularity, maintenance, overallScore }
- `VulnerabilityInfo` — { id, cve, severity, title, url, package, version }
- `DepAuditReport` — { ecosystem, packageCount, vulnerableCount, vulnSummary, packages, tldr, healthScore, sources, status }
- `DepAuditStatus` — 'pending' | 'completed' | 'partial_failure' | 'failed'

**Validate:** `bun run tsc --noEmit` clean

---

## Task 3 — Manifest Parser [PARALLEL: with Task 4]

Traced to: Scenario: "No dependencies shows clean bill of health"

**What:** Parse dependencies from skill manifests (package.json, requirements.txt).

**Files:**

- Create: `apps/registry/src/lib/dep-audit/parser.ts`

**Logic:**

- Accept manifest JSONB from skill_versions
- Extract `dependencies` + `devDependencies` from package.json manifest
- Extract requirements.txt lines from file list (if present in manifest.files)
- Return `Dependency[]` with ecosystem tag
- Handle empty manifests → return []

**Validate:** Unit tests with sample manifests (no deps, npm deps, mixed deps)

---

## Task 4 — External API Clients [PARALLEL: with Task 3]

Traced to: Scenario: "Quality score from npms.io displayed", "npm audit API detects vulnerabilities not in OSV"

**What:** Create typed clients for npms.io, OSV.dev, npm audit API.

**Files:**

- Create: `apps/registry/src/lib/dep-audit/clients/npms-client.ts`
- Create: `apps/registry/src/lib/dep-audit/clients/osv-client.ts`
- Create: `apps/registry/src/lib/dep-audit/clients/npm-audit-client.ts`

**Each client:**

- Zod schema for response validation (safeParse)
- 5s timeout via AbortSignal.timeout
- 1 retry on network error
- Returns typed data or null on failure (never throws)
- Log failures via structured logger

**npms-client:** GET `https://api.npms.io/v2/package/{name}` → quality, popularity, maintenance scores (0-1)
**osv-client:** POST `https://api.osv.dev/v1/querybatch` → vulns array per package (reuse pattern from Python stage5)
**npm-audit-client:** POST `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` → advisories by package

**Validate:** Unit tests with mocked fetch responses

---

## Task 5 — Report Builder [SEQUENTIAL: after Task 3, 4]

Traced to: Scenario: "Vulnerability summary shows on skill page"

**What:** Merge data from all sources into a structured DepAuditReport with tldr.

**Files:**

- Create: `apps/registry/src/lib/dep-audit/report-builder.ts`

**Logic:**

- Accept outputs from parser + all clients
- Deduplicate vulns by CVE ID / OSV ID
- Compute health score: weighted average of npms scores minus vuln penalties
- Generate tldr sentence: "{N} vulnerabilities: {summary of top 3}"
- Handle partial data (some APIs failed) → status = 'partial_failure'

**Validate:** Unit tests with various input combinations

---

## Task 6 — DepAuditService Orchestration [SEQUENTIAL: after Task 5]

Traced to: Scenario: "Dependency audit enriches skill on publish"

**What:** Service class that orchestrates the full audit: parse → fetch → build → store.

**Files:**

- Create: `apps/registry/src/lib/dep-audit/service.ts`

**Logic:**

- `async runAudit(versionId, manifest): Promise<void>`
- Parse dependencies from manifest
- If no deps → store clean report, return
- Fetch from all sources in parallel via Promise.allSettled
- Build report via report-builder
- Store in dep_audit_results table
- Never throws — errors stored as status='failed'

**Validate:** Integration test with mocked DB + mocked external APIs

---

## Task 7 — Integrate into Publish Flow [SEQUENTIAL: after Task 6]

Traced to: Scenario: "Dependency audit enriches skill on publish"

**What:** Call DepAuditService during skill confirmation, non-blocking.

**Files:**

- Modify: `apps/registry/src/api/routes/v1/skills-confirm.ts`

**Changes:**

- After Python scanner completes (or fails), fire `depAuditService.runAudit()` as non-blocking side effect
- Use `Promise.allSettled` or fire-and-forget with error logging
- Publish response unchanged — dep audit does not block

**Validate:** `bun run tsc --noEmit`, existing publish tests still pass

---

## Task 8 — Integrate into Admin Rescan [SEQUENTIAL: after Task 6]

Traced to: Scenario: "Audit data refreshes on rescan"

**What:** Refresh dep audit data when admin triggers rescan.

**Files:**

- Modify: `apps/registry/src/api/routes/admin/packages.ts`

**Changes:**

- In rescan handler, after Python rescan completes, call `depAuditService.runAudit()`
- Delete old dep_audit_results for the version before inserting new ones (or rely on latest-by-created_at query)

**Validate:** `bun run tsc --noEmit`, existing rescan tests still pass

---

## Task 9 — Data Access: Fetch Dep Audit in Skill Detail [SEQUENTIAL: after Task 7]

Traced to: Scenario: "Vulnerability summary shows on skill page"

**What:** Add dep audit data to the skill detail query.

**Files:**

- Modify: `apps/registry/src/lib/skills/data.ts`

**Changes:**

- Add LEFT JOIN to dep_audit_results in `getSkillDetail()` query
- Add `depAudit` field to `ScanDetails` type (optional)
- Parse dep audit JSONB from query result
- Maintain single-query performance pattern

**Validate:** `bun run tsc --noEmit`

---

## Task 10 — UI: DepAuditCard Component [PARALLEL: with Task 9]

Traced to: Scenario: "Vulnerability summary shows on skill page"

**What:** Create the Snyk/Socket-like dependency audit display component.

**Files:**

- Create: `apps/registry/src/components/skills/dep-audit-card.tsx`

**Design:**

- Card container (shadcn Card)
- tldr summary sentence at top
- Health score indicator (color-coded dot + number)
- Package table: name, version, quality score, vuln count, severity badges
- Expandable vulnerability details per package
- "No dependencies found" empty state
- "Audit unavailable" state for partial_failure/failed

**Validate:** Component renders with mock data, dark mode correct

---

## Task 11 — UI: Security Tab Integration [SEQUENTIAL: after Task 9, 10]

Traced to: Scenario: "Regression: Existing findings still display"

**What:** Add DepAuditCard to the security tab, below existing findings.

**Files:**

- Modify: `apps/registry/src/screens/skill-detail-helpers.tsx`
- Modify: `apps/registry/src/components/skills/security-overview.tsx`

**Changes:**

- Import and render DepAuditCard in `buildSecurityTab()`
- Add dep audit summary line to SecurityOverview (e.g., "Dependencies: 3 packages, 1 vulnerability")
- Existing findings, pipeline, tools strip all remain unchanged

**Validate:** Visual check in dark mode, existing security data still shows

---

## Task 12 — Badge API: Vulnerability Count [PARALLEL: with Task 11]

Traced to: Scenario: "Badge shows vulnerability count"

**What:** Extend badge SVG to optionally show vulnerability count.

**Files:**

- Modify: `apps/registry/src/api/routes/v1/badge.ts`

**Changes:**

- Add query param `?type=deps` for dependency-specific badge
- When type=deps: query dep_audit_results for vuln count
- Show "{N} vulns" with green (0) / yellow (1-2) / orange (3+) / red (critical) color
- Default badge (no type param) unchanged for backward compat
- Cache header: 5min

**Validate:** Unit test badge SVG generation

---

## Task 13 — Tests [SEQUENTIAL: after all]

Traced to: Scenario: all

**What:** Unit + integration tests for the new module.

**Files:**

- Create: `apps/registry/src/lib/dep-audit/__tests__/parser.test.ts`
- Create: `apps/registry/src/lib/dep-audit/__tests__/report-builder.test.ts`
- Create: `apps/registry/src/lib/dep-audit/__tests__/npms-client.test.ts`
- Create: `apps/registry/src/lib/dep-audit/__tests__/osv-client.test.ts`
- Create: `apps/registry/src/lib/dep-audit/__tests__/npm-audit-client.test.ts`
- Create: `apps/registry/src/lib/dep-audit/__tests__/service.test.ts`

**Validate:** `just test registry` passes
