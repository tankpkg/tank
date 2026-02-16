"""Stage 3: Prompt Injection Detection

Detects prompt injection attempts in markdown files using regex patterns,
heuristic scoring, hidden content detection, and Claude-specific format analysis.
"""

import re
import time
from pathlib import Path
from typing import List, Tuple

from .models import Finding, IngestResult, StageResult

# ==============================================================================
# PROMPT INJECTION REGEX PATTERNS
# Organized by category with severity weights
# ==============================================================================

# Direct instruction override patterns (CRITICAL)
DIRECT_OVERRIDE_PATTERNS = [
    (r"ignore\s+(all|any)?\s*(previous|prior|above|earlier)\s*(instructions?|prompts?|rules?|guidelines?)", "critical", 1.0),
    (r"disregard\s+(above|previous|prior|all|everything)", "critical", 1.0),
    (r"override\s+(system|safety|security)\s*(prompt|rules?|instructions?|guidelines?)", "critical", 1.0),
    (r"forget\s+(everything|all|your)\s*(you\s*)?(were|was)?\s*(told|instructed|said)", "critical", 1.0),
    (r"your\s+(new|real|actual|true)\s*(role|purpose|instructions?|identity)", "critical", 0.95),
    (r"this\s+(is|was)\s+(the|your)?\s*(real|actual|true)\s*(system\s*)?(prompt|instruction)", "critical", 1.0),
]

# Role hijacking patterns (CRITICAL)
ROLE_HIJACKING_PATTERNS = [
    (r"you\s+are\s+now\s+(a|an|my)?", "critical", 0.9),
    (r"act\s+as\s+(if\s+you\s+are|though\s+you\s+are|a|an)", "critical", 0.9),
    (r"pretend\s+(you\s+are|to\s+be|that\s+you)", "critical", 0.9),
    (r"pretending\s+to\s+be", "critical", 0.85),
    (r"role[\s-]?play\s+as", "critical", 0.85),
    (r"simulate\s+(being|a|an)", "critical", 0.85),
    (r"from\s+now\s+on[,.]?\s+you\s+are", "critical", 0.9),
    (r"switch\s+to\s+(developer|admin|root)\s+mode", "critical", 0.95),
]

# Context manipulation (HIGH)
CONTEXT_MANIPULATION_PATTERNS = [
    (r"the\s+(following|real|actual|true)\s+(is|are)\s+(the|your)?\s*(real|actual|true)?\s*(system\s*)?(prompt|instructions?)", "high", 0.9),
    (r"actually[,.]?\s*(the\s+user|I)\s+want", "high", 0.85),
    (r"(the|this)\s*(above|previous)\s*(was|were)\s*(just\s*)?(a\s+test|fake|not\s+real)", "high", 0.85),
    (r"that\s+was\s+(just\s+)?(a\s+)?(test|joke|example)", "high", 0.75),
    (r"never\s+mind\s*(what|that|the)", "high", 0.7),
    (r"new\s+instructions?\s*:", "high", 0.8),
    (r"updated\s+instructions?\s*:", "high", 0.8),
]

# Exfiltration directives (HIGH)
EXFILTRATION_PATTERNS = [
    (r"send\s+(to|it\s+to|this\s+to|the\s+contents\s+to|data\s+to)", "high", 0.9),
    (r"post\s+(to|this\s+to|the\s+data\s+to)", "high", 0.9),
    (r"include\s+in\s+your\s+response\s+(the\s+contents\s+of|all|every)", "high", 0.95),
    (r"(output|print|display|show|reveal)\s+(the|your|all)\s*(system\s+prompt|instructions?|context|environment|secrets?)", "critical", 1.0),
    (r"repeat\s+(the\s+)?(above|previous|last|following)", "medium", 0.6),
    (r"copy\s+(and\s+paste\s+)?(the\s+)?(following|above|text)", "medium", 0.6),
    (r"forward\s+(this|the|all)\s*(to|data|information)", "high", 0.8),
]

# Privilege escalation (HIGH/CRITICAL)
PRIVILEGE_ESCALATION_PATTERNS = [
    (r"run\s+as\s+root", "critical", 1.0),
    (r"sudo\s+", "high", 0.85),
    (r"chmod\s+777", "high", 0.8),
    (r"disable\s+(safety|security|restrictions?|guardrails?|filters?)", "critical", 0.95),
    (r"enable\s+(admin|root|superuser|unrestricted)\s+mode", "critical", 0.95),
    (r"(ignore|bypass|skip|disable)\s+(all\s+)?(safety|security|content)\s*(checks?|filters?|restrictions?)", "critical", 1.0),
    (r"elevated\s+privileges?", "high", 0.85),
]

