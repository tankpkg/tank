"""Stage T: Token Usage Analysis

Runs the tokenomics CLI tool to analyze token efficiency of a skill.
Advisory-only — findings never affect the scan verdict.

Gracefully skips if the tokenomics CLI is not installed on PATH.
"""

import json
import logging
import os
import shutil
import subprocess
import time

from lib.scan.models import Finding, IngestResult, StageResult

logger = logging.getLogger(__name__)
TOKENOMICS_TIMEOUT = 10  # seconds
MIN_TOKENOMICS_VERSION = "2.3.1"


def stage_token_analyze(ingest_result: IngestResult) -> StageResult:
    """Run Stage T: Token Usage Analysis.

    Uses the tokenomics CLI to estimate token consumption per invocation
    and flag inefficient prompt sizes or file structures.

    Args:
        ingest_result: Result from Stage 0

    Returns:
        StageResult with token findings (always status="passed" or "skipped")
    """
    start = time.monotonic()
    temp_dir = ingest_result.temp_dir

    # Guard: no temp dir
    if not temp_dir:
        return StageResult(stage="stageT", status="skipped", findings=[], duration_ms=0, error="No temp directory")

    # Guard: temp_dir must be a real directory
    if not os.path.isdir(temp_dir):
        return StageResult(
            stage="stageT",
            status="skipped",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="Temp directory does not exist",
        )

    # Check if tokenomics CLI is available
    # Try: global binary → npx (local node_modules) → bunx
    tokenomics_bin = shutil.which("tokenomics")
    run_cmd: list[str] | None = None
    if tokenomics_bin:
        run_cmd = [tokenomics_bin]
    elif shutil.which("npx"):
        run_cmd = ["npx", "--yes", "tokenomics"]
    elif shutil.which("bunx"):
        run_cmd = ["bunx", "tokenomics"]

    if not run_cmd:
        return StageResult(
            stage="stageT", status="skipped", findings=[], duration_ms=int((time.monotonic() - start) * 1000)
        )

    # For npx/bunx invocations, skip version check (npx handles it)
    needs_version_check = bool(tokenomics_bin)

    # Check tokenomics version supports --analyze-skill (>=2.3.0)
    if needs_version_check:
        try:
            ver_result = subprocess.run([tokenomics_bin, "--version"], capture_output=True, text=True, timeout=5)
            version_str = (ver_result.stdout or ver_result.stderr or "").strip()
            # Parse version from output like "tokenomics v2.3.0" or just "2.3.0"
            version_str = version_str.lower().replace("tokenomics", "").replace("v", "").strip()
            installed_parts = [int(p) for p in version_str.split(".") if p.isdigit()]
            min_parts = [int(p) for p in MIN_TOKENOMICS_VERSION.split(".")]
            if installed_parts < min_parts:
                return StageResult(
                    stage="stageT", status="skipped", findings=[], duration_ms=int((time.monotonic() - start) * 1000)
                )
        except Exception:
            # If version check fails, try running anyway — worst case it exits non-zero
            pass

    # Run tokenomics CLI
    try:
        result = subprocess.run(
            [*run_cmd, "--analyze-skill", temp_dir, "--json"],
            capture_output=True,
            text=True,
            timeout=TOKENOMICS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return StageResult(
            stage="stageT",
            status="errored",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error="tokenomics CLI timed out",
        )
    except Exception as e:
        return StageResult(
            stage="stageT",
            status="errored",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error=f"tokenomics CLI failed: {e}",
        )

    if result.returncode != 0:
        logger.warning(f"tokenomics CLI exited with code {result.returncode}: {result.stderr[:200]}")
        return StageResult(
            stage="stageT",
            status="errored",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error=f"tokenomics exited with code {result.returncode}",
        )

    # Parse JSON
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        return StageResult(
            stage="stageT",
            status="errored",
            findings=[],
            duration_ms=int((time.monotonic() - start) * 1000),
            error=f"Invalid JSON from tokenomics: {e}",
        )

    # Convert findings
    findings: list[Finding] = []
    raw_findings = data.get("findings", [])

    for f in raw_findings:
        severity = f.get("severity", "info")
        if severity not in ("critical", "high", "medium", "low", "info"):
            severity = "info"
        findings.append(
            Finding(
                stage="stageT",
                severity=severity,
                type=f.get("rule", "unknown"),
                description=f.get("description", ""),
                location=f.get("location"),
                confidence=f.get("confidence"),
                tool="token_analyzer",
                remediation=f.get("remediation"),
            )
        )

    # Add summary finding with efficiency metadata
    summary = data.get("summary", {})
    eff_score = summary.get("efficiency_score")
    est_tokens = summary.get("estimated_tokens_per_invocation")
    if eff_score is not None or est_tokens is not None:
        desc_parts = []
        if eff_score is not None:
            desc_parts.append(f"Efficiency score: {eff_score}/100")
        if est_tokens is not None:
            desc_parts.append(f"Estimated {est_tokens:,} tokens per invocation")
        findings.append(
            Finding(
                stage="stageT",
                severity="info",
                type="token_summary",
                description=". ".join(desc_parts) + ".",
                confidence=1.0,
                tool="token_analyzer",
                evidence=json.dumps(
                    {
                        "grade": data.get("grade"),
                        "efficiency_score": eff_score,
                        "estimated_tokens_per_invocation": est_tokens,
                        "estimated_tokens": data.get("estimated_tokens"),
                        "cost_per_use": data.get("cost_per_use"),
                        "total_findings": summary.get("total_findings", 0),
                    }
                ),
            )
        )

    return StageResult(
        stage="stageT",
        status="passed",  # Token findings never "fail"
        findings=findings,
        duration_ms=int((time.monotonic() - start) * 1000),
    )
