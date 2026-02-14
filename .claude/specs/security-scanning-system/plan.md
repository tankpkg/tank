# Security Scanning System — Technical Plan (HOW)

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Vercel Deployment                      │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │  Next.js TS Routes  │    │  Python Functions         │ │
│  │                     │    │  (apps/web/api-python/)   │ │
│  │  POST /api/v1/      │    │                          │ │
│  │  skills/confirm     │───▶│  POST /api/analyze/scan  │ │
│  │                     │    │  (orchestrator)           │ │
│  │  GET /api/v1/       │    │       │                  │ │
│  │  skills/[n]/[v]     │    │       ▼                  │ │
│  │                     │    │  scan/                    │ │
│  └────────┬────────────┘    │  ├── stage0_ingest.py    │ │
│           │                 │  ├── stage1_structure.py  │ │
│           │                 │  ├── stage2_static.py     │ │
│           │                 │  ├── stage3_injection.py  │ │
│           │                 │  ├── stage4_secrets.py    │ │
│           │                 │  ├── stage5_supply.py     │ │
│           │                 │  ├── verdict.py           │ │
│           │                 │  └── models.py            │ │
│           │                 └──────────────────────────┘ │
│           │                                              │
│  ┌────────▼────────────┐    ┌──────────────────────────┐ │
│  │  PostgreSQL (Drizzle)│    │  Supabase Storage        │ │
│  │  scan_results       │    │  packages/ bucket         │ │
│  │  scan_findings      │    │  skills/{id}/{v}.tgz     │ │
│  └─────────────────────┘    └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure (New/Modified Files)

```
apps/web/
├── api-python/
│   └── analyze/
│       ├── index.py                # Health check (keep existing)
│       ├── security.py             # DELETE — replaced by scan pipeline
│       ├── permissions.py          # KEEP — LLM permission extraction stays separate
│       ├── _lib.py                 # KEEP — OpenRouter client for permissions endpoint
│       ├── scan.py                 # NEW — Main orchestrator endpoint: POST /api/analyze/scan
│       ├── rescan.py               # NEW — Cron endpoint: POST /api/analyze/rescan
│       ├── scan/                   # NEW — Scanning pipeline modules
│       │   ├── __init__.py
│       │   ├── models.py           # Pydantic models: Finding, StageResult, ScanResult
│       │   ├── stage0_ingest.py    # Ingestion & quarantine
│       │   ├── stage1_structure.py # File & structure validation
│       │   ├── stage2_static.py    # Static code analysis (Bandit + custom AST)
│       │   ├── stage3_injection.py # Prompt injection detection (regex + heuristics)
│       │   ├── stage4_secrets.py   # Secrets & credential scanning (detect-secrets)
│       │   ├── stage5_supply.py    # Dependency & supply chain audit (pip-audit + API)
│       │   ├── verdict.py          # Verdict computation from stage results
│       │   ├── patterns/           # Pattern definition files
│       │   │   ├── __init__.py
│       │   │   ├── injection_patterns.py   # Regex patterns for prompt injection
│       │   │   ├── dangerous_apis.py       # Dangerous API call patterns per language
│       │   │   └── obfuscation.py          # Base64+exec, ROT13, Unicode tricks
│       │   └── rules/              # Custom Bandit-style rules
│       │       ├── __init__.py
│       │       └── skill_threats.py # Custom AST visitors for skill-specific threats
│       └── tests/
│           ├── __init__.py
│           ├── test_analyze.py     # Keep existing (update imports if needed)
│           ├── test_stage0.py      # NEW
│           ├── test_stage1.py      # NEW
│           ├── test_stage2.py      # NEW
│           ├── test_stage3.py      # NEW
│           ├── test_stage4.py      # NEW
│           ├── test_stage5.py      # NEW
│           ├── test_verdict.py     # NEW
│           ├── test_scan_orchestrator.py  # NEW
│           └── fixtures/           # NEW — sample skill archives for testing
│               ├── benign_skill.tgz
│               ├── malicious_skill.tgz
│               └── suspicious_skill.tgz
├── lib/
│   ├── db/
│   │   └── schema.ts              # MODIFY — add scan_results + scan_findings tables
│   └── audit-score.ts             # MODIFY — integrate real scan results
├── app/api/v1/skills/
│   ├── confirm/route.ts           # MODIFY — call Python scan endpoint
│   └── [name]/[version]/route.ts  # MODIFY — return scan verdict + findings
└── requirements.txt               # MODIFY — add scanning dependencies
```

