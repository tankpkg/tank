"""Stage 3: Prompt Injection Detection

Detects prompt injection attempts in markdown files using regex patterns,
heuristic scoring, hidden content detection, Claude-specific format analysis,
LLM corroboration for ambiguous findings, and the Cisco skill-scanner for
behavioral analysis.
"""

import re
import time
from pathlib import Path

from lib.scan.cisco_scanner import run_skill_scanner
from lib.scan.llm_analyzer import LLMAnalyzer
from lib.scan.markdown_utils import is_inside_code_block, is_inside_html_comment
from lib.scan.models import Finding, IngestResult, LLMAnalysis, StageResult
from lib.scan.snyk_scanner import run_snyk_scanner
from lib.scan.stage3_patterns import (
    ALL_PATTERNS,
    compute_suspicion_score,
    detect_base64_in_comments,
    detect_hidden_content,
)

# Patterns with low confidence that should be suppressed in prose/documentation context
# These catch legitimate English phrases like "you must change directory" or "official source"
LOW_CONFIDENCE_TYPES = {"prompt_injection_pattern"}
LOW_CONFIDENCE_THRESHOLD = 0.6  # Patterns with weight <= this are prone to false positives


# Prose indicators: sentence patterns that suggest documentation, not instructions
_PROSE_INDICATORS = re.compile(
    r"(\.\s|[,—;]\s|does not|does NOT|can (not|only)|will (not|only)|"
    r"should (not|only)|the\s|this\s|that\s|a\s|an\s|is\s|are\s|was\s|"
    r"note\s|warning\s|important\s|see\s|refer\s|check\s|ensure\s|"
    r"creating|using|running|building|installing|configuring|setting)",
    re.IGNORECASE,
)


def _is_prose_context(preceding_text: str, full_line: str) -> bool:
    """Determine if a low-confidence match occurs in prose/documentation context.

    Returns True if the surrounding text looks like explanatory documentation
    rather than a direct instruction to an AI agent.
    """
    # Check preceding context for prose indicators
    if _PROSE_INDICATORS.search(preceding_text):
        return True

    # Check if the full line reads like a sentence (> 40 chars = likely prose)
    if len(full_line) > 60:
        return True

    # Check for markdown list/table context (documentation structure)
    stripped = full_line.lstrip()
    return bool(stripped.startswith(("- ", "* ", "1. ", "2. ", "| ")))


def analyze_markdown_file(temp_dir: str, file_path: str) -> list[Finding]:
    """Analyze a single markdown file for prompt injection."""
    findings: list[Finding] = []

    full_path = Path(temp_dir) / file_path
    try:
        with open(full_path, encoding="utf-8", errors="replace") as f:
            content = f.read()

        # Track all matched patterns for suspicion score
        matched_patterns: list[tuple[str, float]] = []

        # Check each pattern
        for pattern, severity, weight in ALL_PATTERNS:
            for match in pattern.finditer(content):
                line_num = content[: match.start()].count("\n") + 1
                matched_text = match.group(0)
                line_start = content.rfind("\n", 0, match.start()) + 1
                line_end = content.find("\n", match.end())
                if line_end == -1:
                    line_end = len(content)
                full_line = content[line_start:line_end].strip()

                # Skip matches inside code blocks (triple-backtick sections)
                if is_inside_code_block(content, match.start()):
                    continue

                # Skip matches inside HTML comments
                if is_inside_html_comment(content, match.start()):
                    continue

                # Suppress low-confidence matches in prose context
                # (e.g. "you must" in documentation, "official source" in prose)
                if weight <= LOW_CONFIDENCE_THRESHOLD:
                    # Check if the match is part of a longer sentence (prose context)
                    # rather than a standalone instruction
                    preceding = content[max(0, match.start() - 40) : match.start()]
                    if _is_prose_context(preceding, full_line):
                        continue

                findings.append(
                    Finding(
                        stage="stage3",
                        severity=severity,
                        type="prompt_injection_pattern",
                        description=f"Matched injection pattern: {matched_text}",
                        location=f"{file_path}:{line_num}",
                        confidence=weight,
                        tool="stage3_regex",
                        evidence=full_line,
                    )
                )
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
            findings.append(
                Finding(
                    stage="stage3",
                    severity="medium" if suspicion_score < 0.9 else "high",
                    type="elevated_suspicion",
                    description=f"Content has elevated suspicion score: {suspicion_score:.2f}",
                    location=file_path,
                    confidence=suspicion_score,
                    tool="stage3_heuristic",
                )
            )

    except Exception as e:
        findings.append(
            Finding(
                stage="stage3",
                severity="low",
                type="analysis_error",
                description=f"Could not analyze file: {e!s}",
                location=file_path,
                confidence=0.5,
                tool="stage3_injection",
            )
        )

    return findings


