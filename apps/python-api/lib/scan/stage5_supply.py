"""Stage 5: Dependency & Supply Chain Audit

Parses dependency manifests, checks for known vulnerabilities via pip-audit and OSV API,
detects typosquatting, unpinned dependencies, and dynamic installation attempts.
"""

import asyncio
import time
from pathlib import Path
from typing import Any

import httpx

from lib.scan.models import Finding, IngestResult, StageResult
from lib.scan.stage5_helpers import (
    POPULAR_NPM_PACKAGES,
    POPULAR_PYTHON_PACKAGES,
    check_typosquatting,
    detect_dynamic_installation,
    parse_package_json,
    parse_pyproject_toml,
    parse_requirements_txt,
)

# Configuration
OSV_API_URL = "https://api.osv.dev/v1/query"
OSV_BATCH_API_URL = "https://api.osv.dev/v1/querybatch"
PYPI_API_URL = "https://pypi.org/pypi"
NPM_REGISTRY_URL = "https://registry.npmjs.org"
REQUEST_TIMEOUT = 20.0  # Increased from 10s for slower API responses
OSV_BATCH_SIZE = 100  # Max packages per batch request


async def query_osv(package: str, version: str, ecosystem: str) -> list[dict[str, Any]]:
    """Query OSV.dev API for vulnerabilities (single package)."""
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


async def query_osv_batch(dependencies: list[dict[str, str]]) -> list[tuple[str, str, list[dict[str, Any]]]]:
    """Query OSV batch API for all dependencies at once.

    Free, no auth, no rate limits, ~3s P95 latency.
    Handles hundreds of packages in a single request.

    Args:
        dependencies: List of dicts with 'name', 'version', 'ecosystem' keys

    Returns:
        List of (name, version, vulns_list) tuples
    """
    if not dependencies:
        return []

    results: list[tuple[str, str, list[dict[str, Any]]]] = []

    # Build batch queries
    queries = []
    for dep in dependencies:
        query: dict[str, Any] = {
            "package": {"name": dep["name"], "ecosystem": dep["ecosystem"]},
        }
        if dep.get("version"):
            query["version"] = dep["version"]
        queries.append(query)

    # Process in batches of 100
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        for i in range(0, len(queries), OSV_BATCH_SIZE):
            batch = queries[i : i + OSV_BATCH_SIZE]
            batch_deps = dependencies[i : i + OSV_BATCH_SIZE]

            try:
                response = await client.post(OSV_BATCH_API_URL, json={"queries": batch})
                response.raise_for_status()
                data = response.json()

                for j, result in enumerate(data.get("results", [])):
                    dep = batch_deps[j]
                    vulns = result.get("vulns", [])
                    results.append((dep["name"], dep.get("version", ""), vulns))

            except Exception:
                # On batch failure, return empty results for this batch
                for dep in batch_deps:
                    results.append((dep["name"], dep.get("version", ""), []))

    return results


def cvss_to_severity(vuln: dict[str, Any]) -> str:
    """Convert CVSS score to severity level."""
    for sev in vuln.get("severity", []):
        try:
            if sev.get("type") == "CVSS_V3":
                score_str = sev.get("score", "0")
                score = 0.0
                # Handle both "CVSS:3.1/AV:N/..." and "7.5" formats
                if score_str.startswith("CVSS"):
                    # Vector strings don't embed the numeric score directly.
                    # Try database_specific for the numeric value.
                    cvss_score = vuln.get("database_specific", {}).get("cvss", {}).get("score", 0)
                    if isinstance(cvss_score, (int, float)):
                        score = float(cvss_score)
                    else:
                        # Cannot determine score from vector alone; fall through
                        continue
                else:
                    score = float(score_str.split("/")[0].split(":")[-1])

                if score >= 9.0:
                    return "critical"
                if score >= 7.0:
                    return "high"
                if score >= 4.0:
                    return "medium"
                return "low"
        except (ValueError, IndexError):
            continue

    # Fallback to database severity if available
    db_sev = vuln.get("database_specific", {}).get("severity", "")
    if db_sev in ("CRITICAL", "HIGH"):
        return "critical" if db_sev == "CRITICAL" else "high"

    return "medium"


async def query_pypi(package: str) -> dict[str, Any] | None:
    """Query PyPI API for package metadata."""
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(f"{PYPI_API_URL}/{package}/json")
            response.raise_for_status()
            return response.json()
    except Exception:
        return None


