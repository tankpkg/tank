"""POST /api/analyze/scan — Main security scan orchestrator endpoint.

Orchestrates the full 6-stage scanning pipeline:
- Stage 0: Ingestion & Quarantine
- Stage 1: File & Structure Validation
- Stage 2: Static Code Analysis
- Stage 3: Prompt Injection Detection
- Stage 4: Secrets & Credential Scanning
- Stage 5: Dependency & Supply Chain Audit

Includes finding deduplication and SARIF export support.

Stores results in PostgreSQL and returns comprehensive scan response.
"""

import os
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from lib.scan.models import (
    Finding,
    ScanRequest,
    ScanResponse,
    StageResult,
    ScanVerdict,
)
from lib.scan.stage0_ingest import stage0_ingest, cleanup_ingest
from lib.scan.stage1_structure import stage1_validate
from lib.scan.stage2_static import stage2_analyze
from lib.scan.stage3_injection import stage3_detect_injection
from lib.scan.stage4_secrets import stage4_scan_secrets
from lib.scan.stage5_supply import stage5_audit_deps
from lib.scan.verdict import compute_verdict, get_verdict_counts, get_stages_run
from lib.scan.dedup import deduplicate_findings
from lib.scan.sarif import to_sarif

app = FastAPI(title="Tank Security Scan", version="2.0.0")

# Configuration
MAX_SCAN_DURATION_MS = 55000  # 55 seconds (leave buffer for Vercel 60s limit)


