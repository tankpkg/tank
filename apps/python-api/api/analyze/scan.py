"""POST /api/analyze/scan — Main security scan orchestrator endpoint.

Orchestrates the full 6-stage scanning pipeline:
- Stage 0: Ingestion & Quarantine
- Stage 1: File & Structure Validation
- Stage 2: Static Code Analysis
- Stage 3: Prompt Injection Detection
- Stage 4: Secrets & Credential Scanning
- Stage 5: Dependency & Supply Chain Audit

Supports two modes:
1. Tarball mode: tarball_url provided, full pipeline runs.
2. Single-file mode: single_file_content provided, stages 0-2 skipped.

Includes finding deduplication and SARIF export support.

Stores results in PostgreSQL and returns comprehensive scan response.
"""

import os
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException

from lib.scan.dedup import deduplicate_findings
from lib.scan.models import (
    Finding,
    IngestResult,
    LLMAnalysis,
    ScanRequest,
    ScanResponse,
    ScanVerdict,
    StageResult,
)
from lib.scan.remediation import enrich_findings
from lib.scan.stage0_ingest import cleanup_ingest, compute_file_hashes, stage0_ingest
from lib.scan.stage1_structure import stage1_validate
from lib.scan.stage2_static import stage2_analyze
from lib.scan.stage3_injection import stage3_detect_injection
from lib.scan.stage4_secrets import stage4_scan_secrets
from lib.scan.stage5_supply import stage5_audit_deps
from lib.scan.stage_token import stage_token_analyze
from lib.scan.verdict import compute_verdict, get_stages_run, get_verdict_counts

app = FastAPI(title="Tank Security Scan", version="2.0.0")

# Configuration
MAX_SCAN_DURATION_MS = 55000  # 55 seconds (leave buffer for Vercel 60s limit)


