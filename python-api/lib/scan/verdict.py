"""Verdict computation from stage results.

Computes the final scan verdict based on aggregate findings from all stages.
"""

from typing import List

from lib.scan.models import Finding, ScanVerdict, StageResult


def compute_verdict(stage_results: List[StageResult]) -> ScanVerdict:
    """Compute the final verdict from stage results.

    Rules:
    - 1+ critical findings → FAIL
    - 4+ high findings → FAIL
    - 1-3 high findings → FLAGGED
    - Any medium or low findings → PASS_WITH_NOTES
    - No findings → PASS

    Args:
        stage_results: List of results from all stages

    Returns:
        ScanVerdict enum value
    """
    # Aggregate all findings
    all_findings: List[Finding] = []
    for stage in stage_results:
        all_findings.extend(stage.findings)

    # Count by severity
    critical_count = sum(1 for f in all_findings if f.severity == "critical")
    high_count = sum(1 for f in all_findings if f.severity == "high")
    medium_count = sum(1 for f in all_findings if f.severity == "medium")
    low_count = sum(1 for f in all_findings if f.severity == "low")

    # Apply verdict rules
    if critical_count > 0:
        return ScanVerdict.FAIL

    if high_count >= 4:
        return ScanVerdict.FAIL

    if high_count > 0:
        return ScanVerdict.FLAGGED

    if medium_count > 0 or low_count > 0:
        return ScanVerdict.PASS_WITH_NOTES

    return ScanVerdict.PASS


def get_verdict_counts(stage_results: List[StageResult]) -> dict:
    """Get counts of findings by severity.

    Args:
        stage_results: List of results from all stages

    Returns:
        Dict with total, critical, high, medium, low counts
    """
    all_findings: List[Finding] = []
    for stage in stage_results:
        all_findings.extend(stage.findings)

    return {
        "total": len(all_findings),
        "critical": sum(1 for f in all_findings if f.severity == "critical"),
        "high": sum(1 for f in all_findings if f.severity == "high"),
        "medium": sum(1 for f in all_findings if f.severity == "medium"),
        "low": sum(1 for f in all_findings if f.severity == "low"),
    }


def get_stages_run(stage_results: List[StageResult]) -> List[str]:
    """Get list of stages that completed successfully or with findings.

    Args:
        stage_results: List of results from all stages

    Returns:
        List of stage identifiers
    """
    return [
        sr.stage
        for sr in stage_results
        if sr.status in ("passed", "failed")
    ]
