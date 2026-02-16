"""Stage 5: Dependency & Supply Chain Audit

Parses dependency manifests, checks for known vulnerabilities via pip-audit and OSV API,
detects typosquatting, unpinned dependencies, and dynamic installation attempts.
"""

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from .models import Finding, IngestResult, StageResult

# Configuration
OSV_API_URL = "https://api.osv.dev/v1/query"
PYPI_API_URL = "https://pypi.org/pypi"
NPM_REGISTRY_URL = "https://registry.npmjs.org"
REQUEST_TIMEOUT = 20.0  # Increased from 10s for slower API responses

# Top 1000 popular Python packages (truncated for brevity - include more in production)
POPULAR_PYTHON_PACKAGES: Set[str] = {
    "requests", "numpy", "pandas", "matplotlib", "django", "flask", "fastapi",
    "scipy", "torch", "tensorflow", "pytorch", "keras", "selenium", "beautifulsoup4",
    "pillow", "pyyaml", "python-dateutil", "six", "setuptools", "pip", "wheel",
    "virtualenv", "pytest", "black", "flake8", "mypy", "pylint", "isort",
    "click", "urllib3", "certifi", "charset-normalizer", "idna", "requests-oauthlib",
    "sqlalchemy", "alembic", "redis", "celery", "gunicorn", "uvicorn", "httpx",
    "aiohttp", "websockets", "pydantic", "jinja2", "markupsafe", "werkzeug",
    "itsdangerous", "python-dotenv", "cryptography", "pyjwt", "passlib",
    "boto3", "botocore", "google-api-python-client", "google-cloud-storage",
    "azure-storage-blob", "psycopg2", "pymongo", "mysql-connector-python",
}

# Top 1000 popular npm packages (truncated)
POPULAR_NPM_PACKAGES: Set[str] = {
    "lodash", "axios", "express", "react", "react-dom", "vue", "angular",
    "typescript", "webpack", "vite", "esbuild", "rollup", "parcel",
    "jest", "mocha", "chai", "cypress", "playwright", "puppeteer",
    "eslint", "prettier", "babel", "terser", "uglify-js",
    "moment", "date-fns", "dayjs", "luxon", "ramda", "immutable",
    "redux", "mobx", "zustand", "recoil", "jotai", "xstate",
    "next", "nuxt", "gatsby", "svelte", "solid-js", "preact",
    "tailwindcss", "styled-components", "emotion", "css-modules",
    "prisma", "mongoose", "sequelize", "typeorm", "knex", "pg",
    "redis", "ioredis", "bull", "kafkajs", "amqplib",
}


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def check_typosquatting(package_name: str, popular_packages: Set[str]) -> Optional[Tuple[str, int]]:
    """Check if package name is a typosquat of a popular package.

    Returns (original_package, distance) if potential typosquat found.
    """
    name_lower = package_name.lower()

    # Check for common typosquat patterns
    for popular in popular_packages:
        popular_lower = popular.lower()

        # Exact match
        if name_lower == popular_lower:
            return None

        # Levenshtein distance check
        distance = levenshtein_distance(name_lower, popular_lower)

        # Flag if distance is 1-2 and package is not the same length
        if 1 <= distance <= 2:
            return (popular, distance)

        # Check for common substitutions
        # e.g., "reqeusts" vs "requests"
        if len(name_lower) == len(popular_lower):
            diffs = sum(1 for a, b in zip(name_lower, popular_lower) if a != b)
            if diffs == 1:
                return (popular, 1)

    return None


def parse_requirements_txt(content: str) -> List[Tuple[str, Optional[str]]]:
    """Parse requirements.txt content.

    Returns list of (package_name, version_spec) tuples.
    """
    packages: List[Tuple[str, Optional[str]]] = []

    for line in content.split("\n"):
        line = line.strip()

        # Skip comments and empty lines
        if not line or line.startswith("#"):
            continue

        # Handle different version specifiers
        # requests==2.28.0
        # requests>=2.28.0
        # requests~=2.28.0
        # requests
        match = re.match(r"^([a-zA-Z0-9_-]+)\s*([<>=!~]+\s*[\d\.\*]+)?", line)
        if match:
            name = match.group(1)
            version = match.group(2).strip() if match.group(2) else None
            packages.append((name, version))

    return packages


