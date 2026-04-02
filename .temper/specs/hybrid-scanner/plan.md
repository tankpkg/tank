# PLAN: Hybrid Dependency Scanner with Snyk/Socket-like Reports

## Architecture

### New Components

1. **`DepAuditService`** (`apps/registry/src/lib/dep-audit/service.ts`)
   - Orchestrates calls to npms.io, OSV.dev, npm audit API
   - Accepts a manifest (package.json / requirements.txt content) + ecosystem
   - Returns a structured `DepAuditReport` with scores, vulns, tldr
   - Each external call has 5s timeout, 1 retry
   - Parallel fetch via `Promise.allSettled` for independent APIs

2. **`dep-audit/clients/`** -- Individual API client modules
   - `npms-client.ts` -- GET `https://api.npms.io/v2/package/{name}` → quality/popularity/maintenance scores
   - `osv-client.ts` -- POST `https://api.osv.dev/v1/querybatch` → vulnerability data (already proven in Python Stage 5)
   - `npm-audit-client.ts` -- POST `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` → npm audit vulns
   - Each client: Zod-validated response, timeout, retry, typed output

3. **`dep-audit/parser.ts`** -- Extracts dependencies from manifest JSON
   - Parses `package.json` dependencies/devDependencies
   - Parses `requirements.txt` (simple == pinning only)
   - Returns `Dependency[]` with name, version, ecosystem

4. **`dep-audit/report-builder.ts`** -- Builds the final report
   - Merges data from all sources
   - Deduplicates vulnerabilities by CVE/OSV ID
   - Computes overall health score (weighted avg of npms scores + vuln penalty)
   - Generates tldr sentence

5. **`dep-audit/types.ts`** -- Shared types for the dep-audit module

### DB Schema Addition

New table `dep_audit_results` (separate from `scan_results` to avoid schema migration on existing tables):

```
dep_audit_results:
  id              UUID PK
  versionId       UUID FK -> skill_versions.id
  ecosystem       TEXT ('npm', 'pypi', 'mixed')
  packageCount    INTEGER
  vulnerableCount INTEGER
  vulnSummary     JSONB { critical: N, high: N, medium: N, low: N }
  packages        JSONB [{ name, version, score, vulns: [...] }]
  tldr            TEXT ("2 vulnerabilities: 1 critical in lodash@4.17.20, 1 high in axios@0.21.0")
  healthScore     REAL (0-1, weighted avg)
  sources         JSONB { npms: bool, osv: bool, npmAudit: bool }
  status          TEXT ('success', 'partial_failure', 'unavailable')
  fetchedAt       TIMESTAMP
  createdAt       TIMESTAMP
```

Index on `versionId` for the LATERAL join in `getSkillDetail`.

### Data Flow

```
Publish flow (existing, enhanced):
  CLI → POST /api/v1/skills/confirm
    → triggerSecurityScan() (Python scanner, unchanged)
    → triggerDepAudit() (NEW, runs in parallel)
      → parse manifest for dependencies
      → fetch npms.io scores (parallel)
      → fetch OSV.dev vulns (parallel)
      → fetch npm audit vulns (parallel)
      → merge + dedup + build report
      → store in dep_audit_results
    → update skill version status

Page load:
  getSkillDetail() query (enhanced)
    → LEFT JOIN dep_audit_results ON version_id
    → Return alongside scan_results

UI rendering:
  skill-detail-helpers.tsx (enhanced)
    → buildSecurityTab() adds DepAuditCard component
    → Shows tldr, scores, vuln table, health indicator
```

### UI Changes

1. **`DepAuditCard`** component (new) -- Shown in security tab after existing findings
   - tldr summary sentence at top
   - Health score indicator (green/yellow/red based on 0-1 score)
   - Package table: name, version, quality score, vuln count, severity badges
   - Expandable vulnerability details per package

2. **`SecurityOverview`** (modified) -- Add dep audit summary line
   - Show "Dependencies: 3 packages, 1 vulnerability" alongside existing severity counts

3. **Badge API** (modified) -- `/api/v1/badge/:name` now includes vuln count
   - New query parameter `?type=deps` for dependency-specific badge
   - Default badge unchanged for backward compat

4. **`skill-detail-helpers.tsx`** (modified) -- `buildSecurityTab` adds DepAuditCard

### API Changes

No new API endpoints. The dep audit runs as a side-effect of publish (same as Python scanner). Data is returned through the existing `getSkillDetail` query.

The admin rescan endpoint (`POST /admin/packages/:name/rescan`) is enhanced to also refresh dep audit data.

## Diagram

