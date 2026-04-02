---
title: Python SDK
description: Official Python SDK for the Tank registry — search, download, read, and audit AI agent skills programmatically from Python applications.
---

# Python SDK

`tankpkg` gives your Python application programmatic access to the Tank skill registry. Search skills, read their full content (including references and scripts), download tarballs with integrity verification, and inspect security audit results — with typed exceptions, streaming downloads, and context manager support.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="py-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>

  <!-- 4 capability cards -->
  <!-- 1: Search / Discovery -->
  <rect x="10" y="10" width="185" height="80" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="20" y="30" text-anchor="start" fill="#10b981" font-size="10" font-weight="600">DISCOVERY</text>
  <text x="20" y="48" text-anchor="start" fill="currentColor" font-size="11" font-weight="600">search("react")</text>
  <line x1="20" y1="56" x2="180" y2="56" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="20" y="70" text-anchor="start" fill="#64748b" font-size="10">→ 47 skills found</text>
  <text x="20" y="84" text-anchor="start" fill="#64748b" font-size="9">name, score, downloads, version</text>

  <!-- 2: Read / Content -->
  <rect x="205" y="10" width="195" height="80" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="215" y="30" text-anchor="start" fill="#10b981" font-size="10" font-weight="600">CONTENT</text>
  <text x="215" y="48" text-anchor="start" fill="currentColor" font-size="11" font-weight="600">read_skill("@tank/react")</text>
  <line x1="215" y1="56" x2="385" y2="56" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="215" y="70" text-anchor="start" fill="#64748b" font-size="10">→ SKILL.md + references/ + scripts/</text>
  <text x="215" y="84" text-anchor="start" fill="#64748b" font-size="9">full content for LLM context</text>

  <!-- 3: Download / Integrity -->
  <rect x="410" y="10" width="185" height="80" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="420" y="30" text-anchor="start" fill="#16a34a" font-size="10" font-weight="600">INTEGRITY</text>
  <text x="420" y="48" text-anchor="start" fill="currentColor" font-size="11" font-weight="600">download("@tank/react")</text>
  <line x1="420" y1="56" x2="580" y2="56" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="420" y="70" text-anchor="start" fill="#64748b" font-size="10">→ SHA-512 verified .tar.gz</text>
  <text x="420" y="84" text-anchor="start" fill="#64748b" font-size="9">100MB cap, streaming download</text>

  <!-- 4: Audit / Security -->
  <rect x="605" y="10" width="185" height="80" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="615" y="30" text-anchor="start" fill="#dc2626" font-size="10" font-weight="600">SECURITY</text>
  <text x="615" y="48" text-anchor="start" fill="currentColor" font-size="11" font-weight="600">audit("@tank/react")</text>
  <line x1="615" y1="56" x2="775" y2="56" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <text x="615" y="70" text-anchor="start" fill="#64748b" font-size="10">→ score: 9.2, verdict: PASS</text>
  <text x="615" y="84" text-anchor="start" fill="#64748b" font-size="9">6-stage scan findings</text>

  <!-- Arrows connecting to unified result -->
  <line x1="102" y1="90" x2="102" y2="116" stroke="#64748b" stroke-width="1.5" marker-end="url(#py-arrow)"/>
  <line x1="302" y1="90" x2="302" y2="116" stroke="#64748b" stroke-width="1.5" marker-end="url(#py-arrow)"/>
  <line x1="502" y1="90" x2="502" y2="116" stroke="#64748b" stroke-width="1.5" marker-end="url(#py-arrow)"/>
  <line x1="697" y1="90" x2="697" y2="116" stroke="#64748b" stroke-width="1.5" marker-end="url(#py-arrow)"/>

  <!-- Unified client bar -->
  <rect x="10" y="120" width="780" height="36" rx="8" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="142" text-anchor="middle" fill="#10b981" font-size="13" font-weight="600">TankClient — same API as the TypeScript SDK</text>

  <!-- Bottom note -->
  <rect x="10" y="168" width="780" height="26" rx="8" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.3"/>
  <text x="400" y="185" text-anchor="middle" fill="#64748b" font-size="10">Auto-discovers token from ~/.tank/config.json → TANK_TOKEN env → explicit token= parameter</text>