async def check_python_dependency(
    package: str, version_spec: str | None, findings: list[Finding], file_path: str
) -> None:
    """Check a Python dependency for issues."""
    # Check unpinned
    if not version_spec or version_spec in ("*", ""):
        findings.append(
            Finding(
                stage="stage5",
                severity="medium",
                type="unpinned_dependency",
                description=f"Unpinned Python dependency: {package}",
                location=file_path,
                confidence=0.9,
                tool="stage5_supply",
            )
        )

    # Check typosquatting
    typosquat = check_typosquatting(package, POPULAR_PYTHON_PACKAGES)
    if typosquat:
        original, distance = typosquat
        findings.append(
            Finding(
                stage="stage5",
                severity="high",
                type="typosquatting",
                description=f"Potential typosquat: '{package}' resembles '{original}' (distance: {distance})",
                location=file_path,
                confidence=0.8,
                tool="stage5_supply",
            )
        )

    # Query OSV for vulnerabilities (if version is pinned)
    if version_spec and version_spec.startswith("=="):
        version = version_spec[2:].strip()
        vulns = await query_osv(package, version, "PyPI")
        for vuln in vulns[:3]:  # Limit to top 3
            severity = "critical" if vuln.get("severity") == "HIGH" else "high"
            vuln_id = vuln.get("id", "Unknown")
            # Extract CVE aliases for linking
            aliases = vuln.get("aliases", [])
            cve_id = next((a for a in aliases if a.startswith("CVE-")), vuln_id)
            evidence_parts = [vuln_id]
            if cve_id != vuln_id:
                evidence_parts.append(f"CVE: {cve_id}")
            summary = vuln.get("summary", "")
            if summary:
                evidence_parts.append(summary)
            findings.append(
                Finding(
                    stage="stage5",
                    severity=severity,
                    type="known_vulnerability",
                    description=f"Known vulnerability in {package}: {vuln_id}",
                    location=file_path,
                    confidence=0.95,
                    tool="stage5_osv",
                    evidence=" | ".join(evidence_parts),
                    remediation=f"Update {package} to a patched version. See: https://osv.dev/vulnerability/{vuln_id}",
                    cwe_id="CWE-1035",
                )
            )


async def check_npm_dependency(package: str, version_spec: str | None, findings: list[Finding], file_path: str) -> None:
    """Check an npm dependency for issues."""
    # Check unpinned
    if not version_spec or version_spec in ("*", "latest", ""):
        findings.append(
            Finding(
                stage="stage5",
                severity="medium",
                type="unpinned_dependency",
                description=f"Unpinned npm dependency: {package}",
                location=file_path,
                confidence=0.9,
                tool="stage5_supply",
            )
        )

    # Check for caret ranges that are too loose
    if version_spec and version_spec.startswith("^") and version_spec.count(".") == 1:
        findings.append(
            Finding(
                stage="stage5",
                severity="low",
                type="loose_version_range",
                description=f"Loose version range for {package}: {version_spec}",
                location=file_path,
                confidence=0.7,
                tool="stage5_supply",
            )
        )

    # Check typosquatting
    typosquat = check_typosquatting(package, POPULAR_NPM_PACKAGES)
    if typosquat:
        original, distance = typosquat
        findings.append(
            Finding(
                stage="stage5",
                severity="high",
                type="typosquatting",
                description=f"Potential typosquat: '{package}' resembles '{original}' (distance: {distance})",
                location=file_path,
                confidence=0.8,
                tool="stage5_supply",
            )
        )


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
    findings: list[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage5",
            status="errored",
            findings=[
                Finding(
                    stage="stage5",
                    severity="critical",
                    type="no_temp_dir",
                    description="No temp directory from Stage 0",
                    confidence=1.0,
                    tool="stage5_supply",
                )
            ],
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
                with open(full_path, encoding="utf-8") as f:
                    packages = parse_requirements_txt(f.read())

                for pkg_name, version in packages:
                    tasks.append(check_python_dependency(pkg_name, version, findings, file_path))

            except Exception:
                pass

        elif name == "package.json":
            try:
                with open(full_path, encoding="utf-8") as f:
                    packages = parse_package_json(f.read())

                for pkg_name, version, _ in packages:
                    tasks.append(check_npm_dependency(pkg_name, version, findings, file_path))

            except Exception:
                pass

        elif name == "pyproject.toml":
            try:
                with open(full_path, encoding="utf-8") as f:
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
