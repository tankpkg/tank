"""Remediation guidance and CWE references for security findings.

Maps finding types to human-readable remediation guidance and CWE identifiers.
Used to enrich findings with actionable advice for skill authors.
"""

from lib.scan.models import Finding

# Maps finding type → (remediation text, CWE ID)
REMEDIATION_MAP: dict[str, tuple[str, str]] = {
    # Shell / command execution
    "shell_injection": (
        "Use subprocess with list arguments instead of shell=True. Avoid passing user input to shell commands.",
        "CWE-78",
    ),
    "subprocess_usage": (
        "Use subprocess with list arguments and avoid shell=True. Ensure no user-controlled input reaches the command.",
        "CWE-78",
    ),
    "undeclared_subprocess": (
        "Declare subprocess permission in your tank.json or avoid using subprocess calls.",
        "CWE-78",
    ),
    # Code execution
    "code_execution": (
        "Avoid eval()/exec() — use ast.literal_eval() for safe evaluation of literals.",
        "CWE-94",
    ),
    "eval_usage": (
        "Avoid eval() — use ast.literal_eval() or json.loads() for safe parsing.",
        "CWE-94",
    ),
    "obfuscation": (
        "Avoid encoding/decoding patterns combined with exec(). If intentional, document the purpose clearly.",
        "CWE-94",
    ),
    # Network access
    "network_access": (
        "Declare network.outbound in your tank.json permissions. Ensure no user data is sent to unexpected endpoints.",
        "CWE-200",
    ),
    "undeclared_network": (
        "Declare network.outbound in your tank.json to match the network requests in your code.",
        "CWE-200",
    ),
    "js_pattern": (
        "Review the flagged pattern. If it's a standard library call, declare the appropriate permission.",
        "CWE-200",
    ),
    # Injection
    "prompt_injection_pattern": (
        "Review the flagged text. If it's documentation or examples, wrap it in code blocks. If intentional instruction, ensure it's scoped appropriately.",
        "CWE-94",
    ),
    "elevated_suspicion": (
        "Review the content for patterns that could be interpreted as prompt injection. Consider rephrasing or using code blocks for examples.",
        "CWE-94",
    ),
    "hidden_instruction": (
        "Hidden content in comments can be used for injection. Remove or move to visible documentation.",
        "CWE-94",
    ),
    # Secrets
    "secret_detected": (
        "Move secrets to environment variables or a secrets manager. Never hardcode credentials.",
        "CWE-798",
    ),
    "base64_in_comment": (
        "Base64 content in comments may hide instructions. Decode and review, or remove if not needed.",
        "CWE-94",
    ),
    # Environment access
    "env_access": (
        "Standard env vars (NODE_ENV, PATH) are safe. Avoid accessing secret/key/password env vars.",
        "CWE-200",
    ),
    # Supply chain
    "dependency_vulnerability": (
        "Update the flagged dependency to a patched version. Check the CVE for details.",
        "CWE-1035",
    ),
    "typosquatting": (
        "This package name closely resembles a popular package. Verify the source and consider using the canonical package.",
        "CWE-1357",
    ),
    # Deserialization
    "insecure_deserialize": (
        "Avoid pickle/marshal/shelve with untrusted data. Use JSON or msgpack for safe serialization.",
        "CWE-502",
    ),
    # File system
    "sensitive_file_read": (
        "Avoid reading sensitive system files (SSH keys, AWS credentials, env files). Use proper secret management.",
        "CWE-200",
    ),
}

# General fallback for unknown finding types
DEFAULT_REMEDIATION = (
    "Review the flagged pattern and ensure it does not pose a security risk.",
    "",
)


def enrich_finding(finding: Finding) -> Finding:
    """Add remediation guidance and CWE reference to a finding.

    Args:
        finding: A Finding to enrich.

    Returns:
        The same Finding with remediation and cwe_id populated if available.
    """
    remediation_text, cwe_id = REMEDIATION_MAP.get(finding.type, DEFAULT_REMEDIATION)

    if remediation_text:
        finding.remediation = remediation_text
    if cwe_id:
        finding.cwe_id = cwe_id

    return finding


def enrich_findings(findings: list[Finding]) -> list[Finding]:
    """Add remediation guidance to all findings in a list.

    Args:
        findings: List of Findings to enrich.

    Returns:
        Same list with remediation fields populated.
    """
    for finding in findings:
        enrich_finding(finding)
    return findings