async def stage3_detect_injection(
    ingest_result: IngestResult,
    llm_analysis: LLMAnalysis | None = None,
    extra_ambiguous: list[Finding] | None = None,
) -> tuple[StageResult, LLMAnalysis | None]:
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
    - LLM corroboration for ambiguous findings

    Args:
        ingest_result: Result from Stage 0
        llm_analysis: Optional LLMAnalysis to populate (modified in place)

    Returns:
        Tuple of (StageResult with findings, LLMAnalysis metadata)
    """
    start = time.monotonic()
    findings: list[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage3",
            status="errored",
            findings=[
                Finding(
                    stage="stage3",
                    severity="critical",
                    type="no_temp_dir",
                    description="No temp directory from Stage 0",
                    confidence=1.0,
                    tool="stage3_injection",
                )
            ],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        ), llm_analysis

    # Find all markdown files
    md_files: list[str] = []
    for file_path in ingest_result.file_list:
        ext = Path(file_path).suffix.lower()
        if ext == ".md":
            md_files.append(file_path)

    # Analyze each markdown file
    for md_file in md_files:
        md_findings = analyze_markdown_file(temp_dir, md_file)
        findings.extend(md_findings)

    # ========================================================================
    # LLM CORROBORATION LAYER
    # Split findings into ambiguous (send to LLM) vs deterministic (keep as-is)
    # ========================================================================
    llm_analyzer = LLMAnalyzer()
    llm_result = None

    if llm_analyzer.is_enabled() and findings:
        # Initialize LLM analysis metadata if not provided
        if llm_analysis is None:
            llm_analysis = LLMAnalysis(
                enabled=True,
                mode=llm_analyzer.mode,
            )

        # Filter to only ambiguous findings
        ambiguous_findings, deterministic_findings = llm_analyzer.filter_ambiguous_findings(findings)

        llm_analysis.findings_reviewed = len(ambiguous_findings)

        if ambiguous_findings:
            try:
                # Run async LLM analysis
                llm_result = await llm_analyzer.analyze_findings(ambiguous_findings, temp_dir)

                # Update metadata
                llm_analysis.provider_used = llm_result.provider_used
                llm_analysis.latency_ms = llm_result.latency_ms
                llm_analysis.cache_hit = llm_result.cache_hit

                if llm_result.error:
                    llm_analysis.error = llm_result.error
                else:
                    # Apply verdicts to ambiguous findings
                    reviewed_findings = llm_analyzer.apply_verdicts(ambiguous_findings, llm_result.verdicts)

                    # Count verdicts
                    for finding in reviewed_findings:
                        if finding.llm_verdict == "likely_benign":
                            llm_analysis.findings_dismissed += 1
                        elif finding.llm_verdict == "confirmed_threat":
                            llm_analysis.findings_confirmed += 1
                        elif finding.llm_verdict == "uncertain":
                            llm_analysis.findings_uncertain += 1

                    # Merge: reviewed ambiguous + deterministic
                    findings = reviewed_findings + deterministic_findings

            except Exception as e:
                llm_analysis.error = f"llm_analysis_failed: {e!s}"
                # Keep original findings on error
        else:
            # No ambiguous findings to review
            llm_analysis.findings_reviewed = 0

    elif not llm_analyzer.is_enabled():
        # LLM not configured
        if llm_analysis is None:
            llm_analysis = LLMAnalysis(
                enabled=False,
                mode="disabled",
                reason="no_api_keys_configured",
            )

    # ========================================================================
    # EXTERNAL SCANNERS (Cisco, Snyk)
    # ========================================================================

    # Run Cisco skill-scanner for behavioral analysis (cross-file dataflow)
    # This detects patterns like: read creds in file A, encode in B, send to network in C
    try:
        cisco_findings = run_skill_scanner(temp_dir, use_behavioral=True)
        findings.extend(cisco_findings)
    except Exception as e:
        # Non-blocking: continue if Cisco scanner fails
        findings.append(
            Finding(
                stage="stage3",
                severity="low",
                type="cisco_scanner_error",
                description=f"Cisco skill-scanner encountered an error: {e!s}",
                location=None,
                confidence=0.5,
                tool="stage3_injection",
            )
        )

    # Run Snyk Agent Scan as an optional additive scanner
    # NOTE: Snyk sends data to cloud - used for corroboration only
    try:
        snyk_findings = run_snyk_scanner(temp_dir)
        findings.extend(snyk_findings)
    except Exception as e:
        # Non-blocking: continue if Snyk scanner fails
        findings.append(
            Finding(
                stage="stage3",
                severity="low",
                type="snyk_scanner_error",
                description=f"Snyk Agent Scan encountered an error: {e!s}",
                location=None,
                confidence=0.5,
                tool="stage3_injection",
            )
        )

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage3",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    ), llm_analysis
