# SDK PyPI Publish Module

## Anchor

**Why this module exists:** The Python SDK exists in the monorepo (`packages/sdk-python/` and `packages/sdk-core/crates/python/`) but is not published to PyPI. Without a PyPI release, downstream consumers — notably `stevesolun/ctx` (a Claude Code skill recommender that wants to ingest skills from Tank) — cannot `pip install` the SDK. They are forced to vendor a client or install from git, both of which block adoption.

Publishing the SDK unblocks every Python-side consumer and makes Tank discoverable via `pip install tank-sdk`, matching the npm story (`npm i @tankpkg/sdk`).

**Consumers:**

- External: `ctx`, future LangChain / LlamaIndex integrations, notebooks, security scanners.
- Internal: `apps/python-api` may adopt the SDK to read skill metadata instead of reimplementing HTTP calls.

**Single source of truth:** `.github/workflows/release.yml` (tag push → PyPI) + `justfile` (`just sdk-python publish`, `just sdk-core-python publish`).

---

## Layer 1: Structure

```
packages/sdk-python/                                # HTTP client (mirrors packages/sdk)
├── pyproject.toml                                  # name = "tank-sdk", version lockstep with monorepo
├── README.md                                       # PyPI landing page
└── tankpkg/                                        # import name (unchanged)
    ├── __init__.py
    ├── _native.py                                  # NEW — optional native binding loader (mirrors sdk/src/install/native.ts)
    ├── _version.py                                 # NEW — single source for SDK_VERSION, updated by `just bump`
    ├── client.py                                   # TankClient, uses _native when available
    ├── errors.py
    └── types.py

packages/sdk-core/crates/python/                    # Rust pyo3 primitives (mirrors packages/sdk-core/crates/node)
├── Cargo.toml
├── pyproject.toml                                  # name = "tank-core", import name = tankpkg_core
├── README.md                                       # NEW
└── src/lib.rs                                      # #[pymodule] fn tankpkg_core (renamed from tankpkg)

.github/workflows/release.yml                       # adds publish-pypi-sdk + publish-pypi-core jobs
justfile                                            # adds sdk-python + sdk-core-python recipes; extends `just bump`
scripts/check-versions.sh                           # adds sdk-python + sdk-core/python pyproject.toml checks
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                                                                                                                                                                                                            | Rationale                                                                                                | Verified by                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1  | `tank-sdk` wheel is pure Python, no Rust dep required                                                                                                                                                                                                                                           | Must work in environments without a C toolchain; matches `packages/sdk` which runs without sdk-core      | `python -m build` produces noarch wheel                                                            |
| C2  | `tank-sdk[native]` extra pulls `tank-core==X.Y.Z` pinned to the same version as the SDK                                                                                                                                                                                                         | Mirrors how `packages/sdk` optionally loads `@tankpkg/sdk-core`; exact pin keeps ABI/wire format aligned | pyproject.toml has `optional-dependencies.native = ["tank-core==X.Y.Z"]` maintained by `just bump` |
| C3  | `tank-core` ships pre-built wheels for linux x64/arm64, macos x64/arm64, windows x64                                                                                                                                                                                                            | Users installing `[native]` must not need a Rust toolchain                                               | CI matrix in release.yml                                                                           |
| C4  | `_native.py` gracefully falls back to pure-Python impls when `tankpkg_core` is absent                                                                                                                                                                                                           | `tank-sdk` without native must stay fully functional                                                     | BDD scenario; unit test                                                                            |
| C5  | `tank-sdk` and `tank-core` versions match monorepo version exactly                                                                                                                                                                                                                              | Prevents the drift that left sdk-python at 0.10.6 while monorepo was 0.13.1                              | `scripts/check-versions.sh` extended                                                               |
| C6  | `just bump X.Y.Z` updates: `packages/sdk-python/tankpkg/_version.py` (single source for tank-sdk), the `native = ["tank-core==X.Y.Z"]` pin in `packages/sdk-python/pyproject.toml`, `packages/sdk-core/crates/python/{pyproject.toml,Cargo.toml}`, and refreshes `packages/sdk-core/Cargo.lock` | Keeps every version source aligned                                                                       | `just bump` inspection                                                                             |
| C7  | Tag push to `v*` triggers PyPI publish on both packages                                                                                                                                                                                                                                         | Matches existing cascade (npm, Docker, Helm, Homebrew)                                                   | release.yml jobs run on tag                                                                        |
| C8  | PyPI publish uses OIDC Trusted Publishing, no long-lived tokens in GitHub secrets                                                                                                                                                                                                               | Security — matches PyPI modern best practice, no token rotation burden                                   | release.yml uses `id-token: write` + `pypa/gh-action-pypi-publish`                                 |
| C9  | First publish may require manual token upload (OIDC requires package to exist)                                                                                                                                                                                                                  | PyPI requires the project to exist OR pending-publisher configured before OIDC works                     | Documented in PR description                                                                       |
| C10 | `publish-pypi-sdk` does not require `publish-pypi-core` to succeed first                                                                                                                                                                                                                        | Pure-python wheel is cheaper and faster; should not be blocked by slow maturin cross-compile             | Jobs run in parallel                                                                               |
| C11 | Rename `#[pymodule] fn tankpkg` → `fn tankpkg_core` in sdk-core/crates/python/src/lib.rs                                                                                                                                                                                                        | Prevents PyPI name collision with `tank-sdk`; makes the two packages co-installable                      | Build + import test                                                                                |
| C12 | No breaking changes to existing `tankpkg` import surface (`from tankpkg import TankClient`)                                                                                                                                                                                                     | Existing internal callers and public docs (`docs/sdk-python.md`, `llms-full.txt`) must keep working      | Import test in CI                                                                                  |
| C13 | `tank-sdk` pyproject has complete PyPI metadata: readme, urls, classifiers, keywords, authors                                                                                                                                                                                                   | Package page on pypi.org is usable                                                                       | Manual review of pypi.org listing after first publish                                              |
| C14 | `tank-sdk` requires Python >= 3.11 (match monorepo standard)                                                                                                                                                                                                                                    | Tank uses 3.14 internally; 3.11 is the documented lower bound                                            | pyproject `requires-python`                                                                        |
| C15 | Nightly builds publish as `X.Y.Z-nightly.YYYYMMDD.SHORT_SHA` to PyPI (optional)                                                                                                                                                                                                                 | Matches `@tankpkg/cli@nightly` story; out of scope for this PR but schema must allow it                  | Version regex permits nightly suffix                                                               |