</svg>
</div>

```bash
pip install tankpkg
```

---

## Quick Start

```python
from tankpkg import TankClient

with TankClient() as client:
    # Search for skills
    results = client.search("react")
    print(f"{results['total']} skills found")

    # Read a skill's full content (SKILL.md + references + scripts)
    skill = client.read_skill("@tank/react")
    print(skill.content)          # SKILL.md text
    print(skill.references)       # {'hooks.md': '...', 'performance.md': '...'}
    print(skill.scripts)          # {'setup.sh': '...'}

    # Feed to an LLM as system context
    system_prompt = "\n".join([
        skill.content,
        *[f"--- {name} ---\n{text}" for name, text in skill.references.items()]
    ])
```

---

## Constructor

```python
client = TankClient(**options)
```

| Parameter      | Type          | Default                   | Description                                                             |
| -------------- | ------------- | ------------------------- | ----------------------------------------------------------------------- |
| `token`        | `str \| None` | auto-discovered           | API key. If omitted, reads `~/.tank/config.json` then `TANK_TOKEN` env. |
| `registry_url` | `str \| None` | `https://www.tankpkg.dev` | Registry URL. Set for self-hosted/on-prem instances. `http://` allowed. |
| `config_dir`   | `str \| None` | `~/.tank`                 | Directory containing `config.json`.                                     |
| `max_retries`  | `int`         | `3`                       | Retry count for 429 and 5xx responses (exponential backoff).            |
| `timeout`      | `float`       | `30.0`                    | HTTP request timeout in seconds.                                        |

**Auth discovery order:** explicit `token` > `TANK_TOKEN` env > `~/.tank/config.json`

```python
# Explicit token (CI/server)
client = TankClient(token="tank_xxx")

# Self-hosted
client = TankClient(registry_url="http://tank.internal:5555")

# Zero-config (uses CLI auth)
client = TankClient()
```

### Context Manager

`TankClient` supports `with` statements. The underlying `httpx.Client` is closed automatically on exit:

```python
with TankClient() as client:
    skill = client.read_skill("@tank/react")
    # httpx client closed automatically here
```

Without `with`, call `client.close()` explicitly when done.

---

## Skill Content

The most important methods for AI agent integrations. These let you load a skill's full content — SKILL.md plus all reference files and scripts — for use as LLM context.

### `read_skill(name, version=None)`

Loads the complete skill content in a single call.

```python
skill = client.read_skill("@tank/react")
```

**Returns: `SkillContent` dataclass**

| Field        | Type             | Description                       |
| ------------ | ---------------- | --------------------------------- |
| `name`       | `str`            | Skill name                        |
| `version`    | `str`            | Resolved version                  |
| `content`    | `str`            | SKILL.md text                     |
| `references` | `dict[str, str]` | Reference files keyed by filename |
| `scripts`    | `dict[str, str]` | Script files keyed by filename    |
| `files`      | `list[str]`      | All file paths in the package     |

### `list_files(name, version=None)`

Lists all files in a skill package.

```python
files = client.list_files("@tank/react")
# ['SKILL.md', 'references/hooks.md', 'references/performance.md', 'scripts/setup.sh', 'skills.json']
```

### `read_file(name, version, file_path)`

Reads a single file from a skill package.

```python
content = client.read_file("@tank/react", "2.2.0", "references/hooks.md")
```

> Path traversal (`..`), absolute paths, and null bytes are rejected with `TankNetworkError`.

---

## Discovery

### `search(query, *, page=1, limit=20)`

```python
results = client.search("typescript", page=1, limit=10)
for skill in results["results"]:
    print(skill["name"], skill["description"])
```

### `info(name)`

```python
info = client.info("@tank/react")
print(info["latestVersion"])  # '2.2.0'
print(info["downloads"])      # 1234
```

### `versions(name)`

```python
result = client.versions("@tank/react")
for v in result["versions"]:
    print(v["version"], v["auditScore"], v["publishedAt"])
```

