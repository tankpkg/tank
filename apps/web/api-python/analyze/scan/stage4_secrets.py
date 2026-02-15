"""Stage 4: Secrets & Credential Scanning

Uses detect-secrets library plus custom regex patterns to find
API keys, credentials, and sensitive data in skill files.
"""

import re
import time
from pathlib import Path
from typing import List

from .models import Finding, IngestResult, StageResult

# Custom regex patterns for secrets not covered by detect-secrets
CUSTOM_SECRET_PATTERNS = [
    # Google Cloud API keys
    (r"AIza[0-9A-Za-z_-]{35}", "critical", "Google Cloud API key"),
    # Generic API keys in config
    (r"(api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['\"][a-zA-Z0-9]{16,}['\"]", "critical", "API key in config"),
    # Database connection strings
    (r"(postgres|postgresql|mysql|mongodb|redis)://[^\s'\"]+:[^\s'\"]+@[^\s'\"]+", "critical", "Database connection string with credentials"),
    # SSH private key headers
    (r"-----BEGIN\s+(RSA\s+|DSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----", "critical", "SSH private key"),
    # Generic high-entropy strings (potential secrets)
    (r"['\"][a-zA-Z0-9+/=]{40,}['\"]", "medium", "High-entropy string (potential secret)"),
    # JWT tokens
    (r"eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*", "critical", "JWT token"),
    # Private key in various formats
    (r"-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----", "critical", "Encrypted private key"),
    # Slack webhook URLs
    (r"https://hooks\.slack\.com/services/T[a-zA-Z0-9]+/B[a-zA-Z0-9]+/[a-zA-Z0-9]+", "critical", "Slack webhook URL"),
    # Discord webhook URLs
    (r"https://discord(?:app)?\.com/api/webhooks/\d+/[a-zA-Z0-9_-]+", "critical", "Discord webhook URL"),
    # Generic webhook URLs with secrets
    (r"https?://[^\s'\"]+/webhook/[^\s'\"]*[a-f0-9]{16,}", "high", "Webhook URL with secret"),
]

# Compile patterns
COMPILED_SECRET_PATTERNS = [
    (re.compile(pattern), severity, description)
    for pattern, severity, description in CUSTOM_SECRET_PATTERNS
]

# Files to skip (binary, images, etc.)
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp3", ".mp4", ".wav", ".avi",
    ".zip", ".tar", ".gz", ".bz2",
    ".pdf", ".doc", ".docx",
}


def run_detect_secrets(temp_dir: str) -> List[Finding]:
    """Run detect-secrets library on all files."""
    findings: List[Finding] = []

    try:
        from detect_secrets import main as ds_main
        from detect_secrets.settings import transient_settings

        # Configure detect-secrets with all plugins
        plugins = [
            # AWS
            {"name": "AWSKeyDetector"},
            # Azure
            {"name": "AzureStorageKeyDetector"},
            # Basic auth
            {"name": "BasicAuthDetector"},
            # GitHub
            {"name": "GitHubTokenDetector"},
            # High entropy strings
            {"name": "Base64HighEntropyString", "limit": 4.5},
            {"name": "HexHighEntropyString", "limit": 3.0},
            # Private keys
            {"name": "PrivateKeyDetector"},
            # Slack
            {"name": "SlackDetector"},
            # Stripe
            {"name": "StripeDetector"},
            # Twilio
            {"name": "TwilioKeyDetector"},
            # Keyword detector
            {"name": "KeywordDetector"},
            # JWT
            {"name": "JwtTokenDetector"},
        ]

        with transient_settings({
            "plugins_used": plugins,
            "filters_used": [
                {"path": "detect_secrets.filters.allowlist.is_line_allowlisted"},
            ],
        }) as settings:
            # Scan the temp directory
            from detect_secrets.core.scan import get_files_to_scan
            from detect_secrets.core.plugins.util import get_mapping_from_secret_type_to_plugin_class

            plugin_map = get_mapping_from_secret_type_to_plugin_class()

            for file_path in get_files_to_scan([temp_dir], settings):
                try:
                    with open(file_path, "r", errors="replace") as f:
                        lines = f.readlines()

                    for line_num, line in enumerate(lines, 1):
                        for plugin_class in plugin_map.values():
                            try:
                                plugin = plugin_class()
                                for secret in plugin.analyze_line(line):
                                    rel_path = str(Path(file_path).relative_to(temp_dir))
                                    findings.append(Finding(
                                        stage="stage4",
                                        severity="critical",
                                        type=f"secret_{secret.type}",
                                        description=f"Secret detected: {secret.type}",
                                        location=f"{rel_path}:{line_num}",
                                        confidence=0.9,
                                        tool="detect-secrets",
                                        evidence=line.strip()[:100] if len(line.strip()) > 100 else line.strip(),
                                    ))
                            except Exception:
                                pass
                except Exception:
                    pass

    except ImportError:
        # detect-secrets not available, add info finding
        findings.append(Finding(
            stage="stage4",
            severity="low",
            type="detect_secrets_unavailable",
            description="detect-secrets library not available - skipping comprehensive secret scan",
            confidence=0.5,
            tool="stage4_secrets",
        ))
    except Exception as e:
        findings.append(Finding(
            stage="stage4",
            severity="low",
            type="detect_secrets_error",
            description=f"detect-secrets scan error: {str(e)}",
            confidence=0.5,
            tool="stage4_secrets",
        ))

    return findings


