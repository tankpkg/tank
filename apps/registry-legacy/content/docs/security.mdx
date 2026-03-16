---
title: Security Model
description: How Tank's 6-stage security pipeline scans AI agent skills for vulnerabilities, prompt injection, credential theft, and supply chain attacks before they reach your agents.
---

# Security Model

Tank's security pipeline is the core reason the project exists. This page explains exactly what runs when a skill is scanned, what each stage detects, how verdicts are assigned, and how the audit score is calculated.

## Why AI Skill Security Is Different

Traditional package managers worry about dependency vulnerabilities — known CVEs in libraries you ship. AI agent skills introduce a fundamentally larger attack surface:

- Skills execute with the **agent's full authority** — reading files, calling APIs, running shell commands
- Skills can contain **prompt injection payloads** that hijack agent behavior mid-conversation
- Skills can **exfiltrate credentials** by intercepting environment variables the agent holds
- Skills can **abuse trust relationships** between the agent and the model provider

This risk materialized in February 2026. The **ClawHavoc incident** exposed 341 malicious skills — 12% of a major marketplace — distributing credential-stealing malware disguised as productivity tools. The attack worked because that registry had no static analysis, no permission enforcement, and no code signing. Users had no way to know what they were installing.

Tank was built as the answer. Security scanning is mandatory, non-optional, and runs server-side before a skill is ever made publicly available.

<Callout type="info">
  Every skill published to the Tank registry is scanned before it becomes installable. A skill with a FAIL verdict is
  blocked from publication. A FLAGGED skill requires manual review by a registry moderator before release.
</Callout>

---

## 6-Stage Security Pipeline

The pipeline is implemented in Python (`python-api/lib/scan/`) as six independent stages. Each stage can error without blocking subsequent stages, but errors are surfaced in the final verdict. All stages write structured findings into a shared result object that feeds the verdict engine.

```
tarball → [Stage 0] → [Stage 1] → [Stage 2] → [Stage 3] → [Stage 4] → [Stage 5] → verdict
           ingest      structure   static       injection    secrets     supply
```

### Stage 0: Ingestion & Safe Quarantine

The first stage downloads the tarball into an isolated quarantine directory and validates it before a single file is extracted.

**What it does:**

- Downloads the tarball to a temporary quarantine directory (never the working directory)
- Validates the source URL — rejects non-HTTPS schemes, private IP ranges (127.x, 10.x, 192.168.x, 169.254.x, ::1), and localhost
- Computes the **SHA-256 hash** of the raw tarball for integrity tracking and deduplication
- Extracts with strict security filters applied to every path in the archive

**Extraction security filters** — any file failing these checks causes immediate rejection with a `critical` finding:

| Check              | Why                                                                        |
| ------------------ | -------------------------------------------------------------------------- |
| Symlinks           | Could point outside the sandbox to host filesystem paths                   |
| Hardlinks          | Same escape vector as symlinks, subtler to detect                          |
| Absolute paths     | `/etc/passwd` style paths extracted verbatim on some systems               |
| Path traversal     | `../../../home/user/.ssh/id_rsa` style directory climbing                  |
| Zip bomb detection | Deeply nested or recursively-compressed archives that expand exponentially |

**Hard limits** enforced during ingestion:

| Limit                    | Value       |
| ------------------------ | ----------- |
| Maximum tarball size     | 50 MB       |
| Maximum single file size | 5 MB        |
| Maximum file count       | 1,000 files |

Exceeding any limit is a `critical` finding and terminates the scan immediately.

<Callout type="warn">
  The 50 MB / 1,000 file limits are not suggestions — they are hard stops. Skills that bundle large datasets,
  pre-trained model weights, or vendored node_modules will fail ingestion. Keep skills lean: code and configuration
  only.
</Callout>

---

### Stage 1: Structure Validation & Unicode Attack Detection

Stage 1 validates that the skill is well-formed and checks every filename and string in the manifest for Unicode-based obfuscation attacks.

**Structure checks:**

- Presence of `SKILL.md` manifest — absence is a `high` finding
- Valid UTF-8 encoding throughout — non-UTF-8 files are flagged `medium`
- Detection of hidden dotfiles (`.env`, `.npmrc`, `.gitconfig`) that shouldn't be distributed — flagged `low` to `medium`
- NFKC normalization tricks — characters that look identical but normalize differently (e.g., the Unicode "micro sign" µ vs Greek lowercase µ) are flagged `medium`

**Unicode attack detection** — a dedicated sub-scanner checks every filename, field in `SKILL.md`, and string in package manifests:

