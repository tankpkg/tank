# Security Scanning System for Claude Code Skills & Plugins

## Technical Plan (Python Backend)

---

## 1. System Overview

The scanner receives a skill or plugin (URL or archive), runs it through a sequential pipeline of automated security stages, and produces a verdict: **PASS**, **FAIL**, or **FLAGGED**. Each stage uses specific, battle tested, actively maintained open source tools combined with custom detection logic. No sandbox execution. No LLM based review. Pure static analysis, pattern detection, dependency auditing, and structural validation.

```
Input (skill/plugin link or archive)
|
v
Stage 0: Ingestion & Quarantine
|
v
Stage 1: File & Structure Validation
|
v
Stage 2: Static Code Analysis (Semgrep + Bandit)
|
v
Stage 3: Prompt Injection Detection (ML Classifier + Pattern Engine)
|
v
Stage 4: Secrets & Credential Scanning (detect-secrets)
|
v
Stage 5: Dependency & Supply Chain Audit (pip-audit + OSV-Scanner)
|
v
Stage 6: Integrity Hashing & Continuous Monitoring
|
v
Output: Verdict + Detailed Report (JSON)
```

A skill must pass ALL stages. Any single critical finding at any stage produces an immediate FAIL.

---

## 2. Exact Tools Used Per Stage

### Stage 0: Ingestion & Quarantine

**Tools:**
- **`hashlib`** (Python stdlib): SHA-256 fingerprinting of every file in the archive immediately after extraction.
- **`zipfile`** / **`tarfile`** (Python stdlib): Safe extraction with explicit protections against zip bombs, symlinks, and path traversal.
- **`requests`** (v2.32+, PyPI, actively maintained): Fetching skill archives from URLs with strict timeouts, size limits, and redirect controls.
- **`magic`** / **`python-magic`** (v0.4.27+, PyPI, wrapper around libmagic): MIME type verification of every extracted file.

**What this stage does:**
1. Downloads the skill archive into a temporary directory (`tempfile.mkdtemp`).
2. Validates the archive format (zip or tar.gz only).
3. Checks the compression ratio before extraction. Rejects if decompressed size exceeds 100x the compressed size (zip bomb protection).
4. Extracts while blocking symlinks, hardlinks, and any path containing `..` or starting with `/`.
5. Verifies MIME types of all extracted files against an allowlist: `.md`, `.py`, `.js`, `.ts`, `.sh`, `.json`, `.yaml`, `.toml`, `.txt`, `.csv`. Rejects binaries (`.exe`, `.so`, `.dll`, `.wasm`, `.class`, `.pyc`).
6. Computes and stores SHA-256 hashes for every file.
7. Enforces a maximum total extracted size of 50MB.

---

### Stage 1: File & Structure Validation

**Tools:**
- **`pathlib`** (Python stdlib): Safe path manipulation and directory traversal.
- **`charset-normalizer`** (v3.4+, PyPI, actively maintained): Detects file encoding and flags non UTF-8 files.
- **`unicodedata`** (Python stdlib): NFKC normalization to detect hidden Unicode tricks.

**What this stage does:**
1. Validates the skill structure. Checks for the presence of a `SKILL.md` file (mandatory for Claude Code skills).
2. Scans every text file for dangerous Unicode characters:
   - Zero width characters: U+200B, U+200C, U+200D, U+FEFF
   - Bidirectional overrides: U+202A through U+202E, U+2066 through U+2069
   - Tag characters: U+E0001 through U+E007F
   - Homoglyph characters (Cyrillic lookalikes for Latin letters)
3. Normalizes all text content to NFKC form and compares against the original.
4. Validates that file sizes are reasonable (no single file exceeding 5MB).
5. Checks for hidden files (dotfiles) that should not be part of a skill.

---

### Stage 2: Static Code Analysis

