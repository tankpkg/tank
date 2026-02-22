"""Wrapper for Cisco AI Defense Skill Scanner.

The Cisco skill-scanner is an open-source AI agent skill security scanner
released by the Cisco AI Defense team. It detects security risks in skills
used on platforms like Claude, Cursor, Codex, and others.

Package: skill-scanner (PyPI)
Repository: https://github.com/cisco-ai-defense/skill-scanner

Detection Capabilities:
- Prompt Injection (AITech-1.1)
- Data Exfiltration (AITech-8.2)
- Malicious Code / Backdoors
- Supply Chain Attacks (AITech-9.3)
- Tool Poisoning / Shadowing (AITech-12.1)
- Obfuscation patterns (ROT13, hex, char-code)
- Cross-file dataflow via behavioral analysis

Layers (Free):
- Static: YAML + YARA rules (~50ms)
- Behavioral: Python AST dataflow via CFG (~100ms)

Total: ~200ms per skill. No LLM. All local.
"""

import logging
import subprocess
import json
from typing import Any, List

from lib.scan.models import Finding

logger = logging.getLogger(__name__)

# Map Cisco threat classes to Tank severity
CISCO_TO_TANK_SEVERITY = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
}

# High-signal threat classes (boost confidence when detected)
CRITICAL_THREAT_CLASSES = {
    "prompt_injection",       # AITech-1.1
    "transitive_trust_abuse", # AITech-1.2
    "data_exfiltration",      # AITech-8.2
    "tool_chaining_abuse",    # AITech-8.2
    "command_injection",      # AITech-9.1
    "code_execution",         # AITech-9.1
    "obfuscation",            # AITech-9.2
    "supply_chain_attack",    # AITech-9.3
    "tool_poisoning",         # AITech-12.1
    "tool_shadowing",         # AITech-12.1
}


def is_skill_scanner_available() -> bool:
    """Check if the skill-scanner package is installed."""
    try:
        result = subprocess.run(
            ["skill-scanner", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_skill_scanner(
    skill_dir: str,
    use_behavioral: bool = True
) -> List[Finding]:
    """Run Cisco skill-scanner with free-only analyzers.

    Static layer: YARA + YAML signatures + bytecode + pipeline taint tracking
    Behavioral layer: AST dataflow analysis (CFG-based, no code execution)

    No LLM. No API keys. Fully local.

    Install: pip install skill-scanner

    Args:
        skill_dir: Path to the extracted skill directory
        use_behavioral: Whether to include behavioral analysis (slower but more thorough)

    Returns:
        List of Finding objects from the scanner
    """
    findings: List[Finding] = []

    # Check if package is available
    if not is_skill_scanner_available():
        logger.debug(
            "skill-scanner not installed. "
            "Install with: pip install skill-scanner"
        )
        return findings

    try:
        # Build command
        cmd = ["skill-scanner", "scan", skill_dir, "--format", "json"]
        if use_behavioral:
            cmd.append("--use-behavioral")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,  # Behavioral analysis takes ~200ms
        )

        if result.returncode != 0:
            logger.warning(f"skill-scanner returned non-zero: {result.stderr}")
            return findings

        # Parse JSON output
        data = json.loads(result.stdout)

        for finding_data in data.get("findings", []):
            category = finding_data.get("category", "unknown")
            confidence = finding_data.get("confidence", 0.8)

            # Boost confidence for high-signal threat classes
            if category in CRITICAL_THREAT_CLASSES:
                confidence = max(confidence, 0.85)

            analyzer = finding_data.get("analyzer", "static")

            findings.append(Finding(
                stage="stage3",
                severity=CISCO_TO_TANK_SEVERITY.get(
                    finding_data.get("severity", "MEDIUM").upper(),
                    "medium"
                ),
                type=f"cisco/{category}",
                description=finding_data.get("description", "Skill scanner finding"),
                location=finding_data.get("location"),
                confidence=confidence,
                tool=f"skill-scanner/{analyzer}",
                evidence=finding_data.get("evidence"),
            ))

    except subprocess.TimeoutExpired:
        logger.warning("skill-scanner timed out after 30 seconds")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse skill-scanner output: {e}")
    except Exception as e:
        logger.error(f"skill-scanner error: {e}")

    return findings


def get_skill_scanner_info() -> dict[str, Any]:
    """Get information about the skill-scanner availability and version."""
    info = {
        "available": False,
        "version": None,
        "analyzers": ["static", "behavioral"],
    }

    try:
        result = subprocess.run(
            ["skill-scanner", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            info["available"] = True
            # Parse version from output like "skill-scanner 1.0.0"
            version_line = result.stdout.strip().split("\n")[0]
            info["version"] = version_line.split()[-1] if version_line else "unknown"
    except Exception as e:
        info["error"] = str(e)

    return info


# Alias for backward compatibility with plan naming
run_cisco_scanner = run_skill_scanner
is_cisco_scanner_available = is_skill_scanner_available
get_cisco_scanner_info = get_skill_scanner_info
