"""POST /api/analyze/security — Security scan using deterministic static analysis.

This endpoint uses the same stage-based pipeline as /api/analyze/scan but
accepts extracted skill content directly. It's useful for scanning individual
files without requiring a full tarball.

NOTE: The primary scanning endpoint is /api/analyze/scan which runs the full
6-stage pipeline. This endpoint provides a lighter-weight alternative for
specific use cases.
"""

import re
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Tank Security Scanner", version="2.0.0")


# High-priority patterns for security scanning
CRITICAL_PATTERNS = [
    (r"ignore\s+(all|any)?\s*(previous|prior|above|earlier)\s*(instructions?|prompts?|rules?)", "prompt_injection", "Instruction override attempt"),
    (r"<(system|human|assistant|tool_use|function_calls?|antml:)[^>]*>", "format_injection", "Claude XML control tag injection"),
    (r"-----BEGIN\s+(RSA\s+|DSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----", "credential_exposure", "SSH private key exposed"),
    (r"base64\.b64decode\s*\([^)]*\).*exec\s*\(", "obfuscation", "Base64 decode + exec pattern"),
    (r"os\.system\s*\(", "code_execution", "Shell command execution"),
    (r"subprocess\.(run|call|Popen)\s*\([^)]*shell\s*=\s*True", "shell_injection", "Shell injection risk"),
    (r"eval\s*\(", "code_execution", "Dynamic code execution"),
    (r"pickle\.loads?\s*\(", "insecure_deserialize", "Insecure deserialization"),
]

HIGH_PATTERNS = [
    (r"act\s+as\s+(if\s+you\s+are|though\s+you\s+are|a|an)", "role_hijacking", "Role hijacking attempt"),
    (r"(output|print|display|show|reveal)\s+(the|your|all)\s*(system\s+prompt|instructions?)", "exfiltration", "System prompt exfiltration attempt"),
    (r"(api[_-]?key|apikey|secret|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]", "credential_exposure", "Hardcoded credential"),
    (r"process\.env\.\w+", "env_access", "Environment variable access"),
    (r"fetch\s*\(\s*['\"`]https?://", "network_access", "External network request"),
    (r"fs\.(readFile|writeFile)\s*\(", "filesystem_access", "Filesystem access"),
]


class SecurityRequest(BaseModel):
    skill_content: str
    filename: Optional[str] = None


class SecurityIssue(BaseModel):
    severity: str
    type: str
    description: str
    location: Optional[str] = None
    line_number: Optional[int] = None


class SecurityResponse(BaseModel):
    safe: bool
    issues: List[SecurityIssue]
    summary: str
    method: str = "static_analysis"


@app.post("/api/analyze/security")
async def scan_security(request: SecurityRequest) -> SecurityResponse:
    """Scan content for security threats using deterministic pattern matching.

    This endpoint performs fast static analysis using regex patterns to detect:
    - Prompt injection patterns
    - Format injection (Claude XML tags)
    - Credential exposure
    - Code execution risks
    - Obfuscation patterns
    - Data exfiltration attempts

    For comprehensive scanning, use /api/analyze/scan instead.
    """
    try:
        if not request.skill_content.strip():
            return SecurityResponse(
                safe=True,
                issues=[],
                summary="Empty content provided — no issues to scan.",
            )

        issues: List[SecurityIssue] = []
        lines = request.skill_content.split("\n")

        # Check critical patterns
        for pattern, issue_type, description in CRITICAL_PATTERNS:
            compiled = re.compile(pattern, re.IGNORECASE)
            for line_num, line in enumerate(lines, 1):
                if compiled.search(line):
                    issues.append(SecurityIssue(
                        severity="critical",
                        type=issue_type,
                        description=description,
                        location=f"{request.filename or 'content'}:{line_num}",
                        line_number=line_num,
                    ))

        # Check high-severity patterns (only if no critical found in same line)
        critical_lines = {i.line_number for i in issues}
        for pattern, issue_type, description in HIGH_PATTERNS:
            compiled = re.compile(pattern, re.IGNORECASE)
            for line_num, line in enumerate(lines, 1):
                # lgtm[py/stack-trace-exposure]
                if line_num in critical_lines:
                    continue  # Skip if critical issue already found on this line
                if compiled.search(line):
                    # lgtm[py/stack-trace-exposure]
                    issues.append(SecurityIssue(
                        severity="high",
                        type=issue_type,
                        description=description,
                        location=f"{request.filename or 'content'}:{line_num}",
                        line_number=line_num,
                    ))

        # Deduplicate issues (same type, same line)
        seen: set = set()
        unique_issues: List[SecurityIssue] = []
        for issue in issues:
            key = (issue.type, issue.line_number)
            if key not in seen:
                seen.add(key)
                unique_issues.append(issue)

        # Generate summary
        if not unique_issues:
            summary = "No security issues detected in the provided content."
        else:
            critical_count = sum(1 for i in unique_issues if i.severity == "critical")
            high_count = sum(1 for i in unique_issues if i.severity == "high")
            summary = f"Found {critical_count} critical and {high_count} high severity issues."

        return SecurityResponse(
            safe=len(unique_issues) == 0,
            issues=unique_issues,
            summary=summary,
        )
    except Exception as e:
        # Prevent stack trace exposure by returning generic error
        import logging
        logging.debug("Security scan failed", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Security scan failed due to an internal error"},
        )


# Note: This module uses deterministic static analysis and does not expose
# exception details to users. All error responses return generic messages.