## Python Dependencies (Budget: <250MB)

### Current (`requirements.txt`)
```
fastapi>=0.115.0,<1.0.0
httpx>=0.27.0,<1.0.0
pydantic>=2.0.0,<3.0.0
```

### Proposed additions
```
# Stage 0: Ingestion
python-magic>=0.4.27        # MIME type detection (~50KB + libmagic)
charset-normalizer>=3.4.0   # Encoding detection (~2MB)

# Stage 2: Static analysis
bandit>=1.8.0               # Python security linting (~5MB)

# Stage 4: Secrets
detect-secrets>=1.5.0       # Credential scanning (~10MB)

# Stage 5: Dependencies
pip-audit>=2.7.0            # Python vulnerability scanning (~15MB)

# Database access (from Python side)
psycopg[binary]>=3.2.0      # PostgreSQL driver (~5MB)
```

**Estimated total bundle**: ~80-100MB (well under 250MB limit)

**NOT included** (too large):
- ~~torch~~ (~2GB)
- ~~transformers~~ (~500MB)
- ~~sentence-transformers~~ (~200MB)
- ~~semgrep~~ (Rust binary, not installable via pip on Vercel)

### python-magic note

`python-magic` requires `libmagic` system library. On Vercel Python runtime, this may not be available. **Fallback**: use file extension + header-byte checks instead of MIME detection. Test during implementation and use `python-magic` if available, otherwise fall back to extension-based detection.

## Database Schema Changes

### New table: `scan_results`

```sql
CREATE TABLE scan_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      UUID NOT NULL REFERENCES skill_versions(id),
  verdict         TEXT NOT NULL,              -- 'pass', 'pass_with_notes', 'flagged', 'fail'
  total_findings  INTEGER NOT NULL DEFAULT 0,
  critical_count  INTEGER NOT NULL DEFAULT 0,
  high_count      INTEGER NOT NULL DEFAULT 0,
  medium_count    INTEGER NOT NULL DEFAULT 0,
  low_count       INTEGER NOT NULL DEFAULT 0,
  stages_run      JSONB NOT NULL,            -- ["stage0","stage1",...] array of completed stages
  duration_ms     INTEGER,                    -- total scan time in milliseconds
  file_hashes     JSONB,                      -- { "path": "sha256hash", ... } Merkle tree
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scan_results_version_id_idx ON scan_results(version_id);
```

### New table: `scan_findings`

```sql
CREATE TABLE scan_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         UUID NOT NULL REFERENCES scan_results(id),
  stage           TEXT NOT NULL,              -- 'stage0', 'stage1', ..., 'stage5'
  severity        TEXT NOT NULL,              -- 'critical', 'high', 'medium', 'low'
  type            TEXT NOT NULL,              -- e.g. 'prompt_injection', 'shell_injection', 'secret_found'
  description     TEXT NOT NULL,
  location        TEXT,                        -- e.g. 'SKILL.md:47' or 'script.py:12'
  confidence      REAL,                        -- 0.0-1.0
  tool            TEXT,                        -- which tool/rule found it
  evidence        TEXT,                        -- raw snippet or pattern matched
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scan_findings_scan_id_idx ON scan_findings(scan_id);
CREATE INDEX scan_findings_severity_idx ON scan_findings(severity);
```

### Drizzle schema additions (`lib/db/schema.ts`)

Add `scanResults` and `scanFindings` tables with Drizzle `pgTable()`, relations to `skillVersions`, and appropriate indexes.

