from __future__ import annotations

from typing import Any

_native: Any = None
_checked = False


def _try_load() -> Any:
    global _native, _checked
    if _checked:
        return _native
    _checked = True
    try:
        import tankpkg_core
    except ImportError:
        _native = None
    else:
        _native = tankpkg_core
    return _native


def has_native() -> bool:
    return _try_load() is not None


def native_verify_integrity(data: bytes, expected_integrity: str) -> str | None:
    n = _try_load()
    if n is None:
        return None
    return n.verify_integrity(data, expected_integrity)


def native_extract_tarball(data: bytes, dest: str) -> list[str] | None:
    n = _try_load()
    if n is None:
        return None
    return n.extract_tarball(data, dest)


def native_resolve_version(available: list[str], range_: str) -> tuple[bool, str | None]:
    n = _try_load()
    if n is None:
        return (False, None)
    return (True, n.resolve_version(available, range_))


def native_is_path_allowed(requested_path: str, allowed_paths: list[str]) -> bool | None:
    n = _try_load()
    if n is None:
        return None
    return n.is_path_allowed(requested_path, allowed_paths)


def native_is_domain_allowed(domain: str, allowed_domains: list[str]) -> bool | None:
    n = _try_load()
    if n is None:
        return None
    return n.is_domain_allowed(domain, allowed_domains)


def _reset_for_tests() -> None:
    global _native, _checked
    _native = None
    _checked = False
