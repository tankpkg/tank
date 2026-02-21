"""Convert Tank scan findings to SARIF v2.1.0 format.

SARIF (Static Analysis Results Interchange Format) is an industry standard
for static analysis output. It enables integration with:
- GitHub Code Scanning
- Azure DevOps
- SonarQube
- Other security tools

Reference: https://sarifweb.azurewebsites.net/
"""

from datetime import datetime, timezone
from typing import Any


SARIF_LEVEL = {
    "critical": "error",
    "high": "error",
    "medium": "warning",
    "low": "note",
}


def to_sarif(
    findings: list[dict[str, Any]],
    scan_duration_ms: int = 0,
    skill_name: str = "unknown",
) -> dict[str, Any]:
    """Convert Tank scan findings to SARIF v2.1.0 format.

    Args:
        findings: List of finding dicts from scan pipeline
        scan_duration_ms: Total scan duration in milliseconds
        skill_name: Name of the scanned skill

    Returns:
        SARIF-compliant dict ready for JSON serialization
    """
    rules: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []

    for finding in findings:
        rule_id = finding.get("type", "unknown")

        # Build rules index
        if rule_id not in rules:
            rules[rule_id] = {
                "id": rule_id,
                "shortDescription": {
                    "text": _format_rule_description(rule_id)
                },
                "defaultConfiguration": {
                    "level": SARIF_LEVEL.get(finding.get("severity", "medium"), "warning")
                },
                "properties": {
                    "tags": _extract_tags(finding),
                    "precision": _get_precision(finding.get("confidence", 0.8)),
                },
            }

        # Build result
        result: dict[str, Any] = {
            "ruleId": rule_id,
            "level": SARIF_LEVEL.get(finding.get("severity", "medium"), "warning"),
            "message": {
                "text": finding.get("description", "No description")
            },
            "properties": {
                "confidence": finding.get("confidence", 0),
                "source_tool": finding.get("tool", "unknown"),
            },
        }

        # Add location if available
        loc = finding.get("location")
        if loc and ":" in str(loc):
            parts = str(loc).rsplit(":", 1)
            try:
                line_num = int(parts[1])
                result["locations"] = [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": parts[0]},
                        "region": {"startLine": line_num},
                    }
                }]
            except (ValueError, IndexError):
                result["locations"] = [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": str(loc)},
                    }
                }]

        # Add corroboration info
        if finding.get("corroborated"):
            result["properties"]["corroborated"] = True
            result["properties"]["corroboration_count"] = finding.get("corroboration_count", 1)

        # Add evidence if available
        evidence = finding.get("evidence")
        if evidence:
            result["codeFlows"] = [{
                "message": {"text": "Evidence"},
                "threadFlows": [{
                    "locations": [{
                        "location": {
                            "message": {"text": str(evidence)[:500]}
                        }
                    }]
                }]
            }]

        results.append(result)

    # Build SARIF document
    sarif: dict[str, Any] = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "tank-scanner",
                    "version": "2.0.0",
                    "informationUri": "https://tankpkg.dev",
                    "rules": list(rules.values()),
                    "organization": "Tank",
                    "product": "Tank Security Scanner",
                }
            },
            "results": results,
            "invocations": [{
                "executionSuccessful": True,
                "startTimeUtc": datetime.now(timezone.utc).isoformat(),
            }],
            "properties": {
                "skill": skill_name,
            },
        }],
    }

    # Add duration if provided
    if scan_duration_ms:
        sarif["runs"][0]["invocations"][0]["properties"] = {
            "duration_ms": scan_duration_ms
        }

    return sarif


def _format_rule_description(rule_id: str) -> str:
    """Format a rule ID as human-readable description."""
    # Replace slashes and underscores with spaces, title case
    text = rule_id.replace("/", ": ").replace("_", " ").replace("-", " ")
    return text.title()


def _extract_tags(finding: dict[str, Any]) -> list[str]:
    """Extract tags from a finding for SARIF categorization."""
    tags = []

    tool = finding.get("tool", "")
    finding_type = finding.get("type", "")
    severity = finding.get("severity", "")

    # Tool tags
    if "semgrep" in tool.lower():
        tags.append("semgrep")
    if "bandit" in tool.lower():
        tags.append("bandit")
    if "detect-secrets" in tool.lower():
        tags.append("secrets")
    if "osv" in tool.lower():
        tags.append("dependency")

    # Category tags based on type
    if "injection" in finding_type.lower():
        tags.append("injection")
    if "secret" in finding_type.lower() or "credential" in finding_type.lower():
        tags.append("credentials")
    if "exfiltration" in finding_type.lower():
        tags.append("data-exfiltration")
    if "exec" in finding_type.lower():
        tags.append("code-execution")

    # Severity tag
    if severity:
        tags.append(f"severity:{severity}")

    return tags


def _get_precision(confidence: float) -> str:
    """Convert confidence score to SARIF precision level."""
    if confidence >= 0.9:
        return "very-high"
    if confidence >= 0.8:
        return "high"
    if confidence >= 0.7:
        return "medium"
    if confidence >= 0.5:
        return "low"
    return "very-low"