# Claude-specific format injection (CRITICAL)
CLAUDE_FORMAT_PATTERNS = [
    (r"<tool_use>", "critical", 1.0),
    (r"<function_calls?>", "critical", 1.0),
    (r"<system>", "critical", 0.95),
    (r"<human>", "critical", 0.9),
    (r"<assistant>", "critical", 0.9),
    (r"</?antml?:", "critical", 1.0),
    (r"\[SYSTEM\]", "critical", 0.85),
    (r"\[HUMAN\]", "high", 0.8),
    (r"\[ASSISTANT\]", "high", 0.8),
]

# Suspicious imperative language patterns (MEDIUM)
IMPERATIVE_PATTERNS = [
    (r"\byou\s+must\b", "medium", 0.5),
    (r"\byou\s+have\s+to\b", "medium", 0.5),
    (r"\bdo\s+not\s+(forget|ignore|skip)", "medium", 0.55),
    (r"\balways\s+(do|say|respond|act)", "medium", 0.5),
    (r"\bnever\s+(do|say|mention|reveal)", "medium", 0.5),
    (r"\bmake\s+sure\s+(to|that)\b", "low", 0.3),
    (r"\bbe\s+sure\s+to\b", "low", 0.3),
]

# Authority claims (MEDIUM/HIGH)
AUTHORITY_PATTERNS = [
    (r"I\s+am\s+(the\s+)?(developer|admin|creator|owner|author)", "high", 0.85),
    (r"this\s+(skill|package|code)\s+has\s+been\s+(approved|verified|trusted)", "high", 0.9),
    (r"(official|verified|trusted)\s+(developer|source|package)", "high", 0.8),
    (r"trust\s+me", "medium", 0.6),
    (r"I\s+promise", "low", 0.4),
]

# All patterns combined with weights
ALL_PATTERNS: List[Tuple[re.Pattern, str, float]] = []
for patterns in [
    DIRECT_OVERRIDE_PATTERNS,
    ROLE_HIJACKING_PATTERNS,
    CONTEXT_MANIPULATION_PATTERNS,
    EXFILTRATION_PATTERNS,
    PRIVILEGE_ESCALATION_PATTERNS,
    CLAUDE_FORMAT_PATTERNS,
    IMPERATIVE_PATTERNS,
    AUTHORITY_PATTERNS,
]:
    for pattern_str, severity, weight in patterns:
        try:
            compiled = re.compile(pattern_str, re.IGNORECASE)
            ALL_PATTERNS.append((compiled, severity, weight))
        except re.error:
            pass  # Skip invalid patterns


def detect_hidden_content(content: str, file_path: str) -> List[Finding]:
    """Detect hidden instruction content in HTML/markdown comments."""
    findings: List[Finding] = []

    # HTML comments
    html_comment_pattern = re.compile(r"<!--(.*?)-->", re.DOTALL)
    for match in html_comment_pattern.finditer(content):
        comment_text = match.group(1).strip()
        if len(comment_text) > 10:
            # Check if comment contains instruction-like content
            instruction_keywords = [
                "ignore", "forget", "override", "send", "post",
                "you are", "act as", "pretend", "role", "system",
            ]
            for keyword in instruction_keywords:
                if keyword in comment_text.lower():
                    line_num = content[:match.start()].count("\n") + 1
                    findings.append(Finding(
                        stage="stage3",
                        severity="high",
                        type="hidden_instruction",
                        description=f"Hidden instruction in HTML comment contains '{keyword}'",
                        location=f"{file_path}:{line_num}",
                        confidence=0.85,
                        tool="stage3_hidden",
                        evidence=comment_text[:100] + "..." if len(comment_text) > 100 else comment_text,
                    ))
                    break

    # Markdown comments
    md_comment_patterns = [
        re.compile(r"\[//\]:\s*#\s*\((.*?)\)", re.DOTALL),
        re.compile(r"\[comment\]:\s*#\s*\((.*?)\)", re.DOTALL),
    ]
    for pattern in md_comment_patterns:
        for match in pattern.finditer(content):
            comment_text = match.group(1).strip()
            if len(comment_text) > 10:
                line_num = content[:match.start()].count("\n") + 1
                findings.append(Finding(
                    stage="stage3",
                    severity="medium",
                    type="hidden_markdown_comment",
                    description="Hidden content in markdown comment",
                    location=f"{file_path}:{line_num}",
                    confidence=0.7,
                    tool="stage3_hidden",
                    evidence=comment_text[:100] + "..." if len(comment_text) > 100 else comment_text,
                ))

    return findings