**Tools:**
- **Semgrep** (v1.110+, open source CLI, actively maintained by Semgrep Inc.): Pattern based code scanning with custom YAML rules.
- **Bandit** (v1.8+, open source, maintained by PyCQA): Python specific security linting.

**What this stage does:**

**Semgrep scan** (for `.py`, `.js`, `.ts` files):
- Runs built-in `p/security-audit` and `p/owasp-top-ten` rulesets.
- Custom YAML rules for Claude Code skill threats:
  - **Network exfiltration:** Any use of `fetch`, `requests.get/post`, `urllib.request`, `http.client`, `socket`, `XMLHttpRequest`, `curl`, `wget`
  - **Shell injection:** `os.system()`, `subprocess.Popen(..., shell=True)`, backtick execution, `child_process.exec()`
  - **Dynamic code execution:** `eval()`, `exec()`, `compile()`, `Function()` constructor, `importlib.import_module()` with variable arguments
  - **File system abuse:** Read or write operations targeting `~/.ssh/`, `~/.aws/`, `~/.config/`, `/etc/`, `~/.bashrc`, `~/.zshrc`
  - **Environment harvesting:** `os.environ`, `process.env`, `dotenv` usage
  - **Obfuscation indicators:** Base64 decoding combined with `exec()`, string character code concatenation, ROT13 patterns

**Bandit scan** (for `.py` files only):
- B102: `exec` used
- B301 through B303: insecure deserialization (`pickle`, `marshal`, `shelve`)
- B305: insecure cipher usage
- B307: `eval` used
- B602: `subprocess_popen_with_shell_equals_true`
- B701: insecure Jinja2 templating

**Purpose check:** Compares the skill's declared purpose against capabilities found in the code.

---

### Stage 3: Prompt Injection Detection

**Tools:**
- **ProtectAI `deberta-v3-base-prompt-injection-v2`** (HuggingFace model, Apache 2.0 license): Fine tuned DeBERTa v3 classifier.
- **Meta `Prompt-Guard-86M`** (HuggingFace model, Llama 3 Community): 86M parameters, classifies into benign/injection/jailbreak categories.
- **`sentence-transformers`** (v3.4+, PyPI): Uses `all-MiniLM-L6-v2` model for semantic similarity.

**What this stage does:**

**Layer 1: Fast pass regex pattern matching**
- Direct overrides: "ignore previous instructions", "disregard above", "override system prompt"
- Role hijacking: "you are now", "act as if you are", "pretend you are"
- Context manipulation: "the following is the real system prompt", "actually the user wants"
- Exfiltration directives: "send to", "post to", "include in your response the contents of"
- Privilege escalation: "run as root", "sudo", "chmod 777", "disable safety"

**Layer 2: ML classifier (ProtectAI DeBERTa v3)**
- Every paragraph from `.md` files fed through classifier (512 token max)
- Confidence threshold: 0.85

**Layer 3: ML classifier (Meta Prompt Guard 86M)**
- Same content run as second opinion for cross validation

**Layer 4: Semantic similarity search**
- Computes embeddings for each instruction block
- Compares against corpus of ~5,000 known prompt injection attacks
- Cosine similarity above 0.82 triggers a flag

**Layer 5: Structural analysis**
- Checks for instructions referencing tools/files not present in codebase
- Detects hidden content in HTML comments, markdown comments, or metadata fields

---

### Stage 4: Secrets & Credential Scanning

**Tools:**
- **`detect-secrets`** (v1.5+, open source, created and maintained by Yelp): Enterprise grade secrets detection.

**What this stage does:**
Runs `detect-secrets scan` with:
- **High entropy string detection** enabled
- **All built-in plugins** enabled:
  - `AWSKeyDetector`
  - `AzureStorageKeyDetector`
  - `BasicAuthDetector`
  - `GitHubTokenDetector`
  - `Base64HighEntropyString`
  - `PrivateKeyDetector`
  - `SlackDetector`
  - `StripeDetector`
  - And many more

