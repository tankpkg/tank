# Plan: Scan Bugfixes Trio

## Architecture

```mermaid
flowchart TD
    subgraph Registry["TANK REGISTRY"]
        SCAN_API["POST /api/v1/scan"]
        EXPANDER["url-expander.ts"]
        GH_API["GitHub API (NEW)"]
    end

    subgraph Scanner["PYTHON SCANNER"]
        STAGE4["stage4_secrets.py"]
        DS["detect-secrets lib"]
    end

    subgraph Docker["DOCKER BUILD"]
        DF["Dockerfile (python:3.12-alpine)"]
        UV["uv sync --frozen"]
    end

    SCAN_API -->|"expand URL"| EXPANDER
    EXPANDER -->|"1. resolve default_branch (NEW)"| GH_API
    EXPANDER -->|"2. build tarball URL"| CODELOAD["codeload.github.com"]
    SCAN_API -->|"proxy to scanner"| Scanner
    STAGE4 -->|"import"| DS
    DF --> UV --> Scanner
```

## ASCII Diagram

```
+------------------------------------------------------+
|                    USER BROWSER                       |
|                                                      |
|  /scan page                                          |
|    | url input                                       |
|    +-----> POST /api/v1/scan                         |
|    | <----- scan result                              |
|    v                                                 |
|  Scan Results                                        |
|    | Findings Table                                  |
|    |   +-- CWE links --> cwe.mitre.org               |
|    | Security Overview                               |
|                                                      |
+------------------------------------------------------+

+------------------------------------------------------+
|              TANK REGISTRY (Hono)                     |
|                                                      |
|  POST /api/v1/scan                                   |
|    |                                                 |
|    +-- expandScanUrl()  <--- FIX TARGET (Bug 2)      |
|    |     |                                           |
|    |     +-- detectURLType()                         |
|    |     +-- expandGitHubFolder()                    |
|    |     |     +-- NEW: resolveDefaultBranch()       |
|    |     |           |                               |
|    |     |           +-- GET api.github.com/repos/   |
|    |     |           |     -> default_branch         |
|    |     |           +-- fallback: main -> master    |
|    |     |                                           |
|    |     +-- expandSkillsShUrl()  (uses resolver)    |
|    |     +-- fetchSkillFileFromGitHub()  (uses it)   |
|    |     +-- scrapeAgentskillsGithub()  (uses it)    |
|    |                                                 |
|    +-- Proxy to Python scanner                       |
|                                                      |
+------------------------------------------------------+

+------------------------------------------------------+
|              PYTHON SCANNER (Docker)                  |
|                                                      |
|  Dockerfile:                                         |
|    FROM python:3.12-alpine  <--- FIX (Bug 1)        |
|    RUN uv sync --frozen                              |
|    RUN python -c "import detect_secrets"  (verify)   |
|                                                      |
|  stage4_secrets.py:                                  |
|    run_detect_secrets()                              |
|    | try:                                            |
|    +-> import detect_secrets  (NOW WORKS)            |
|    | except ImportError:                             |
|    +-> LOG + sys.version + sys.platform              |
|        severity="medium" (was "low")                 |
|                                                      |
+------------------------------------------------------+
```

## Blast Radius

| Area           | Impact                | Risk                      |
| -------------- | --------------------- | ------------------------- |
| URL expansion  | All GitHub scan paths | High -- every GitHub scan |
| Docker build   | Scanner container     | Medium -- build-only      |
| Python scanner | Error handling        | Low -- logging only       |
| Scan page      | Downstream of Bug 2   | None -- no changes needed |

## Risk: Medium

- Bug 2 fix adds network call to critical scan path -- mitigated by 10-min cache
- Bug 1 fix changes Docker base image -- mitigated by using stable 3.12