---

## Download

### `download(name, version, *, dest=None)`

Downloads a skill tarball. Always returns the raw bytes. If `dest` is provided, also writes to disk.

```python
# Buffer only — returns bytes, integrity verified
data = client.download("@tank/react", "2.2.0")

# Write to disk — also returns bytes
data = client.download("@tank/react", "2.2.0", dest="./skills/")
```

SHA-512 integrity is always verified against the registry hash. Download size is capped at 100MB with streaming enforcement.

---

## Security & Audit

### `audit(name, version=None)`

Returns the full security analysis as a `VersionDetail` dataclass.

```python
result = client.audit("@tank/react")
print(result.audit_score)     # 9.5
print(result.scan_findings)   # [{'stage': 'static', 'severity': 'low', ...}]
```

### `permissions(name, version=None)`

```python
perms = client.permissions("@tank/react")
# {'network': {'outbound': ['*.api.com']}, 'filesystem': {'read': ['./data/**']}, 'subprocess': False}
```

---

## Auth

### `whoami()`

Returns `UserInfo` if authenticated, `None` otherwise.

```python
user = client.whoami()
if user:
    print(user.user_id, user.name, user.email)
```

---

## Stars

```python
# Get star count
stars = client.get_star_count("@tank/react")
print(stars["count"], stars["isStarred"])

# Star/unstar (requires session auth)
client.star("@tank/react")
client.unstar("@tank/react")
```

---

## Error Handling

All errors extend `TankError`. Catch specific types for programmatic handling:

```python
from tankpkg import TankClient, TankNotFoundError, TankAuthError

try:
    client.info("@acme/missing")
except TankNotFoundError as e:
    print(e.status)       # 404
    print(e.skill_name)   # '@acme/missing'
except TankAuthError:
    print("Invalid token")
```

| Exception             | HTTP Status | When                                  |
| --------------------- | ----------- | ------------------------------------- |
| `TankAuthError`       | 401         | Invalid or missing token              |
| `TankNotFoundError`   | 404         | Skill or file not found               |
| `TankPermissionError` | 403         | Insufficient permissions              |
| `TankNetworkError`    | —           | Connection failure, timeout, redirect |
| `TankIntegrityError`  | —           | SHA-512 hash mismatch                 |
| `TankConflictError`   | 409         | Dependency resolution conflict        |

---

## Full Example: Load Skill into OpenAI

```python
from tankpkg import TankClient
from openai import OpenAI

tank = TankClient()
openai = OpenAI()

# 1. Load skill with all references
skill = tank.read_skill("@tank/react")

# 2. Build system prompt
parts = [skill.content]
for name, text in skill.references.items():
    parts.append(f"\n--- Reference: {name} ---\n{text}")
system_prompt = "\n".join(parts)

# 3. Use as LLM context
response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "How should I handle data fetching in React?"},
    ],
)
```

---

## Types

```python
from tankpkg import (
    TankClient,
    SkillContent,       # dataclass: name, version, content, references, scripts, files
    UserInfo,           # dataclass: user_id, name, email
    VersionDetail,      # dataclass: name, version, integrity, audit_score, ...
    TankError,
    TankAuthError,
    TankNotFoundError,
    TankPermissionError,
    TankNetworkError,
    TankIntegrityError,
    TankConflictError,
)
```

---

## Differences from TypeScript SDK

| Feature             | TypeScript                     | Python                         |
| ------------------- | ------------------------------ | ------------------------------ |
| Install             | `npm install @tankpkg/sdk`     | `pip install tankpkg`          |
| Naming              | `camelCase`                    | `snake_case`                   |
| Client cleanup      | Garbage collected              | `with` statement or `.close()` |
| Download default    | Returns `ReadableStream`       | Returns `bytes`                |
| File read batching  | Concurrent (6 at a time)       | Sequential                     |
| Install pipeline    | Available (extracted from CLI) | Not yet available              |
| Native acceleration | Optional Rust core via NAPI-RS | Future via PyO3                |