---

## Layer 3: Examples

| #   | Input                                                                                | Expected                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `pip install tank-sdk` from PyPI                                                     | Installs pure-Python wheel; `from tankpkg import TankClient; TankClient().search("foo")` works                                                          |
| E2  | `pip install "tank-sdk[native]"` on linux-x64                                        | Also installs `tank-core` wheel; `_native.has_native()` returns True                                                                                    |
| E3  | `pip install "tank-sdk[native]"` on an unsupported platform (e.g. s390x)             | Falls back to pure-Python install; `_native.has_native()` returns False; client still works                                                             |
| E4  | `git push origin v0.14.0` (tag push)                                                 | release.yml runs `publish-pypi-sdk` (publishes tank-sdk 0.14.0) and `publish-pypi-core` (publishes tank-core 0.14.0 wheels for 5 platforms) in parallel |
| E5  | `just bump 0.14.0`                                                                   | Updates `packages/sdk-python/pyproject.toml` version AND `packages/sdk-core/crates/python/pyproject.toml` version; `just check-versions` passes         |
| E6  | `just sdk-python publish-test`                                                       | Builds wheel + sdist, uploads to TestPyPI via twine                                                                                                     |
| E7  | User calls `TankClient.download()` with `tank-core` installed                        | Integrity verification uses Rust `verify_integrity` via `_native.native_verify_integrity`                                                               |
| E8  | User calls `TankClient.download()` without `tank-core`                               | Integrity check falls back to pure Python `hashlib.sha512` with the same security guarantees                                                            |
| E9  | `tank-core 0.14.0` import: `import tankpkg_core; tankpkg_core.verify_integrity(...)` | Module name is `tankpkg_core`, not `tankpkg` — no collision                                                                                             |
| E10 | Local dev: `cd packages/sdk-core/crates/python && maturin develop`                   | Builds + installs local `tankpkg_core` into current venv for development                                                                                |

---

## Open Questions

1. **First-publish bootstrap.** Resolved: maintainer registers **pending publishers** at https://pypi.org/manage/account/publishing for both `tank-sdk` and `tank-core` (owner: `tankpkg`, repo: `tank`, workflow: `release.yml`, environment: `pypi`) before merging this PR. First tag push then claims the names via OIDC. No one-shot API token needed.

2. **Nightly publish cadence.** Should `cli-nightly.yml` also publish `tank-sdk@nightly` to PyPI? Out of scope for this PR; tracked as follow-up.

3. **Does `sdk-python` need feature parity with `packages/sdk` before publishing?** `packages/sdk` has install/link/remove helpers, MCP tool generators, etc. `sdk-python` today only has the registry HTTP client. Decision: ship what exists. Add feature parity in follow-up PRs once real PyPI consumers file issues.

4. **Should ctx PR wait for this to ship, or be opened alongside with a `tank-sdk>=<version>` marker pending?** ctx PR waits — clean story is "tank-sdk is on PyPI, here's how to use it."
