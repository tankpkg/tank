"""Stage 2: Static Code Analysis

Runs Bandit (Python AST), custom AST analysis for dangerous patterns,
regex patterns for JS/TS/shell, context-aware evaluation (Layer 1 fast-path),
and cross-checks against declared permissions.
"""

import time
from pathlib import Path
from typing import Any

from lib.scan.context import ContextEvaluator
from lib.scan.models import Finding, IngestResult, StageResult
from lib.scan.stage2_analyzers import (
    JS_EXTENSIONS,
    PYTHON_EXTENSIONS,
    SHELL_EXTENSIONS,
    analyze_js_file,
    analyze_python_file,
    analyze_shell_file,
    run_bandit_scan,
)

# Sensitive paths to watch for
SENSITIVE_PATHS = [
    ".ssh",
    ".aws",
    ".config",
    ".env",
    "/etc/passwd",
    "/etc/shadow",
    ".bashrc",
    ".zshrc",
    ".profile",
]


def cross_check_permissions(
    findings: list[Finding], permissions: dict[str, Any], manifest: dict[str, Any]
) -> list[Finding]:
    """Check if code capabilities match declared permissions."""
    additional_findings: list[Finding] = []

    # Check for network usage without network permission
    network_findings = [
        f
        for f in findings
        if f.type in ("network_access", "js_pattern")
        and any(p in f.description for p in ["fetch", "request", "http", "XMLHttpRequest"])
    ]

    if network_findings:
        network_perms = permissions.get("network", {})
        outbound = network_perms.get("outbound", [])
        if not outbound:
            additional_findings.append(
                Finding(
                    stage="stage2",
                    severity="high",
                    type="undeclared_network",
                    description="Code makes network requests but no network.outbound permission declared",
                    confidence=0.8,
                    tool="stage2_permission_check",
                )
            )

    # Check for subprocess usage without subprocess permission
    subprocess_findings = [
        f
        for f in findings
        if "shell" in f.type.lower()
        or "subprocess" in f.description.lower()
        or "child_process" in f.description.lower()
    ]

    if subprocess_findings and not permissions.get("subprocess", False):
        additional_findings.append(
            Finding(
                stage="stage2",
                severity="high",
                type="undeclared_subprocess",
                description="Code runs subprocesses but subprocess permission is false/undeclared",
                confidence=0.8,
                tool="stage2_permission_check",
            )
        )

    return additional_findings


def stage2_analyze(
    ingest_result: IngestResult,
    manifest: dict[str, Any],
    permissions: dict[str, Any],
) -> tuple[StageResult, list[Finding]]:
    """Run Stage 2: Static Code Analysis.

    Runs Bandit (Python AST), custom AST analysis, regex patterns for JS/TS/shell,
    context-aware evaluation (Layer 1 fast-path), and cross-checks against declared permissions.

    Args:
        ingest_result: Result from Stage 0
        manifest: Skill manifest from database
        permissions: Declared permissions from database

    Returns:
        Tuple of (StageResult with findings, list of ambiguous findings for LLM review)
    """
    start = time.monotonic()
    findings: list[Finding] = []
    ambiguous: list[Finding] = []

    temp_dir = ingest_result.temp_dir
    if not temp_dir:
        return StageResult(
            stage="stage2",
            status="errored",
            findings=[
                Finding(
                    stage="stage2",
                    severity="critical",
                    type="no_temp_dir",
                    description="No temp directory from Stage 0",
                    confidence=1.0,
                    tool="stage2_static",
                )
            ],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Stage 0 did not provide temp directory",
        ), []

    # Categorize files
    python_files: list[str] = []
    js_files: list[str] = []
    shell_files: list[str] = []

    for file_path in ingest_result.file_list:
        ext = Path(file_path).suffix.lower()
        if ext in PYTHON_EXTENSIONS:
            python_files.append(file_path)
        elif ext in JS_EXTENSIONS:
            js_files.append(file_path)
        elif ext in SHELL_EXTENSIONS:
            shell_files.append(file_path)

    # Run Bandit on Python files (Python-specific AST scanner)
    if python_files:
        bandit_findings = run_bandit_scan(temp_dir, python_files)
        findings.extend(bandit_findings)

    # Analyze Python files with custom AST
    for py_file in python_files:
        py_findings = analyze_python_file(temp_dir, py_file)
        findings.extend(py_findings)

    # Analyze JS/TS files
    for js_file in js_files:
        js_findings = analyze_js_file(temp_dir, js_file)
        findings.extend(js_findings)

    # Analyze shell files
    for sh_file in shell_files:
        sh_findings = analyze_shell_file(temp_dir, sh_file)
        findings.extend(sh_findings)

    # Cross-check against permissions
    permission_findings = cross_check_permissions(findings, permissions, manifest)
    findings.extend(permission_findings)

    # Context-aware evaluation (Layer 1 fast-path)
    context_eval = ContextEvaluator(permissions, manifest)
    source_cache: dict[str, str | None] = {}
    for i, finding in enumerate(findings):
        # Get source content for markdown/code block checks (cached per file)
        file_path = finding.location.rsplit(":", 1)[0] if finding.location and ":" in finding.location else ""
        source = source_cache.get(file_path)
        if source is None and file_path:
            try:
                full_path = Path(temp_dir) / file_path
                if full_path.exists():
                    source = full_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                pass
            source_cache[file_path] = source

        findings[i], is_resolved = context_eval.evaluate(
            finding,
            source=source,
            file_meta={"path": file_path},
        )
        if not is_resolved and findings[i].severity in ("critical", "high", "medium"):
            ambiguous.append(findings[i])

    # Determine status
    has_critical = any(f.severity == "critical" for f in findings)
    status = "failed" if has_critical else "passed"

    return StageResult(
        stage="stage2",
        status=status,
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    ), ambiguous