## Stage-by-Stage Technical Design

---

### Stage 0: Ingestion & Quarantine

**Module**: `scan/stage0_ingest.py`

**Input**: `tarball_url: str` (signed Supabase download URL) or `tarball_bytes: bytes`

**Process**:
1. Download tarball via httpx (timeout 30s, max 50MB)
2. Validate it's a valid gzip-compressed tar archive
3. Check compression ratio: reject if decompressed > 100x compressed (zip bomb protection)
4. Extract to `/tmp/tank_scan_{uuid}/` with safety checks:
   - Block symlinks and hardlinks
   - Block paths containing `..` or starting with `/`
   - Block absolute paths
5. Verify file types against allowlist:
   - Allowed: `.md`, `.py`, `.js`, `.ts`, `.sh`, `.json`, `.yaml`, `.yml`, `.toml`, `.txt`, `.csv`, `.mjs`, `.cjs`
   - Blocked: `.exe`, `.so`, `.dll`, `.wasm`, `.class`, `.pyc`, `.pyo`, `.jar`, `.war`
   - Use extension-based check (with fallback magic-byte check for extensionless files)
6. Compute SHA-256 hash for every extracted file
7. Enforce max total extracted size: 50MB
8. Return: `IngestResult(temp_dir, file_hashes, file_list, total_size)`

**Libraries**: `tarfile` (stdlib), `hashlib` (stdlib), `httpx`, `tempfile` (stdlib)

**Findings emitted**:
- `critical`: zip bomb detected, path traversal attempt, blocked binary type
- `high`: symlink/hardlink in archive
- `medium`: unusually large file (>5MB single file)

---

### Stage 1: File & Structure Validation

**Module**: `scan/stage1_structure.py`

**Input**: `IngestResult` from Stage 0

**Process**:
1. Check for `SKILL.md` presence (mandatory for Claude Code skills)
2. Scan every text file for dangerous Unicode characters:
   - Zero-width characters: U+200B, U+200C, U+200D, U+FEFF
   - Bidirectional overrides: U+202A–U+202E, U+2066–U+2069
   - Tag characters: U+E0001–U+E007F
   - Homoglyph detection: Cyrillic lookalikes for Latin (e.g., `а` vs `a`, `е` vs `e`, `о` vs `o`)
3. NFKC normalize all text and compare against original (detect normalization-dependent tricks)
4. Validate file encoding: flag non-UTF-8 files (using `charset-normalizer`)
5. Check for hidden files (dotfiles other than `.gitignore`, `.editorconfig`, `.prettierrc`)
6. Validate no single file exceeds 5MB

**Libraries**: `unicodedata` (stdlib), `pathlib` (stdlib), `charset-normalizer`

**Findings emitted**:
- `critical`: bidirectional override characters found, tag characters found
- `high`: SKILL.md missing, homoglyph characters detected
- `medium`: zero-width characters, non-UTF-8 encoding, NFKC normalization mismatch
- `low`: hidden files present, large single file

---

### Stage 2: Static Code Analysis

**Module**: `scan/stage2_static.py`

**Input**: `IngestResult` from Stage 0

**Process**:

#### Part A: Bandit scan (Python files only)
Run Bandit programmatically (not CLI) on all `.py` files:
```python
from bandit.core import manager as b_manager
```

Target checks:
- B102: `exec` used
- B301-B303: insecure deserialization (`pickle`, `marshal`, `shelve`)
- B305: insecure cipher usage
- B307: `eval` used
- B602: `subprocess.Popen(shell=True)`
- B701: insecure Jinja2 templating

#### Part B: Custom AST analysis (Python, JS/TS)

