"""POST /api/analyze/rescan — Cron endpoint for re-scanning old skill versions.

Called daily by Vercel Cron Jobs. Re-scans versions that haven't been
scanned in 24+ hours and updates their audit status if verdict changes.
"""

import os
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .scan.models import Finding, ScanVerdict, StageResult
from .scan.stage0_ingest import stage0_ingest, cleanup_ingest
from .scan.stage1_structure import stage1_validate
from .scan.stage2_static import stage2_analyze
from .scan.stage3_injection import stage3_detect_injection
from .scan.stage4_secrets import stage4_scan_secrets
from .scan.stage5_supply import stage5_audit_deps
from .scan.verdict import compute_verdict

app = FastAPI(title="Tank Rescan", version="1.0.0")

# Configuration
BATCH_SIZE = 5  # Max versions to rescan per invocation
RESCAN_AGE_HOURS = 24
CRON_SECRET = os.environ.get("CRON_SECRET", "")


async def get_versions_to_rescan() -> List[Dict[str, Any]]:
    """Query database for versions that need rescanning."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return []

    try:
        import psycopg
        from psycopg.rows import dict_row

        async with await psycopg.AsyncConnection.connect(
            database_url, row_factory=dict_row
        ) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT sv.id, sv.skill_id, sv.tarball_path, sv.manifest, sv.permissions,
                           sr.verdict as last_verdict
                    FROM skill_versions sv
                    LEFT JOIN scan_results sr ON sr.version_id = sv.id
                    WHERE sv.audit_status = 'completed'
                    AND (
                        sr.id IS NULL
                        OR sr.created_at < NOW() - INTERVAL '%s hours'
                    )
                    ORDER BY sv.created_at DESC
                    LIMIT %s
                    """,
                    (RESCAN_AGE_HOURS, BATCH_SIZE),
                )
                return await cur.fetchall()

    except Exception as e:
        print(f"Database query error: {e}")
        return []


async def update_version_audit_status(
    version_id: str,
    verdict: ScanVerdict,
    old_verdict: Optional[str]
) -> None:
    """Update version's audit status based on scan result."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return

    try:
        import psycopg

        # Map verdict to audit status
        status_map = {
            ScanVerdict.PASS: "completed",
            ScanVerdict.PASS_WITH_NOTES: "completed",
            ScanVerdict.FLAGGED: "flagged",
            ScanVerdict.FAIL: "failed",
        }

        audit_status = status_map.get(verdict, "completed")

        async with await psycopg.AsyncConnection.connect(database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE skill_versions
                    SET audit_status = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (audit_status, version_id),
                )

                # If verdict changed, log audit event
                if old_verdict and old_verdict != verdict.value:
                    await cur.execute(
                        """
                        INSERT INTO audit_events
                        (action, target_type, target_id, metadata)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            "rescan_verdict_changed",
                            "skill_version",
                            version_id,
                            {"old_verdict": old_verdict, "new_verdict": verdict.value},
                        ),
                    )

                await conn.commit()

    except Exception as e:
        print(f"Database update error: {e}")


async def generate_signed_url(tarball_path: str) -> Optional[str]:
    """Generate a signed download URL for the tarball.

    Uses Supabase storage to generate a time-limited signed URL.
    """
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        return None

    try:
        import httpx

        async with httpx.AsyncClient() as client:
            # Create signed URL via Supabase Storage API
            response = await client.post(
                f"{supabase_url}/storage/v1/object/sign/packages/{tarball_path}",
                headers={
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": 3600},  # 1 hour
            )
            response.raise_for_status()
            data = response.json()
            return f"{supabase_url}{data['signedURL']}"

    except Exception as e:
        print(f"Failed to generate signed URL: {e}")
        return None


async def rescan_version(version: Dict[str, Any]) -> Dict[str, Any]:
    """Run a full rescan on a single version."""
    start = time.monotonic()
    version_id = version["id"]

    # Generate signed URL
    tarball_url = await generate_signed_url(version["tarball_path"])
    if not tarball_url:
        return {
            "version_id": version_id,
            "status": "error",
            "error": "Failed to generate download URL",
        }

    # Run scan stages
    stage_results: List[StageResult] = []

    try:
        # Stage 0
        ingest = await stage0_ingest(tarball_url)
        stage_results.append(ingest.stage_result)

        if ingest.stage_result.status != "failed":
            try:
                # Stage 1
                stage_results.append(stage1_validate(ingest))

                # Stage 2
                stage_results.append(stage2_analyze(
                    ingest,
                    version["manifest"] or {},
                    version["permissions"] or {},
                ))

                # Stage 3
                stage_results.append(stage3_detect_injection(ingest))

                # Stage 4
                stage_results.append(stage4_scan_secrets(ingest))

                # Stage 5
                stage_results.append(await stage5_audit_deps(ingest))

            finally:
                cleanup_ingest(ingest.temp_dir)

        # Compute verdict
        verdict = compute_verdict(stage_results)
        duration_ms = int((time.monotonic() - start) * 1000)

        # Update audit status
        old_verdict = version.get("last_verdict")
        await update_version_audit_status(version_id, verdict, old_verdict)

        return {
            "version_id": version_id,
            "status": "completed",
            "verdict": verdict.value,
            "duration_ms": duration_ms,
            "finding_count": sum(len(sr.findings) for sr in stage_results),
        }

    except Exception as e:
        return {
            "version_id": version_id,
            "status": "error",
            "error": str(e),
        }


class RescanResponse(BaseModel):
    """Response from the rescan endpoint."""

    processed: int
    results: List[Dict[str, Any]]


@app.post("/api/analyze/rescan")
async def rescan_handler(
    authorization: Optional[str] = Header(None)
) -> RescanResponse:
    """Run daily rescan of old skill versions.

    This endpoint is called by Vercel Cron Jobs. It requires authentication
    via the CRON_SECRET header.
    """
    # Verify cron authorization
    if CRON_SECRET:
        if not authorization or authorization != f"Bearer {CRON_SECRET}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    # Get versions to rescan
    versions = await get_versions_to_rescan()

    if not versions:
        return RescanResponse(processed=0, results=[])

    # Rescan each version
    results = []
    for version in versions:
        result = await rescan_version(version)
        results.append(result)

    return RescanResponse(processed=len(results), results=results)


@app.get("/api/analyze/rescan/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "tank-rescan"}