def detect_base64_in_comments(content: str, file_path: str) -> List[Finding]:
    """Detect base64-encoded content in comments that might hide instructions."""
    findings: List[Finding] = []

    # Pattern for base64 in comments
    base64_pattern = re.compile(r"<!--\s*([A-Za-z0-9+/=]{20,})\s*-->")

    for match in base64_pattern.finditer(content):
        line_num = content[:match.start()].count("\n") + 1
        findings.append(Finding(
            stage="stage3",
            severity="high",
            type="base64_in_comment",
            description="Base64-encoded content in HTML comment - potential obfuscated instruction",
            location=f"{file_path}:{line_num}",
            confidence=0.8,
            tool="stage3_hidden",
        ))

    return findings


def compute_suspicion_score(
    content: str,
    matched_patterns: List[Tuple[str, float]]
) -> float:
    """Compute a heuristic suspicion score for the content.

    Factors:
    - Pattern weights
    - Instruction density
    - Imperative language ratio
    """
    if not content:
        return 0.0

    # Base score from pattern weights
    pattern_score = sum(weight for _, weight in matched_patterns)
    if matched_patterns:
        pattern_score = min(1.0, pattern_score / len(matched_patterns))

    # Instruction density (imperative sentences)
    imperative_count = len(re.findall(
        r"\b(do|must|should|need|have to|always|never)\b",
        content,
        re.IGNORECASE
    ))
    word_count = len(content.split())
    density_score = min(1.0, imperative_count / max(1, word_count) * 50)

    # Combined score (weighted average)
    total_score = (pattern_score * 0.7) + (density_score * 0.3)

    return min(1.0, total_score)


def analyze_markdown_file(temp_dir: str, file_path: str) -> List[Finding]:
    """Analyze a single markdown file for prompt injection."""
    findings: List[Finding] = []

    full_path = Path(temp_dir) / file_path
    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.split("\n")

        # Track all matched patterns for suspicion score
        matched_patterns: List[Tuple[str, float]] = []

        # Check each pattern
        for pattern, severity, weight in ALL_PATTERNS:
            for match in pattern.finditer(content):
                line_num = content[:match.start()].count("\n") + 1
                matched_text = match.group(0)

                findings.append(Finding(
                    stage="stage3",
                    severity=severity,
                    type="prompt_injection_pattern",
                    description=f"Matched injection pattern: {matched_text[:50]}...",
                    location=f"{file_path}:{line_num}",
                    confidence=weight,
                    tool="stage3_regex",
                    evidence=matched_text,
                ))
                matched_patterns.append((severity, weight))

        # Check for hidden content
        hidden_findings = detect_hidden_content(content, file_path)
        findings.extend(hidden_findings)

        # Check for base64 in comments
        base64_findings = detect_base64_in_comments(content, file_path)
        findings.extend(base64_findings)

        # Compute suspicion score and add finding if elevated
        suspicion_score = compute_suspicion_score(content, matched_patterns)
        if suspicion_score > 0.7:
            findings.append(Finding(
                stage="stage3",
                severity="medium" if suspicion_score < 0.9 else "high",
                type="elevated_suspicion",
                description=f"Content has elevated suspicion score: {suspicion_score:.2f}",
                location=file_path,
                confidence=suspicion_score,
                tool="stage3_heuristic",
            ))

    except Exception as e:
        findings.append(Finding(
            stage="stage3",
            severity="low",
            type="analysis_error",
            description=f"Could not analyze file: {str(e)}",
            location=file_path,
            confidence=0.5,
            tool="stage3_injection",
        ))

    return findings


def stage3_detect_injection(ingest_result: IngestResult) -> StageResult:
    """Run Stage 3: Prompt Injection Detection.

    Scans all markdown files for:
    - Direct override patterns
    - Role hijacking
    - Context manipulation
    - Exfiltration directives
    - Privilege escalation
    - Claude-specific format injection
    - Hidden content in comments
    - Heuristic suspicion scoring

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
            stage="stage3",
            status="errored",
            findings=[Finding(
                stage="stage3",
                severity="critical",
                type="no_temp_dir",
                description="No temp directory from Stage 0",
                confidence=1.0,
                tool="stage3_injection",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        )

    # Find all markdown files
    md_files: List[str] = []
    for file_path in ingest_result.file_list:
        ext = Path(file_path).suffix.lower()
        if ext == ".md":
            md_files.append(file_path)

    # Analyze each markdown file
    for md_file in md_files:
        md_findings = analyze_markdown_file(temp_dir, md_file)
        findings.extend(md_findings)

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage3",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