async def store_scan_results(
    version_id: str,
    verdict: ScanVerdict,
    stage_results: List[StageResult],
    duration_ms: int,
    file_hashes: Dict[str, str],
) -> Optional[str]:
    """Store scan results in PostgreSQL.

    Returns scan_id if successful, None if storage failed.
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None

    try:
        import psycopg
        from psycopg.rows import dict_row

        counts = get_verdict_counts(stage_results)
        stages_run = get_stages_run(stage_results)

        async with await psycopg.AsyncConnection.connect(
            database_url, row_factory=dict_row
        ) as conn:
            async with conn.cursor() as cur:
                # Insert scan_results
                await cur.execute(
                    """
                    INSERT INTO scan_results
                    (version_id, verdict, total_findings, critical_count, high_count,
                     medium_count, low_count, stages_run, duration_ms, file_hashes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    ),
                )
                row = await cur.fetchone()
                scan_id = str(row["id"]) if row else None

                if not scan_id:
                    return None

                # Insert scan_findings
                all_findings: List[Finding] = []
                for stage in stage_results:
                    all_findings.extend(stage.findings)

                if all_findings:
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
                        )
                        for f in all_findings
                    ]

                    await cur.executemany(
                        """
                        INSERT INTO scan_findings
                        (scan_id, stage, severity, type, description, location,
                         confidence, tool, evidence)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        finding_values,
                    )

                await conn.commit()
                return scan_id

    except Exception as e:
        # Log error but don't fail the scan
        print(f"Database storage error: {e}")
        return None


async def run_scan_pipeline(request: ScanRequest) -> ScanResponse:
    """Run the full scanning pipeline.

    Orchestrates all 6 stages with error handling and timeout management.
    """
    start = time.monotonic()
    stage_results: List[StageResult] = []
    file_hashes: Dict[str, str] = {}

    # Stage 0: Ingestion & Quarantine (REQUIRED - provides temp dir)
    try:
        ingest_result = await stage0_ingest(request.tarball_url)
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
            )

    except Exception as e:
        # Stage 0 failed - cannot continue
        stage_results.append(StageResult(
            stage="stage0",
            status="errored",
            findings=[Finding(
                stage="stage0",
                severity="critical",
                type="ingestion_error",
                description=f"Failed to ingest tarball: {str(e)}",
                confidence=1.0,
                tool="scan_orchestrator",
            )],
            duration_ms=int((time.monotonic() - start) * 1000),
            error=str(e),
        ))

        verdict = compute_verdict(stage_results)
        duration_ms = int((time.monotonic() - start) * 1000)

        return ScanResponse(
            scan_id=None,
            verdict=verdict.value,
            findings=[f for sr in stage_results for f in sr.findings],
            stage_results=stage_results,
            duration_ms=duration_ms,
            file_hashes={},
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
                stage_results.append(StageResult(
                    stage="stage1",
                    status="errored",
                    findings=[],
                    duration_ms=0,
                    error=str(e),
                ))

        # Stage 2: Static Code Analysis
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 10000:
            try:
                result = stage2_analyze(
                    ingest_result,
                    request.manifest,
                    request.permissions,
                )
                stage_results.append(result)
            except Exception as e:
                stage_results.append(StageResult(
                    stage="stage2",
                    status="errored",
                    findings=[],
                    duration_ms=0,
                    error=str(e),
                ))

        # Stage 3: Prompt Injection Detection
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result = stage3_detect_injection(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(StageResult(
                    stage="stage3",
                    status="errored",
                    findings=[],
                    duration_ms=0,
                    error=str(e),
                ))

        # Stage 4: Secrets & Credential Scanning
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 5000:
            try:
                result = stage4_scan_secrets(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(StageResult(
                    stage="stage4",
                    status="errored",
                    findings=[],
                    duration_ms=0,
                    error=str(e),
                ))

        # Stage 5: Dependency & Supply Chain Audit
        elapsed = int((time.monotonic() - start) * 1000)
        remaining_budget = MAX_SCAN_DURATION_MS - elapsed
        if remaining_budget > 10000:
            try:
                result = await stage5_audit_deps(ingest_result)
                stage_results.append(result)
            except Exception as e:
                stage_results.append(StageResult(
                    stage="stage5",
                    status="errored",
                    findings=[],
                    duration_ms=0,
                    error=str(e),
                ))

    finally:
        # Always cleanup temp directory
        cleanup_ingest(temp_dir)

    # Collect all findings from all stages
    all_findings = [f for sr in stage_results for f in sr.findings]

    # Deduplicate findings across tools (boosts confidence for corroborated findings)
    deduped_findings = deduplicate_findings([
        {
            "stage": f.stage,
            "severity": f.severity,
            "type": f.type,
            "description": f.description,
            "location": f.location,
            "confidence": f.confidence,
            "tool": f.tool,
            "evidence": f.evidence,
        }
        for f in all_findings
    ])

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
    )

    return ScanResponse(
        scan_id=scan_id,
        verdict=verdict.value,
        findings=[Finding(
            stage=f["stage"],
            severity=f["severity"],
            type=f["type"],
            description=f["description"],
            location=f.get("location"),
            confidence=f.get("confidence"),
            tool=f.get("tool"),
            evidence=f.get("evidence"),
        ) for f in deduped_findings],
        stage_results=stage_results,
        duration_ms=duration_ms,
        file_hashes=file_hashes,
    )


@app.post("/api/analyze/scan")
async def scan_handler(request: ScanRequest) -> ScanResponse:
    """Run a full security scan on a skill package.

    Accepts a tarball URL and skill metadata, runs all 6 scanning stages,
    stores results in PostgreSQL, and returns comprehensive findings.

    The scan is designed to complete within 55 seconds to stay within
    Vercel's 60-second function timeout.
    """
    # Validate request
    if not request.tarball_url:
        raise HTTPException(status_code=400, detail="tarball_url is required")
    if not request.version_id:
        raise HTTPException(status_code=400, detail="version_id is required")

    try:
        return await run_scan_pipeline(request)
    except Exception as e:
        # Catch-all for unexpected errors
        return ScanResponse(
            scan_id=None,
            verdict=ScanVerdict.FAIL.value,
            findings=[Finding(
                stage="orchestrator",
                severity="critical",
                type="scan_error",
                description=f"Scan failed with unexpected error: {str(e)}",
                confidence=1.0,
                tool="scan_orchestrator",
            )],
            stage_results=[StageResult(
                stage="orchestrator",
                status="errored",
                findings=[],
                duration_ms=0,
                error=str(e),
            )],
            duration_ms=0,
            file_hashes={},
        )


@app.get("/api/analyze/scan/health")
async def health_check():
    """Health check endpoint for the scan service."""
    return {"status": "ok", "service": "tank-security-scan"}