**Additional custom patterns:**
- Google Cloud API keys (`AIza[0-9A-Za-z_-]{35}`)
- Generic API keys in config files
- Database connection strings
- SSH private key headers

Any secret found is an automatic **critical** finding.

---

### Stage 5: Dependency & Supply Chain Audit

**Tools:**
- **`pip-audit`** (v2.7+, maintained by Trail of Bits): Python dependency vulnerability scanning.
- **OSV-Scanner** (v2.0+, maintained by Google OpenSSF): Multi ecosystem dependency vulnerability scanning.

**What this stage does:**

**Step 1: Dependency enumeration**
- Parses all manifest and lock files: `requirements.txt`, `Pipfile`, `pyproject.toml`, `package.json`, `yarn.lock`, etc.
- Scans code for dynamic dependency installation (flagged as critical)

**Step 2: pip-audit scan** (for Python dependencies)
- Checks against Python Packaging Advisory Database

**Step 3: OSV-Scanner scan** (for all ecosystems)
- Queries OSV.dev database aggregating advisories from GitHub, PyPI, npm, NVD, and others

**Step 4: Supply chain red flags**
- **Unpinned dependencies:** `*`, `latest`, or missing version specifiers
- **Typosquatting detection:** Levenshtein distance against top 5,000 popular packages
- **Deprecated packages:** Checks registry deprecation status
- **Very new packages:** Flags packages published < 30 days ago with < 100 downloads

---

### Stage 6: Integrity Hashing & Continuous Monitoring

**Tools:**
- **`hashlib`** (Python stdlib): SHA-256 computation
- **`APScheduler`** (v3.10+, PyPI): Job scheduling for periodic re-scans
- **PostgreSQL** (via `psycopg` or `asyncpg`): Storage for scan results

**What this stage does:**
1. Stores complete SHA-256 Merkle tree of the skill's files in database
2. Records full scan report as immutable audit log entry
3. Schedules periodic re-fetches (default every 24 hours)
4. If any file hash changes, triggers automatic full re-scan
5. Retroactively checks all approved skills against new vulnerability advisories
6. Downgrades skill status to "unverifiable" if source URL unreachable for > 72 hours

---

## 3. Scoring & Verdict Logic

Each stage produces structured findings:

```json
{
  "stage": "stage_3_prompt_injection",
  "status": "flagged",
  "findings": [
    {
      "severity": "critical",
      "type": "direct_override_attempt",
      "location": "SKILL.md:47",
      "description": "Instruction matches prompt injection pattern: role hijacking",
      "confidence": 0.94,
      "tool": "protectai-deberta-v3-prompt-injection-v2",
      "evidence": "Paragraph contains semantic equivalent of 'ignore previous instructions'"
    }
  ]
}
```

**Verdict rules:**

| Condition | Verdict |
| --- | --- |
| Any **critical** finding in any stage | **FAIL** |
| More than 3 **high** findings across all stages | **FAIL** |
| Any **high** finding | **FLAGGED** (quarantine, pending review) |
| Only **medium** and **low** findings | **PASS WITH NOTES** |
| Zero findings | **PASS** |

There is no trusted publisher bypass. Every version of every skill is fully scanned every time.

---

## 4. Complete Tool Inventory