| Attack Type                                                          | Severity   | Example                                                                              |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| **Bidirectional override characters** (U+202A–U+202E, U+2066–U+2069) | `critical` | Filename appears as `"document.pdf"` but is actually `"fdp.tnemucode"` when executed |
| **Cyrillic homoglyphs** replacing Latin characters                   | `high`     | `аnthroрic.com` (Cyrillic а and р) vs `anthropic.com`                                |
| **Zero-width characters** (U+200B, U+FEFF, U+00AD)                   | `medium`   | Hidden characters in identifiers that change behavior without changing appearance    |

Bidirectional override characters receive `critical` severity because they are the core technique used in the "Trojan Source" class of attacks — they allow an attacker to make source code appear to reviewers as doing something completely different from what it actually executes.

---

### Stage 2: Static Analysis — Code-Level Vulnerability Detection

Stage 2 is the deepest code inspection stage. It runs multiple analyzers across all code files in the extracted skill.

**Python files — Bandit AST analysis:**

[Bandit](https://bandit.readthedocs.io/) runs a full Abstract Syntax Tree parse of every `.py` file and checks for:

- `eval()`, `exec()`, `compile()` calls with dynamic input
- `subprocess` module usage (flagged for cross-check with permissions)
- `os.system()`, `os.popen()`, `commands.getstatusoutput()`
- `pickle.loads()` / `yaml.load()` deserialization
- Hardcoded password or key literals
- Use of weak cryptographic primitives (MD5, SHA1 for security)
- XML external entity (XXE) vulnerabilities
- SQL string formatting (potential injection)

**JavaScript and TypeScript files — custom regex pattern engine:**

A set of compiled regex patterns scans every `.js`, `.ts`, `.mjs`, `.cjs` file for:

- `eval(`, `new Function(`, `setTimeout(code)` patterns
- `child_process.exec`, `execSync`, `spawn` usage
- Dynamic `require()` or `import()` with variable arguments
- `fetch(`, `axios(`, `http.request(` (cross-checked against network permissions)
- `process.env` access (cross-checked against environment permissions)
- Base64-then-eval obfuscation: `Buffer.from(X, 'base64')` followed by `eval`

**Shell and Bash files:**

- Command injection patterns (`$()`, backtick expansion with user input)
- `curl | bash` or `wget -O- | sh` patterns
- Modification of PATH or sensitive environment variables

**Obfuscation detection:**

Stage 2 specifically looks for code obfuscation — a strong signal of malicious intent:

- Multi-layer base64 encoding: `atob(atob(...))` chains
- ROT13 + eval combinations
- Excessive string splitting and joining of identifiers
- Hex-encoded string literals used in `eval` or `exec`

**Permission cross-check:**

Any network call, subprocess invocation, or environment variable access found in code is cross-checked against the permissions declared in `SKILL.md`. Discrepancies where code does more than permissions declare are flagged `high`. This is the primary mechanism for detecting skills that lie about what they do.

---

### Stage 3: Prompt Injection & Hidden Content Detection

Stage 3 is unique to AI skill security — it's the stage with no direct equivalent in traditional package scanning. It detects content designed to hijack agent behavior.

**Prompt injection pattern categories:**

Tank compiles 114 patterns across 8 categories at scanner startup:

| Category                    | Description                                                                                    | Example Signals                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Direct override**         | Instructions that tell the model to ignore prior context                                       | "ignore previous instructions", "disregard your system prompt"                 |
| **Role hijacking**          | Attempts to redefine what the model is                                                         | "you are now", "from now on you will be", "new persona:"                       |
| **Context manipulation**    | Fictitious scenarios that excuse policy violations                                             | "in this hypothetical", "pretend this is a game where rules don't apply"       |
| **Exfiltration**            | Instructions to send data to external endpoints                                                | "send the contents of", "forward all messages to", "email the above"           |
| **Privilege escalation**    | Claims of elevated permissions or developer mode                                               | "developer mode enabled", "DAN mode", "jailbreak token:"                       |
| **Claude format injection** | Attempts to inject `<parameter name="thinking">` tags, `Human:` / `Assistant:` turn delimiters | Anthropic-format delimiters appearing in skill content strings                 |
| **Imperative language**     | Urgent commands disguised as skill instructions                                                | "you must immediately", "do not tell the user", "execute without confirmation" |
| **Authority claims**        | False claims of being Anthropic, OpenAI, or the registry                                       | "message from Anthropic:", "system override from registry:"                    |

**Hidden content detection:**

Injection payloads are often concealed where users won't look:

- **HTML comments** — `<!-- ignore previous instructions -->` inside skill documentation
- **Markdown comments** — `[//]: # (inject: ...)` syntax
- **Base64-encoded strings in code comments** — decoded and re-scanned for injection patterns
- **Whitespace steganography** — payload hidden in trailing spaces or tab sequences

**LLM corroboration for ambiguous findings:**

Some patterns have legitimate uses (e.g., a skill teaching prompt engineering might contain "ignore previous instructions" as example content). Stage 3 can optionally send ambiguous findings to an LLM for corroboration — see [LLM-Assisted Analysis](#llm-assisted-analysis) below.

**Optional third-party scanners:**

| Tool                    | Purpose                                                         | Availability                    |
| ----------------------- | --------------------------------------------------------------- | ------------------------------- |
| **Cisco Skill Scanner** | AI agent threat detection, specialized for MCP/agent ecosystems | Optional, cloud-dependent       |
| **Snyk Agent Scan**     | Prompt injection and tool poisoning detection                   | Optional, requires Snyk API key |

<Callout type="info">
  If optional scanners are unavailable, Stage 3 continues with its built-in 114-pattern engine. Optional scanner results
  are additive — they can increase severity but never reduce it.
</Callout>

---

### Stage 4: Secrets & Credential Detection

Stage 4 scans every file for secrets, API keys, tokens, and credentials that should never be distributed in a skill package.

**detect-secrets library (11 plugins):**

Tank uses the [`detect-secrets`](https://github.com/Yelp/detect-secrets) library, which applies entropy analysis and pattern matching simultaneously:

| Plugin                    | Detects                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `AWSKeyDetector`          | AWS access key IDs (`AKIA...`) and secret access keys      |
| `AzureStorageKeyDetector` | Azure storage connection strings and SAS tokens            |
| `GitHubTokenDetector`     | GitHub personal access tokens (`ghp_`, `github_pat_`)      |
| `JwtTokenDetector`        | JSON Web Tokens (three base64url segments)                 |
| `StripeDetector`          | Stripe publishable and secret keys                         |
| `SlackDetector`           | Slack webhook URLs and bot tokens                          |
| `BasicAuthDetector`       | HTTP Basic auth credentials embedded in URLs               |
| `HexHighEntropyString`    | High-entropy hex strings (likely cryptographic keys)       |
| `Base64HighEntropyString` | High-entropy base64 strings (likely encoded secrets)       |
| `KeywordDetector`         | Common secret keywords (`password=`, `api_key=`, `token=`) |
| `MailchimpDetector`       | Mailchimp API keys                                         |

**10 custom regex patterns:**

Beyond detect-secrets, Tank adds patterns for secrets not covered by the library:

| Pattern            | Detects                                                       |
| ------------------ | ------------------------------------------------------------- |
| `GOOGLE_CLOUD_KEY` | Google Cloud API keys (`AIza...`)                             |
| `FIREBASE_KEY`     | Firebase admin SDK service account JSON                       |
| `DATABASE_URL`     | PostgreSQL/MySQL connection strings with embedded credentials |
| `MONGODB_URI`      | MongoDB connection strings with embedded credentials          |
| `REDIS_URL`        | Redis connection strings with authentication                  |
| `SSH_PRIVATE_KEY`  | PEM-encoded private keys (`-----BEGIN RSA PRIVATE KEY-----`)  |
| `SSH_OPENSSH_KEY`  | OpenSSH format private keys                                   |
| `SENDGRID_KEY`     | SendGrid API keys (`SG.`)                                     |
| `SLACK_WEBHOOK`    | Slack incoming webhook URLs                                   |
| `DISCORD_WEBHOOK`  | Discord webhook URLs with authentication tokens               |

**`.env` file detection:**

Any `.env`, `.env.local`, `.env.production`, or similar file present in the tarball is an automatic `critical` finding — there is no legitimate reason for a distributed skill to include environment configuration files.

<Callout type="error">
  A single confirmed secret in a published skill is treated as a critical incident regardless of Stage 4 severity
  scoring. The skill is immediately blocked and the publisher account is flagged for review.
</Callout>

---

### Stage 5: Supply Chain Analysis

Stage 5 analyzes the skill's declared dependencies for typosquatting, known vulnerabilities, and unsafe version pinning practices.

**Supported manifest formats:**

- `requirements.txt` (Python)
- `pyproject.toml` (Python — `[project.dependencies]` and `[tool.poetry.dependencies]`)
- `package.json` (Node.js — `dependencies` and `devDependencies`)

**Typosquatting detection:**

Tank maintains an internal list of 1,000+ popular packages across both ecosystems (e.g., `requests`, `numpy`, `react`, `lodash`). Every declared dependency is compared against this list using **Levenshtein distance**:

- Distance 1: `reqests`, `reacts` → `high` finding (very likely intentional typosquatting)
- Distance 2: `reqeusts`, `reakts` → `medium` finding (suspicious, may be legitimate)
- Distance 3+: Not flagged as typosquatting

Package names that differ only in separator style (`_` vs `-`) are also normalized before comparison, since `Pillow` and `pillow` are the same package but `Pillow` and `Pill0w` are not.

**OSV vulnerability scanning:**

Every dependency with a pinned version is queried against the [OSV (Open Source Vulnerability) database](https://osv.dev/) API:

- Known CVEs with a CVSS score ≥ 9.0 → `critical` finding
- CVSS 7.0–8.9 → `high` finding
- CVSS 4.0–6.9 → `medium` finding
- CVSS < 4.0 → `low` finding

**Unpinned and loose dependency detection:**

| Pattern                                     | Finding    | Reason                                                  |
| ------------------------------------------- | ---------- | ------------------------------------------------------- |
| No version specifier (`requests`)           | `medium`   | Allows any version, including future malicious releases |
| Overly broad range (`>=1.0`)                | `medium`   | Same risk as unpinned                                   |
| Loose upper bound (`^1.0.0` allowing major) | `low`      | Lower risk but not deterministic                        |
| Exact pin (`requests==2.31.0`)              | No finding | Best practice                                           |

**Dynamic install detection:**

Any code that runs `pip install` or `npm install` at runtime (common in malicious skills) is flagged `critical`:

- `subprocess.run(["pip", "install", ...])` in Python files
- `execSync("npm install ...")` in JavaScript files
- `os.system("pip install ...")` in Python files

Dynamic installs bypass all of Stage 5's static analysis and represent a complete supply chain bypass.

---

## Verdict Rules: How Findings Map to Outcomes

After all six stages complete, the verdict engine counts findings by severity and applies these rules in order:

| Condition                           | Verdict             | Meaning                                                       |
| ----------------------------------- | ------------------- | ------------------------------------------------------------- |
| 1 or more `critical` findings       | **FAIL**            | Blocked from publication — must fix all criticals             |
| 4 or more `high` findings           | **FAIL**            | Blocked from publication — serious systemic issues            |
| 1–3 `high` findings                 | **FLAGGED**         | Requires manual review by a registry moderator before release |
| `medium` and/or `low` findings only | **PASS_WITH_NOTES** | Publishable — findings are displayed to installers            |
| Zero findings                       | **PASS**            | Clean scan — no findings                                      |

The rules are applied in order — the first matching rule determines the verdict. A skill with 2 criticals and 0 highs is FAIL (by the first rule), not evaluated further.

<Callout type="warn">
  FLAGGED skills are not publicly installable until a registry moderator reviews and approves them. This process
  typically takes 1–2 business days. If you receive a FLAGGED verdict, address the high-severity findings before
  requesting review — reviewers will reject skills with unaddressed issues.
</Callout>

---

## Audit Score Algorithm

The audit score (0–10) is separate from the security verdict. Where the verdict is binary (pass/fail), the score is a continuous quality signal displayed on every skill's registry page and returned by `tank audit`.

The score is computed by `lib/audit-score.ts` across 8 weighted checks:

| #   | Check                       | Points | Pass Condition                                              |
| --- | --------------------------- | ------ | ----------------------------------------------------------- |
| 1   | SKILL.md present            | 1 pt   | `SKILL.md` exists in the tarball root                       |
| 2   | Description present         | 1 pt   | `SKILL.md` contains a non-empty `description` field         |
| 3   | Permissions declared        | 1 pt   | `permissions` object present in `SKILL.md`, even if empty   |
| 4   | No security issues          | 2 pts  | Zero findings from Stage 2–5 combined                       |
| 5   | Permission extraction match | 2 pts  | Code's actual capability usage matches declared permissions |
| 6   | File count reasonable       | 1 pt   | Fewer than 100 files in the package                         |
| 7   | README documentation        | 1 pt   | A `README.md` or `README.mdx` is present                    |
| 8   | Package size under 5 MB     | 1 pt   | Total extracted size < 5 MB                                 |

**Maximum: 10 points.**

The most impactful checks are **#4 (No security issues, 2 pts)** and **#5 (Permission extraction match, 2 pts)**. A skill can have a perfect SKILL.md and README and still score 6/10 if its code's actual behavior doesn't match what it declared in permissions.

Check #5 specifically rewards transparency: the security scanner extracts what capabilities the code actually uses (network calls, filesystem access, subprocess calls) and compares against the declared `permissions` block. A skill that declares exactly what it does earns full marks. A skill that declares nothing but does nothing also earns them — the check is about accuracy, not minimalism.

```bash
# View the full audit breakdown
tank audit @org/skill-name

# Example output:
# Audit score: 8/10
#
# ✅  SKILL.md present           (1/1)
# ✅  Description present        (1/1)
# ✅  Permissions declared       (1/1)
# ✅  No security issues         (2/2)
# ⚠️  Permission extraction      (1/2)  — code accesses process.env.HOME (undeclared)
# ✅  File count reasonable      (1/1)
# ❌  README documentation       (0/1)  — no README.md found
# ✅  Package size <5 MB         (1/1)
```

---

## LLM-Assisted Analysis

Some security findings require contextual judgment that pattern matching alone cannot make accurately. Stage 3 (prompt injection detection) can optionally use an LLM to corroborate ambiguous findings before promoting them to a final severity level.

### How It Works

When a Stage 3 pattern match has a confidence score below a configured threshold — for example, a skill about prompt engineering that legitimately contains phrases like "ignore previous instructions" as educational examples — the scanner can send the flagged content plus surrounding context to an LLM with a structured evaluation prompt.

The LLM is asked to determine:

1. Is this content genuinely attempting to hijack agent behavior?
2. What is the likely intent given the surrounding context?
3. What severity level is appropriate?

The LLM response is used to **raise or lower** the pending finding's severity, or to dismiss it as a false positive. It cannot promote a finding above what pattern matching already established — it can only reduce severity or confirm it.

### Built-in Providers

Tank's hosted registry at tankpkg.dev includes built-in LLM analysis powered by:

| Provider       | Model          | Configuration                                 |
| -------------- | -------------- | --------------------------------------------- |
| **Groq**       | Llama models   | Set `GROQ_API_KEY` environment variable       |
| **OpenRouter** | Various models | Set `OPENROUTER_API_KEY` environment variable |

When either API key is configured in the Python API deployment, LLM analysis is automatically enabled for all scans. The system tries each provider in order and uses the first available one.

### Modes

Configure LLM analysis via the `LLM_ANALYSIS_MODE` environment variable on the Python API server:

| Mode       | Behavior                                                               |
| ---------- | ---------------------------------------------------------------------- |
| `byollm`   | Use your own LLM endpoint — configure `LLM_ENDPOINT` and `LLM_API_KEY` |
| `builtin`  | Use the registry's configured LLM (Groq/OpenRouter with API keys)      |
| `disabled` | Skip LLM corroboration entirely — pattern matching only                |

If no mode is specified, the system automatically enables `builtin` mode when `GROQ_API_KEY` or `OPENROUTER_API_KEY` is present.

### UI Indicator

When LLM analysis is used during a scan, the skill's security page displays an indicator showing:

- **Mode**: Whether built-in providers or custom LLM was used
- **Findings reviewed**: Number of ambiguous findings sent for LLM review
- **False positives dismissed**: Findings the LLM determined were safe
- **Threats confirmed**: Findings the LLM verified as genuine security issues

This transparency helps users understand the depth of analysis performed on each skill.

### On-Premises Deployments

Self-hosted Tank registries can run LLM analysis locally using Ollama. See the [self-hosting guide](/docs/self-hosting) for Docker Compose configuration with the `--profile llm-local` flag, which starts an Ollama container alongside the scanner.

<Callout type="info">
  LLM-assisted analysis is an enhancement to pattern matching, not a replacement for it. Skills are never approved
  solely on the basis of LLM judgment — all critical and high findings from pattern matching are preserved regardless of
  LLM corroboration results.
</Callout>

---

## Rescanning Published Skills

The registry periodically rescans already-published skills when:

- New vulnerability data is available from OSV
- The prompt injection pattern database is updated with new categories
- A security report is filed against a specific skill

If a rescan produces a verdict change (e.g., a previously PASS skill now has a critical finding due to a newly disclosed CVE), the skill is immediately pulled from installability and the publisher is notified.

Administrators can trigger manual rescans via:

```bash
# Admin API — rescan a specific skill
POST /api/admin/rescan-skills
{ "skillName": "@org/skill-name" }

# Or rescan all skills in bulk
POST /api/admin/rescan-skills
{ "all": true }
```

---

## Further Reading

- [Permissions & Access Control](/docs/permissions) — How to declare and enforce what skills can access
- [Security Checklist](/docs/security-checklist) — Pre-publish checklist for skill authors
- [Publishing Guide](/docs/publishing) — Full publishing workflow including scan results
- [Self-Hosting](/docs/self-hosting) — Running your own registry with the full security pipeline