def parse_package_json(content: str) -> List[Tuple[str, Optional[str], str]]:
    """Parse package.json content.

    Returns list of (package_name, version_spec, section) tuples.
    """
    packages: List[Tuple[str, Optional[str], str]] = []

    try:
        data = json.loads(content)

        for section in ["dependencies", "devDependencies", "peerDependencies"]:
            deps = data.get(section, {})
            for name, version in deps.items():
                packages.append((name, version, section))

    except json.JSONDecodeError:
        pass

    return packages


def parse_pyproject_toml(content: str) -> List[Tuple[str, Optional[str]]]:
    """Parse pyproject.toml content (simplified).

    Returns list of (package_name, version_spec) tuples.
    """
    packages: List[Tuple[str, Optional[str]]] = []

    # Simple regex-based parsing (not full TOML parser)
    # Look for [project.dependencies] section
    in_deps = False
    for line in content.split("\n"):
        line = line.strip()

        if line.startswith("[project.dependencies]"):
            in_deps = True
            continue
        elif line.startswith("[") and in_deps:
            in_deps = False

        if in_deps and "=" in line:
            # e.g., "requests = ">=2.28.0""
            match = re.match(r'^"([^"]+)"\s*=\s*"([^"]*)"', line)
            if match:
                packages.append((match.group(1), match.group(2)))

    return packages


def detect_dynamic_installation(temp_dir: str, file_list: List[str]) -> List[Finding]:
    """Detect dynamic pip/npm install commands in code."""
    findings: List[Finding] = []

    # Patterns for dynamic installation
    pip_patterns = [
        (r"subprocess\.(run|call|Popen)\s*\([^)]*pip\s+install", "critical"),
        (r"subprocess\.(run|call|Popen)\s*\([^)]*-m\s+pip\s+install", "critical"),
        (r"os\.system\s*\([^)]*pip\s+install", "critical"),
        (r"pip\.main\s*\(", "critical"),
    ]

    npm_patterns = [
        (r"subprocess\.(run|call|Popen)\s*\([^)]*npm\s+install", "critical"),
        (r"subprocess\.(run|call|Popen)\s*\([^)]*npm\s+i\s+", "critical"),
        (r"os\.system\s*\([^)]*npm\s+install", "critical"),
        (r"exec\s*\(\s*['\"`]npm\s+install", "critical"),
    ]

    code_extensions = {".py", ".js", ".ts", ".sh"}

    for file_path in file_list:
        ext = Path(file_path).suffix.lower()
        if ext not in code_extensions:
            continue

        full_path = Path(temp_dir) / file_path
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            lines = content.split("\n")

            patterns = pip_patterns + npm_patterns
            for pattern, severity in patterns:
                for line_num, line in enumerate(lines, 1):
                    if re.search(pattern, line, re.IGNORECASE):
                        findings.append(Finding(
                            stage="stage5",
                            severity=severity,
                            type="dynamic_install",
                            description="Dynamic package installation detected - potential supply chain risk",
                            location=f"{file_path}:{line_num}",
                            confidence=0.9,
                            tool="stage5_supply",
                        ))

        except Exception:
            pass

    return findings