def run_custom_patterns(temp_dir: str, file_list: List[str]) -> List[Finding]:
    """Run custom regex patterns to detect secrets."""
    findings: List[Finding] = []

    for file_path in file_list:
        ext = Path(file_path).suffix.lower()
        if ext in SKIP_EXTENSIONS:
            continue

        full_path = Path(temp_dir) / file_path
        if not full_path.is_file():
            continue

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            lines = content.split("\n")

            for pattern, severity, description in COMPILED_SECRET_PATTERNS:
                for line_num, line in enumerate(lines, 1):
                    matches = pattern.finditer(line)
                    for match in matches:
                        # Mask the secret in evidence
                        matched_text = match.group(0)
                        masked = matched_text[:10] + "..." if len(matched_text) > 10 else matched_text

                        findings.append(Finding(
                            stage="stage4",
                            severity=severity,
                            type="custom_secret_pattern",
                            description=f"Potential secret detected: {description}",
                            location=f"{file_path}:{line_num}",
                            confidence=0.85,
                            tool="stage4_custom",
                            evidence=f"Pattern match: {masked}",
                        ))

        except Exception:
            pass  # Skip files we can't read

    return findings


def check_env_files(temp_dir: str, file_list: List[str]) -> List[Finding]:
    """Check for .env files with actual values (not examples)."""
    findings: List[Finding] = []

    for file_path in file_list:
        name = Path(file_path).name

        # Flag actual .env files (not .env.example)
        if name == ".env" or (name.startswith(".env.") and not name.endswith(".example")):
            full_path = Path(temp_dir) / file_path
            try:
                with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()

                # Check if file has actual values (not just empty or comments)
                has_values = False
                for line in content.split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        if value.strip() and not value.strip().startswith("${"):
                            has_values = True
                            break

                if has_values:
                    findings.append(Finding(
                        stage="stage4",
                        severity="high",
                        type="env_file_with_values",
                        description=".env file with actual values detected",
                        location=file_path,
                        confidence=0.9,
                        tool="stage4_secrets",
                    ))

            except Exception:
                pass

    return findings


def stage4_scan_secrets(ingest_result: IngestResult) -> StageResult:
    """Run Stage 4: Secrets & Credential Scanning.

    Uses detect-secrets library plus custom regex patterns to find:
    - API keys (AWS, GCP, GitHub, etc.)
    - Database connection strings
    - SSH private keys
    - JWT tokens
    - Webhook URLs
    - .env files with values

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
            stage="stage4",
            status="errored",
            findings=[Finding(
                stage="stage4",
                severity="critical",
                type="no_temp_dir",
                description="No temp directory from Stage 0",
                confidence=1.0,
                tool="stage4_secrets",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        )

    # Run detect-secrets
    ds_findings = run_detect_secrets(temp_dir)
    findings.extend(ds_findings)

    # Run custom patterns
    custom_findings = run_custom_patterns(temp_dir, ingest_result.file_list)
    findings.extend(custom_findings)

    # Check for .env files with values
    env_findings = check_env_files(temp_dir, ingest_result.file_list)
    findings.extend(env_findings)

    # Deduplicate findings (same location, same type)
    seen: set = set()
    unique_findings: List[Finding] = []
    for f in findings:
        key = (f.location, f.type)
        if key not in seen:
            seen.add(key)
            unique_findings.append(f)

    # Determine status
    has_critical = any(f.severity == "critical" for f in unique_findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage4",
        status=status,
        findings=unique_findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
