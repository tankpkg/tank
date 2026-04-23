# tank-sdk

Official Python SDK for [Tank](https://tankpkg.dev) — the security-first package manager for AI agent skills.

Search, download, read, and audit skills from the Tank registry. Designed for agent frameworks, notebook workflows, and any Python tool that wants to consume AI skills with provenance and integrity guarantees.

## Install

```bash
pip install tank-sdk
```

For faster integrity verification, install the native extra:

```bash
pip install "tank-sdk[native]"
```

This installs `tank-core` — pre-built Rust wheels for Linux x86_64/aarch64, macOS x86_64/arm64, and Windows x86_64 (Python 3.11+). On unsupported platforms, `pip` will either build from source (requires a Rust toolchain) or fail. If you don't want the native dep, install the plain `tank-sdk` — every feature remains available via the pure-Python fallback.

## Quick start

```python
from tankpkg import TankClient

with TankClient() as client:
    results = client.search("nextjs")
    for skill in results.get("skills", []):
        print(skill["name"], skill["description"])

    skill = client.read_skill("@tank/nextjs")
    print(skill.content)
```

## Authentication

The SDK reads `~/.tank/config.json` (managed by the `tank` CLI) or the `TANK_TOKEN` environment variable. Login with:

```bash
tank login
```

Or pass a token explicitly:

```python
TankClient(token="your-token")
```

## Self-hosted registries

```python
TankClient(registry_url="https://tank.your-company.com")
```

Or set `TANK_REGISTRY_URL`.

## API

- `search(query, *, page, limit)` — search the registry
- `info(name)` — skill metadata
- `versions(name)` — list available versions
- `version_detail(name, version)` — full version record including `scan_verdict`, `audit_score`, `integrity` (SHA-512)
- `download(name, version, *, dest)` — download and verify tarball
- `read_skill(name, version=None)` — SKILL.md + references + scripts inline
- `list_files(name, version=None)` — file listing within a version
- `read_file(name, version, path)` — read a single file
- `audit(name, version=None)` — security scan verdict for latest or pinned version
- `permissions(name, version=None)` — resolved permission budget
- `whoami()` — authenticated user info
- `star(name)` / `unstar(name)` / `get_star_count(name)`

All methods raise typed exceptions: `TankAuthError`, `TankNotFoundError`, `TankPermissionError`, `TankNetworkError`, `TankIntegrityError`, `TankConflictError`.

## Native acceleration

`tank-sdk` works fully in pure Python. Installing `tank-sdk[native]` pulls [`tank-core`](https://pypi.org/project/tank-core/) — Rust bindings that are wired in where it matters most today: **SHA-512 integrity verification** on `TankClient.download()`. The Rust core also exposes tarball extraction, semver resolution, and permission checks as primitives that are used by the Tank CLI and available for direct import as `tankpkg_core`.

Check whether native acceleration is active:

```python
from tankpkg import has_native
print(has_native())  # True if tank-core is installed and loaded
```

When native acceleration is unavailable, `tank-sdk` falls back to `hashlib.sha512` for integrity verification — same security guarantees, pure Python.

## Requirements

- Python 3.11+
- [`httpx`](https://pypi.org/project/httpx/) (installed automatically)

## Links

- **Homepage**: https://tankpkg.dev
- **Documentation**: https://www.tankpkg.dev/docs/sdk-python
- **Source**: https://github.com/tankpkg/tank
- **Issues**: https://github.com/tankpkg/tank/issues

## License

MIT
