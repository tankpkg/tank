---
title: Python SDK
description: Official Python SDK for the Tank registry — search, download, read, and audit AI agent skills programmatically from Python applications.
---

# Python SDK

`tankpkg` gives your Python application programmatic access to the Tank skill registry. Search skills, read their full content (including references and scripts), download tarballs with integrity verification, and inspect security audit results — with typed exceptions, streaming downloads, and context manager support.

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