async def store_scan_results(
    version_id: str,
    verdict: ScanVerdict,
    stage_results: list[StageResult],
    duration_ms: int,
    file_hashes: dict[str, str],
    llm_analysis: LLMAnalysis | None = None,
    enriched_findings: list[Finding] | None = None,
) -> str | None:
    """Store scan results in PostgreSQL.

    Returns scan_id if successful, None if storage failed.
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None

    try:
        import logging

        import psycopg
        from psycopg.rows import dict_row

        logger = logging.getLogger(__name__)

        counts = get_verdict_counts(stage_results)
        stages_run = get_stages_run(stage_results)

        async with await psycopg.AsyncConnection.connect(database_url, row_factory=dict_row) as conn:
            async with conn.cursor() as cur:
                # Insert scan_results
                await cur.execute(
                    """
                    INSERT INTO scan_results
                    (version_id, verdict, total_findings, critical_count, high_count,
                     medium_count, low_count, stages_run, duration_ms, file_hashes, llm_analysis)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        version_id,
                        verdict.value,
                        counts["total"],
                        counts["critical"],
                        counts["high"],
                        counts["medium"],
                        counts["low"],
                        stages_run,
                        duration_ms,
                        file_hashes if file_hashes else None,
                        llm_analysis.model_dump() if llm_analysis else None,
                    ),
                )
                row = await cur.fetchone()
                scan_id = str(row["id"]) if row else None

                if not scan_id:
                    return None

                # Insert scan_findings — use enriched findings if available
                findings_to_store = (
                    enriched_findings
                    if enriched_findings is not None
                    else [f for stage in stage_results for f in stage.findings]
                )

                if findings_to_store:
                    finding_values = [
                        (
                            scan_id,
                            f.stage,
                            f.severity,
                            f.type,
                            f.description,
                            f.location,
                            f.confidence,
                            f.tool,
                            f.evidence,
                            f.llm_verdict,
                            f.llm_reviewed,
                            getattr(f, "remediation", None),
                            getattr(f, "cwe_id", None),
                        )
                        for f in findings_to_store
                    ]

                    await cur.executemany(
                        """
                        INSERT INTO scan_findings
                        (scan_id, stage, severity, type, description, location,
                         confidence, tool, evidence, llm_verdict, llm_reviewed,
                         remediation, cwe_id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        finding_values,
                    )

                await conn.commit()
                return scan_id

    except Exception as e:
        # Log error but don't fail the scan
        logger.error(f"Database storage error for version_id={version_id}: {e}", exc_info=True)
        return None


async def run_single_file_pipeline(request: ScanRequest) -> ScanResponse:
    """Run a streamlined scan pipeline for a single file.

    Skips stages that require package structure (stage1, stage2).
    Runs stage3 (injection), stage4 (secrets), and stage5 (supply chain).
    """
    start = time.monotonic()
    stage_results: list[StageResult] = []
    llm_analysis: LLMAnalysis | None = None

    file_name = request.single_file_name or "SKILL.md"
    file_content = request.single_file_content or ""

    # Create a temp directory with the single file for stages that expect a dir
    temp_dir = tempfile.mkdtemp(prefix="tank_scan_single_")
    file_path = os.path.join(temp_dir, file_name)
    Path(file_path).write_text(file_content, encoding="utf-8")

    file_hashes = compute_file_hashes(temp_dir, [file_name])
    ingest_result = IngestResult(
        temp_dir=temp_dir,
        file_hashes=file_hashes,
        file_list=[file_name],
        total_size=len(file_content.encode("utf-8")),
        stage_result=StageResult(
            stage="stage0",
            status="passed",
            findings=[],
            duration_ms=0,
        ),
    )
    stage_results.append(ingest_result.stage_result)

    try:
        # Stage 1 & 2: SKIP (no package structure to validate, no code to analyze statically)
        stage_results.append(StageResult(stage="stage1", status="skipped", findings=[], duration_ms=0))
        stage_results.append(StageResult(stage="stage2", status="skipped", findings=[], duration_ms=0))

        # Stage 3: Prompt Injection Detection
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result, llm_analysis = await stage3_detect_injection(
                    ingest_result,
                    llm_analysis,
                )
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(stage="stage3", status="errored", findings=[], duration_ms=0, error=str(e))
                )

        # Stage 4: Secrets & Credential Scanning
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result = stage4_scan_secrets(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(stage="stage4", status="errored", findings=[], duration_ms=0, error=str(e))
                )

        # Stage 5: Supply Chain — skip for single files (no package.json)
        stage_results.append(StageResult(stage="stage5", status="skipped", findings=[], duration_ms=0))

        # Stage T: Token Usage Analysis (optional, advisory-only)
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 3000:
            try:
                result = stage_token_analyze(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(stage="stageT", status="errored", findings=[], duration_ms=0, error=str(e))
                )

    finally:
        cleanup_ingest(temp_dir)

    # Collect and deduplicate findings
    all_findings = [f for sr in stage_results for f in sr.findings]
    deduped_findings = deduplicate_findings(
        [
            {
                "stage": f.stage,
                "severity": f.severity,
                "type": f.type,
                "description": f.description,
                "location": f.location,
                "confidence": f.confidence,
                "tool": f.tool,
                "evidence": f.evidence,
                "llm_verdict": f.llm_verdict,
                "llm_reviewed": f.llm_reviewed,
            }
            for f in all_findings
        ]
    )

    enriched_findings = enrich_findings(
        [
            Finding(
                stage=f["stage"],
                severity=f["severity"],
                type=f["type"],
                description=f["description"],
                location=f.get("location"),
                confidence=f.get("confidence"),
                tool=f.get("tool"),
                evidence=f.get("evidence"),
                llm_verdict=f.get("llm_verdict"),
                llm_reviewed=f.get("llm_reviewed", False),
            )
            for f in deduped_findings
        ]
    )

    verdict = compute_verdict(stage_results)
    duration_ms = int((time.monotonic() - start) * 1000)

    # Store results
    scan_id = await store_scan_results(
        request.version_id,
        verdict,
        stage_results,
        duration_ms,
        file_hashes,
        llm_analysis,
        enriched_findings=enriched_findings,
    )

    return ScanResponse(
        scan_id=scan_id,
        verdict=verdict.value,
        findings=enriched_findings,
        stage_results=stage_results,
        duration_ms=duration_ms,
        file_hashes=file_hashes,
        llm_analysis=llm_analysis,
    )


async def run_scan_pipeline(request: ScanRequest) -> ScanResponse:
    """Run the full scanning pipeline.

    Orchestrates all 6 stages with error handling and timeout management.
    """
    start = time.monotonic()
    stage_results: list[StageResult] = []
    file_hashes: dict[str, str] = {}
    llm_analysis: LLMAnalysis | None = None

    # Stage 0: Ingestion & Quarantine (REQUIRED - provides temp dir)
    try:
        ingest_result = await stage0_ingest(request.tarball_url, request.sub_path)
        stage_results.append(ingest_result.stage_result)
        file_hashes = ingest_result.file_hashes

        # If Stage 0 failed critically, stop here
        if ingest_result.stage_result.status == "failed":
            verdict = compute_verdict(stage_results)
            duration_ms = int((time.monotonic() - start) * 1000)

            # Store partial results
            scan_id = await store_scan_results(
                request.version_id,
                verdict,
                stage_results,
                duration_ms,
                file_hashes,
                llm_analysis,
            )

            # Cleanup
            cleanup_ingest(ingest_result.temp_dir)

            return ScanResponse(
                scan_id=scan_id,
                verdict=verdict.value,
                findings=[f for sr in stage_results for f in sr.findings],
                stage_results=stage_results,
                duration_ms=duration_ms,
                file_hashes=file_hashes,
                llm_analysis=llm_analysis,
            )

    except Exception as e:
        # Stage 0 failed - cannot continue
        stage_results.append(
            StageResult(
                stage="stage0",
                status="errored",
                findings=[
                    Finding(
                        stage="stage0",
                        severity="critical",
                        type="ingestion_error",
                        description=f"Failed to ingest tarball: {e!s}",
                        confidence=1.0,
                        tool="scan_orchestrator",
                    )
                ],
                duration_ms=int((time.monotonic() - start) * 1000),
                error=str(e),
            )
        )

        verdict = compute_verdict(stage_results)
        duration_ms = int((time.monotonic() - start) * 1000)

        return ScanResponse(
            scan_id=None,
            verdict=verdict.value,
            findings=[f for sr in stage_results for f in sr.findings],
            stage_results=stage_results,
            duration_ms=duration_ms,
            file_hashes={},
            llm_analysis=None,
        )

    temp_dir = ingest_result.temp_dir

    try:
        # Check remaining time
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed

        # Stage 1: File & Structure Validation
        if remaining_budget > 5000:
            try:
                result = stage1_validate(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(
                        stage="stage1",
                        status="errored",
                        findings=[],
                        duration_ms=0,
                        error=str(e),
                    )
                )

        # Stage 2: Static Code Analysis (with context evaluation + ambiguous findings)
        stage2_ambiguous: list[Finding] = []
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 10000:
            try:
                result, stage2_ambiguous = stage2_analyze(
                    ingest_result,
                    request.manifest,
                    request.permissions,
                )
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(
                        stage="stage2",
                        status="errored",
                        findings=[],
                        duration_ms=0,
                        error=str(e),
                    )
                )

        # Stage 3: Prompt Injection Detection (with context evaluation + LLM corroboration)
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result, llm_analysis = await stage3_detect_injection(
                    ingest_result,
                    llm_analysis,
                    extra_ambiguous=stage2_ambiguous,
                )
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(
                        stage="stage3",
                        status="errored",
                        findings=[],
                        duration_ms=0,
                        error=str(e),
                    )
                )

        # Stage 4: Secrets & Credential Scanning
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result = stage4_scan_secrets(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(
                        stage="stage4",
                        status="errored",
                        findings=[],
                        duration_ms=0,
                        error=str(e),
                    )
                )

        # Stage 5: Dependency & Supply Chain Audit
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 10000:
            try:
                result = await stage5_audit_deps(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(
                        stage="stage5",
                        status="errored",
                        findings=[],
                        duration_ms=0,
                        error=str(e),
                    )
                )

        # Stage T: Token Usage Analysis (optional, advisory-only)
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 3000:
            try:
                result = stage_token_analyze(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(
                    StageResult(stage="stageT", status="errored", findings=[], duration_ms=0, error=str(e))
                )

    finally:
        # Always cleanup temp directory
        cleanup_ingest(temp_dir)

    # Collect all findings from all stages
    all_findings = [f for sr in stage_results for f in sr.findings]

    # Deduplicate findings across tools (boosts confidence for corroborated findings)
    deduped_findings = deduplicate_findings(
        [
            {
                "stage": f.stage,
                "severity": f.severity,
                "type": f.type,
                "description": f.description,
                "location": f.location,
                "confidence": f.confidence,
                "tool": f.tool,
                "evidence": f.evidence,
                "llm_verdict": f.llm_verdict,
                "llm_reviewed": f.llm_reviewed,
            }
            for f in all_findings
        ]
    )

    # Enrich findings with remediation guidance and CWE references
    enriched_findings = enrich_findings(
        [
            Finding(
                stage=f["stage"],
                severity=f["severity"],
                type=f["type"],
                description=f["description"],
                location=f.get("location"),
                confidence=f.get("confidence"),
                tool=f.get("tool"),
                evidence=f.get("evidence"),
                llm_verdict=f.get("llm_verdict"),
                llm_reviewed=f.get("llm_reviewed", False),
            )
            for f in deduped_findings
        ]
    )

    # Compute final verdict
    verdict = compute_verdict(stage_results)
    duration_ms = int((time.monotonic() - start) * 1000)

    # Store results in database
    scan_id = await store_scan_results(
        request.version_id,
        verdict,
        stage_results,
        duration_ms,
        file_hashes,
        llm_analysis,
        enriched_findings=enriched_findings,
    )

    return ScanResponse(
        scan_id=scan_id,
        verdict=verdict.value,
        findings=enriched_findings,
        stage_results=stage_results,
        duration_ms=duration_ms,
        file_hashes=file_hashes,
        llm_analysis=llm_analysis,
    )


@app.post("/scan")
async def scan_handler(request: ScanRequest) -> ScanResponse:
    """Run a full security scan on a skill package.

    Supports two modes:
    1. Tarball mode: tarball_url provided, runs full 6-stage pipeline.
    2. Single-file mode: single_file_content provided, runs stages 3-5 only.

    The scan is designed to complete within 55 seconds to stay within
    Vercel's 60-second function timeout.
    """
    # Validate request
    if not request.tarball_url and not request.single_file_content:
        raise HTTPException(status_code=400, detail="tarball_url or single_file_content is required")
    if not request.version_id:
        raise HTTPException(status_code=400, detail="version_id is required")

    try:
        if request.single_file_content:
            return await run_single_file_pipeline(request)
        return await run_scan_pipeline(request)
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Scan pipeline crashed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Scan failed with unexpected error: {e!s}",
        ) from e


@app.get("/scan/health")
async def health_check():
    """Health check endpoint for the scan service."""
    return {"status": "ok", "service": "tank-security-scan"}