| Tool | Version | Source | License | Purpose |
| --- | --- | --- | --- | --- |
| `hashlib` | stdlib | Python | PSF | SHA-256 file fingerprinting |
| `zipfile` / `tarfile` | stdlib | Python | PSF | Safe archive extraction |
| `pathlib` | stdlib | Python | PSF | Path manipulation |
| `unicodedata` | stdlib | Python | PSF | NFKC normalization |
| `re` | stdlib | Python | PSF | Regex pattern matching |
| `requests` | 2.32+ | PyPI | Apache 2.0 | HTTP fetching |
| `python-magic` | 0.4.27+ | PyPI | MIT | MIME type detection |
| `charset-normalizer` | 3.4+ | PyPI | MIT | Encoding detection |
| **Semgrep** | 1.110+ | PyPI/CLI | LGPL 2.1 | Static code analysis (multi-language) |
| **Bandit** | 1.8+ | PyPI | Apache 2.0 | Python security linting |
| **detect-secrets** | 1.5+ | PyPI | Apache 2.0 | Secrets/credential scanning |
| **pip-audit** | 2.7+ | PyPI | Apache 2.0 | Python dependency vulnerability scanning |
| **OSV-Scanner** | 2.0+ | Go binary | Apache 2.0 | Multi-ecosystem dependency vulnerability scanning |
| `transformers` | 4.47+ | PyPI | Apache 2.0 | Loading ML classifier models |
| `torch` | 2.5+ | PyPI | BSD | ML model inference backend |
| **ProtectAI deberta-v3-base-prompt-injection-v2** | latest | HuggingFace | Apache 2.0 | Prompt injection ML classifier |
| **Meta Prompt-Guard-86M** | latest | HuggingFace | Llama 3 Community | Prompt injection + jailbreak ML classifier |
| **sentence-transformers** | 3.4+ | PyPI | Apache 2.0 | Semantic similarity for injection detection |
| `all-MiniLM-L6-v2` | latest | HuggingFace | Apache 2.0 | Embedding model for similarity search |
| **APScheduler** | 3.10+ | PyPI | MIT | Periodic re-scan scheduling |
| `psycopg` / `asyncpg` | 3.2+ / 0.30+ | PyPI | LGPL / Apache 2.0 | PostgreSQL database driver |

**Total: 13 external tools/libraries + 5 Python stdlib modules + 3 ML models**

---

## 5. Python Package Requirements

```
# Core
requests>=2.32.0
python-magic>=0.4.27
charset-normalizer>=3.4.0

# Static Analysis
semgrep>=1.110.0
bandit>=1.8.0

# Secrets Detection
detect-secrets>=1.5.0

# Dependency Auditing
pip-audit>=2.7.0

# Prompt Injection Detection (ML)
transformers>=4.47.0
torch>=2.5.0
sentence-transformers>=3.4.0

# Scheduling & Storage
APScheduler>=3.10.0
psycopg[binary]>=3.2.0

# OSV-Scanner: installed separately as Go binary
# Install via: go install github.com/google/osv-scanner/cmd/osv-scanner@latest
# Or via Docker: ghcr.io/google/osv-scanner:latest
```

---

## 6. Key Design Decisions

### Why no sandbox/execution stage?
Sandboxing adds massive infrastructure complexity (VMs, container orchestration, network isolation) and still cannot catch all attacks. A skill can behave perfectly in a sandbox and then act maliciously only when detecting it is running in a real Claude Code session. Static analysis combined with ML based prompt injection detection covers the attack surface more reliably for this context.

### Why no LLM review stage?
LLM reviewers are susceptible to the very attacks they are trying to detect. A cleverly crafted skill could manipulate the reviewing LLM through the same prompt injection techniques. The ML classifiers (DeBERTa, Prompt Guard) are purpose built for injection detection and are not susceptible to instruction following manipulation.

### Why two ML classifiers for prompt injection?
Single model reliance is risky. ProtectAI DeBERTa and Meta Prompt Guard use different architectures, different training data, and different classification strategies. Cross validation between them dramatically reduces false negatives.

### Why both pip-audit and OSV-Scanner for dependencies?
They use different vulnerability databases. pip-audit queries the Python Packaging Advisory Database. OSV-Scanner queries the aggregated OSV.dev database. The overlap provides redundancy and non overlapping coverage catches more issues.

### Why detect-secrets over alternatives like truffleHog?
detect-secrets is purpose built for pre-commit and CI/CD integration, has a modular plugin architecture allowing custom detectors, is maintained by Yelp with enterprise use patterns, and produces fewer false positives than entropy only tools.

---

*Content is user-generated and unverified.*
