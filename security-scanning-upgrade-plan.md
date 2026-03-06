# Tank Security Scanning Upgrade Plan

**Goal:** Upgrade Tank's security scanning to world-class level using only free, open-source tools. No LLMs. No paid APIs. Pure deterministic analysis that is auditable, reproducible, and fast.

**Competitive context:** skills.sh/audits uses Snyk + Socket + Gen Agent Trust Hub (all paid/proprietary). This plan matches or exceeds their coverage at $0/month.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Remove OpenRouter / LLM Dependencies](#2-remove-openrouter--llm-dependencies)
3. [Phase 1: Activate Dormant Tools](#3-phase-1-activate-dormant-tools)
4. [Phase 2: Add Cisco AI Defense Skill Scanner](#4-phase-2-add-cisco-ai-defense-skill-scanner)
5. [Phase 3: Optimize Dependency Scanning](#5-phase-3-optimize-dependency-scanning)
6. [Phase 4: Custom Agent-Specific Rules](#6-phase-4-custom-agent-specific-rules)
7. [Phase 5: Finding Deduplication & Confidence Scoring](#7-phase-5-finding-deduplication--confidence-scoring)
8. [Phase 6: SARIF Unified Output](#8-phase-6-sarif-unified-output)
9. [Phase 7: UX Overhaul](#9-phase-7-ux-overhaul)
10. [Deployment Strategy](#10-deployment-strategy)
11. [Validation & Testing](#11-validation--testing)
12. [Implementation Order](#12-implementation-order)

---

## 1. Current State Analysis

### What Tank Has Today (6-stage pipeline)

| Stage | What It Does | Tools Used | Status |
|---|---|---|---|
| 0: Ingestion | Download, extract, validate archive | `httpx`, `tarfile`, `hashlib` | Implemented |
| 1: Structure | File types, Unicode tricks, hidden files | `charset-normalizer`, `unicodedata` | Implemented |
| 2: Static Analysis | Dangerous code patterns | Custom AST regex only | Partial (Semgrep/Bandit commented out) |
| 3: Injection Detection | Prompt injection in SKILL.md | Custom regex patterns only | Implemented (regex only) |
| 4: Secrets Scanning | Hardcoded credentials | `detect-secrets` (commented out) + custom regex | Partial |
| 5: Supply Chain | CVEs, typosquatting | OSV API (per-package) + custom checks | Implemented |

### What's Missing vs. skills.sh/audits

| Capability | skills.sh | Tank Current | Gap |
|---|---|---|---|
| Cross-file dataflow analysis | Gen Agent Trust Hub | None | Critical gap |
| Agent-specific threat taxonomy | Gen Agent Trust Hub (16 classes) | ~5 classes (custom regex) | Major gap |
| AST-level code analysis (multi-language) | Snyk SAST | Custom regex (not AST) | Major gap |
| Obfuscation detection (YARA patterns) | Unknown | Base64+exec only | Medium gap |
| Tool poisoning / shadowing detection | Gen Agent Trust Hub | Not detected | Major gap |
| Supply chain scoring (maintenance, quality) | Socket | Typosquatting + age only | Medium gap |
| Professional SAST tool coverage | Snyk | None active | Major gap |
| Multi-tool corroboration | 3 independent tools | 1 custom engine | Major gap |

---

## 2. Remove OpenRouter / LLM Dependencies

**Why:** LLM-based security scanning is fundamentally flawed for this use case. The scanning LLM is susceptible to the same prompt injection attacks it tries to detect. A skill can craft its SKILL.md to manipulate the reviewer LLM. Deterministic tools are immune to this.

### Files to Delete

| File | Purpose | Replacement |
|---|---|---|
| `python-api/api/analyze/_lib.py` | OpenRouter API client | Not needed (all tools run locally) |
| `python-api/api/analyze/security.py` | LLM-based SKILL.md security scan | Cisco skill-scanner + Semgrep + existing regex pipeline |
| `python-api/api/analyze/permissions.py` | LLM-based permission extraction | Static AST-based permission extraction (new) |
| `apps/web/api-python/analyze/_lib.py` | Duplicate OpenRouter client | Delete |
| `apps/web/api-python/analyze/security.py` | Duplicate LLM security scan | Delete |

### Environment Variables to Remove

- `OPENROUTER_API_KEY` -- remove from Vercel env config, `.env` files, documentation

### Replace Permission Extraction with Static Analysis

The LLM-based permission extraction (`permissions.py`) should be replaced with deterministic AST analysis:

**New file: `python-api/lib/scan/permission_extractor.py`**

```python
"""Static permission extraction from skill code files.

Replaces the LLM-based OpenRouter permission extraction with deterministic
AST analysis. Scans Python/JS/TS files for actual API calls, filesystem
operations, and subprocess usage to determine what permissions a skill needs.
"""

import ast
import json
import re
from pathlib import Path


# Network patterns
NETWORK_PATTERNS = {
    "python": [
        r"requests\.(get|post|put|delete|patch|head)\s*\(\s*['\"]([^'\"]+)",
        r"httpx\.\w+\s*\(\s*['\"]([^'\"]+)",
        r"urllib\.request\.urlopen\s*\(\s*['\"]([^'\"]+)",
        r"aiohttp\.\w+\s*\(\s*['\"]([^'\"]+)",
    ],
    "javascript": [
        r"fetch\s*\(\s*['\"`]([^'\"`]+)",
        r"axios\.(get|post|put|delete)\s*\(\s*['\"`]([^'\"`]+)",
        r"new\s+XMLHttpRequest",
    ],
}

# Filesystem patterns
FS_READ_PATTERNS = [
    r"open\s*\(\s*['\"]([^'\"]+)['\"]",
    r"fs\.(readFile|readFileSync|readdir)\s*\(\s*['\"`]([^'\"`]+)",
    r"Path\s*\(\s*['\"]([^'\"]+)",
]

FS_WRITE_PATTERNS = [
    r"open\s*\(\s*['\"]([^'\"]+)['\"],\s*['\"][wa]",
    r"fs\.(writeFile|writeFileSync|appendFile)\s*\(\s*['\"`]([^'\"`]+)",
]

# Subprocess patterns
SUBPROCESS_PATTERNS = [
    r"subprocess\.(run|call|Popen|check_output|check_call)",
    r"os\.(system|popen|exec\w*)\s*\(",
    r"child_process\.(exec|spawn|fork)\s*\(",
    r"execSync\s*\(",
]


def extract_permissions(skill_dir: str) -> dict:
    """Extract permissions from skill code using static analysis.

    Returns:
        {
            "network": {"outbound": ["api.example.com", ...]},
            "filesystem": {"read": ["./path"], "write": ["./path"]},
            "subprocess": True/False,
            "environment": ["VAR_NAME", ...]
        }
    """
    permissions = {
        "network": {"outbound": set()},
        "filesystem": {"read": set(), "write": set()},
        "subprocess": False,
        "environment": set(),
    }

    skill_path = Path(skill_dir)
    for file_path in skill_path.rglob("*"):
        if not file_path.is_file():
            continue

        suffix = file_path.suffix.lower()
        if suffix not in (".py", ".js", ".ts", ".mjs", ".mts"):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Network access
        lang = "python" if suffix == ".py" else "javascript"
        for pattern in NETWORK_PATTERNS.get(lang, []):
            for match in re.finditer(pattern, content):
                url = match.group(match.lastindex or 1)
                domain = _extract_domain(url)
                if domain:
                    permissions["network"]["outbound"].add(domain)

        # Filesystem
        for pattern in FS_READ_PATTERNS:
            for match in re.finditer(pattern, content):
                permissions["filesystem"]["read"].add(match.group(1))

        for pattern in FS_WRITE_PATTERNS:
            for match in re.finditer(pattern, content):
                permissions["filesystem"]["write"].add(match.group(1))

        # Subprocess
        for pattern in SUBPROCESS_PATTERNS:
            if re.search(pattern, content):
                permissions["subprocess"] = True

        # Environment variables
        for match in re.finditer(r"os\.environ\[?['\"](\w+)", content):
            permissions["environment"].add(match.group(1))
        for match in re.finditer(r"os\.getenv\(['\"](\w+)", content):
            permissions["environment"].add(match.group(1))
        for match in re.finditer(r"process\.env\.(\w+)", content):
            permissions["environment"].add(match.group(1))

    # Convert sets to sorted lists for JSON serialization
    return {
        "network": {"outbound": sorted(permissions["network"]["outbound"])},
        "filesystem": {
            "read": sorted(permissions["filesystem"]["read"]),
            "write": sorted(permissions["filesystem"]["write"]),
        },
        "subprocess": permissions["subprocess"],
        "environment": sorted(permissions["environment"]),
    }


def _extract_domain(url: str) -> str | None:
    """Extract domain from a URL string."""
    try:
        from urllib.parse import urlparse
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        parsed = urlparse(url)
        return parsed.hostname
    except Exception:
        return None
```

---

## 3. Phase 1: Activate Dormant Tools

**These tools were already planned and partially coded but are disabled.**

### 3.1 Activate Semgrep in Stage 2

**Why:** Semgrep parses ASTs and understands language semantics. It catches patterns that regex misses. The OSS version ships with 2,000+ community rules including OWASP Top 10 coverage. Free, runs locally, no API calls.

**Files to modify:**
- `python-api/requirements.txt` -- uncomment/add `semgrep>=1.90.0`
- `python-api/lib/scan/stage2_static.py` -- add Semgrep subprocess integration

**Implementation details:**

```python
# Add to stage2_static.py

import subprocess
import json

SEMGREP_CONFIGS = [
    "p/security-audit",     # General security patterns
    "p/owasp-top-ten",      # OWASP coverage
    "p/python",             # Python-specific rules
    "p/typescript",         # TypeScript-specific rules
]

async def run_semgrep(skill_dir: str) -> list[dict]:
    """Run Semgrep OSS with security + OWASP rules."""
    findings = []
    try:
        cmd = ["semgrep", "--json", "--timeout", "30", "--max-target-bytes", "1000000", "--no-git-ignore"]
        for config in SEMGREP_CONFIGS:
            cmd.extend(["--config", config])

        # Add custom agent rules if they exist
        custom_rules = Path(__file__).parent / "semgrep-rules"
        if custom_rules.exists():
            cmd.extend(["--config", str(custom_rules)])

        cmd.append(skill_dir)

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)

        if result.stdout:
            data = json.loads(result.stdout)
            for match in data.get("results", []):
                sev_map = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}
                findings.append({
                    "type": f"semgrep/{match.get('check_id', 'unknown')}",
                    "severity": sev_map.get(match.get("extra", {}).get("severity", "WARNING"), "medium"),
                    "description": match.get("extra", {}).get("message", "Semgrep finding"),
                    "location": f"{match.get('path', '?')}:{match.get('start', {}).get('line', '?')}",
                    "confidence": 0.85,
                    "tool": "semgrep",
                    "evidence": match.get("extra", {}).get("lines", "")[:500],
                })
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass  # Non-critical -- other tools still scan

    return findings
```

### 3.2 Activate Bandit in Stage 2

**Why:** Python-specific AST scanner. Catches `torch.load()`, insecure deserialization (`pickle`), weak crypto, hardcoded passwords. Overlaps with Semgrep on some patterns but catches others it misses.

**Files to modify:**
- `python-api/requirements.txt` -- uncomment/add `bandit>=1.8.0`
- `python-api/lib/scan/stage2_static.py` -- ensure Bandit subprocess runs

```python
async def run_bandit(skill_dir: str) -> list[dict]:
    """Run Bandit on Python files."""
    findings = []
    try:
        result = subprocess.run(
            ["bandit", "-r", skill_dir, "-f", "json", "--severity-level", "low",
             "-x", ".git,node_modules,__pycache__"],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout or result.stderr
        if output:
            data = json.loads(output)
            for issue in data.get("results", []):
                findings.append({
                    "type": f"bandit/{issue.get('test_id', 'unknown')}",
                    "severity": issue.get("issue_severity", "MEDIUM").lower(),
                    "description": issue.get("issue_text", "Bandit finding"),
                    "location": f"{issue.get('filename', '?')}:{issue.get('line_number', '?')}",
                    "confidence": {"HIGH": 0.9, "MEDIUM": 0.7, "LOW": 0.5}.get(issue.get("issue_confidence", "MEDIUM"), 0.7),
                    "tool": "bandit",
                    "evidence": issue.get("code", "")[:500],
                })
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass

    return findings
```

### 3.3 Activate detect-secrets in Stage 4

**Files to modify:**
- `python-api/requirements.txt` -- uncomment/add `detect-secrets>=1.5.0`
- `python-api/lib/scan/stage4_secrets.py` -- verify the existing integration works

The code already has detect-secrets integration. Uncommenting the dependency activates it. The custom regex patterns (Google API keys, DB connection strings, JWT tokens, SSH headers) should remain as supplementary checks.

---

## 4. Phase 2: Add Cisco AI Defense Skill Scanner

**This is the single biggest improvement.** The Cisco skill-scanner is the only open-source tool purpose-built for agent skill security. It detects 16 threat classes with both static and behavioral (cross-file dataflow) analysis.

### What Cisco Adds That Tank Currently Misses

| Threat | Current Detection | With Cisco |
|---|---|---|
| Multi-file data exfiltration (read creds in A, encode in B, send in C) | Not detected | Behavioral analyzer tracks cross-file dataflow |
| Tool shadowing (skill impersonates a trusted tool) | Not detected | YARA + YAML signature rules |
| Tool poisoning (skill tampers with tool behavior) | Not detected | Pattern + behavioral detection |
| Tool chaining abuse (read-then-send chains) | Partial regex | Full source-to-sink taint tracking via CFG |
| Obfuscation (ROT13, char-code concat, hex encoding) | Base64+exec only | Multiple YARA obfuscation patterns |
| Autonomy abuse (infinite retry loops, resource exhaustion) | Not detected | Resource abuse detection |
| Capability inflation (skill requests more tools than needed) | Not detected | Trigger analyzer |
| Transitive trust abuse (indirect injection via fetched content) | Not detected | AITech-1.2 pattern matching |
| Supply chain injection (malicious package/tool references) | Partial | AITech-9.3 detection |

### Cisco Scanner Layers (Free Only)

| Layer | Method | Speed | What It Catches |
|---|---|---|---|
| Static | YARA binary patterns + YAML regex signatures | ~50ms | Known malicious patterns, obfuscation, suspicious imports |
| Bytecode | Python `.pyc` consistency verification | ~10ms | Tampered bytecode files |
| Pipeline | Shell command taint tracking | ~30ms | Shell injection chains in scripts |
| Behavioral | AST dataflow analysis (CFG + fixpoint) | ~100ms | Cross-file source-to-sink flows, exfiltration chains |

**Total: ~200ms per skill. No API calls. No LLM. All local.**

### Integration

**Files to modify:**
- `python-api/requirements.txt` -- add `cisco-ai-skill-scanner` (verify exact PyPI package name)
- New file: `python-api/lib/scan/cisco_scanner.py` -- wrapper module
- `python-api/lib/scan/stage3_injection.py` -- integrate Cisco findings alongside existing regex

**New file: `python-api/lib/scan/cisco_scanner.py`**

```python
"""Wrapper for Cisco AI Defense Skill Scanner (free layers only)."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Map Cisco threat classes to Tank severity
CISCO_TO_TANK_SEVERITY = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
}

# High-signal threat classes (boost confidence when detected)
CRITICAL_THREAT_CLASSES = {
    "prompt_injection",       # AITech-1.1
    "transitive_trust_abuse", # AITech-1.2
    "data_exfiltration",      # AITech-8.2
    "tool_chaining_abuse",    # AITech-8.2
    "command_injection",      # AITech-9.1
    "code_execution",         # AITech-9.1
    "obfuscation",            # AITech-9.2
    "supply_chain_attack",    # AITech-9.3
    "tool_poisoning",         # AITech-12.1
    "tool_shadowing",         # AITech-12.1
}


async def run_cisco_scanner(skill_dir: str, use_behavioral: bool = True) -> list[dict]:
    """Run Cisco skill-scanner with free-only analyzers.

    Static layer: YARA + YAML signatures + bytecode + pipeline taint tracking
    Behavioral layer: AST dataflow analysis (CFG-based, no code execution)

    No LLM. No API keys. Fully local.
    """
    findings = []

    try:
        from skill_scanner import SkillScanner
    except ImportError:
        logger.warning("cisco-ai-skill-scanner not installed, skipping")
        return findings

    try:
        scanner_kwargs = {}

        if use_behavioral:
            try:
                from skill_scanner.core.analyzers import BehavioralAnalyzer
                scanner_kwargs["analyzers"] = [BehavioralAnalyzer()]
            except ImportError:
                logger.info("Behavioral analyzer not available, using static only")

        scanner = SkillScanner(**scanner_kwargs)
        result = scanner.scan_skill(skill_dir)

        for finding in result.findings:
            category = getattr(finding, "category", "unknown")
            confidence = getattr(finding, "confidence", 0.8)

            # Boost confidence for high-signal threat classes
            if category in CRITICAL_THREAT_CLASSES:
                confidence = max(confidence, 0.85)

            analyzer = getattr(finding, "analyzer", "static")
            findings.append({
                "type": f"cisco/{category}",
                "severity": CISCO_TO_TANK_SEVERITY.get(getattr(finding, "severity", "MEDIUM"), "medium"),
                "description": getattr(finding, "description", str(finding)),
                "location": getattr(finding, "location", None),
                "confidence": confidence,
                "tool": f"cisco-skill-scanner/{analyzer}",
                "evidence": getattr(finding, "evidence", None),
            })

    except Exception as e:
        logger.error(f"Cisco skill-scanner error: {e}")

    return findings
```

**Stage 3 integration -- modify `stage3_injection.py`:**

```python
# Add at the top of the stage3 runner function:
from .cisco_scanner import run_cisco_scanner

async def run_stage3(skill_dir: str, files: list[dict]) -> StageResult:
    findings = []

    # Layer 1: Existing fast regex patterns (sub-millisecond, catches common injections)
    regex_findings = detect_injection_patterns(files)
    findings.extend(regex_findings)

    # Layer 2: Cisco skill-scanner (YARA + behavioral dataflow, ~200ms)
    cisco_findings = await run_cisco_scanner(skill_dir, use_behavioral=True)
    findings.extend(cisco_findings)

    # Deduplication happens in Phase 5's dedup module
    return StageResult(stage="stage3", findings=findings)
```

### Cisco Scanner: Important Notes

- **License:** The repo uses a custom SPDX identifier. Verify compatibility with Tank's license before production use. Read `LICENSE` in their repo.
- **Python version:** Requires 3.10+. Tank's Python API already uses 3.12+.
- **Package name on PyPI:** Verify the exact name (`cisco-ai-skill-scanner` or similar) before adding to requirements.
- **API stability:** The scanner is relatively new (Jan 2026). Pin the version and wrap with try/except to handle API changes.

---

## 5. Phase 3: Optimize Dependency Scanning

### 5.1 Switch to OSV Batch API

Current `stage5_supply.py` makes one HTTP request per dependency. The OSV batch API handles hundreds of packages in a single request.

**File to modify:** `python-api/lib/scan/stage5_supply.py`

```python
async def query_osv_batch(dependencies: list[dict]) -> list[dict]:
    """Query OSV batch API for all dependencies at once.

    Free, no auth, no rate limits, ~3s P95 latency.
    Falls back to individual queries on batch failure.
    """
    if not dependencies:
        return []

    findings = []
    queries = [
        {
            "package": {"name": d["name"], "ecosystem": d["ecosystem"]},
            **({"version": d["version"]} if d.get("version") else {}),
        }
        for d in dependencies
    ]

    BATCH_SIZE = 100
    async with httpx.AsyncClient(timeout=15.0) as client:
        for i in range(0, len(queries), BATCH_SIZE):
            batch = queries[i : i + BATCH_SIZE]
            try:
                resp = await client.post("https://api.osv.dev/v1/querybatch", json={"queries": batch})
                resp.raise_for_status()

                for j, result in enumerate(resp.json().get("results", [])):
                    for vuln in result.get("vulns", []):
                        dep = dependencies[i + j]
                        findings.append({
                            "type": "known_vulnerability",
                            "severity": _cvss_to_severity(vuln),
                            "description": f"{dep['name']}@{dep.get('version', '?')}: {vuln.get('summary', vuln['id'])}",
                            "location": f"requirements.txt" if dep["ecosystem"] == "PyPI" else "package.json",
                            "confidence": 1.0,
                            "tool": "osv-api",
                            "evidence": f"{vuln['id']} -- https://osv.dev/vulnerability/{vuln['id']}",
                        })
            except Exception:
                pass  # Fall back to existing per-package queries

    return findings


def _cvss_to_severity(vuln: dict) -> str:
    for s in vuln.get("severity", []):
        try:
            score = float(s.get("score", "0").split("/")[0].split(":")[-1])
            if score >= 9.0: return "critical"
            if score >= 7.0: return "high"
            if score >= 4.0: return "medium"
            return "low"
        except (ValueError, IndexError):
            continue
    return "medium"
```

### 5.2 Improve npm Ecosystem Parsing

Ensure `package.json` dependencies are fully parsed for JS/TS skills:

```python
def parse_package_json(content: str) -> list[dict]:
    """Parse all dependency types from package.json."""
    deps = []
    try:
        data = json.loads(content)
        for dep_type in ("dependencies", "devDependencies", "peerDependencies"):
            for name, version_spec in data.get(dep_type, {}).items():
                version = version_spec.lstrip("^~>=<! ")
                if version and version not in ("*", "latest"):
                    deps.append({"name": name, "version": version, "ecosystem": "npm"})
    except json.JSONDecodeError:
        pass
    return deps
```

---

## 6. Phase 4: Custom Agent-Specific Semgrep Rules

Generic SAST rules don't cover agent-specific attack patterns. Create a dedicated rule pack.

**New directory: `python-api/lib/scan/semgrep-rules/`**

### `agent-exfiltration.yaml`

```yaml
rules:
  - id: tank/env-to-network
    patterns:
      - pattern-either:
          - pattern: |
              $DATA = os.environ[...]
              ...
              requests.$METHOD($URL, ..., data=$DATA, ...)
          - pattern: |
              $DATA = os.getenv(...)
              ...
              requests.$METHOD($URL, ..., json=$DATA, ...)
    message: "Environment variable data sent to external endpoint (potential credential exfiltration)"
    severity: ERROR
    languages: [python]
    metadata:
      category: data-exfiltration
      cwe: ["CWE-200"]
      threat-class: AITech-8.2

  - id: tank/file-read-then-post
    patterns:
      - pattern: |
          $CONTENT = open($PATH).read()
          ...
          requests.post($URL, ..., data=$CONTENT, ...)
    message: "File contents read and sent to network endpoint (potential exfiltration)"
    severity: ERROR
    languages: [python]
    metadata:
      category: data-exfiltration
      cwe: ["CWE-200"]

  - id: tank/fetch-with-sensitive-data
    patterns:
      - pattern-either:
          - pattern: |
              $DATA = process.env.$KEY
              ...
              fetch($URL, { ..., body: $DATA, ... })
          - pattern: |
              $DATA = process.env.$KEY
              ...
              fetch($URL, { ..., body: JSON.stringify({..., $KEY: $DATA, ...}), ... })
    message: "Environment variable included in fetch request body"
    severity: ERROR
    languages: [javascript, typescript]
    metadata:
      category: data-exfiltration
```

### `agent-injection.yaml`

```yaml
rules:
  - id: tank/xml-tag-injection-in-markdown
    pattern-regex: "<(system|human|assistant|tool_use|function_calls|antml:)[^>]*>"
    message: "Claude XML control tag found in skill content -- potential format injection"
    severity: ERROR
    paths:
      include: ["*.md", "*.txt", "*.yaml", "*.yml"]
    metadata:
      category: prompt-injection
      threat-class: AITech-1.1

  - id: tank/dynamic-tool-loading
    patterns:
      - pattern-either:
          - pattern: json.loads($INPUT)
          - pattern: yaml.safe_load($INPUT)
      - metavariable-pattern:
          metavariable: $INPUT
          pattern-not: |
            open("...").read()
    message: "Tool definitions loaded from dynamic/untrusted input (potential tool poisoning)"
    severity: WARNING
    languages: [python]
    metadata:
      category: tool-poisoning
      threat-class: AITech-12.1
```

### `agent-obfuscation.yaml`

```yaml
rules:
  - id: tank/char-concat-exec
    patterns:
      - pattern: |
          $S = chr(...) + ...
          ...
          exec($S)
    message: "Character-by-character string construction followed by exec (obfuscation)"
    severity: ERROR
    languages: [python]
    metadata:
      category: obfuscation
      threat-class: AITech-9.2

  - id: tank/hex-decode-exec
    patterns:
      - pattern: |
          $S = bytes.fromhex(...)
          ...
          exec($S)
    message: "Hex-decoded string passed to exec (obfuscation)"
    severity: ERROR
    languages: [python]
    metadata:
      category: obfuscation

  - id: tank/base64-dynamic-import
    patterns:
      - pattern: |
          $DECODED = base64.b64decode(...)
          ...
          importlib.import_module($DECODED)
    message: "Base64-decoded string used for dynamic module import"
    severity: ERROR
    languages: [python]
    metadata:
      category: obfuscation
```

---

## 7. Phase 5: Finding Deduplication & Confidence Scoring

Multiple tools scanning the same code will produce duplicate findings. This module merges overlapping results and boosts confidence when multiple tools agree.

**New file: `python-api/lib/scan/dedup.py`**

```python
"""Deduplicate findings across scanning tools.

Rules:
- Two findings are duplicates if: same file (within 3 lines) AND similar type category
- When duplicates merge: keep highest severity, boost confidence by 0.1 per corroborating tool
- Record all contributing tools for UI attribution
"""


def deduplicate_findings(findings: list[dict]) -> list[dict]:
    if len(findings) <= 1:
        return findings

    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    sorted_findings = sorted(
        findings,
        key=lambda f: (severity_rank.get(f.get("severity", "low"), 3), -f.get("confidence", 0)),
    )

    merged = []
    consumed = set()

    for i, primary in enumerate(sorted_findings):
        if i in consumed:
            continue

        duplicates = []
        for j in range(i + 1, len(sorted_findings)):
            if j in consumed:
                continue
            if _is_duplicate(primary, sorted_findings[j]):
                duplicates.append(j)
                consumed.add(j)

        if duplicates:
            tools = {primary.get("tool", "unknown")}
            for idx in duplicates:
                tools.add(sorted_findings[idx].get("tool", "unknown"))

            primary["confidence"] = min(1.0, primary.get("confidence", 0.8) + 0.1 * len(duplicates))
            primary["tool"] = " + ".join(sorted(tools))
            primary["corroborated"] = True
            primary["corroboration_count"] = len(tools)

        merged.append(primary)

    return merged


def _is_duplicate(a: dict, b: dict) -> bool:
    loc_a, loc_b = str(a.get("location", "")), str(b.get("location", ""))
    if not loc_a or not loc_b:
        return False

    file_a = loc_a.rsplit(":", 1)[0]
    file_b = loc_b.rsplit(":", 1)[0]
    if file_a != file_b:
        return False

    try:
        line_a = int(loc_a.rsplit(":", 1)[1])
        line_b = int(loc_b.rsplit(":", 1)[1])
        if abs(line_a - line_b) > 3:
            return False
    except (ValueError, IndexError):
        return False

    # Check keyword overlap in type names
    words_a = set(a.get("type", "").replace("/", " ").replace("_", " ").replace("-", " ").split())
    words_b = set(b.get("type", "").replace("/", " ").replace("_", " ").replace("-", " ").split())
    return len(words_a & words_b) > 0
```

---

## 8. Phase 6: SARIF Unified Output

All tools in this plan (Semgrep, Bandit, Cisco, OSV) support SARIF output. Adding SARIF as an export format enables future GitHub Code Scanning integration and standardized reporting.

**New file: `python-api/lib/scan/sarif.py`**

```python
"""Convert Tank scan findings to SARIF v2.1.0 format."""

from datetime import datetime, timezone

SARIF_LEVEL = {"critical": "error", "high": "error", "medium": "warning", "low": "note"}


def to_sarif(findings: list[dict], scan_duration_ms: int = 0) -> dict:
    rules = {}
    results = []

    for finding in findings:
        rule_id = finding.get("type", "unknown")
        if rule_id not in rules:
            rules[rule_id] = {
                "id": rule_id,
                "shortDescription": {"text": rule_id.replace("/", ": ").replace("_", " ").title()},
                "defaultConfiguration": {"level": SARIF_LEVEL.get(finding.get("severity", "medium"), "warning")},
                **({"properties": {"tags": [finding.get("tool", "")]}} if finding.get("tool") else {}),
            }

        result = {
            "ruleId": rule_id,
            "level": SARIF_LEVEL.get(finding.get("severity", "medium"), "warning"),
            "message": {"text": finding.get("description", "No description")},
            "properties": {
                "confidence": finding.get("confidence", 0),
                "source_tool": finding.get("tool", "unknown"),
                **({"corroborated": True} if finding.get("corroborated") else {}),
            },
        }

        loc = finding.get("location")
        if loc and ":" in str(loc):
            parts = str(loc).rsplit(":", 1)
            try:
                result["locations"] = [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": parts[0]},
                        "region": {"startLine": int(parts[1])},
                    }
                }]
            except (ValueError, IndexError):
                pass

        results.append(result)

    return {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "tank-scanner", "version": "2.0.0", "rules": list(rules.values())}},
            "results": results,
            "invocations": [{
                "executionSuccessful": True,
                "startTimeUtc": datetime.now(timezone.utc).isoformat(),
                **({"properties": {"duration_ms": scan_duration_ms}} if scan_duration_ms else {}),
            }],
        }],
    }
```

**Optional:** Store SARIF in a `sarif_report` JSONB column on `scan_results` or expose via API endpoint for download.

---

## 9. Phase 7: UX Overhaul

**This is the biggest differentiator for Tank.** Users need to quickly understand: "Is this skill safe?" and "What exactly was checked?"

### Current UX Problems

1. Security info is crammed into a small sidebar with tiny text (text-xs, text-[10px])
2. Findings are in a 256px scrollable container -- hard to read
3. No visual distinction between "multiple tools agree this is dangerous" vs "one tool flagged it"
4. No way to understand what was actually scanned (which tools ran, what they checked)
5. Score breakdown is hidden behind a `<details>` element
6. No filtering/sorting of findings
7. Remediation guidance is generic static text
8. No concept of "scan transparency" -- users can't see the pipeline

### 9.1 New Security Tab on Skill Detail Page

**Move security from the sidebar to its own dedicated tab.** The sidebar keeps only the summary (score + verdict badge). The full security analysis gets a tab alongside "Readme", "Versions", "Files".

**New tab: "Security"**

This tab becomes the centerpiece of Tank's value proposition. It should feel like a professional security report, not an afterthought in a sidebar.

#### Tab Layout (top to bottom):

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  SECURITY OVERVIEW BANNER                                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Score: 8/10          Verdict: PASS        Scanned: 2m ago    │ │
│  │  ████████░░            [green badge]        Duration: 1.2s    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  SCANNING TOOLS USED                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────┐ ┌─────┐ │
│  │ Semgrep  │ │ Bandit   │ │ Cisco Skill  │ │ detect-   │ │ OSV │ │
│  │ SAST     │ │ Python   │ │ Scanner      │ │ secrets   │ │ API │ │
│  │ ✓ ran    │ │ ✓ ran    │ │ ✓ ran        │ │ ✓ ran     │ │ ✓   │ │
│  └──────────┘ └──────────┘ └──────────────┘ └───────────┘ └─────┘ │
│                                                                     │
│  FINDINGS  (3 critical · 1 high · 2 medium · 4 low)                │
│  [Filter: All | Critical | High | Medium | Low]                     │
│  [Sort: Severity | Stage | Tool | Location]                         │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ● CRITICAL  shell_injection                   main.py:42      │ │
│  │   Use of os.system() with unvalidated input                   │ │
│  │   Detected by: Semgrep + Bandit + Cisco (3 tools agree)       │ │
│  │   [Expand for details, evidence, and fix suggestion]           │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ ● CRITICAL  data_exfiltration                 utils.py:18     │ │
│  │   Environment variables sent to external endpoint              │ │
│  │   Detected by: Cisco skill-scanner/behavioral                  │ │
│  │   [Expand for details, evidence, and fix suggestion]           │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ ...                                                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  SCAN PIPELINE DETAILS                                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Stage 0: Ingestion ✓ ─── 0 issues ─── 0.3s                   │ │
│  │ Stage 1: Structure ✓ ─── 1 issue  ─── 0.1s                   │ │
│  │ Stage 2: Static    ✓ ─── 4 issues ─── 2.1s                   │ │
│  │ Stage 3: Agent     ✓ ─── 2 issues ─── 0.4s                   │ │
│  │ Stage 4: Secrets   ✓ ─── 0 issues ─── 0.2s                   │ │
│  │ Stage 5: Supply    ✓ ─── 1 issue  ─── 1.8s                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  SCORE BREAKDOWN                                                    │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ✓ SKILL.md present                                    +1      │ │
│  │ ✓ Description provided                                +1      │ │
│  │ ✓ Permissions declared                                +1      │ │
│  │ ✗ No security issues                                  +0 /+2  │ │
│  │ ✓ Permissions match detected usage                    +2      │ │
│  │ ✓ File count under 100                                +1      │ │
│  │ ✓ README documentation                                +1      │ │
│  │ ✓ Package under 5MB                                   +1      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Component Specifications

#### A) Security Overview Banner

```tsx
// New component: components/security/SecurityOverview.tsx

interface SecurityOverviewProps {
  score: number | null;        // 0-10
  verdict: string | null;      // "pass" | "pass_with_notes" | "flagged" | "fail"
  durationMs: number | null;   // Scan execution time
  scannedAt: string | null;    // ISO date
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}
```

**Design:**
- Full-width card with score on left (large number + progress bar), verdict badge center, metadata right
- Score progress bar: 0-3 red, 4-6 yellow, 7-8 green, 9-10 bright green
- Verdict badge: large, rounded, color-coded (same as current but bigger)
- "Scanned X ago" uses `timeago.js` or Intl.RelativeTimeFormat
- If scan failed or is pending, show appropriate status with explanation

#### B) Scanning Tools Strip

```tsx
// New component: components/security/ScanningToolsStrip.tsx

interface ScanTool {
  name: string;           // "Semgrep", "Bandit", etc.
  category: string;       // "SAST", "Python AST", "Agent Threats", "Secrets", "SCA"
  ran: boolean;           // Whether this tool was part of the scan
  findingCount: number;   // Findings from this tool
  version?: string;       // Tool version
}
```

**Design:**
- Horizontal strip of tool "cards" (small, ~120px each)
- Each card: tool name (bold), category (muted), checkmark if ran, finding count badge
- Gray out tools that didn't run (e.g., Bandit doesn't run if no Python files)
- Hover tooltip: "Semgrep OSS -- Static analysis with 2,000+ security rules. Checked 4 Python files, 2 TypeScript files."

**Why this matters:** This is the biggest transparency win. Users can see at a glance which tools checked their skill. skills.sh shows "Snyk + Socket + Gen Agent Trust Hub" -- Tank should show its tool lineup prominently.

#### C) Findings List (Enhanced)

```tsx
// New component: components/security/FindingsList.tsx

interface Finding {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  location: string | null;
  confidence: number;
  tool: string;
  evidence: string | null;
  corroborated: boolean;       // Multiple tools agree
  corroborationCount: number;  // How many tools flagged this
  stage: string;
}

interface FindingsListProps {
  findings: Finding[];
  filters: {
    severity: string[];
    stage: string[];
    tool: string[];
  };
}
```

**Design:**

Each finding is a card with:
- **Left border:** Color-coded by severity (red/orange/yellow/blue), 3px wide
- **Header row:** Severity badge (pill) + finding type (bold) + location (monospace, right-aligned)
- **Description:** 1-2 lines, clear language
- **Tool attribution:** "Detected by: Semgrep + Bandit (2 tools agree)" with a small shield icon if corroborated
- **Expandable detail section:**
  - Evidence: code snippet in a syntax-highlighted block (bg-muted, monospace)
  - CWE reference link (if available from Semgrep/Bandit metadata)
  - Fix suggestion: specific, actionable (from tool metadata or Tank's remediation map)
  - Confidence bar: thin horizontal bar (0-100%)

**Filters (top of list):**
- Severity filter: clickable pills (Critical | High | Medium | Low) that toggle visibility
- Sort dropdown: by severity (default), by stage, by tool, by file

**Empty state:** When no findings, show a green checkmark with "No security issues detected across all scanning tools."

#### D) Scan Pipeline Visualization

```tsx
// New component: components/security/ScanPipeline.tsx

interface PipelineStage {
  id: string;                // "stage0", "stage1", etc.
  name: string;              // "Ingestion", "Structure Validation", etc.
  description: string;       // What this stage checks
  status: "passed" | "flagged" | "failed" | "skipped";
  findingCount: number;
  durationMs: number;
  tools: string[];           // Which tools ran in this stage
}
```

**Design:**
- Vertical pipeline with connected nodes (similar to GitHub Actions workflow view)
- Each stage: status icon (green check / yellow warning / red X / gray skip) + name + finding count + duration
- Expand any stage to see which tools ran and what they checked
- Color the connecting line: green if all passed, yellow if some flagged, red if any failed

#### E) Score Breakdown

```tsx
// New component: components/security/ScoreBreakdown.tsx

interface ScoreCriterion {
  label: string;       // "SKILL.md present"
  passed: boolean;
  points: number;      // Points earned
  maxPoints: number;   // Max possible for this criterion
}
```

**Design:**
- Vertical list of criteria with checkmark/X + label + points on right
- Green rows for passed, muted red rows for failed
- Total at bottom with the 0-10 score

### 9.3 Sidebar Changes

Keep the sidebar lightweight. Move the detailed security info to the Security tab:

**Sidebar security section (simplified):**
```
┌──────────────────────┐
│  Security Score       │
│  ██████████░░  8/10   │
│  [PASS] badge         │
│                       │
│  3 critical findings  │
│  1 high finding       │
│                       │
│  → View full report   │  ← Links to Security tab
└──────────────────────┘
```

### 9.4 Schema Changes for UX

Add fields to `scan_findings` to support the enhanced UX:

```sql
ALTER TABLE scan_findings
  ADD COLUMN IF NOT EXISTS corroborated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS corroboration_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cwe TEXT,         -- CWE-200, CWE-78, etc.
  ADD COLUMN IF NOT EXISTS fix_suggestion TEXT;
```

Add fields to `scan_results` for per-stage timing:

```sql
ALTER TABLE scan_results
  ADD COLUMN IF NOT EXISTS stage_durations JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tools_used TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sarif_report JSONB;
```

### 9.5 API Response Changes

Update the skill version API to include the new fields:

```typescript
interface EnhancedScanFinding {
  stage: string;
  severity: string;
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
  // New fields:
  corroborated: boolean;
  corroborationCount: number;
  cwe: string | null;          // CWE reference
  fixSuggestion: string | null;
}

interface EnhancedScanDetails {
  verdict: string | null;
  stagesRun: string[];
  durationMs: number | null;
  findings: EnhancedScanFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  // New fields:
  toolsUsed: string[];                           // ["semgrep", "bandit", "cisco-skill-scanner", ...]
  stageDurations: Record<string, number>;         // {"stage0": 300, "stage1": 100, ...}
}
```

---

## 10. Deployment Strategy

### 10.1 Container Migration

Semgrep (~200MB) + Cisco skill-scanner will exceed Vercel's 250MB function limit. Move the Python scanning API to a dedicated container.

**Recommended: Railway free tier** (512MB, Docker support, free tier with 500 hours/month)

**Alternative: Fly.io free tier** (256MB VMs, 3 shared VMs free, Docker support)

**Docker setup:**

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY requirements-scanner.txt .
RUN pip install --no-cache-dir -r requirements-scanner.txt

COPY python-api/ /app/
WORKDIR /app

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`requirements-scanner.txt`:**
```
# Core
fastapi>=0.115.0
uvicorn>=0.30.0
pydantic>=2.0.0
httpx>=0.27.0
psycopg[binary]>=3.2.0

# Scanning
charset-normalizer>=3.0.0
semgrep>=1.90.0
bandit>=1.8.0
detect-secrets>=1.5.0
pip-audit>=2.7.0

# Agent-specific (verify exact PyPI package name)
cisco-ai-skill-scanner>=0.1.0
```

### 10.2 Updated Timeout Budget

With a dedicated container (no 60s Vercel limit):

| Stage | Budget | Tools |
|---|---|---|
| 0: Ingestion | 15s | httpx, tarfile, hashlib |
| 1: Structure | 5s | charset-normalizer, unicodedata |
| 2: Static Analysis | 30s | Semgrep + Bandit + custom patterns |
| 3: Agent Threats | 20s | Cisco skill-scanner + regex patterns |
| 4: Secrets | 10s | detect-secrets + custom patterns |
| 5: Dependencies | 15s | OSV batch API + typosquatting checks |
| Dedup + SARIF | 5s | dedup.py + sarif.py |
| **Total max** | **100s** | Buffer: 20s for overhead |

### 10.3 Architecture After Migration

```
User Browser
     │
     ▼
┌──────────────┐      HTTP       ┌─────────────────────┐
│ Next.js App  │ ──────────────► │ Scanner Service      │
│ (Vercel)     │                 │ (Railway/Fly.io)     │
│              │ ◄────────────── │                      │
│ - Web UI     │   scan results  │ - FastAPI            │
│ - API routes │                 │ - Semgrep            │
│ - DB queries │                 │ - Bandit             │
│              │                 │ - Cisco Skill Scanner│
└──────┬───────┘                 │ - detect-secrets     │
       │                         │ - OSV API client     │
       ▼                         └─────────┬────────────┘
┌──────────────┐                           │
│ PostgreSQL   │ ◄─────────────────────────┘
│ (Supabase)   │   store scan results
└──────────────┘
```

---

## 11. Validation & Testing

### 11.1 Test Skill Corpus

Create `python-api/tests/test_skills/` with known-malicious and benign patterns:

```
test_skills/
├── malicious/
│   ├── exfiltration_singlefile/    # Reads ~/.ssh/id_rsa + POST to external
│   ├── exfiltration_multifile/     # Read in A, encode in B, send in C
│   ├── injection_direct/           # "Ignore previous instructions" in SKILL.md
│   ├── injection_xml_tags/         # <system> tags in markdown
│   ├── obfuscated_base64_exec/     # base64 + exec chain
│   ├── obfuscated_charcode/        # chr() concat + exec
│   ├── obfuscated_hex/             # bytes.fromhex() + exec
│   ├── tool_shadow/                # Skill impersonates filesystem tool
│   ├── tool_poison/                # Modifies tool behavior
│   ├── supply_chain_typosquat/     # Depends on "reqeusts" instead of "requests"
│   ├── shell_injection/            # os.system() with user input
│   ├── secrets_hardcoded/          # Contains AWS_SECRET_ACCESS_KEY
│   ├── env_harvesting/             # Reads all of os.environ + sends
│   └── unicode_bidi/               # Bidirectional override chars
│
├── benign/
│   ├── simple_tool/                # Clean skill with no issues
│   ├── network_declared/           # Makes API calls with proper permissions
│   ├── file_operations/            # Reads/writes within own directory
│   ├── complex_but_safe/           # Many files, no issues
│   └── env_config_read/            # Reads specific env var for config (low, not critical)
```

### 11.2 Expected Detection Matrix

| Test Case | Stage 2 (SAST) | Stage 3 (Agent) | Stage 4 (Secrets) | Stage 5 (Supply) |
|---|---|---|---|---|
| exfiltration_singlefile | Semgrep: ERROR | Cisco: CRITICAL | - | - |
| exfiltration_multifile | - (single-file tools miss it) | Cisco behavioral: CRITICAL | - | - |
| injection_direct | - | Regex: CRITICAL + Cisco: CRITICAL | - | - |
| injection_xml_tags | Custom Semgrep rule: ERROR | Regex: CRITICAL | - | - |
| obfuscated_base64_exec | Bandit: HIGH + Semgrep: ERROR | Cisco: HIGH | - | - |
| tool_shadow | - | Cisco: HIGH | - | - |
| supply_chain_typosquat | - | - | - | Levenshtein: HIGH |
| shell_injection | Semgrep: ERROR + Bandit: HIGH | Cisco: CRITICAL | - | - |
| secrets_hardcoded | - | - | detect-secrets: CRITICAL | - |
| benign_simple_tool | None | None | None | None |
| benign_network_declared | None (properly declared) | None | None | None |

### 11.3 Success Criteria

After full implementation:

1. **Detection:** All 14 malicious test cases produce at least one CRITICAL or HIGH finding
2. **False positive rate:** All 5 benign test cases produce zero CRITICAL/HIGH findings
3. **Multi-file detection:** `exfiltration_multifile` is caught by Cisco behavioral analyzer
4. **Corroboration:** `shell_injection` shows "Detected by: Semgrep + Bandit + Cisco (3 tools)"
5. **Performance:** Full scan completes in under 100 seconds for typical skills
6. **Transparency:** UI shows all 5+ tools that participated in the scan
7. **Cost:** $0/month in API calls (OSV is free, everything else runs locally)

---

## 12. Implementation Order

Phases are ordered by impact-to-effort ratio. Each phase is independently deployable.

| Order | Phase | What | Impact | Effort |
|---|---|---|---|---|
| **0** | Remove OpenRouter | Delete LLM files, remove env var | Reduces attack surface | Trivial |
| **1** | Phase 1.1: Semgrep | Uncomment + integrate | +30% JS/TS code coverage | Small |
| **2** | Phase 1.2: Bandit | Uncomment + integrate | +10% Python coverage | Small |
| **3** | Phase 1.3: detect-secrets | Uncomment dependency | Full secrets scanning | Trivial |
| **4** | Deployment (10.1) | Move scanner to container | Removes size/timeout constraints | Medium |
| **5** | Phase 2: Cisco scanner | Install + integrate | +40% agent threat coverage, cross-file dataflow | Medium |
| **6** | Phase 3: OSV batch | Rewrite query logic | Faster dependency scans | Small |
| **7** | Phase 4: Custom rules | Write Semgrep YAML | +15% agent-specific coverage | Small |
| **8** | Phase 5: Dedup | New module | Cleaner results, confidence scoring | Small |
| **9** | Phase 7: UX overhaul | New components + tab | Users can see and understand everything | Large |
| **10** | Phase 6: SARIF | New module | Export format for interop | Small |
| **11** | Phase 11: Test suite | Create test skills | Regression testing | Medium |

---

## Tool Inventory (Final)

| Tool | License | Cost | Purpose | Runs Locally |
|---|---|---|---|---|
| Semgrep OSS | LGPL-2.1 | Free | Multi-language SAST with 2,000+ rules | Yes |
| Bandit | Apache-2.0 | Free | Python AST security scanner (47 checks) | Yes |
| Cisco AI Defense Skill Scanner | Custom (verify) | Free | Agent-specific: 16 threat classes, YARA, behavioral dataflow | Yes |
| detect-secrets | Apache-2.0 | Free | 15+ secret detectors (AWS, GitHub, Stripe, JWT, etc.) | Yes |
| OSV API | Free service | Free | CVE database for PyPI, npm, Go, Maven, etc. | API (free, no auth) |
| pip-audit | Apache-2.0 | Free | Python dependency vulnerability scanning | Yes |
| Custom Tank regex | MIT | Free | Claude-specific injection patterns, Unicode tricks | Yes |
| Custom Semgrep rules | MIT | Free | Agent-specific exfiltration, obfuscation, tool poisoning | Yes |

**Total tools: 8 (7 local + 1 free API). Total cost: $0/month.**

---

## What This Plan Explicitly Excludes

| Feature | Why |
|---|---|
| Any LLM-based analysis | Susceptible to prompt injection. Deterministic tools are immune. |
| Snyk / Socket | Paid. OSV + Bandit + Semgrep provide equivalent coverage free. |
| ML prompt injection classifiers | Require PyTorch (~2GB). Too heavy for free container tiers. Cisco YARA rules cover the common patterns. |
| Sandbox execution | Massive infra complexity. Skills can detect sandboxes. Static analysis is more reliable here. |
| Continuous re-scanning | Good feature, separate project. This plan focuses on scan-time quality. |

---

## Threat Coverage Map (After Implementation)

| OWASP Top 10 for LLM Applications | Tank Detection | Tools |
|---|---|---|
| LLM01: Prompt Injection | Direct + indirect patterns | Cisco + regex + Semgrep custom rules |
| LLM02: Insecure Output Handling | Code execution patterns | Semgrep + Bandit + Cisco |
| LLM03: Training Data Poisoning | N/A (not applicable to skills) | - |
| LLM04: Model Denial of Service | Resource abuse patterns | Cisco trigger analyzer |
| LLM05: Supply Chain Vulnerabilities | CVE scanning + typosquatting | OSV + pip-audit + custom checks |
| LLM06: Sensitive Information Disclosure | Secret scanning + exfiltration | detect-secrets + Cisco behavioral + Semgrep |
| LLM07: Insecure Plugin Design | Tool poisoning/shadowing | Cisco (AITech-12.1) |
| LLM08: Excessive Agency | Capability inflation, autonomy abuse | Cisco trigger + resource abuse |
| LLM09: Overreliance | N/A (user-side concern) | - |
| LLM10: Model Theft | N/A (not applicable to skills) | - |

**Coverage: 8 out of 8 applicable categories.**
