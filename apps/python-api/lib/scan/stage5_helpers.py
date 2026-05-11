"""Stage 5 helpers: package name sets, typosquatting, manifest parsers, dynamic install detection.

Pure utility functions with no async or external API dependencies.
"""

import json
import re
from pathlib import Path

from lib.scan.models import Finding

# Top 1000 popular Python packages (truncated for brevity - include more in production)
POPULAR_PYTHON_PACKAGES: set[str] = {
    "requests",
    "numpy",
    "pandas",
    "matplotlib",
    "django",
    "flask",
    "fastapi",
    "scipy",
    "torch",
    "tensorflow",
    "pytorch",
    "keras",
    "selenium",
    "beautifulsoup4",
    "pillow",
    "pyyaml",
    "python-dateutil",
    "six",
    "setuptools",
    "pip",
    "wheel",
    "virtualenv",
    "pytest",
    "black",
    "flake8",
    "mypy",
    "pylint",
    "isort",
    "click",
    "urllib3",
    "certifi",
    "charset-normalizer",
    "idna",
    "requests-oauthlib",
    "sqlalchemy",
    "alembic",
    "redis",
    "celery",
    "gunicorn",
    "uvicorn",
    "httpx",
    "aiohttp",
    "websockets",
    "pydantic",
    "jinja2",
    "markupsafe",
    "werkzeug",
    "itsdangerous",
    "python-dotenv",
    "cryptography",
    "pyjwt",
    "passlib",
    "boto3",
    "botocore",
    "google-api-python-client",
    "google-cloud-storage",
    "azure-storage-blob",
    "psycopg2",
    "pymongo",
    "mysql-connector-python",
}

# Top 1000 popular npm packages (truncated)
POPULAR_NPM_PACKAGES: set[str] = {
    "lodash",
    "axios",
    "express",
    "react",
    "react-dom",
    "vue",
    "angular",
    "typescript",
    "webpack",
    "vite",
    "esbuild",
    "rollup",
    "parcel",
    "jest",
    "mocha",
    "chai",
    "cypress",
    "playwright",
    "puppeteer",
    "eslint",
    "prettier",
    "babel",
    "terser",
    "uglify-js",
    "moment",
    "date-fns",
    "dayjs",
    "luxon",
    "ramda",
    "immutable",
    "redux",
    "mobx",
    "zustand",
    "recoil",
    "jotai",
    "xstate",
    "next",
    "nuxt",
    "gatsby",
    "svelte",
    "solid-js",
    "preact",
    "tailwindcss",
    "styled-components",
    "emotion",
    "css-modules",
    "prisma",
    "mongoose",
    "sequelize",
    "typeorm",
    "knex",
    "pg",
    "redis",
    "ioredis",
    "bull",
    "kafkajs",
    "amqplib",
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


def check_typosquatting(package_name: str, popular_packages: set[str]) -> tuple[str, int] | None:
    """Check if package name is a typosquat of a popular package.

    Returns ``(original_package, distance)`` if a potential typosquat is found,
    else ``None``.

    A package that itself belongs to ``popular_packages`` (case-insensitive) is
    never a typosquat, even if it sits within edit distance 1-2 of another
    popular name. This prevents false positives like ``react`` vs ``preact``,
    ``next`` vs ``nuxt``, or ``redis`` vs ``redux``.

    Iteration is deterministic (sorted) so the chosen match is stable across
    Python versions and process restarts.
    """
    name_lower = package_name.lower()
    popular_lower: set[str] = {p.lower() for p in popular_packages}

    if name_lower in popular_lower:
        return None

    for popular in sorted(popular_packages):
        distance = levenshtein_distance(name_lower, popular.lower())
        if 1 <= distance <= 2:
            return (popular, distance)

    return None


def parse_requirements_txt(content: str) -> list[tuple[str, str | None]]:
    """Parse requirements.txt content.

    Returns list of (package_name, version_spec) tuples.
    """
    packages: list[tuple[str, str | None]] = []

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


def parse_package_json(content: str) -> list[tuple[str, str | None, str]]:
    """Parse package.json content.

    Returns list of (package_name, version_spec, section) tuples.
    """
    packages: list[tuple[str, str | None, str]] = []

    try:
        data = json.loads(content)

        for section in ["dependencies", "devDependencies", "peerDependencies"]:
            deps = data.get(section, {})
            for name, version in deps.items():
                packages.append((name, version, section))

    except json.JSONDecodeError:
        pass

    return packages


def parse_pyproject_toml(content: str) -> list[tuple[str, str | None]]:
    """Parse pyproject.toml content (simplified).

    Returns list of (package_name, version_spec) tuples.
    """
    packages: list[tuple[str, str | None]] = []

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


def detect_dynamic_installation(temp_dir: str, file_list: list[str]) -> list[Finding]:
    """Detect dynamic pip/npm install commands in code."""
    findings: list[Finding] = []

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
            with open(full_path, encoding="utf-8", errors="replace") as f:
                content = f.read()

            lines = content.split("\n")

            patterns = pip_patterns + npm_patterns
            for pattern, severity in patterns:
                for line_num, line in enumerate(lines, 1):
                    if re.search(pattern, line, re.IGNORECASE):
                        findings.append(
                            Finding(
                                stage="stage5",
                                severity=severity,
                                type="dynamic_install",
                                description="Dynamic package installation detected - potential supply chain risk",
                                location=f"{file_path}:{line_num}",
                                confidence=0.9,
                                tool="stage5_supply",
                            )
                        )

        except Exception:
            pass

    return findings
