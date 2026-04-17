"""Tank Scanner - Main API Entry Point

Aggregates all scanner endpoints for container deployment.

Endpoints:
- POST /api/analyze/scan - Full security scan
- POST /api/analyze/security - Quick security check
- POST /api/analyze/permissions - Permission extraction
- GET /api/analyze/scan/health - Health check
- GET /health/llm - LLM provider health status
"""

import hmac
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.analyze.index import app as analyze_index_app
from api.analyze.permissions import app as permissions_app
from api.analyze.rescan import app as rescan_app

# Import individual API apps
from api.analyze.scan import app as scan_app
from api.analyze.security import app as security_app
from lib.scan.llm_health import check_llm_health

# Startup diagnostics: verify critical scanner dependencies are available
_startup_logger = logging.getLogger("tank.scanner.startup")
try:
    import detect_secrets as _ds  # noqa: F401

    _startup_logger.info(
        "detect-secrets %s available (Python %s on %s)",
        getattr(_ds, "__version__", "unknown"),
        __import__("sys").version.split()[0],
        __import__("sys").platform,
    )
except ImportError:
    _startup_logger.warning(
        "detect-secrets NOT available — secret scanning will use regex fallback only (Python %s on %s)",
        __import__("sys").version.split()[0],
        __import__("sys").platform,
    )

# Create main app
app = FastAPI(
    title="Tank Security Scanner",
    version="2.0.0",
    description="""
Tank Security Scanner - Comprehensive security analysis for Claude Code skills.

## Features

- **6-Stage Pipeline**: Ingestion, Structure, Static Analysis, Injection Detection, Secrets, Dependencies
- **Multiple Tools**: Semgrep, Bandit, detect-secrets, OSV API
- **Custom Rules**: Agent-specific threat detection
- **Deduplication**: Findings merged across tools with confidence boosting
- **SARIF Export**: Industry-standard output format

## Authentication

For production, add API key authentication between your Next.js app and this scanner.
    """,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration for registry integration
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.tankpkg\.dev$|http://localhost:3000|http://localhost:5555",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Scanner service authentication middleware
# When SCANNER_AUTH_ENABLED=true, requires X-Scanner-Key header matching SCANNER_SERVICE_KEY
@app.middleware("http")
async def scanner_auth_middleware(request: Request, call_next):
    auth_enabled = os.environ.get("SCANNER_AUTH_ENABLED", "false").lower() == "true"
    if not auth_enabled:
        return await call_next(request)

    # Health endpoints are always accessible
    if request.url.path in ("/health", "/health/llm", "/api/analyze/scan/health", "/"):
        return await call_next(request)

    expected_key = os.environ.get("SCANNER_SERVICE_KEY", "")
    provided_key = request.headers.get("X-Scanner-Key", "")

    if not expected_key:
        # Key not configured with auth enabled — refuse all requests
        import logging

        logging.getLogger(__name__).error(
            "SCANNER_AUTH_ENABLED=true but SCANNER_SERVICE_KEY is empty. "
            "All requests are rejected. Set SCANNER_SERVICE_KEY to enable authentication."
        )
        return JSONResponse(
            status_code=503,
            content={"error": "Scanner auth misconfigured: service key not set"},
        )

    if not hmac.compare_digest(provided_key, expected_key):
        return JSONResponse(
            status_code=403,
            content={"error": "Invalid scanner service key"},
        )

    return await call_next(request)


# Mount sub-apps
app.include_router(analyze_index_app.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(scan_app.router, prefix="/api/analyze", tags=["scan"])
app.include_router(security_app.router, prefix="/api/analyze", tags=["security"])
app.include_router(permissions_app.router, prefix="/api/analyze", tags=["permissions"])
app.include_router(rescan_app.router, prefix="/api/analyze", tags=["rescan"])


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Tank Security Scanner",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/api/analyze/scan/health",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/debug/stageT")
async def debug_stage_t():
    """Diagnostic endpoint to check Stage T runtime environment."""
    import shutil

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vendor_path = os.path.join(project_root, "vendor", "tokenomics", "analyze.js")
    node_modules_path = os.path.join(project_root, "node_modules", "tokenomics", "dist", "analyze.js")
    node_bin = shutil.which("node")
    node_candidates = ["/vercel/node-wrapper/node", "/usr/local/bin/node", "/opt/node/bin/node"]
    found_node = None
    for c in node_candidates:
        if os.path.isfile(c):
            found_node = c
            break

    return {
        "__file__": __file__,
        "project_root": project_root,
        "cwd": os.getcwd(),
        "vendor_path": vendor_path,
        "vendor_exists": os.path.isfile(vendor_path),
        "node_modules_path": node_modules_path,
        "node_modules_exists": os.path.isfile(node_modules_path),
        "node_on_path": node_bin,
        "node_candidate_found": found_node,
        "tokenomics_on_path": shutil.which("tokenomics"),
        "dir_listing_vendor": os.listdir(os.path.join(project_root, "vendor", "tokenomics"))
        if os.path.isdir(os.path.join(project_root, "vendor", "tokenomics"))
        else "DIR_NOT_FOUND",
        "dir_listing_project_root": [f for f in os.listdir(project_root) if not f.startswith(".")],
    }


@app.get("/health/llm")
async def llm_health():
    """Check LLM provider health status.

    Returns configuration and health status for all configured LLM providers.
    Does NOT expose API keys - only shows whether keys are configured.
    """
    return await check_llm_health()


# Export for uvicorn
# Run with: uvicorn api.main:app --host 0.0.0.0 --port 8000