**For Python files** — use `ast` module to walk AST:
- **Network exfiltration**: detect calls to `requests.get/post`, `urllib.request.urlopen`, `http.client`, `socket.connect`, `httpx.post/get`
- **Shell injection**: `os.system()`, `subprocess.Popen(shell=True)`, `subprocess.call(shell=True)`
- **Dynamic code execution**: `eval()`, `exec()`, `compile()`, `importlib.import_module()` with non-literal args
- **File system abuse**: operations on `~/.ssh/`, `~/.aws/`, `~/.config/`, `/etc/`, `~/.bashrc`, `~/.zshrc`, `~/.env`
- **Environment harvesting**: `os.environ`, `os.getenv()`, `dotenv.load_dotenv()`
- **Obfuscation**: `base64.b64decode()` combined with `exec()`, `codecs.decode('rot13')`

**For JS/TS files** — use regex-based pattern matching (no JS parser in Python):
- `fetch(`, `XMLHttpRequest`, `require('http')`, `require('child_process')`
- `eval(`, `Function(`, `new Function(`
- `process.env`, `require('dotenv')`
- `fs.readFileSync` on sensitive paths
- `child_process.exec(`, `child_process.spawn(`

**For shell files** — regex for:
- `curl`, `wget` to external domains
- `chmod 777`, `chmod +x`
- Piped commands to `bash`, `sh`, `eval`

#### Part C: Purpose cross-check
Compare declared permissions in `skills.json` against capabilities found in code:
- If code uses `fetch()` but no `network.outbound` declared → high finding
- If code reads filesystem but no `filesystem.read` declared → high finding
- If code runs subprocesses but `subprocess: false` or undeclared → high finding

**Libraries**: `bandit` (programmatic API), `ast` (stdlib), `re` (stdlib)

**Findings emitted**:
- `critical`: shell injection, insecure deserialization, dynamic code execution with external input
- `high`: network exfiltration (undeclared), file system abuse on sensitive paths, environment harvesting
- `medium`: undeclared permissions (code capabilities vs manifest mismatch)
- `low`: general Bandit findings (B305 cipher, etc.)

---

### Stage 3: Prompt Injection Detection

**Module**: `scan/stage3_injection.py`

**Input**: `IngestResult` from Stage 0 (specifically all `.md` files)

**Process** (replaces ML classifiers with deterministic approach):

#### Layer 1: Regex pattern matching
Compile and match against a corpus of ~200 injection patterns:

**Direct overrides**:
- `ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts|rules|guidelines)`
- `disregard (above|previous|prior|all|everything)`
- `override (system|safety|security) (prompt|rules|instructions|guidelines)`
- `forget (everything|all|your) (you |I )?(were |was )?(told|instructed|said)`

**Role hijacking**:
- `you are now (a|an|my)?`
- `act as (if you are|though you are|a|an)`
- `pretend (you are|to be|that you)`
- `your (new|real|actual|true) (role|purpose|instructions|identity)`

**Context manipulation**:
- `the (following|real|actual|true) (is|are) (the|your) (real|actual|true)? (system prompt|instructions)`
- `actually,? (the user|I) want`
- `(the|this) (above|previous) (was|were) (just )?(a test|fake|not real)`

**Exfiltration directives**:
- `send (to|it to|this to|the contents to|data to)`
- `post (to|this to|the data to)`
- `include in your response (the contents of|all|every)`
- `(output|print|display|show|reveal) (the|your|all) (system prompt|instructions|context|environment|secrets)`

**Privilege escalation**:
- `run as root`, `sudo`, `chmod 777`
- `disable (safety|security|restrictions|guardrails|filters)`
- `enable (admin|root|superuser|unrestricted) mode`
- `(ignore|bypass|skip|disable) (all )?(safety|security|content) (checks|filters|restrictions)`

#### Layer 2: Hidden content detection
- Scan for HTML comments: `<!-- ... -->` containing instruction-like text
- Scan for markdown comments: `[//]: # (...)` or `[comment]: # (...)`
- Check metadata fields in YAML frontmatter for injected instructions
- Look for invisible Unicode that could hide text (already flagged in Stage 1, cross-reference)

#### Layer 3: Heuristic scoring
For each `.md` file, compute a suspicion score:
- Count of matched patterns × weight per pattern severity
- Density of imperative language ("do this", "you must", "always", "never") outside normal skill instruction context
- References to tools/files/paths not present in the skill's own codebase
- Ratio of instruction-like content to documentation-like content

