# Plan: Scanner Report Redesign

## Architecture Diagram

```mermaid
flowchart TD
    subgraph External["EXTERNAL INPUTS"]
        GH_FOLDER["GitHub folder/file URLs"]
        SKILLS_SH["skills.sh skills"]
        RAW_MD["Raw .md file URLs"]
        NPM_TAR["npm registry tarballs"]
    end

    subgraph Internal["INTERNAL INPUTS"]
        TANK_SKILLS["Tank registry skills"]
        PUB_PKG["Published packages"]
        TAR_UPLOAD["tarball uploads"]
    end

    subgraph URLExpand["URL EXPANDER (NEW)"]
        GH_API["GitHub API -> tarball URL"]
        SH_RESOLVE["skills.sh -> skill URL"]
        RAW_INLINE["raw .md -> inline scan"]
    end

    subgraph TankAPI["TANK API"]
        TOP_API["GET /api/v1/skills/top"]
        EXT_API["GET /api/v1/skills/external"]
        SCAN_API["POST /api/v1/scan"]
    end

    subgraph Scanner["PYTHON SCANNER (FIXED)"]
        S0["Stage 0: Ingest (supports .md)"]
        S1["Stage 1: Structure validation"]
        S2["Stage 2: Static (Bandit + Semgrep)"]
        S3["Stage 3: Injection + Cisco + Snyk"]
        S4["Stage 4: Secrets (FIXED)"]
        S5["Stage 5: Supply chain (OSV)"]
        REMEDIATE["Remediation enrichment"]
        TOOL_ATTR["Per-finding tool attribution"]
        FP_SUPPRESS["False-positive suppression"]
    end

    subgraph Report["SECURITY REPORT UX (NEW)"]
        VERDICT["Verdict Hero"]
        TOOLS_STRIP["Tools Ran (expanded)"]
        FINDINGS["Findings (grouped by category)"]
        PIPELINE["Pipeline Visualization"]
        DEP_AUDIT["Dependency Audit"]
    end

    subgraph Showcase["TOP SKILLS SHOWCASE (NEW)"]
        TANK_PANEL["From Tank (internal)"]
        EXT_PANEL["From skills.sh (external)"]
        TRUST["Trust Badge + Verdict"]
    end

    GH_FOLDER --> GH_API
    SKILLS_SH --> SH_RESOLVE
    RAW_MD --> RAW_INLINE
    TANK_SKILLS --> TOP_API
    PUB_PKG --> SCAN_API
    TAR_UPLOAD --> SCAN_API

    GH_API --> SCAN_API
    SH_RESOLVE --> SCAN_API
    RAW_INLINE --> SCAN_API

    SCAN_API --> S0
    S0 --> S1 --> S2 --> S3 --> S4 --> S5
    S3 --> TOOL_ATTR
    S4 --> TOOL_ATTR
    S3 --> FP_SUPPRESS
    S4 --> FP_SUPPRESS
    S5 --> REMEDIATE

    Scanner --> Report
    Scanner --> Showcase
```

## ASCII Diagram

```
+-----------------------------+     +-----------------------------+
|     EXTERNAL INPUTS         |     |     INTERNAL INPUTS         |
|                             |     |                             |
| - GitHub folder/file URLs   |     | - Tank registry skills      |
| - skills.sh skills          |     | - Published packages        |
| - Raw .md file URLs         |     | - tarball uploads           |
| - npm registry tarballs     |     |                             |
+-------------+---------------+     +-------------+---------------+
              |                                   |
              v                                   v
+-------------+---------------+   +---------------+---------------+
|    URL EXPANDER (NEW)       |   |       TANK API               |
|                             |   |                               |
| - GitHub API -> tarball URL |   | GET /api/v1/skills/top        |
| - skills.sh -> skill URL    |   | GET /api/v1/skills/external   |
| - raw .md -> inline scan    |   | POST /api/v1/scan (expanded)  |
+-------------+---------------+   +---------------+---------------+
              |                                   |
              +------------------+----------------+
                                 |
                                 v
              +------------------+----------------+
              |     PYTHON SCANNER (FIXED)        |
              |                                   |
              | Stage 0: Ingest (supports .md)    |
              | Stage 1: Structure validation     |
              | Stage 2: Static (Bandit + Semgrep)|
              | Stage 3: Injection + Cisco + Snyk |
              | Stage 4: Secrets (FIXED)          |
              |   - detect-secrets WORKING        |
              |   - Custom patterns (fewer FPs)   |
              |   - Tool attribution per finding  |
              | Stage 5: Supply chain (OSV)       |
              |                                   |
              | NEW: Remediation enrichment       |
              | NEW: Per-finding tool attribution  |
              | NEW: False-positive suppression   |
              +------------------+----------------+
                                 |
                                 v
              +------------------+----------------+
              |     SECURITY REPORT UX (NEW)       |
              |                                    |
              | +--------------------------------+ |
              | | VERDICT HERO                   | |
              | | "VERIFIED" / "CONCERNS" / etc  | |
              | | Human-readable 1-line summary   | |
              | +--------------------------------+ |
              | | TOOLS RAN (expanded)            | |
              | | Cisco | Snyk | detect-secrets  | |
              | | Bandit | Semgrep | OSV | LLM   | |
              | | Each shows: ran/failed/findings | |
              | +--------------------------------+ |
              | | FINDINGS (grouped by category)  | |
              | | - Per-finding: what + why + fix | |
              | | - Remediation guidance           | |
              | | - CWE links                      | |
              | | - Confidence indicator            | |
              | +--------------------------------+ |
              | | PIPELINE VIS (kept)             | |
              | | DEP AUDIT (kept)                | |
              | +--------------------------------+ |
              +------------------------------------+

              +------------------------------------+
              |     TOP SKILLS SHOWCASE (NEW)       |
              |                                    |
              | +----------+ +-------------------+ |
              | | FROM TANK | | FROM SKILLS.SH    | |
              | | (internal)| | (external)        | |
              | +----------+ +-------------------+ |
              | | Ranked by downloads + score     | |
              | | Each skill card shows:           | |
              | |  - Trust badge                   | |
              | |  - Quick scan verdict             | |
              | |  - "Why safe" / "Why unsafe"     | |
              | |  - Click -> full security report  | |
              +------------------------------------+
```

## Blast Radius

| Area | Files | Impact |
|------|-------|--------|
| Python scanner | `stage4_secrets.py`, `models.py`, `verdict.py`, `dedup.py`, `remediation.py`, `stage3_injection.py` | Fix detect-secrets, reduce FPs, enrich findings |
| Scan API | `api/routes/v1/scan.ts`, `lib/scan/url-validator.ts` | Expand accepted URLs, new input types |
| URL expander (NEW) | `lib/scan/url-expander.ts` | GitHub/skills.sh URL normalization |
| Skill detail screen | `skill-detail-screen.tsx`, `skill-detail-helpers.tsx` | Wire remediation to UI |
| Security components | `security-overview.tsx`, `findings-table.tsx`, `scanning-tools-strip.tsx`, `scan-pipeline.tsx` | UX redesign |
| Scan screen | `scan-screen.tsx` | Accept folders, .md files, expanded results |
| Top skills (NEW) | `screens/top-skills-screen.tsx`, `api/routes/v1/top-skills.ts` | New page + API |
| DB schema | `lib/db/schema.ts` | External skill cache table |
| Data types | `lib/skills/data.ts` | `ScanFinding` adds `remediation`, `cwe_id` display |
