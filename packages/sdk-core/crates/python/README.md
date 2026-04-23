# tank-core

Native Rust primitives for the Tank Python SDK. Provides SHA-512 integrity verification, tarball extraction with path traversal protection, semver resolution, and permission checks — built in Rust, exposed via [pyo3](https://pyo3.rs/).

Most users do not install this directly. Install the high-level SDK instead:

```bash
pip install "tank-sdk[native]"
```

That pulls `tank-core` as a dependency and the SDK loads it transparently. Installing `tank-core` alone is supported but exposes a low-level API that the SDK abstracts.

## Install

```bash
pip install tank-core
```

Pre-built wheels ship for:

- Linux x86_64 and aarch64 (manylinux_2_28)
- macOS x86_64 (10.12+) and arm64 (11+)
- Windows x86_64

Built against Python's stable ABI (abi3), compatible with Python 3.11+. Unsupported platforms (e.g. musllinux, FreeBSD) fall back to an sdist build that requires a Rust toolchain.

## Low-level API

```python
import tankpkg_core

tankpkg_core.verify_integrity(data, "sha512-...")
tankpkg_core.extract_tarball(data, "/tmp/dest")
tankpkg_core.resolve_version(["1.0.0", "1.1.0", "2.0.0"], "^1.0.0")
tankpkg_core.is_path_allowed("/src/foo.ts", ["/src/**"])
tankpkg_core.is_domain_allowed("api.anthropic.com", ["*.anthropic.com"])

budget = tankpkg_core.Permissions(
    network_outbound=["*.anthropic.com"],
    fs_read=["/src/**"],
    fs_write=["/output/**"],
    subprocess=False,
)
skill_perms = tankpkg_core.Permissions(fs_read=["/src/**"])
tankpkg_core.check_permission_budget(budget, skill_perms, "@example/skill")
```

Errors use standard Python exceptions: `ValueError` for integrity failures, `IOError` for extraction failures, `PermissionError` for budget violations.

## Building from source

Requires Rust and [maturin](https://www.maturin.rs/):

```bash
cd packages/sdk-core/crates/python
maturin develop
```

## Links

- **Homepage**: https://tankpkg.dev
- **SDK**: https://pypi.org/project/tank-sdk/
- **Source**: https://github.com/tankpkg/tank
- **Issues**: https://github.com/tankpkg/tank/issues

## License

MIT