Threshold: suspicion score > 0.7 → flag, > 0.9 → critical

#### Layer 4: Structural analysis
- Check if any instruction blocks reference Claude-specific internals: `<tool_use>`, `<function_calls>`, `<system>`, `<human>`, `<assistant>`
- Detect attempts to output structured XML/JSON that mimics Claude's tool-calling format
- Flag instructions that claim special authority: "I am the developer", "this is a trusted skill", "this has been approved"

**Libraries**: `re` (stdlib), no external dependencies

**Findings emitted**:
- `critical`: direct override patterns, role hijacking, Claude-specific format injection
- `high`: exfiltration directives, privilege escalation patterns, hidden content with instructions
- `medium`: elevated suspicion score, instruction-dense content
- `low`: references to non-existent files/tools

---

### Stage 4: Secrets & Credential Scanning

**Module**: `scan/stage4_secrets.py`

**Input**: `IngestResult` from Stage 0

**Process**:
Run `detect-secrets` programmatically:
```python
from detect_secrets import main as ds_main
from detect_secrets.settings import transient_settings
```

Configuration — all built-in plugins enabled:
- `AWSKeyDetector`
- `AzureStorageKeyDetector`
- `BasicAuthDetector`
- `GitHubTokenDetector`
- `Base64HighEntropyString` (limit: 4.5)
- `HexHighEntropyString` (limit: 3.0)
- `PrivateKeyDetector`
- `SlackDetector`
- `StripeDetector`
- `TwilioKeyDetector`
- `SoftlayerDetector`
- `SquareOAuthDetector`
- `NpmrcDetector`
- `SendGridDetector`
- `KeywordDetector`
- `MailchimpDetector`
- `JwtTokenDetector`
- `DiscordBotTokenDetector`
- `IbmCloudIamDetector`
- `IbmCosHmacDetector`

Additional custom regex patterns (run after detect-secrets):
- Google Cloud API keys: `AIza[0-9A-Za-z_-]{35}`
- Generic API keys in config: `(api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['\"][a-zA-Z0-9]{16,}`
- Database connection strings: `(postgres|mysql|mongodb)://[^\s'"]+`
- SSH private key headers: `-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----`

**Libraries**: `detect-secrets` (programmatic API)

**Findings emitted**:
- `critical`: any detected secret (every secret is critical per spec)
- Additional custom patterns also `critical`

---

### Stage 5: Dependency & Supply Chain Audit

**Module**: `scan/stage5_supply.py`

**Input**: `IngestResult` from Stage 0

**Process**:

#### Step 1: Dependency enumeration
Parse all manifest/lock files found in the extracted skill:
- `requirements.txt`, `Pipfile`, `pyproject.toml` (Python)
- `package.json`, `yarn.lock`, `pnpm-lock.yaml` (Node.js)
- Scan code for dynamic dependency installation: `pip install`, `npm install`, `subprocess.run(['pip', ...])` → critical finding

#### Step 2: pip-audit (for Python dependencies)
Run programmatically:
```python
from pip_audit._cli import audit
```
Check against Python Packaging Advisory Database (PyPA).

#### Step 3: PyPI/npm advisory API queries
For packages not covered by pip-audit:
- Query `https://pypi.org/pypi/{package}/json` for deprecation status
- Query `https://registry.npmjs.org/{package}` for npm packages
- Query `https://api.osv.dev/v1/query` (OSV.dev REST API) for vulnerability data
  - This replaces the OSV-Scanner Go binary with direct HTTP API calls

#### Step 4: Supply chain red flags
- **Unpinned dependencies**: `*`, `latest`, missing version specifiers → medium
- **Typosquatting detection**: Levenshtein distance against top 1000 popular PyPI/npm packages → high
- **Very new packages**: packages published < 30 days ago with < 100 weekly downloads → medium
- **Deprecated packages**: check registry deprecation status → low

