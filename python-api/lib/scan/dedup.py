"""Deduplicate findings across scanning tools.

Rules:
- Two findings are duplicates if: same file (within 3 lines) AND similar type category
- When duplicates merge: keep highest severity, boost confidence by 0.1 per corroborating tool
- Record all contributing tools for UI attribution
"""

from typing import Any


def deduplicate_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate findings from multiple scanning tools.

    When multiple tools find the same issue, merge them into a single finding
    with higher confidence and attribution to all tools.
    """
    if len(findings) <= 1:
        return findings

    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}

    # Sort by severity (critical first), then by confidence (high first)
    sorted_findings = sorted(
        findings,
        key=lambda f: (severity_rank.get(f.get("severity", "low"), 3), -f.get("confidence", 0)),
    )

    merged: list[dict[str, Any]] = []
    consumed: set[int] = set()

    for i, primary in enumerate(sorted_findings):
        if i in consumed:
            continue

        duplicates: list[int] = []
        for j in range(i + 1, len(sorted_findings)):
            if j in consumed:
                continue
            if _is_duplicate(primary, sorted_findings[j]):
                duplicates.append(j)
                consumed.add(j)

        if duplicates:
            tools = {primary.get("tool", "unknown")}
            for idx in duplicates:
                tools.add(sorted_findings[idx].get("tool", "unknown"))

            # Boost confidence for corroborated findings
            primary["confidence"] = min(1.0, primary.get("confidence", 0.8) + 0.1 * len(duplicates))
            primary["tool"] = " + ".join(sorted(tools))
            primary["corroborated"] = True
            primary["corroboration_count"] = len(tools)

        merged.append(primary)

    return merged


def _is_duplicate(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Check if two findings are duplicates."""
    loc_a, loc_b = str(a.get("location", "")), str(b.get("location", ""))

    # Must have locations
    if not loc_a or not loc_b:
        return False

    # Extract file path (before last colon)
    file_a = loc_a.rsplit(":", 1)[0] if ":" in loc_a else loc_a
    file_b = loc_b.rsplit(":", 1)[0] if ":" in loc_b else loc_b

    if file_a != file_b:
        return False

    # Check line proximity
    try:
        line_a = int(loc_a.rsplit(":", 1)[1])
        line_b = int(loc_b.rsplit(":", 1)[1])
        if abs(line_a - line_b) > 3:
            return False
    except (ValueError, IndexError):
        pass  # If no line numbers, check type similarity

    # Check keyword overlap in type names
    words_a = set(a.get("type", "").replace("/", " ").replace("_", " ").replace("-", " ").lower().split())
    words_b = set(b.get("type", "").replace("/", " ").replace("_", " ").replace("-", " ").lower().split())

    # Common security keywords that indicate similar issues
    security_keywords = {
        "injection", "xss", "sqli", "rce", "execution", "deserialization",
        "credential", "secret", "password", "key", "token", "auth",
        "exfiltration", "network", "shell", "command", "eval", "exec",
        "obfuscation", "typosquat", "vulnerability", "cve",
    }

    # Check if both have overlapping security keywords
    overlap = words_a & words_b
    keyword_overlap = (words_a & security_keywords) & (words_b & security_keywords)

    return len(overlap) > 0 or len(keyword_overlap) > 0
