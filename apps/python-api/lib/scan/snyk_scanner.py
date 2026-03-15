"""Wrapper for Snyk Agent Scan.

Snyk Agent Scan is a security scanner for AI agent skills that detects
prompt injection, tool poisoning, and malicious patterns.

Package: snyk-agent-scan (invoked via uvx)
Repository: https://github.com/snyk/agent-scan

IMPORTANT: Snyk Agent Scan sends skill data to Snyk's cloud for analysis.
This conflicts with Tank's core principle of local-only scanning, so it's
integrated as an OPTIONAL scanner that contributes corroborating findings.
If Snyk is unavailable or times out, scanning continues without it.

Detection Capabilities:
- Prompt Injection
- Tool Poisoning / Shadowing
- Data Exfiltration patterns
- Malicious Code / Backdoors
- Supply Chain Attack indicators

Usage:
- Invoke via: uvx snyk-agent-scan@latest --skills <dir> --json --opt-out
- The --opt-out flag disables anonymous scan ID tracking
"""

import json
import logging
import subprocess
from typing import Any

from lib.scan.models import Finding

logger = logging.getLogger(__name__)

# Map Snyk severity to Tank severity
SNYK_TO_TANK_SEVERITY = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "low",  # Map info to low
}

# High-signal threat types (boost confidence when detected)
CRITICAL_THREAT_TYPES = {
    "prompt_injection",
    "tool_poisoning",
    "tool_shadowing",
    "data_exfiltration",
    "command_injection",
    "code_execution",
    "credential_theft",
    "backdoor",
    "supply_chain_attack",
}


def is_snyk_scanner_available() -> bool:
    """Check if uvx is available (required to run snyk-agent-scan)."""
    try:
        result = subprocess.run(
            ["uvx", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_snyk_scanner(skill_dir: str) -> list[Finding]:
    """Run Snyk Agent Scan on a skill directory.

    Uses uvx to run snyk-agent-scan without requiring pip install.
    The --opt-out flag disables anonymous scan ID tracking.

    NOTE: This scanner sends data to Snyk's cloud. It's an optional
    additive scanner that provides corroborating findings. Failure
    is non-blocking - the scan pipeline continues without it.

    Args:
        skill_dir: Path to the extracted skill directory

    Returns:
        List of Finding objects from the scanner
    """
    findings: list[Finding] = []

    # Check if uvx is available
    if not is_snyk_scanner_available():
        logger.debug("uvx not installed. Snyk Agent Scan requires uvx. Install uv from: https://docs.astral.sh/uv/")
        return findings

    try:
        # Build command
        # --opt-out: Disable anonymous scan ID tracking
        # --json: Output in JSON format
        # --skills: Scan for AI agent skill threats
        cmd = [
            "uvx",
            "snyk-agent-scan@latest",
            "--skills",
            skill_dir,
            "--json",
            "--opt-out",
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,  # 30 second timeout
        )

        # Snyk may return non-zero on findings, check stdout for results
        if result.returncode not in (0, 1):  # 1 typically means findings found
            logger.warning(f"snyk-agent-scan returned non-zero: {result.stderr}")
            # Still try to parse output if available

        # Parse JSON output
        if not result.stdout.strip():
            logger.debug("snyk-agent-scan produced no output")
            return findings

        data = json.loads(result.stdout)

        # Handle different output formats
        # Snyk may return findings in different structures
        findings_list = data.get("findings", []) or data.get("results", [])

        for finding_data in findings_list:
            threat_type = finding_data.get("type", "unknown")
            severity = finding_data.get("severity", "medium").lower()
            confidence = finding_data.get("confidence", 0.8)

            # Boost confidence for high-signal threat types
            if threat_type in CRITICAL_THREAT_TYPES:
                confidence = max(confidence, 0.85)

            findings.append(
                Finding(
                    stage="stage3",
                    severity=SNYK_TO_TANK_SEVERITY.get(severity, "medium"),
                    type=f"snyk/{threat_type}",
                    description=finding_data.get("description", "Snyk Agent Scan finding"),
                    location=finding_data.get("location"),
                    confidence=confidence,
                    tool="snyk-agent-scan",
                    evidence=finding_data.get("evidence"),
                )
            )

    except subprocess.TimeoutExpired:
        logger.warning("snyk-agent-scan timed out after 30 seconds")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse snyk-agent-scan output: {e}")
    except Exception as e:
        logger.error(f"snyk-agent-scan error: {e}")

    return findings


def get_snyk_scanner_info() -> dict[str, Any]:
    """Get information about the snyk-agent-scan availability and version."""
    info = {
        "available": False,
        "version": None,
        "runtime": "uvx",
        "cloud_dependent": True,  # Snyk sends data to cloud
    }

    try:
        # Check uvx availability
        result = subprocess.run(
            ["uvx", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            info["available"] = True
            # Parse uvx version
            version_line = result.stdout.strip().split("\n")[0]
            info["version"] = version_line.split()[-1] if version_line else "unknown"
    except Exception as e:
        info["error"] = str(e)

    return info