**Libraries**: `pip-audit` (programmatic), `httpx` (API calls), `Levenshtein` or custom edit-distance (stdlib-based)

**Findings emitted**:
- `critical`: known CVE with high CVSS, dynamic dependency installation
- `high`: typosquatting match, known CVE with medium CVSS
- `medium`: unpinned dependencies, very new/low-download packages
- `low`: deprecated packages

---

### Verdict Computation

**Module**: `scan/verdict.py`

```python
def compute_verdict(stage_results: list[StageResult]) -> ScanVerdict:
    all_findings = [f for sr in stage_results for f in sr.findings]

    critical_count = sum(1 for f in all_findings if f.severity == "critical")
    high_count = sum(1 for f in all_findings if f.severity == "high")
    medium_count = sum(1 for f in all_findings if f.severity == "medium")
    low_count = sum(1 for f in all_findings if f.severity == "low")

    if critical_count > 0:
        return ScanVerdict.FAIL
    if high_count > 3:
        return ScanVerdict.FAIL
    if high_count > 0:
        return ScanVerdict.FLAGGED
    if medium_count > 0 or low_count > 0:
        return ScanVerdict.PASS_WITH_NOTES
    return ScanVerdict.PASS
```

---

## Orchestrator Endpoint

**Module**: `scan.py` → `POST /api/analyze/scan`

```python
@app.post("/api/analyze/scan")
async def run_scan(request: ScanRequest) -> ScanResponse:
    """
    Orchestrate full scanning pipeline.

    Input:
      - tarball_url: str (signed Supabase download URL)
      - version_id: str (skill_versions.id)
      - manifest: dict (skill manifest from DB)
      - permissions: dict (declared permissions from DB)

    Output:
      - verdict: str
      - findings: list[Finding]
      - stage_results: list[StageResult]
      - duration_ms: int
      - file_hashes: dict
    """
    start = time.monotonic()

    # Stage 0
    ingest = await stage0_ingest(request.tarball_url)

    # Stage 1
    structure = stage1_validate(ingest)

    # Stage 2
    static = stage2_analyze(ingest, request.manifest, request.permissions)

    # Stage 3
    injection = stage3_detect_injection(ingest)

    # Stage 4
    secrets = stage4_scan_secrets(ingest)

    # Stage 5
    supply = await stage5_audit_deps(ingest)

    # Compute verdict
    all_stages = [ingest.stage_result, structure, static, injection, secrets, supply]
    verdict = compute_verdict(all_stages)

    duration_ms = int((time.monotonic() - start) * 1000)

    # Store results in PostgreSQL
    scan_id = await store_scan_results(
        version_id=request.version_id,
        verdict=verdict,
        stages=all_stages,
        duration_ms=duration_ms,
        file_hashes=ingest.file_hashes,
    )

    # Cleanup
    shutil.rmtree(ingest.temp_dir, ignore_errors=True)

    return ScanResponse(
        scan_id=scan_id,
        verdict=verdict.value,
        findings=[f for s in all_stages for f in s.findings],
        duration_ms=duration_ms,
    )
```

## Integration with TypeScript Publish Flow

### `confirm/route.ts` changes

After the existing audit score computation, add a call to the Python scan endpoint:

