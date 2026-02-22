"""Static permission extraction from skill code files.

Replaces the LLM-based OpenRouter permission extraction with deterministic
AST analysis. Scans Python/JS/TS files for actual API calls, filesystem
operations, and subprocess usage to determine what permissions a skill needs.
"""

import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


# Network patterns
NETWORK_PATTERNS = {
    "python": [
        (r"requests\.(get|post|put|delete|patch|head)\s*\(\s*['\"]([^'\"]+)", 2),
        (r"httpx\.\w+\s*\(\s*['\"]([^'\"]+)", 1),
        (r"urllib\.request\.urlopen\s*\(\s*['\"]([^'\"]+)", 1),
        (r"aiohttp\.\w+\s*\(\s*['\"]([^'\"]+)", 1),
        (r"socket\.connect\s*\(\s*\([^)]*['\"]([^'\"]+)", 1),
    ],
    "javascript": [
        (r"fetch\s*\(\s*['\"`]([^'\"`]+)", 1),
        (r"axios\.(get|post|put|delete)\s*\(\s*['\"`]([^'\"`]+)", 2),
        (r"new\s+XMLHttpRequest", None),  # No URL capture, just detection
        (r"\.open\s*\(\s*['\"]GET['\"],\s*['\"`]([^'\"`]+)", 1),
        (r"\.open\s*\(\s*['\"]POST['\"],\s*['\"`]([^'\"`]+)", 1),
    ],
}

# Filesystem patterns
FS_READ_PATTERNS = [
    r"open\s*\(\s*['\"]([^'\"]+)['\"]",
    r"fs\.readFile\s*\(\s*['\"`]([^'\"`]+)",
    r"fs\.readFileSync\s*\(\s*['\"`]([^'\"`]+)",
    r"fs\.readdir\s*\(\s*['\"`]([^'\"`]+)",
    r"Path\s*\(\s*['\"]([^'\"]+)",
    r"\.read_text\s*\(",
    r"\.read\(\s*\)",
]

FS_WRITE_PATTERNS = [
    r"open\s*\(\s*['\"]([^'\"]+)['\"],\s*['\"][wa]",
    r"fs\.writeFile\s*\(\s*['\"`]([^'\"`]+)",
    r"fs\.writeFileSync\s*\(\s*['\"`]([^'\"`]+)",
    r"fs\.appendFile\s*\(\s*['\"`]([^'\"`]+)",
    r"\.write_text\s*\(",
    r"\.write\(",
]

# Subprocess patterns
SUBPROCESS_PATTERNS = [
    r"subprocess\.(run|call|Popen|check_output|check_call)",
    r"os\.(system|popen)\s*\(",
    r"os\.exec\w*\s*\(",
    r"child_process\.(exec|spawn|fork)\s*\(",
    r"execSync\s*\(",
    r"spawnSync\s*\(",
]


def extract_permissions(skill_dir: str) -> dict[str, Any]:
    """Extract permissions from skill code using static analysis.

    Scans Python, JS, TS, and shell files for network calls, filesystem
    operations, and subprocess usage to determine what permissions a skill needs.

    Args:
        skill_dir: Path to the extracted skill directory

    Returns:
        {
            "network": {"outbound": ["api.example.com", ...]},
            "filesystem": {"read": ["./path"], "write": ["./path"]},
            "subprocess": True/False,
            "environment": ["VAR_NAME", ...]
        }
    """
    permissions: dict[str, Any] = {
        "network": {"outbound": set()},
        "filesystem": {"read": set(), "write": set()},
        "subprocess": False,
        "environment": set(),
    }

    skill_path = Path(skill_dir)
    if not skill_path.exists():
        return normalize_permissions(permissions)

    for file_path in skill_path.rglob("*"):
        if not file_path.is_file():
            continue

        suffix = file_path.suffix.lower()
        if suffix not in (".py", ".js", ".ts", ".mjs", ".mts", ".jsx", ".tsx", ".sh"):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Determine language
        lang = "python" if suffix == ".py" else ("javascript" if suffix in (".js", ".ts", ".mjs", ".mts", ".jsx", ".tsx") else "shell")

        # Network access
        if lang in NETWORK_PATTERNS:
            for pattern, group in NETWORK_PATTERNS[lang]:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    if group:
                        url = match.group(group)
                        domain = _extract_domain(url)
                        if domain:
                            permissions["network"]["outbound"].add(domain)
                    else:
                        # Pattern detected but no domain capture
                        permissions["network"]["outbound"].add("*")

        # Filesystem read
        for pattern in FS_READ_PATTERNS:
            for match in re.finditer(pattern, content):
                if match.lastindex:
                    path = match.group(1)
                    permissions["filesystem"]["read"].add(_normalize_fs_path(path))

        # Filesystem write
        for pattern in FS_WRITE_PATTERNS:
            for match in re.finditer(pattern, content):
                if match.lastindex:
                    path = match.group(1)
                    permissions["filesystem"]["write"].add(_normalize_fs_path(path))

        # Subprocess
        for pattern in SUBPROCESS_PATTERNS:
            if re.search(pattern, content):
                permissions["subprocess"] = True
                break

        # Environment variables
        for match in re.finditer(r"os\.environ\[?['\"](\w+)", content):
            permissions["environment"].add(match.group(1))
        for match in re.finditer(r"os\.getenv\(['\"](\w+)", content):
            permissions["environment"].add(match.group(1))
        for match in re.finditer(r"process\.env\.(\w+)", content):
            permissions["environment"].add(match.group(1))

    return normalize_permissions(permissions)


def normalize_permissions(permissions: dict[str, Any]) -> dict[str, Any]:
    """Convert sets to sorted lists for JSON serialization."""
    network_outbound = permissions["network"]["outbound"]
    # Remove wildcard if we have specific domains
    if "*" in network_outbound and len(network_outbound) > 1:
        network_outbound.discard("*")

    return {
        "network": {"outbound": sorted(network_outbound)},
        "filesystem": {
            "read": sorted(permissions["filesystem"]["read"]),
            "write": sorted(permissions["filesystem"]["write"]),
        },
        "subprocess": permissions["subprocess"],
        "environment": sorted(permissions["environment"]),
    }


def _extract_domain(url: str) -> Optional[str]:
    """Extract domain from a URL string."""
    try:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        parsed = urlparse(url)
        hostname = parsed.hostname
        if hostname and hostname not in ("localhost", "127.0.0.1", "::1"):
            return hostname
        return None
    except Exception:
        return None


def _normalize_fs_path(path: str) -> str:
    """Normalize filesystem path for permissions.

    - Converts absolute paths to relative
    - Normalizes common patterns
    - Masks variable interpolations
    """
    # Remove leading slashes for relative paths
    path = path.lstrip("/")

    # Handle common path patterns
    if path.startswith("./"):
        path = path[2:]

    # Mask template strings and variables
    path = re.sub(r"\$\{[^}]+\}", "*", path)
    path = re.sub(r"\$\w+", "*", path)
    path = re.sub(r"f['\"][^'\"]*\{[^}]+\}[^'\"]*['\"]", "*", path)

    return path or "."