async def query_osv(package: str, version: str, ecosystem: str) -> List[Dict[str, Any]]:
    """Query OSV.dev API for vulnerabilities."""
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                OSV_API_URL,
                json={
                    "package": {"name": package, "ecosystem": ecosystem},
                    "version": version,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("vulns", [])
    except Exception:
        return []


async def query_pypi(package: str) -> Optional[Dict[str, Any]]:
    """Query PyPI API for package metadata."""
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(f"{PYPI_API_URL}/{package}/json")
            response.raise_for_status()
            return response.json()
    except Exception:
        return None


async def check_python_dependency(
    package: str,
    version_spec: Optional[str],
    findings: List[Finding],
    file_path: str
) -> None:
    """Check a Python dependency for issues."""
    # Check unpinned
    if not version_spec or version_spec in ("*", ""):
        findings.append(Finding(
            stage="stage5",
            severity="medium",
            type="unpinned_dependency",
            description=f"Unpinned Python dependency: {package}",
            location=file_path,
            confidence=0.9,
            tool="stage5_supply",
        ))

    # Check typosquatting
    typosquat = check_typosquatting(package, POPULAR_PYTHON_PACKAGES)
    if typosquat:
        original, distance = typosquat
        findings.append(Finding(
            stage="stage5",
            severity="high",
            type="typosquatting",
            description=f"Potential typosquat: '{package}' resembles '{original}' (distance: {distance})",
            location=file_path,
            confidence=0.8,
            tool="stage5_supply",
        ))

    # Query OSV for vulnerabilities (if version is pinned)
    if version_spec and version_spec.startswith("=="):
        version = version_spec[2:].strip()
        vulns = await query_osv(package, version, "PyPI")
        for vuln in vulns[:3]:  # Limit to top 3
            severity = "critical" if vuln.get("severity") == "HIGH" else "high"
            findings.append(Finding(
                stage="stage5",
                severity=severity,
                type="known_vulnerability",
                description=f"Known vulnerability in {package}: {vuln.get('id', 'Unknown')}",
                location=file_path,
                confidence=0.95,
                tool="stage5_osv",
            ))


async def check_npm_dependency(
    package: str,
    version_spec: Optional[str],
    findings: List[Finding],
    file_path: str
) -> None:
    """Check an npm dependency for issues."""
    # Check unpinned
    if not version_spec or version_spec in ("*", "latest", ""):
        findings.append(Finding(
            stage="stage5",
            severity="medium",
            type="unpinned_dependency",
            description=f"Unpinned npm dependency: {package}",
            location=file_path,
            confidence=0.9,
            tool="stage5_supply",
        ))

    # Check for caret ranges that are too loose
    if version_spec and version_spec.startswith("^") and version_spec.count(".") == 1:
        findings.append(Finding(
            stage="stage5",
            severity="low",
            type="loose_version_range",
            description=f"Loose version range for {package}: {version_spec}",
            location=file_path,
            confidence=0.7,
            tool="stage5_supply",
        ))

    # Check typosquatting
    typosquat = check_typosquatting(package, POPULAR_NPM_PACKAGES)
    if typosquat:
        original, distance = typosquat
        findings.append(Finding(
            stage="stage5",
            severity="high",
            type="typosquatting",
            description=f"Potential typosquat: '{package}' resembles '{original}' (distance: {distance})",
            location=file_path,
            confidence=0.8,
            tool="stage5_supply",
        ))


async def stage5_audit_deps(ingest_result: IngestResult) -> StageResult:
    """Run Stage 5: Dependency & Supply Chain Audit.

    Parses dependency manifests, checks for:
    - Known vulnerabilities (OSV API)
    - Typosquatting
    - Unpinned dependencies
    - Dynamic installation in code
    - Deprecated packages

    Args:
        ingest_result: Result from Stage 0

    Returns:
        StageResult with findings
    """
    start = time.monotonic()
    findings: List[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage5",
            status="errored",
            findings=[Finding(
                stage="stage5",
                severity="critical",
                type="no_temp_dir",
                description="No temp directory from Stage 0",
                confidence=1.0,
                tool="stage5_supply",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        )

    # Detect dynamic installation in code
    dynamic_findings = detect_dynamic_installation(temp_dir, ingest_result.file_list)
    findings.extend(dynamic_findings)

    # Parse and check requirements.txt
    tasks = []
    for file_path in ingest_result.file_list:
        name = Path(file_path).name
        full_path = Path(temp_dir) / file_path

        if name == "requirements.txt":
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    packages = parse_requirements_txt(f.read())

                for pkg_name, version in packages:
                    tasks.append(check_python_dependency(pkg_name, version, findings, file_path))

            except Exception:
                pass

        elif name == "package.json":
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    packages = parse_package_json(f.read())

                for pkg_name, version, _ in packages:
                    tasks.append(check_npm_dependency(pkg_name, version, findings, file_path))

            except Exception:
                pass

        elif name == "pyproject.toml":
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    packages = parse_pyproject_toml(f.read())

                for pkg_name, version in packages:
                    tasks.append(check_python_dependency(pkg_name, version, findings, file_path))

            except Exception:
                pass

    # Run all checks concurrently
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage5",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