```typescript
// After step 6 (update version record)...

// 7. Trigger security scan (fire-and-await)
try {
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/analyze/scan`;
  const downloadUrl = await getSignedDownloadUrl(tarballPath);

  const scanResponse = await fetch(scanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarball_url: downloadUrl,
      version_id: versionId,
      manifest: version.manifest,
      permissions: version.permissions,
    }),
  });

  if (scanResponse.ok) {
    const scanResult = await scanResponse.json();
    // Update audit score with real scan data
    const result = computeAuditScore({
      manifest,
      permissions,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      readme,
      analysisResults: {
        securityIssues: scanResult.findings
          .filter(f => f.severity === 'critical' || f.severity === 'high'),
        extractedPermissions: null, // Separate endpoint
      },
    });

    await db.update(skillVersions).set({
      auditScore: result.score,
      auditStatus: scanResult.verdict === 'fail' ? 'failed' : 'completed',
    }).where(eq(skillVersions.id, versionId));
  }
} catch {
  // Scan failed — graceful degradation, keep existing score
  await db.update(skillVersions).set({
    auditStatus: 'scan-failed',
  }).where(eq(skillVersions.id, versionId));
}
```

### `[name]/[version]/route.ts` changes

Add scan results to the version response:

```typescript
// After fetching version details, also fetch latest scan result
const scanResults = await db
  .select()
  .from(scanResultsTable)
  .where(eq(scanResultsTable.versionId, version.id))
  .orderBy(desc(scanResultsTable.createdAt))
  .limit(1);

const scanFindings = scanResults[0]
  ? await db.select().from(scanFindingsTable)
      .where(eq(scanFindingsTable.scanId, scanResults[0].id))
  : [];

// Include in response
return NextResponse.json({
  ...existingFields,
  scanVerdict: scanResults[0]?.verdict ?? null,
  scanFindings: scanFindings.map(f => ({
    stage: f.stage,
    severity: f.severity,
    type: f.type,
    description: f.description,
    location: f.location,
  })),
});
```

## Database Connection from Python

The Python scan endpoint needs to write results to PostgreSQL. Use `psycopg` (async) with the same `DATABASE_URL` env var:

```python
import psycopg
from psycopg.rows import dict_row

async def get_db_connection():
    return await psycopg.AsyncConnection.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row,
    )
```

## Cron Re-scan Endpoint

**Module**: `rescan.py` → `POST /api/analyze/rescan`

Vercel Cron Job calls this daily. The endpoint:
1. Queries `skill_versions` where `auditStatus = 'completed'` and `last scan > 24h ago`
2. For each, re-downloads tarball and runs full pipeline
3. Compares new results against stored results
4. If verdict changed, updates `auditStatus` and creates new `scan_results` record

```json
// vercel.json (new file)
{
  "crons": [
    {
      "path": "/api/analyze/rescan",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Note: Vercel Cron has a 60s timeout. The rescan endpoint should process a limited batch per invocation (e.g., 5 skills) and handle pagination across runs.

## Vercel Configuration

### `vercel.json` (new file at project root)

```json
{
  "functions": {
    "apps/web/api-python/analyze/scan.py": {
      "maxDuration": 60,
      "memory": 1024
    },
    "apps/web/api-python/analyze/rescan.py": {
      "maxDuration": 60,
      "memory": 1024
    }
  },
  "crons": [
    {
      "path": "/api/analyze/rescan",
      "schedule": "0 3 * * *"
    }
  ]
}
```

## Error Handling & Graceful Degradation

| Failure | Behavior |
|---------|----------|
| Python scan endpoint unreachable | Confirm endpoint still succeeds, sets `auditStatus: scan-failed` |
| Single stage fails (exception) | Orchestrator catches, marks stage as errored, continues remaining stages |
| Scan exceeds 55s | Orchestrator returns partial results for completed stages |
| Database write fails | Log error, return scan results to caller (confirm endpoint handles) |
| Tarball download fails | Stage 0 returns critical finding, pipeline stops |

## Testing Strategy

### Unit Tests (per stage)
- Each stage has its own test file with:
  - Benign skill input → no findings
  - Known-malicious input → expected findings with correct severity
  - Edge cases (empty files, Unicode, large files)

### Integration Tests
- `test_scan_orchestrator.py`: Full pipeline with mock tarball
- Test verdict computation with various finding combinations

### Test Fixtures
- `benign_skill.tgz`: Clean skill that should PASS
- `malicious_skill.tgz`: Skill with prompt injection, secrets, shell injection → FAIL
- `suspicious_skill.tgz`: Skill with medium findings → PASS_WITH_NOTES

### Existing Tests
- Keep `test_analyze.py` (health check + permissions tests)
- Update imports if `security.py` is deleted