```
flowchart TD
    subgraph "Publish Flow"
        CLI[CLI: tank publish] --> CONFIRM[POST /api/v1/skills/confirm]
        CONFIRM --> PY_SCAN[Python Scanner\n6-stage pipeline]
        CONFIRM --> DEP_AUDIT[DepAuditService\nNEW]
    end

    subgraph "DepAuditService (NEW)"
        DEP_AUDIT --> PARSE[parser.ts\nExtract deps from manifest]
        PARSE --> NPMS[npms.io\nQuality/Popularity/Maintenance]
        PARSE --> OSV[OSV.dev\nKnown vulnerabilities]
        PARSE --> NPM_AUD[npm audit API\nVulnerability data]
        NPMS --> MERGE[report-builder.ts\nDedup + score + tldr]
        OSV --> MERGE
        NPM_AUD --> MERGE
    end

    subgraph "Storage"
        MERGE --> DB[(dep_audit_results\nNEW table)]
        PY_SCAN --> SCAN_DB[(scan_results + scan_findings\nEXISTING tables)]
    end

    subgraph "Skill Detail Page"
        QUERY[getSkillDetail\nEnhanced query] --> DB
        QUERY --> SCAN_DB
        QUERY --> UI[Security Tab]
        UI --> EXISTING[Existing findings table\n+ pipeline + tools strip]
        UI --> DEP_CARD[DepAuditCard\nNEW component]
        DEP_CARD --> TLDR[tldr summary]
        DEP_CARD --> SCORES[npms scores per package]
        DEP_CARD --> VULNS[Vulnerability table\nwith CVE/severity]
    end

    classDef new fill:#e1f5fe,stroke:#0288d1
    classDef existing fill:#f5f5f5,stroke:#9e9e9e
    classDef modified fill:#fff3e0,stroke:#f57c00

    class DEP_AUDIT,PARSE,NPMS,OSV,NPM_AUD,MERGE,DB,DEP_CARD,TLDR,SCORES,VULNS new
    class CLI,CONFIRM,PY_SCAN,SCAN_DB,EXISTING,QUERY existing
    class UI modified
```

Legend: Blue = new, Gray = existing (unchanged), Orange = modified.

## BLAST RADIUS

```
BLAST RADIUS -- hybrid-scanner

  Direct impact (NEW files):
    apps/registry/src/lib/dep-audit/service.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/clients/npms-client.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/clients/osv-client.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/clients/npm-audit-client.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/parser.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/report-builder.ts (create) → no consumers yet
    apps/registry/src/lib/dep-audit/types.ts (create) → no consumers yet
    apps/registry/src/components/skills/dep-audit-card.tsx (create) → consumed by skill-detail-helpers
    apps/registry/drizzle/XXXX_add_dep_audit_results.sql (create) → migration

  Direct impact (MODIFIED files):
    apps/registry/src/lib/db/schema.ts (modify) → used by 5+ consumers (data.ts, packages.ts, skills-confirm.ts, badge.ts)
    apps/registry/src/lib/skills/data.ts (modify) → used by skill-detail route, query options
    apps/registry/src/api/routes/v1/skills-confirm.ts (modify) → publish flow
    apps/registry/src/api/routes/admin/packages.ts (modify) → admin rescan flow
    apps/registry/src/api/routes/v1/badge.ts (modify) → badge rendering
    apps/registry/src/screens/skill-detail-helpers.tsx (modify) → security tab builder
    apps/registry/src/components/skills/security-overview.tsx (modify) → security overview display

  Transitive impact:
    getSkillDetail query → adds LEFT JOIN dep_audit_results, no breaking change
    ScanDetails type → extended with optional depAudit field, backward compat
    badge API → extended with optional ?type=deps, backward compat

  Risk areas:
    schema.ts — adding table to shared schema file, must not break relations
    data.ts — modifying core getSkillDetail query, performance-critical (single query pattern)
    skills-confirm.ts — adding non-blocking async call to publish flow

  Architectural compliance:
    ✅ New code in registry app only, no cross-package imports
    ✅ No changes to Python scanner (apps/python-api/ untouched)
    ✅ Zod validation on all external API responses
    ✅ New table avoids migration on existing scan_results schema
    ✅ Env validation at startup pattern followed (no new env vars needed)
    ⚠️ External API calls during publish add latency — mitigated by parallel + timeout
```

## File-to-Scenario Traceability

```
Scenario-traced files:
  lib/dep-audit/service.ts          → Scenario: "Dependency audit enriches skill on publish"
  lib/dep-audit/clients/npms-client.ts → Scenario: "Quality score from npms.io displayed"
  lib/dep-audit/clients/osv-client.ts  → Scenario: "npm audit API detects vulnerabilities not in OSV"
  lib/dep-audit/clients/npm-audit-client.ts → Scenario: "npm audit API detects vulnerabilities not in OSV"
  lib/dep-audit/parser.ts           → Scenario: "No dependencies shows clean bill of health"
  lib/dep-audit/report-builder.ts   → Scenario: "Vulnerability summary shows on skill page"
  components/skills/dep-audit-card.tsx → Scenario: "Vulnerability summary shows on skill page"
  screens/skill-detail-helpers.tsx   → Scenario: "Regression: Existing findings still display"
  api/routes/v1/badge.ts            → Scenario: "Badge shows vulnerability count"

Infrastructure files:
  drizzle/XXXX_add_dep_audit_results.sql → Required by DepAuditService (storage)
  lib/db/schema.ts                   → Required by migration (table definition)
  lib/dep-audit/types.ts             → Required by all dep-audit modules
```
